package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import id.tbcall.authorization.ReferralSourceAuthorityPolicy;
import id.tbcall.authorization.ClinicalSourceAuthorityPolicy;
import id.tbcall.application.common.ApplicationFailure;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false","tbcall.security.expose-verification-tokens=true"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class ReferralIntegrationTest {
    @TestConfiguration static class TimeConfig {
        @Bean @Primary Clock referralTestClock() { return Clock.fixed(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS),ZoneOffset.UTC); }
    }
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername); r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords; @Autowired Clock clock;
    @MockitoSpyBean ReferralSourceAuthorityPolicy referralSource;
    @MockitoSpyBean ClinicalSourceAuthorityPolicy clinicalSource;
    final JsonMapper json=JsonMapper.builder().build(); static String hash;
    static final String PASSWORD="Referral password 123!";
    UUID source,destination,foreign,patient,registration,diagnosis,caseId,treatment,officer,self,supporter;
    Cookie sourceCookie,destinationCookie,selfCookie,supportCookie,caller;
    @BeforeEach void setup() throws Exception {
        reset(referralSource,clinicalSource);
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        source=facility("Source"); destination=facility("Destination"); foreign=facility("Foreign");
        officer=user("source@example.org","TB_OFFICER",source); user("destination@example.org","TB_OFFICER",destination);
        self=user("self@example.org","PATIENT",null); supporter=user("support@example.org","TREATMENT_SUPPORTER",null);
        patient=jdbc.queryForObject("insert into patients(full_name,nik,bpjs_number,sex_code) values ('Handoff Patient','1234567890123456','BPJS-PRIVATE','PEREMPUAN') returning id",UUID.class);
        registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,?,'CONVERTED_TO_CASE') returning id",UUID.class,patient,source,today().minusDays(5));
        diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition,referred_to_facility_id) values (?,?,'PRIVATE-DIAGNOSIS','REFERRED',?) returning id",UUID.class,registration,today().minusDays(4),destination);
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code,status,hiv_status_code,dm_status_code) values (?,?,?,'TB_SO','BARU','REFERRED','POSITIF','YA') returning id",UUID.class,registration,diagnosis,source);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",self,patient);
        jdbc.update("insert into patient_supporters(case_id,supporter_type,full_name,linked_user_id) values (?,'PMO','Supporter',?)",caseId,supporter);
        sourceCookie=login("source@example.org"); destinationCookie=login("destination@example.org"); selfCookie=login("self@example.org"); supportCookie=login("support@example.org"); caller=sourceCookie;
    }
    @Test void preTreatmentReportMovesExistingCaseAndDestinationCanStartTreatment() throws Exception {
        JsonNode sent=send(false); ownership("REFERRED",source,null); assertThat(sent.path("sourceFacility").path("id").asText()).isEqualTo(source.toString());
        caller=destinationCookie; JsonNode received=transition(sent,"receive",Map.of(),200); ownership("REFERRED",source,null);
        JsonNode reported=transition(received,"report",Map.of(),200); assertThat(reported.path("status").asText()).isEqualTo("REPORTED"); ownership("ACTIVE",destination,null);
        call(post("/api/v1/cases/"+caseId+"/treatments"),Map.of("regimenCode","SO_6M_2HRZE_4HR","startDate",today().toString(),"drugs",List.of(Map.of("drugCode","H","startDate",today().toString()))),201);
        assertThat(jdbc.queryForObject("select count(*) from tb_cases",Integer.class)).isEqualTo(1); assertThat(jdbc.queryForObject("select count(*) from treatments",Integer.class)).isEqualTo(1);
        caller=sourceCookie; call(get(path(sent)),null,200); call(get("/api/v1/cases/"+caseId),null,404);
    }
    @Test void treatmentTransferPreservesHistoryLinksAndMovesOnlyCurrentOwnership() throws Exception {
        activeTreatment(); seedHistory(); var history=history(); var before=jdbc.queryForMap("select * from treatments where id=?",treatment);
        JsonNode sent=send(true); ownership("REFERRED",source,source); caller=destinationCookie;
        JsonNode received=transition(sent,"receive",Map.of("notes","Reception notes"),200); ownership("REFERRED",source,source);
        JsonNode reported=transition(received,"report",Map.of(),200); ownership("ACTIVE",destination,destination);
        var after=jdbc.queryForMap("select * from treatments where id=?",treatment);
        for(String key:before.keySet()) if(!Set.of("facility_id","version","updated_at").contains(key)) assertThat(after.get(key)).as(key).isEqualTo(before.get(key));
        assertThat(history()).isEqualTo(history); assertThat(jdbc.queryForObject("select count(*) from tb_cases",Integer.class)).isEqualTo(1);
        call(get("/api/v1/treatments/"+treatment),null,200);
        call(patch("/api/v1/treatments/"+treatment).header("If-Match",treatmentVersion()),Map.of("notes","Destination update"),200);
        call(post("/api/v1/treatments/"+treatment+"/dose-events"),Map.of("scheduledDate",today().toString(),"status","TAKEN_OBSERVED"),201);
        caller=sourceCookie; call(get("/api/v1/treatments/"+treatment),null,404); call(get(path(reported)),null,200);
        assertThat(call(get("/api/v1/referrals/outgoing"),null,200).path("totalElements").asLong()).isEqualTo(1);
        caller=selfCookie; call(get("/api/v1/me/treatment"),null,200); call(post("/api/v1/me/treatment/dose-events"),Map.of("scheduledDate",today().toString(),"status","TAKEN_SELF_REPORTED"),201);
        caller=supportCookie; call(get("/api/v1/me/supporting-cases/"+caseId+"/treatment"),null,200);
    }
    @ParameterizedTest @CsvSource({"false,cancel,CANCELLED,REFERRED","false,return,RETURNED,REFERRED","true,cancel,CANCELLED,ACTIVE","true,return,RETURNED,ACTIVE"})
    void returnAndCancelRestoreOnlySpecifiedState(boolean transfer,String action,String status,String caseStatus) throws Exception {
        if(transfer) activeTreatment(); JsonNode sent=send(transfer),current=sent;
        if(action.equals("return")) { caller=destinationCookie; current=transition(sent,"receive",Map.of(),200); }
        JsonNode ended=transition(current,action,Map.of(action.equals("return") ? "returnReason" : "cancelReason","Reason private"),200);
        assertThat(ended.path("status").asText()).isEqualTo(status); ownership(caseStatus,source,transfer ? source : null);
        assertThat(ended.path(action.equals("return") ? "returnReason" : "cancelReason").asText()).isEqualTo("Reason private");
        caller=sourceCookie; send(transfer);
    }
    @ParameterizedTest @ValueSource(strings={"activeCase","planned","active","paused","noDiagnosis","wrongDisposition","wrongDestination","treatmentPresent"})
    void invalidPreTreatmentSendIsAtomic(String invalid) throws Exception {
        Map<String,Object> input=sendInput(false);
        switch(invalid) {
            case "activeCase" -> jdbc.update("update tb_cases set status='ACTIVE' where id=?",caseId);
            case "planned","active","paused" -> jdbc.update("insert into treatments(case_id,facility_id,start_date,status) values (?,?,?,?)",caseId,source,today(),invalid.toUpperCase());
            case "noDiagnosis" -> jdbc.update("update tb_cases set confirming_diagnosis_id=null where id=?",caseId);
            case "wrongDisposition" -> jdbc.update("update diagnoses set treatment_disposition='TREAT_HERE' where id=?",diagnosis);
            case "wrongDestination" -> input.put("destinationFacilityId",foreign);
            default -> { activeTreatment(); input.put("treatmentId",treatment); jdbc.update("update tb_cases set status='REFERRED' where id=?",caseId); }
        }
        var before=jdbc.queryForMap("select * from tb_cases where id=?",caseId); call(post(sendPath()),input,409);
        assertThat(jdbc.queryForMap("select * from tb_cases where id=?",caseId)).isEqualTo(before); assertNoSuccessAudits();
    }
    @ParameterizedTest @ValueSource(strings={"noId","otherCase","paused","planned","completed","otherFacility","outcome","referredCase"})
    void invalidTransferSendIsAtomic(String invalid) throws Exception {
        activeTreatment(); Map<String,Object> input=sendInput(true);
        switch(invalid) {
            case "noId" -> input.remove("treatmentId");
            case "otherCase" -> input.put("treatmentId",UUID.randomUUID());
            case "paused","planned","completed" -> jdbc.update("update treatments set status=? where id=?",invalid.toUpperCase(),treatment);
            case "otherFacility" -> jdbc.update("update treatments set facility_id=? where id=?",foreign,treatment);
            case "outcome" -> jdbc.update("insert into treatment_outcomes(treatment_id,outcome_code,outcome_date) values (?,'SEMBUH',?)",treatment,today());
            default -> jdbc.update("update tb_cases set status='REFERRED' where id=?",caseId);
        }
        var before=jdbc.queryForMap("select * from tb_cases where id=?",caseId); call(post(sendPath()),input,409);
        assertThat(jdbc.queryForMap("select * from tb_cases where id=?",caseId)).isEqualTo(before); assertNoSuccessAudits();
    }
    @ParameterizedTest @ValueSource(strings={"same","inactive","missing","unknownType","unknownField"})
    void invalidDestinationAndProtectedInputNeverPersist(String invalid) throws Exception {
        Map<String,Object> input=sendInput(false);
        switch(invalid) {
            case "same" -> input.put("destinationFacilityId",source);
            case "inactive" -> jdbc.update("update facilities set active=false where id=?",destination);
            case "missing" -> input.put("destinationFacilityId",UUID.randomUUID());
            case "unknownType" -> input.put("referralType","TRANSFERRED");
            default -> input.put("sourceFacilityId",foreign);
        }
        call(post(sendPath()),input,400); assertNoSuccessAudits();
    }
    @Test void queriesUseImmutableSideScopesAreBoundedAndExcludeSensitiveFields() throws Exception {
        activeTreatment(); JsonNode sent=send(true); caller=sourceCookie;
        assertThat(call(get("/api/v1/referrals/incoming"),null,200).path("content")).hasSize(0);
        assertThat(call(get("/api/v1/referrals/outgoing"),null,200).path("content")).hasSize(1);
        caller=destinationCookie; assertThat(call(get("/api/v1/referrals/incoming"),null,200).path("content")).hasSize(1);
        assertThat(call(get("/api/v1/referrals/outgoing"),null,200).path("content")).hasSize(0);
        String body=call(get(path(sent)),null,200).toString();
        assertThat(body).contains("Handoff Patient","Transfer notes").doesNotContain("1234567890123456","BPJS-PRIVATE","PRIVATE-DIAGNOSIS","hiv","dmStatus","password","audit","sync","drugName","doseEvents");
        call(get("/api/v1/referrals/incoming").param("size","51"),null,400); call(get("/api/v1/referrals/incoming").param("page","-1"),null,400);
        call(get("/api/v1/referrals/outgoing").param("page","2147483647"),null,400);
        user("foreign@example.org","TB_OFFICER",foreign); caller=login("foreign@example.org"); call(get(path(sent)),null,404);
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","LAB_STAFF","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"})
    void noOtherRoleHasReferralBypass(String role) throws Exception {
        JsonNode sent=send(false); user("other@example.org",role,source); caller=login("other@example.org");
        call(get(path(sent)),null,403); call(get("/api/v1/referrals/outgoing"),null,403); call(post(sendPath()),sendInput(false),403);
        transition(sent,"receive",Map.of(),403); transition(sent,"cancel",Map.of("cancelReason","Reason"),403);
    }
    @Test void exactSidePermissionsAndActiveAssignmentsAreRequired() throws Exception {
        JsonNode sent=send(false); caller=sourceCookie; transition(sent,"receive",Map.of(),404);
        caller=destinationCookie; transition(sent,"cancel",Map.of("cancelReason","Reason"),404);
        jdbc.update("update user_facilities set active=false where user_id=?",officer); caller=sourceCookie; call(get(path(sent)),null,403);
        jdbc.update("update user_facilities set active=true where user_id=?",officer);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code='REFERRAL_WRITE')");
        try { transition(sent,"cancel",Map.of("cancelReason","Reason"),403); }
        finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code='REFERRAL_WRITE'"); }
    }
    @Test void receivedCannotBeCancelledAndTransitionsRequireFreshVersion() throws Exception {
        JsonNode sent=send(false); caller=destinationCookie;
        call(post(path(sent)+"/receive"),Map.of(),428); call(post(path(sent)+"/receive").header("If-Match","bad"),Map.of(),400);
        JsonNode received=transition(sent,"receive",Map.of(),200); transition(sent,"report",Map.of(),409); transition(received,"receive",Map.of(),409);
        caller=sourceCookie; transition(received,"cancel",Map.of("cancelReason","Reason"),409); ownership("REFERRED",source,null);
    }
    @ParameterizedTest @ValueSource(strings={"activeCase","movedCase","newTreatment"})
    void preTreatmentReportRechecksFreshParentState(String invalid) throws Exception {
        JsonNode sent=send(false); caller=destinationCookie; JsonNode received=transition(sent,"receive",Map.of(),200);
        switch(invalid) {
            case "activeCase" -> jdbc.update("update tb_cases set status='ACTIVE' where id=?",caseId);
            case "movedCase" -> jdbc.update("update tb_cases set current_facility_id=? where id=?",foreign,caseId);
            default -> jdbc.update("insert into treatments(case_id,facility_id,start_date,status) values (?,?,?,'PLANNED')",caseId,source,today());
        }
        var before=jdbc.queryForMap("select * from tb_cases where id=?",caseId); transition(received,"report",Map.of(),409);
        assertThat(jdbc.queryForMap("select * from tb_cases where id=?",caseId)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select status from referrals",String.class)).isEqualTo("RECEIVED");
    }
    @ParameterizedTest @ValueSource(strings={"pausedTreatment","movedTreatment","outcome","closedCase"})
    void transferReportNeverResurrectsClosedOrChangedParent(String invalid) throws Exception {
        activeTreatment(); JsonNode sent=send(true); caller=destinationCookie; JsonNode received=transition(sent,"receive",Map.of(),200);
        switch(invalid) {
            case "pausedTreatment" -> jdbc.update("update treatments set status='PAUSED' where id=?",treatment);
            case "movedTreatment" -> jdbc.update("update treatments set facility_id=? where id=?",foreign,treatment);
            case "outcome" -> jdbc.update("insert into treatment_outcomes(treatment_id,outcome_code,outcome_date) values (?,'SEMBUH',?)",treatment,today());
            default -> jdbc.update("update tb_cases set status='COMPLETED' where id=?",caseId);
        }
        var c=jdbc.queryForMap("select * from tb_cases where id=?",caseId); var t=jdbc.queryForMap("select * from treatments where id=?",treatment);
        transition(received,"report",Map.of(),409); assertThat(jdbc.queryForMap("select * from tb_cases where id=?",caseId)).isEqualTo(c); assertThat(jdbc.queryForMap("select * from treatments where id=?",treatment)).isEqualTo(t);
    }
    @Test void receiveNotesPreserveWhenOmittedAndReplaceWhenSupplied() throws Exception {
        JsonNode sent=send(false); caller=destinationCookie; JsonNode received=transition(sent,"receive",Map.of(),200);
        assertThat(received.path("notes").asText()).isEqualTo("Transfer notes"); transition(received,"return",Map.of("returnReason","Reason"),200);
        caller=sourceCookie; JsonNode second=send(false); caller=destinationCookie;
        assertThat(transition(second,"receive",Map.of("notes","Replacement"),200).path("notes").asText()).isEqualTo("Replacement");
    }
    @ParameterizedTest @ValueSource(strings={"REFERRAL_READ","REFERRAL_WRITE"})
    void permissionRevocationIsEffectiveOnTheNextRequest(String permission) throws Exception {
        JsonNode sent=send(false);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code=?)",permission);
        try { if(permission.equals("REFERRAL_READ")) { call(get(path(sent)),null,403); call(get("/api/v1/referrals/outgoing"),null,403); }
            else transition(sent,"cancel",Map.of("cancelReason","Reason"),403); }
        finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code=?",permission); }
    }
    @Test void destinationCanFinalizeSameTreatmentAfterReportWithItsNewVersion() throws Exception {
        activeTreatment(); JsonNode sent=send(true); caller=destinationCookie; transition(transition(sent,"receive",Map.of(),200),"report",Map.of(),200);
        call(post("/api/v1/treatments/"+treatment+"/outcome").header("If-Match",treatmentVersion()),outcome(),201); ownership("COMPLETED",destination,destination);
        caller=sourceCookie; call(get(path(sent)),null,200);
    }
    @ParameterizedTest @ValueSource(strings={"futureReceive","earlyReceive","futureReport","earlyReport","beforeReceive","blankReturn","blankCancel","unknownReceiveField"})
    void invalidChronologyAndReasonsRollback(String invalid) throws Exception {
        JsonNode sent=send(false); caller=destinationCookie;
        if(invalid.equals("futureReceive") || invalid.equals("earlyReceive") || invalid.equals("unknownReceiveField")) {
            Object body=invalid.equals("unknownReceiveField") ? Map.of("status","REPORTED") : Map.of("receivedAt",now().plusDays(invalid.equals("futureReceive") ? 1 : -1).toString());
            transition(sent,"receive",body,400);
        } else if(invalid.equals("blankCancel")) { caller=sourceCookie; transition(sent,"cancel",Map.of("cancelReason"," "),400); }
        else {
            JsonNode received=transition(sent,"receive",Map.of(),200);
            if(invalid.equals("blankReturn")) transition(received,"return",Map.of("returnReason"," "),400);
            else {
                if(invalid.equals("beforeReceive")) jdbc.update("update referrals set received_at=? where id=?",now().plusHours(1),UUID.fromString(sent.path("id").asText()));
                transition(received,"report",Map.of("patientReportedAt",now().plusDays(invalid.equals("futureReport") ? 1 : invalid.equals("earlyReport") ? -1 : 0).toString()),400);
            }
        }
        ownership("REFERRED",source,null); assertThat(jdbc.queryForObject("select count(*) from audit_logs where action in ('REFERRAL_REPORTED','REFERRAL_RETURNED','REFERRAL_CANCELLED')",Integer.class)).isZero();
    }
    @Test void allFiveAuditsContainCorrelationOnly() throws Exception {
        JsonNode first=send(false); transition(first,"cancel",Map.of("cancelReason","PRIVATE-CANCEL"),200);
        JsonNode second=send(false); caller=destinationCookie; JsonNode received=transition(second,"receive",Map.of(),200); transition(received,"return",Map.of("returnReason","PRIVATE-RETURN"),200);
        caller=sourceCookie; JsonNode third=send(false); caller=destinationCookie; transition(transition(third,"receive",Map.of(),200),"report",Map.of(),200);
        var actions=jdbc.queryForList("select distinct action from audit_logs where action like 'REFERRAL_%'",String.class);
        assertThat(actions).containsExactlyInAnyOrder("REFERRAL_SENT","REFERRAL_RECEIVED","REFERRAL_RETURNED","REFERRAL_CANCELLED","REFERRAL_REPORTED");
        for(var row:jdbc.queryForList("select metadata::text,entity_type,entity_id,actor_user_id from audit_logs where action like 'REFERRAL_%'")) {
            assertThat(json.readTree(row.get("metadata").toString()).properties()).hasSize(1); assertThat(row.get("metadata").toString()).contains("traceId").doesNotContain("PRIVATE","Handoff","Transfer");
            assertThat(row.get("entity_type")).isEqualTo("REFERRAL"); assertThat(row.get("entity_id")).isNotNull(); assertThat(row.get("actor_user_id")).isNotNull();
        }
    }
    @Test void localSourceAuthorityReceivesExactCreateAndTransitionScopes() throws Exception {
        JsonNode sent=send(false); UUID id=UUID.fromString(sent.path("id").asText());
        verify(referralSource).requireLocalCreate(any(),eq("REFERRAL_WRITE"),eq(source),eq(caseId));
        caller=destinationCookie; JsonNode received=transition(sent,"receive",Map.of(),200); transition(received,"report",Map.of(),200);
        verify(referralSource,times(2)).requireLocalTransition(any(),eq("REFERRAL_WRITE"),eq(destination),eq(id));
        verifyNoInteractions(clinicalSource);
    }
    @Test void sourceCreateDenialRollsBackSendAndCaseState() throws Exception {
        activeTreatment(); doThrow(ApplicationFailure.forbidden()).when(referralSource).requireLocalCreate(any(),anyString(),any(),any());
        call(post(sendPath()),sendInput(true),403); ownership("ACTIVE",source,source); assertNoSuccessAudits();
    }
    @ParameterizedTest @ValueSource(strings={"receive","return","cancel","report"})
    void sourceTransitionDenialRollsBackAllChanges(String action) throws Exception {
        activeTreatment(); JsonNode sent=send(true),current=sent;
        if(action.equals("return") || action.equals("report")) { caller=destinationCookie; current=transition(sent,"receive",Map.of(),200); }
        caller=action.equals("cancel") ? sourceCookie : destinationCookie;
        var before=jdbc.queryForMap("select * from referrals"); var c=jdbc.queryForMap("select * from tb_cases"); var t=jdbc.queryForMap("select * from treatments");
        int count=jdbc.queryForObject("select count(*) from audit_logs where action like 'REFERRAL_%'",Integer.class);
        doThrow(ApplicationFailure.forbidden()).when(referralSource).requireLocalTransition(any(),anyString(),any(),any());
        transition(current,action,action.equals("return") ? Map.of("returnReason","Reason") : action.equals("cancel") ? Map.of("cancelReason","Reason") : Map.of(),403);
        assertThat(jdbc.queryForMap("select * from referrals")).isEqualTo(before); assertThat(jdbc.queryForMap("select * from tb_cases")).isEqualTo(c); assertThat(jdbc.queryForMap("select * from treatments")).isEqualTo(t);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action like 'REFERRAL_%'",Integer.class)).isEqualTo(count);
    }
    @Test void concurrentDuplicateSendHasOneWinner() throws Exception {
        assertThat(race(sourceCookie,sendPath(),sendInput(false),null,sourceCookie,sendPath(),sendInput(false),null)).containsExactlyInAnyOrder(201,409);
        assertThat(jdbc.queryForObject("select count(*) from referrals",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REFERRAL_SENT'",Integer.class)).isEqualTo(1);
    }
    @Test void receiveVersusCancelHasOneWinnerAndNoPartialOwnershipChange() throws Exception {
        activeTreatment(); JsonNode sent=send(true);
        assertThat(race(destinationCookie,path(sent)+"/receive",Map.of(),version(sent),sourceCookie,path(sent)+"/cancel",Map.of("cancelReason","Reason"),version(sent))).containsExactlyInAnyOrder(200,409);
        String status=jdbc.queryForObject("select status from referrals",String.class); ownership(status.equals("RECEIVED") ? "REFERRED" : "ACTIVE",source,source);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action in ('REFERRAL_RECEIVED','REFERRAL_CANCELLED')",Integer.class)).isEqualTo(1);
    }
    @Test void outcomeVersusTransferSendHasExactlyOneCoherentWinner() throws Exception {
        activeTreatment(); var statuses=race(sourceCookie,sendPath(),sendInput(true),null,sourceCookie,"/api/v1/treatments/"+treatment+"/outcome",outcome(),"\"0\"");
        assertThat(statuses).containsExactlyInAnyOrder(201,409);
        boolean ended=jdbc.queryForObject("select count(*) from treatment_outcomes",Integer.class)==1;
        ownership(ended ? "COMPLETED" : "REFERRED",source,source); assertThat(jdbc.queryForObject("select count(*) from referrals",Integer.class)).isEqualTo(ended ? 0 : 1);
    }
    @Test void outcomeVersusReportCannotCompleteAnEpisodeStillInTransit() throws Exception {
        activeTreatment(); JsonNode sent=send(true); caller=destinationCookie; JsonNode received=transition(sent,"receive",Map.of(),200);
        var statuses=race(destinationCookie,path(received)+"/report",Map.of(),version(received),sourceCookie,"/api/v1/treatments/"+treatment+"/outcome",outcome(),"\"0\"");
        assertThat(statuses.get(0)).isEqualTo(200); assertThat(statuses.get(1)).isIn(404,409); ownership("ACTIVE",destination,destination);
        assertThat(jdbc.queryForObject("select count(*) from treatment_outcomes",Integer.class)).isZero();
    }
    @ParameterizedTest @ValueSource(booleans={true,false})
    void caseLockSerializesBothOutcomeAndSendOrderings(boolean sendFirst) throws Exception {
        activeTreatment(); CountDownLatch locked=new CountDownLatch(1),release=new CountDownLatch(1);
        if(sendFirst) doAnswer(inv -> { locked.countDown(); if(!release.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Gate timeout"); return inv.callRealMethod(); })
                .when(referralSource).requireLocalCreate(any(),eq("REFERRAL_WRITE"),eq(source),eq(caseId));
        else doAnswer(inv -> { locked.countDown(); if(!release.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Gate timeout"); return inv.callRealMethod(); })
                .when(clinicalSource).requireLocalEdit(any(),eq("OUTCOME_WRITE"),eq(source),eq("TREATMENT"),eq(treatment));
        try(var pool=Executors.newFixedThreadPool(2)) {
            String outcomePath="/api/v1/treatments/"+treatment+"/outcome";
            var first=pool.submit(() -> raw(sourceCookie,sendFirst ? sendPath() : outcomePath,sendFirst ? sendInput(true) : outcome(),sendFirst ? null : "\"0\""));
            Future<Integer> second=null;
            try {
                assertThat(locked.await(30,TimeUnit.SECONDS)).isTrue();
                second=pool.submit(() -> raw(sourceCookie,sendFirst ? outcomePath : sendPath(),sendFirst ? outcome() : sendInput(true),sendFirst ? "\"0\"" : null));
                assertCaseLockWait();
            } finally { release.countDown(); }
            assertThat(first.get(30,TimeUnit.SECONDS)).isEqualTo(201); assertThat(second.get(30,TimeUnit.SECONDS)).isEqualTo(409);
        }
        ownership(sendFirst ? "REFERRED" : "COMPLETED",source,source);
        assertThat(jdbc.queryForObject("select count(*) from treatment_outcomes",Integer.class)).isEqualTo(sendFirst ? 0 : 1);
        assertThat(jdbc.queryForObject("select count(*) from referrals",Integer.class)).isEqualTo(sendFirst ? 1 : 0);
    }
    @Test void waitingOutcomeReadsFreshReportedOwnershipAndVersionUnderCaseLock() throws Exception {
        activeTreatment(); JsonNode sent=send(true); caller=destinationCookie; JsonNode received=transition(sent,"receive",Map.of(),200);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",officer,destination);
        CountDownLatch locked=new CountDownLatch(1),release=new CountDownLatch(1);
        doAnswer(inv -> { locked.countDown(); if(!release.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Gate timeout"); return inv.callRealMethod(); })
                .when(referralSource).requireLocalTransition(any(),eq("REFERRAL_WRITE"),eq(destination),eq(UUID.fromString(sent.path("id").asText())));
        try(var pool=Executors.newFixedThreadPool(2)) {
            var report=pool.submit(() -> raw(destinationCookie,path(received)+"/report",Map.of(),version(received)));
            Future<Integer> outcome=null;
            try {
                assertThat(locked.await(30,TimeUnit.SECONDS)).isTrue();
                // The destination move increments the treatment version. Both facility assignments are explicit.
                outcome=pool.submit(() -> raw(sourceCookie,"/api/v1/treatments/"+treatment+"/outcome",outcome(),"\"1\"")); assertCaseLockWait();
            } finally { release.countDown(); }
            assertThat(report.get(30,TimeUnit.SECONDS)).isEqualTo(200); assertThat(outcome.get(30,TimeUnit.SECONDS)).isEqualTo(201);
        }
        ownership("COMPLETED",destination,destination); assertThat(jdbc.queryForObject("select status from referrals",String.class)).isEqualTo("REPORTED");
    }
    private void assertCaseLockWait() throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15); boolean waiting=false;
        while(System.nanoTime()<deadline) {
            waiting=Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%tb_cases%' and cardinality(pg_blocking_pids(pid))>0)",Boolean.class));
            if(waiting) break; Thread.sleep(25);
        }
        assertThat(waiting).as("Competing HTTP command must actually wait on the PostgreSQL case lock").isTrue();
    }
    private int raw(Cookie cookie,String path,Object body,String match) throws Exception {
        var request=post(path).cookie(cookie).with(csrf()).contentType("application/json").content(json.writeValueAsString(body)); if(match!=null) request.header("If-Match",match);
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }
    private void activeTreatment() {
        jdbc.update("update tb_cases set status='ACTIVE' where id=?",caseId);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,regimen_id,start_date,status,notes) select ?,?,id,?,'ACTIVE','PRIVATE-TREATMENT' from regimens where code='SO_6M_2HRZE_4HR' returning id",UUID.class,caseId,source,today().minusDays(2));
        jdbc.update("insert into treatment_drugs(treatment_id,drug_id,drug_name_snapshot,dose_value,dose_unit,frequency_per_week) select ?,id,'Snapshot name',100,'mg',7 from drugs where code='H'",treatment);
    }
    private void seedHistory() {
        jdbc.update("insert into dose_events(treatment_id,scheduled_date,status,source,recorded_by_user_id,notes) values (?,?,'TAKEN_SELF_REPORTED','PATIENT',?,'PRIVATE-DOSE')",treatment,today().minusDays(1),self);
        jdbc.update("insert into follow_ups(treatment_id,facility_id,follow_up_type,scheduled_at,notes) values (?,?,'Control',?,'PRIVATE-FOLLOW')",treatment,source,now());
        jdbc.update("insert into adverse_events(treatment_id,event_type,description,reported_at) values (?,'Observation','PRIVATE-ADVERSE',?)",treatment,now());
        UUID request=jdbc.queryForObject("insert into lab_requests(case_id,requesting_facility_id,testing_facility_id,referral_type,requested_at,request_reason_code) values (?,?,?,'INTERNAL',?,'FOLLOW_UP') returning id",UUID.class,caseId,source,source,now());
        UUID test=jdbc.queryForObject("insert into lab_request_tests(lab_request_id,test_type_code) values (?,'TCM') returning id",UUID.class,request);
        jdbc.update("insert into lab_results(lab_request_test_id,sequence_no,status,tested_at,result_text) values (?,1,'FINAL',?,'PRIVATE-LAB')",test,now());
    }
    private Map<String,List<Map<String,Object>>> history() {
        Map<String,List<Map<String,Object>>> result=new LinkedHashMap<>();
        for(String table:List.of("treatment_drugs","dose_events","follow_ups","adverse_events","lab_requests","lab_request_tests","lab_results","patient_user_links","patient_supporters","tb_registrations","diagnoses")) result.put(table,jdbc.queryForList("select * from "+table+" order by id"));
        return result;
    }
    private void ownership(String status,UUID caseFacility,UUID treatmentFacility) {
        var owner=jdbc.queryForMap("select status,current_facility_id from tb_cases where id=?",caseId); assertThat(owner.get("status")).isEqualTo(status); assertThat(owner.get("current_facility_id")).isEqualTo(caseFacility);
        if(treatmentFacility!=null) { var t=jdbc.queryForMap("select status,facility_id from treatments where id=?",treatment); assertThat(t.get("facility_id")).isEqualTo(treatmentFacility); assertThat(t.get("status")).isEqualTo(status.equals("COMPLETED") ? "COMPLETED" : "ACTIVE"); }
    }
    private JsonNode send(boolean transfer) throws Exception { return call(post(sendPath()),sendInput(transfer),201); }
    private Map<String,Object> sendInput(boolean transfer) { Map<String,Object> input=new HashMap<>(Map.of("referralType",transfer ? "TREATMENT_TRANSFER" : "PRE_TREATMENT_REFERRAL","destinationFacilityId",destination,"notes","Transfer notes")); if(transfer) input.put("treatmentId",treatment); return input; }
    private String sendPath() { return "/api/v1/cases/"+caseId+"/referrals"; }
    private String path(JsonNode r) { return "/api/v1/referrals/"+r.path("id").asText(); }
    private String version(JsonNode r) { return "\""+r.path("version").asLong()+"\""; }
    private String treatmentVersion() { return "\""+jdbc.queryForObject("select version from treatments where id=?",Long.class,treatment)+"\""; }
    private Map<String,Object> outcome() { return Map.of("outcomeCode","SEMBUH","outcomeDate",today().toString()); }
    private JsonNode transition(JsonNode r,String action,Object body,int status) throws Exception { return call(post(path(r)+"/"+action).header("If-Match",version(r)),body,status); }
    private List<Integer> race(Cookie a,String pathA,Object bodyA,String versionA,Cookie b,String pathB,Object bodyB,String versionB) throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch ready=new CountDownLatch(2),go=new CountDownLatch(1);
            Callable<Integer> first=() -> concurrent(a,pathA,bodyA,versionA,ready,go),second=() -> concurrent(b,pathB,bodyB,versionB,ready,go);
            var x=pool.submit(first); var y=pool.submit(second); try { assertThat(ready.await(30,TimeUnit.SECONDS)).isTrue(); } finally { go.countDown(); }
            return List.of(x.get(30,TimeUnit.SECONDS),y.get(30,TimeUnit.SECONDS));
        }
    }
    private int concurrent(Cookie cookie,String path,Object body,String match,CountDownLatch ready,CountDownLatch go) throws Exception {
        ready.countDown(); if(!go.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Race start timeout");
        var request=post(path).cookie(cookie).with(csrf()).contentType("application/json").content(json.writeValueAsString(body)); if(match!=null) request.header("If-Match",match);
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }
    private void assertNoSuccessAudits() { assertThat(jdbc.queryForObject("select count(*) from referrals",Integer.class)).isZero(); assertThat(jdbc.queryForObject("select count(*) from audit_logs where action like 'REFERRAL_%'",Integer.class)).isZero(); }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int status) throws Exception {
        request.cookie(caller).with(csrf()); if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        var response=mvc.perform(request).andExpect(status().is(status)).andReturn().getResponse(); return json.readTree(response.getContentAsString());
    }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID user(String email,String role,UUID facility) {
        UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role);
        if(facility!=null) jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,facility); return id;
    }
    private Cookie login(String email) throws Exception {
        var response=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse(); return response.getCookie("TBCALL_SESSION");
    }
    private LocalDate today() { return LocalDate.now(clock); }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
}
