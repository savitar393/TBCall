package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import id.tbcall.authorization.ContactSourceAuthorityPolicy;
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
class ContactTptIntegrationTest {
    @TestConfiguration static class TimeConfig { @Bean @Primary Clock contactTestClock() { return Clock.fixed(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS),ZoneOffset.UTC); } }
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) { r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername); r.add("spring.datasource.password",POSTGRES::getPassword); }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords; @Autowired Clock clock;
    @MockitoSpyBean ContactSourceAuthorityPolicy contactSource;
    final JsonMapper json=JsonMapper.builder().build(); static String hash; static final String PASSWORD="Contact password 123!";
    UUID source,destination,foreign,indexPatient,linkedPatient,registration,caseId,officer,self; Cookie sourceCookie,destinationCookie,selfCookie,caller;
    @BeforeEach void setup() throws Exception {
        reset(contactSource);
        if(hash==null) hash=passwords.encode(PASSWORD); jdbc.execute("truncate users,patients,facilities restart identity cascade");
        source=facility("Source"); destination=facility("Destination"); foreign=facility("Foreign");
        officer=user("source@example.org","TB_OFFICER",source); user("destination@example.org","TB_OFFICER",destination); self=user("self@example.org","PATIENT",null);
        indexPatient=patient("PRIVATE INDEX","1234567890123456"); linkedPatient=patient("Exact Linked Patient","2234567890123456");
        registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,?,'CONVERTED_TO_CASE') returning id",UUID.class,indexPatient,source,today().minusDays(5));
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code,status,hiv_status_code,dm_status_code) values (?,?,'TB_SO','BARU','ACTIVE','POSITIF','YA') returning id",UUID.class,registration,source);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",self,linkedPatient);
        sourceCookie=login("source@example.org"); destinationCookie=login("destination@example.org"); selfCookie=login("self@example.org"); caller=sourceCookie;
    }
    @ParameterizedTest @ValueSource(booleans={false,true}) void atomicCreationDerivesOwnershipAndState(boolean outgoing) throws Exception {
        JsonNode contact=create(outgoing); var inv=contact.path("investigations").get(0);
        assertThat(inv.path("status").asText()).isEqualTo(outgoing ? "SENT" : "IN_PROGRESS");
        assertThat(jdbc.queryForObject("select source_facility_id from contact_investigations",UUID.class)).isEqualTo(source);
        assertThat(jdbc.queryForObject("select destination_facility_id from contact_investigations",UUID.class)).isEqualTo(outgoing ? destination : null);
        assertThat(jdbc.queryForObject("select phone from contacts",String.class)).isEqualTo("+628123456789"); assertThat(contact.path("phone").asText()).isEqualTo("***6789");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action in ('CONTACT_CREATED','CONTACT_INVESTIGATION_SENT','CONTACT_INVESTIGATION_STARTED')",Integer.class)).isEqualTo(2);
    }
    @ParameterizedTest @ValueSource(strings={"same","inactive","missing","internalDestination","type","birth","sex","phone","name","indexCaseId","linkedPatientId","sourceFacilityId","status","requestedAt"})
    void invalidCreationIsAtomic(String invalid) throws Exception {
        var input=createInput(true); switch(invalid) {
            case "same" -> input.put("destinationFacilityId",source); case "inactive" -> jdbc.update("update facilities set active=false where id=?",destination);
            case "missing" -> input.put("destinationFacilityId",UUID.randomUUID()); case "internalDestination" -> input.put("workflowType","INTERNAL");
            case "type" -> input.put("workflowType","INCOMING_REFERRAL"); case "birth" -> input.put("birthDate",today().plusDays(1).toString());
            case "sex" -> input.put("sexCode","INVALID"); case "phone" -> input.put("phone","not-phone"); case "name" -> input.put("fullName"," ");
            default -> input.put(invalid,"spoof");
        }
        call(post(createPath()),input,400); assertThat(count("contacts")).isZero(); assertThat(count("contact_investigations")).isZero(); assertThat(contactAudits()).isZero();
    }
    @Test void contactPatchIsVersionedAndDoesNotExposeLinkedIdentifiers() throws Exception {
        var c=create(false); String path=contactPath(c);
        call(patch(path),Map.of("fullName","Changed"),428); call(patch(path).header("If-Match","bad"),Map.of("fullName","Changed"),400);
        call(patch(path).header("If-Match","\"8\""),Map.of("fullName","Changed"),409);
        c=call(patch(path).header("If-Match",version(c)),Map.of("fullName","Changed","householdContact",false),200);
        assertThat(c.path("fullName").asText()).isEqualTo("Changed"); assertThat(c.path("version").asLong()).isEqualTo(1);
        for(String field:List.of("indexCaseId","linkedPatientId","version")) call(patch(path).header("If-Match",version(c)),Map.of(field,UUID.randomUUID()),400);
        assertThat(call(get("/api/v1/cases/"+caseId+"/contacts"),null,200).path("content")).hasSize(1);
        String body=call(get(path),null,200).toString(); assertThat(body).doesNotContain("PRIVATE INDEX","1234567890123456","linkedPatientId","hiv","dmStatus","password","audit","sync");
    }
    @Test void exactWniLinkDoesNotOverwriteEitherSnapshot() throws Exception {
        var c=create(false); var patientBefore=jdbc.queryForMap("select * from patients where id=?",linkedPatient); var contactBefore=jdbc.queryForMap("select * from contacts where id=?",uuid(c));
        c=call(post(contactPath(c)+"/link-patient").header("If-Match",version(c)),link(linkedPatient),200);
        assertThat(c.path("linkedPatient").asBoolean()).isTrue(); assertThat(c.toString()).doesNotContain(linkedPatient.toString(),"2234567890123456");
        assertThat(jdbc.queryForMap("select * from patients where id=?",linkedPatient)).isEqualTo(patientBefore);
        var after=jdbc.queryForMap("select * from contacts where id=?",uuid(c)); for(String key:contactBefore.keySet()) if(!Set.of("linked_patient_id","version","updated_at").contains(key)) assertThat(after.get(key)).as(key).isEqualTo(contactBefore.get(key));
        call(post(contactPath(c)+"/link-patient").header("If-Match",version(c)),link(indexPatient),409);
    }
    @ParameterizedTest @ValueSource(strings={"noConfirmation","name","key","patient","birth","citizenship"}) void incorrectIdentityIsNotFuzzyMatched(String wrong) throws Exception {
        var c=create(false); var input=link(linkedPatient); int expected=404;
        switch(wrong) { case "noConfirmation" -> { input=new HashMap<>(Map.of("patientId",linkedPatient)); expected=400; } case "name" -> input.put("fullName","Exact Linked Patien"); case "key" -> input.put("nik","3234567890123456"); case "patient" -> input.put("patientId",indexPatient); case "birth" -> input.put("birthDate","2001-01-01"); default -> { input.put("citizenship","INVALID"); expected=400; } }
        call(post(contactPath(c)+"/link-patient").header("If-Match",version(c)),input,expected); assertThat(jdbc.queryForObject("select linked_patient_id from contacts",UUID.class)).isNull();
    }
    @Test void exactWnaLinkReusesPhase2AmbiguityHandling() throws Exception {
        jdbc.update("update patients set citizenship='WNA',nik=null,other_identity_number='EXACT-PASSPORT' where id=?",linkedPatient);
        var c=create(false); var input=Map.of("patientId",linkedPatient,"citizenship","WNA","otherIdentityNumber","EXACT-PASSPORT","fullName"," exact linked patient ");
        UUID duplicate=jdbc.queryForObject("insert into patients(full_name,citizenship,other_identity_number) values ('Exact Linked Patient','WNA','EXACT-PASSPORT') returning id",UUID.class);
        call(post(contactPath(c)+"/link-patient").header("If-Match",version(c)),input,409); jdbc.update("delete from patients where id=?",duplicate);
        call(post(contactPath(c)+"/link-patient").header("If-Match",version(c)),input,200);
    }
    @Test void outgoingWorkflowScopesAndCompletionAreExplicit() throws Exception {
        var c=create(true); var i=investigation(c); String path=ikPath(i);
        assertThat(call(get("/api/v1/contact-investigations/outgoing"),null,200).path("totalElements").asLong()).isEqualTo(1);
        assertThat(call(get("/api/v1/contact-investigations/incoming"),null,200).path("content")).isEmpty();
        call(post(path+"/receive").header("If-Match",version(i)),Map.of(),404); caller=destinationCookie;
        assertThat(call(get("/api/v1/contact-investigations/incoming"),null,200).path("content")).hasSize(1);
        assertThat(call(get("/api/v1/contact-investigations/outgoing"),null,200).path("content")).isEmpty();
        i=transition(i,"receive",Map.of(),200); i=transition(i,"start",Map.of(),200); i=transition(i,"complete",eligibility(true,true),200);
        assertThat(i.path("status").asText()).isEqualTo("COMPLETED"); assertThat(i.path("eligibilityAssessedAt").asText()).isNotBlank();
        assertThat(count("patients")).isEqualTo(2); assertThat(count("tb_registrations")).isEqualTo(1); assertThat(count("tb_cases")).isEqualTo(1); assertThat(count("preventive_treatments")).isZero();
        String body=i.toString(); assertThat(body).doesNotContain("PRIVATE INDEX","1234567890123456","hiv","dmStatus","labResults","diagnosis","password","audit","sync");
    }
    @ParameterizedTest @CsvSource({"false,false,false,200","false,true,false,200","false,false,true,400","true,false,false,200","true,true,true,200"})
    void completionRequiresConsistentExplicitEligibility(boolean outgoing,boolean excluded,boolean eligible,int expected) throws Exception {
        var i=investigation(create(outgoing)); if(outgoing) { caller=destinationCookie; i=transition(i,"receive",Map.of(),200); i=transition(i,"start",Map.of(),200); }
        transition(i,"complete",eligibility(excluded,eligible),expected); assertThat(count("preventive_treatments")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"activeTbExcluded","tptEligible"}) void eligibilityCannotBeOmitted(String missing) throws Exception {
        var i=investigation(create(false)); var input=eligibility(true,true); input.remove(missing); transition(i,"complete",input,400);
    }
    @ParameterizedTest @ValueSource(strings={"receivedFuture","receivedBefore","investigatedFuture","investigatedBefore","beforeReceived"}) void chronologyIsValidated(String invalid) throws Exception {
        var i=investigation(create(true)); caller=destinationCookie;
        if(invalid.equals("beforeReceived")) jdbc.update("update contact_investigations set requested_at=? where id=?",now().minusDays(1),uuid(i));
        if(invalid.startsWith("received")) transition(i,"receive",Map.of("receivedAt",(invalid.equals("receivedFuture") ? now().plusSeconds(1) : now().minusSeconds(1)).toString()),400);
        else { i=transition(i,"receive",Map.of(),200); i=transition(i,"start",Map.of(),200); var input=eligibility(true,true); input.put("investigatedAt",(invalid.equals("investigatedFuture") ? now().plusSeconds(1) : now().minusSeconds(1)).toString()); transition(i,"complete",input,400); }
    }
    @Test void returnAndCancelRespectSidesAndTerminalStates() throws Exception {
        var i=investigation(create(true)); i=transition(i,"cancel",Map.of(),200); assertThat(i.path("status").asText()).isEqualTo("CANCELLED");
        i=investigation(create(true)); caller=destinationCookie; i=transition(i,"receive",Map.of(),200); var received=i;
        caller=sourceCookie; transition(received,"cancel",Map.of(),409); caller=destinationCookie; transition(received,"return",Map.of("returnReason"," "),400);
        i=transition(received,"return",Map.of("returnReason","PRIVATE RETURN"),200); assertThat(i.path("status").asText()).isEqualTo("RETURNED");
        transition(i,"start",Map.of(),409);
    }
    @ParameterizedTest @ValueSource(strings={"INTERNAL","OUTGOING_REFERRAL"}) void tptDerivesOwnerFacilityAndDoesNotInferDose(String workflow) throws Exception {
        boolean outgoing=workflow.equals("OUTGOING_REFERRAL"); var i=completed(outgoing); var t=start(i);
        assertThat(t.path("status").asText()).isEqualTo("ACTIVE"); assertThat(t.path("facility").path("id").asText()).isEqualTo((outgoing ? destination : source).toString());
        var row=jdbc.queryForMap("select * from preventive_treatments"); assertThat(row.get("patient_id")).isNull(); assertThat(row.get("index_case_id")).isEqualTo(caseId); assertThat(row.get("outcome_code")).isNull();
        assertThat(row.get("duration_value")).isNull(); assertThat(count("regimen_drugs")).isZero(); assertThat(count("dose_events")).isZero();
        assertThat(call(get("/api/v1/contacts/"+row.get("contact_id")+"/tpt"),null,200).path("content")).hasSize(1);
    }
    @ParameterizedTest @ValueSource(strings={"notCompleted","notExcluded","notEligible","planned","active"}) void invalidTptGateNeverInserts(String invalid) throws Exception {
        var i=investigation(create(false)); if(!invalid.equals("notCompleted")) i=transition(i,"complete",eligibility(!invalid.equals("notExcluded"),!invalid.equals("notEligible")&&!invalid.equals("notExcluded")),200);
        if(Set.of("planned","active").contains(invalid)) jdbc.update("insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date,status) values (?,?,?, ?,?)",UUID.fromString(i.path("contact").path("id").asText()),caseId,source,today(),invalid.toUpperCase());
        call(post(ikPath(i)+"/tpt"),tptInput(),409); assertThat(count("preventive_treatments")).isEqualTo(Set.of("planned","active").contains(invalid) ? 1 : 0);
    }
    @ParameterizedTest @ValueSource(strings={"noRegimen","inactive","wrongKind","wrongCategory","missing","weight","duration","unit","future","endBefore","owner","status","outcomeCode"})
    void invalidTptInputNeverInserts(String invalid) throws Exception {
        var i=completed(false); var input=tptInput(); switch(invalid) {
            case "noRegimen" -> input.remove("regimenCode"); case "inactive" -> jdbc.update("update regimens set active=false where code='TPT_SO_6H'");
            case "wrongKind" -> input.put("regimenCode","SO_6M_2HRZE_4HR"); case "wrongCategory" -> input.put("regimenCode","TPT_RO_6LFX"); case "missing" -> input.put("regimenCode","NO-CODE");
            case "weight" -> input.put("weightKg",0); case "duration" -> input.put("durationValue",0); case "unit" -> input.put("durationUnit","YEAR");
            case "future" -> input.put("startDate",today().plusDays(1).toString()); case "endBefore" -> input.put("plannedEndDate",today().minusDays(1).toString()); default -> input.put(invalid,"spoof");
        }
        try { call(post(ikPath(i)+"/tpt"),input,400); } finally { jdbc.update("update regimens set active=true where code='TPT_SO_6H'"); }
        assertThat(count("preventive_treatments")).isZero();
    }
    @Test void individualizedRoDescriptionAndPatchDoNotSelectCatalogOrDose() throws Exception {
        jdbc.update("update tb_cases set case_category_code='TB_RO' where id=?",caseId); var i=completed(false); var input=tptInput(); input.remove("regimenCode"); input.put("regimenDescription","Individualized clinician regimen");
        var t=call(post(ikPath(i)+"/tpt"),input,201); assertThat(t.path("regimenCode").isNull()).isTrue();
        t=call(patch(tptPath(t)).header("If-Match",version(t)),Map.of("durationValue",6,"durationUnit","MONTH","weightKg",20.5,"notes","PRIVATE TPT NOTE"),200);
        assertThat(t.path("durationValue").asInt()).isEqualTo(6); assertThat(jdbc.queryForObject("select regimen_id from preventive_treatments",UUID.class)).isNull();
        var clear=new HashMap<String,Object>(); clear.put("durationValue",null); clear.put("durationUnit",null); t=call(patch(tptPath(t)).header("If-Match",version(t)),clear,200); assertThat(t.path("durationValue").isNull()).isTrue();
        clear.clear(); clear.put("regimenDescription",null); call(patch(tptPath(t)).header("If-Match",version(t)),clear,400);
    }
    @ParameterizedTest @ValueSource(strings={"contactId","patientId","indexCaseId","facilityId","regimenCode","startDate","status","actualEndDate","outcomeCode"}) void patchCannotChangeImmutableTptFields(String field) throws Exception {
        var t=start(completed(false)); call(patch(tptPath(t)).header("If-Match",version(t)),Map.of(field,"spoof"),400);
    }
    @ParameterizedTest @CsvSource({"complete,COMPLETED","stop,STOPPED","lost-to-follow-up,LOST_TO_FOLLOW_UP"}) void tptClosuresUseExplicitStatusAndKeepOutcomeNull(String action,String status) throws Exception {
        var i=completed(false); var t=start(i); if(action.equals("stop")) call(post(tptPath(t)+"/stop").header("If-Match",version(t)),Map.of(),400);
        t=call(post(tptPath(t)+"/"+action).header("If-Match",version(t)),Map.of("closureReason","PRIVATE CLOSURE"),200);
        assertThat(t.path("status").asText()).isEqualTo(status); assertThat(jdbc.queryForObject("select outcome_code from preventive_treatments",String.class)).isNull();
        call(patch(tptPath(t)).header("If-Match",version(t)),Map.of("notes","No"),409); start(i); assertThat(count("preventive_treatments")).isEqualTo(2);
    }
    @ParameterizedTest @ValueSource(strings={"future","before"}) void closureDateCannotEscapeTreatmentChronology(String wrong) throws Exception {
        var t=start(completed(false)); call(post(tptPath(t)+"/complete").header("If-Match",version(t)),Map.of("actualEndDate",(wrong.equals("future") ? today().plusDays(1) : today().minusDays(1)).toString()),400);
    }
    @Test void selfProjectionRequiresVerifiedLinkAndExcludesPrivateFields() throws Exception {
        var c=create(false); c=call(post(contactPath(c)+"/link-patient").header("If-Match",version(c)),link(linkedPatient),200); var i=transition(investigation(c),"complete",eligibility(true,true),200); var input=tptInput(); input.put("notes","PRIVATE OFFICER"); input.put("drugSource","PRIVATE SOURCE"); var t=call(post(ikPath(i)+"/tpt"),input,201);
        caller=selfCookie; String body=call(get("/api/v1/me/tpt"),null,200).toString(); assertThat(body).contains("ACTIVE","TPT 6H","Source").doesNotContain("PRIVATE","indexCase","TB_SO","contact","eligib","resultCode","phone","address","notes","drugSource","audit","sync",caseId.toString());
        call(get(tptPath(t)),null,403); call(get(contactPath(c)),null,403); call(get(ikPath(i)),null,403);
        jdbc.update("update patient_user_links set verification_status='PENDING',verified_at=null where user_id=?",self); call(get("/api/v1/me/tpt"),null,403);
    }
    @Test void selfCannotSeeUnlinkedOtherPatientAndAmbiguousActiveIsConflict() throws Exception {
        var i=completed(false); start(i); caller=selfCookie; call(get("/api/v1/me/tpt"),null,404); caller=sourceCookie;
        UUID contact=UUID.fromString(i.path("contact").path("id").asText()); jdbc.update("update contacts set linked_patient_id=? where id=?",linkedPatient,contact);
        var i2=completed(false); start(i2); jdbc.update("update contacts set linked_patient_id=? where id=?",linkedPatient,UUID.fromString(i2.path("contact").path("id").asText()));
        caller=selfCookie; assertThat(call(get("/api/v1/me/tpt"),null,409).path("code").asText()).isEqualTo("ACTIVE_TPT_AMBIGUOUS");
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","LAB_STAFF","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"}) void rolesHaveNoOperationalBypass(String role) throws Exception {
        var c=create(false); var i=transition(investigation(c),"complete",eligibility(true,true),200); var t=start(i); user("other@example.org",role,source); caller=login("other@example.org");
        call(post(createPath()),createInput(false),403); call(get(contactPath(c)),null,403); call(get(ikPath(i)),null,403); call(get(tptPath(t)),null,403);
        call(post(ikPath(i)+"/tpt"),tptInput(),403); call(patch(tptPath(t)).header("If-Match",version(t)),Map.of("notes","No"),403);
    }
    @Test void facilityIsolationAndBoundedQueries() throws Exception {
        var c=create(false); var i=investigation(c); caller=destinationCookie; call(get(contactPath(c)),null,404); call(get(ikPath(i)),null,404); call(get("/api/v1/cases/"+caseId+"/contacts"),null,404);
        caller=sourceCookie; for(String path:List.of("/api/v1/contact-investigations/incoming","/api/v1/contact-investigations/outgoing","/api/v1/cases/"+caseId+"/contacts")) { call(get(path).param("size","51"),null,400); call(get(path).param("page","-1"),null,400); call(get(path).param("page","2147483647"),null,400); }
    }
    @Test void indexCaseTransferDoesNotMoveHistoricalInvestigationOrTpt() throws Exception {
        var c=create(false); var i=transition(investigation(c),"complete",eligibility(true,true),200); var t=start(i);
        UUID treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status) values (?,?,?,'ACTIVE') returning id",UUID.class,caseId,source,today());
        var ref=call(post("/api/v1/cases/"+caseId+"/referrals"),Map.of("referralType","TREATMENT_TRANSFER","destinationFacilityId",destination,"treatmentId",treatment),201);
        caller=destinationCookie; ref=call(post("/api/v1/referrals/"+uuid(ref)+"/receive").header("If-Match",version(ref)),Map.of(),200); call(post("/api/v1/referrals/"+uuid(ref)+"/report").header("If-Match",version(ref)),Map.of(),200);
        assertThat(jdbc.queryForObject("select source_facility_id from contact_investigations",UUID.class)).isEqualTo(source); assertThat(jdbc.queryForObject("select facility_id from preventive_treatments",UUID.class)).isEqualTo(source);
        call(get(tptPath(t)),null,404); call(get(ikPath(i)),null,404); caller=sourceCookie; call(get(contactPath(c)),null,200); call(get(ikPath(i)),null,200); call(get(tptPath(t)),null,200);
    }
    @Test void legacyContactTptHistoryFollowsTptFacilityAfterIndexCaseTransfer() throws Exception {
        UUID contact=jdbc.queryForObject("insert into contacts(index_case_id,full_name) values (?,'Legacy contact') returning id",UUID.class,caseId);
        UUID tpt=jdbc.queryForObject("insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date,status,regimen_description) values (?,?,?,?,'ACTIVE','Safe historical regimen') returning id",UUID.class,contact,caseId,source,today());
        UUID treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status) values (?,?,?,'ACTIVE') returning id",UUID.class,caseId,source,today());
        var ref=call(post("/api/v1/cases/"+caseId+"/referrals"),Map.of("referralType","TREATMENT_TRANSFER","destinationFacilityId",destination,"treatmentId",treatment),201);
        caller=destinationCookie; ref=call(post("/api/v1/referrals/"+uuid(ref)+"/receive").header("If-Match",version(ref)),Map.of(),200); call(post("/api/v1/referrals/"+uuid(ref)+"/report").header("If-Match",version(ref)),Map.of(),200);
        caller=sourceCookie; call(get("/api/v1/preventive-treatments/"+tpt),null,200);
        assertThat(call(get("/api/v1/contacts/"+contact+"/tpt"),null,200).path("content")).hasSize(1);
        caller=destinationCookie; call(get("/api/v1/preventive-treatments/"+tpt),null,404);
    }
    @Test void auditMetadataNeverCopiesSensitiveNarratives() throws Exception {
        var c=create(false); c=call(patch(contactPath(c)).header("If-Match",version(c)),Map.of("address","PRIVATE ADDRESS"),200); c=call(post(contactPath(c)+"/link-patient").header("If-Match",version(c)),link(linkedPatient),200);
        var t=start(transition(investigation(c),"complete",eligibility(true,true),200)); t=call(patch(tptPath(t)).header("If-Match",version(t)),Map.of("notes","PRIVATE NOTE"),200); call(post(tptPath(t)+"/stop").header("If-Match",version(t)),Map.of("closureReason","PRIVATE REASON"),200);
        for(var row:jdbc.queryForList("select metadata from audit_logs where action like 'CONTACT_%' or action like 'TPT_%'")) assertThat(row.toString()).doesNotContain("PRIVATE","2234567890123456","regimen","eligible","Contact Snapshot");
        assertThat(jdbc.queryForList("select distinct action from audit_logs where action like 'CONTACT_%' or action like 'TPT_%'",String.class)).contains("CONTACT_CREATED","CONTACT_UPDATED","CONTACT_LINKED_PATIENT","CONTACT_INVESTIGATION_STARTED","CONTACT_INVESTIGATION_COMPLETED","TPT_STARTED","TPT_UPDATED","TPT_STOPPED");
    }
    @Test void duplicateTptStartHasOneWinner() throws Exception { var i=completed(false); assertThat(race(sourceCookie,ikPath(i)+"/tpt",tptInput(),null,sourceCookie,ikPath(i)+"/tpt",tptInput(),null)).containsExactlyInAnyOrder(201,409); assertThat(count("preventive_treatments")).isEqualTo(1); assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='TPT_STARTED'",Integer.class)).isEqualTo(1); }
    @Test void receiveVersusCancelHasOneWinner() throws Exception { var i=investigation(create(true)); assertThat(race(destinationCookie,ikPath(i)+"/receive",Map.of(),version(i),sourceCookie,ikPath(i)+"/cancel",Map.of(),version(i))).containsExactlyInAnyOrder(200,409); assertThat(jdbc.queryForObject("select status from contact_investigations",String.class)).isIn("RECEIVED","CANCELLED"); }
    @Test void returnVersusCompleteHasOneCoherentWinner() throws Exception { var i=investigation(create(true)); caller=destinationCookie; i=transition(i,"receive",Map.of(),200); i=transition(i,"start",Map.of(),200); assertThat(race(destinationCookie,ikPath(i)+"/return",Map.of("returnReason","Reason"),version(i),destinationCookie,ikPath(i)+"/complete",eligibility(true,true),version(i))).containsExactlyInAnyOrder(200,409); assertThat(jdbc.queryForObject("select status from contact_investigations",String.class)).isIn("RETURNED","COMPLETED"); }
    @Test void concurrentLinksNeverSilentlyOverwrite() throws Exception { var c=create(false); assertThat(race(sourceCookie,contactPath(c)+"/link-patient",link(linkedPatient),version(c),sourceCookie,contactPath(c)+"/link-patient",link(indexPatient),version(c))).containsExactlyInAnyOrder(200,409); assertThat(jdbc.queryForObject("select linked_patient_id from contacts",UUID.class)).isIn(linkedPatient,indexPatient); assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='CONTACT_LINKED_PATIENT'",Integer.class)).isEqualTo(1); }
    @ParameterizedTest @ValueSource(strings={"CONTACT_READ","CONTACT_WRITE","TPT_READ","TPT_WRITE"}) void eachPermissionIsIndependentlyRequired(String permission) throws Exception {
        var c=create(false); var i=transition(investigation(c),"complete",eligibility(true,true),200); var t=start(i);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code=?)",permission);
        try { switch(permission) {
            case "CONTACT_READ" -> { call(get(contactPath(c)),null,403); call(get(ikPath(i)),null,403); }
            case "CONTACT_WRITE" -> { call(patch(contactPath(c)).header("If-Match",version(c)),Map.of("fullName","No"),403); call(post(createPath()),createInput(false),403); }
            case "TPT_READ" -> { call(get(tptPath(t)),null,403); call(get("/api/v1/contacts/"+uuid(c)+"/tpt"),null,403); assertThat(call(get(contactPath(c)),null,200).path("tpt")).isEmpty(); }
            default -> { call(post(ikPath(i)+"/tpt"),tptInput(),403); call(patch(tptPath(t)).header("If-Match",version(t)),Map.of("notes","No"),403); }
        } } finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code=?",permission); }
    }
    @Test void activeFacilityAssignmentsAreRequiredForHistoricalWorkflowReads() throws Exception {
        var c=create(false); var i=transition(investigation(c),"complete",eligibility(true,true),200); var t=start(i);
        jdbc.update("update facilities set active=false where id=?",source); call(get(contactPath(c)),null,403); call(get(tptPath(t)),null,403);
        jdbc.update("update facilities set active=true where id=?",source); jdbc.update("update user_facilities set active=false where user_id=?",officer); call(get(ikPath(i)),null,403);
    }
    @ParameterizedTest @ValueSource(strings={"receive","start","return","cancel","complete"}) void investigationIfMatchIsRequiredAndStaleRejected(String action) throws Exception {
        var i=investigation(create(true)); Object input=Map.of();
        if(!action.equals("cancel")) caller=destinationCookie;
        if(Set.of("start","return","complete").contains(action)) i=transition(i,"receive",Map.of(),200);
        if(action.equals("complete")) { i=transition(i,"start",Map.of(),200); input=eligibility(true,true); }
        if(action.equals("return")) input=Map.of("returnReason","Reason");
        call(post(ikPath(i)+"/"+action),input,428); call(post(ikPath(i)+"/"+action).header("If-Match","bad"),input,400);
        call(post(ikPath(i)+"/"+action).header("If-Match","\"100\""),input,409);
    }
    @ParameterizedTest @ValueSource(strings={"patch","complete","stop","lost-to-follow-up"}) void tptIfMatchIsRequired(String action) throws Exception {
        var t=start(completed(false)); var body=action.equals("patch") ? Map.of("notes","No") : Map.of("closureReason","Reason");
        var path=tptPath(t)+(action.equals("patch") ? "" : "/"+action);
        call(action.equals("patch") ? patch(path) : post(path),body,428);
        call((action.equals("patch") ? patch(path) : post(path)).header("If-Match","bad"),body,400);
        call((action.equals("patch") ? patch(path) : post(path)).header("If-Match","\"100\""),body,409);
    }
    @Test void outgoingDestinationCanReturnAfterStartAndSourceCannotComplete() throws Exception {
        var i=investigation(create(true)); caller=destinationCookie; i=transition(i,"receive",Map.of(),200); i=transition(i,"start",Map.of(),200);
        caller=sourceCookie; transition(i,"complete",eligibility(true,true),404); caller=destinationCookie; i=transition(i,"return",Map.of("returnReason","Reason"),200);
        transition(i,"complete",eligibility(true,true),409); assertThat(jdbc.queryForObject("select active_tb_excluded from contact_investigations",Boolean.class)).isNull();
    }
    @Test void canonicalRoRegimenMatchesOnlyRoIndexCase() throws Exception {
        jdbc.update("update tb_cases set case_category_code='TB_RO' where id=?",caseId); var i=completed(false); var input=tptInput(); input.put("regimenCode","TPT_RO_6LFX");
        var t=call(post(ikPath(i)+"/tpt"),input,201); assertThat(t.path("regimenName").asText()).isEqualTo("TPT RO 6Lfx"); assertThat(t.path("durationValue").isNull()).isTrue();
    }
    @Test void safeIndividualizedDescriptionDoesNotFallBackToOfficerNotes() throws Exception {
        var i=completed(false); jdbc.update("update contacts set linked_patient_id=? where id=?",linkedPatient,UUID.fromString(i.path("contact").path("id").asText()));
        var input=tptInput(); input.remove("regimenCode"); input.put("regimenDescription","Clinician-selected individual regimen"); input.put("notes","PRIVATE OFFICER"); call(post(ikPath(i)+"/tpt"),input,201);
        caller=selfCookie; String body=call(get("/api/v1/me/tpt"),null,200).toString(); assertThat(body).contains("Clinician-selected individual regimen").doesNotContain("PRIVATE OFFICER","notes","contact","indexCase");
    }
    @Test void selfPatientOwnedTptUsesLeftJoinsAndLatestSelection() throws Exception {
        jdbc.update("insert into preventive_treatments(patient_id,facility_id,start_date,status,regimen_description) values (?,?,?,'COMPLETED','Historical safe regimen')",linkedPatient,source,today().minusDays(2));
        jdbc.update("insert into preventive_treatments(patient_id,facility_id,start_date,status,regimen_description) values (?,?,?,'STOPPED','Latest safe regimen')",linkedPatient,source,today().minusDays(1));
        caller=selfCookie; var t=call(get("/api/v1/me/tpt"),null,200); assertThat(t.path("regimenDisplay").asText()).isEqualTo("Latest safe regimen");
    }
    @Test void allFourteenAuditActionsArePresentAndPrivacySafe() throws Exception {
        auditMetadataNeverCopiesSensitiveNarratives(); caller=sourceCookie;
        var i=investigation(create(true)); caller=destinationCookie; i=transition(i,"receive",Map.of(),200); i=transition(i,"start",Map.of(),200); transition(i,"return",Map.of("returnReason","PRIVATE RETURN"),200);
        caller=sourceCookie; i=investigation(create(true)); transition(i,"cancel",Map.of(),200);
        var t=start(completed(false)); call(post(tptPath(t)+"/complete").header("If-Match",version(t)),Map.of(),200);
        t=start(completed(false)); call(post(tptPath(t)+"/lost-to-follow-up").header("If-Match",version(t)),Map.of(),200);
        assertThat(jdbc.queryForList("select distinct action from audit_logs where action like 'CONTACT_%' or action like 'TPT_%'",String.class)).containsExactlyInAnyOrder(
                "CONTACT_CREATED","CONTACT_UPDATED","CONTACT_LINKED_PATIENT","CONTACT_INVESTIGATION_SENT","CONTACT_INVESTIGATION_RECEIVED","CONTACT_INVESTIGATION_STARTED","CONTACT_INVESTIGATION_RETURNED","CONTACT_INVESTIGATION_CANCELLED","CONTACT_INVESTIGATION_COMPLETED","TPT_STARTED","TPT_UPDATED","TPT_COMPLETED","TPT_STOPPED","TPT_LOST_TO_FOLLOW_UP");
        for(var row:jdbc.queryForList("select metadata from audit_logs where action like 'CONTACT_%' or action like 'TPT_%'")) assertThat(row.toString()).doesNotContain("PRIVATE","eligible","regimen","reason","result");
    }
    @Test void sourcePoliciesAreInvokedForContactInvestigationAndTptWrites() throws Exception {
        var c=create(false); verify(contactSource).requireLocalContactWrite(any(),eq("CONTACT_WRITE"),eq(source),eq(caseId),isNull());
        c=call(patch(contactPath(c)).header("If-Match",version(c)),Map.of("address","Updated"),200); verify(contactSource).requireLocalContactWrite(any(),eq("CONTACT_WRITE"),eq(source),eq(caseId),eq(uuid(c)));
        var i=transition(investigation(c),"complete",eligibility(true,true),200); verify(contactSource).requireLocalInvestigationTransition(any(),eq("CONTACT_WRITE"),eq(source),eq(uuid(i)));
        var t=start(i); verify(contactSource).requireLocalTptWrite(any(),eq("TPT_WRITE"),eq(source),eq(uuid(c)),isNull());
        t=call(patch(tptPath(t)).header("If-Match",version(t)),Map.of("notes","Updated"),200); verify(contactSource).requireLocalTptWrite(any(),eq("TPT_WRITE"),eq(source),eq(uuid(c)),eq(uuid(t)));
    }
    @ParameterizedTest @ValueSource(strings={"contactCreate","investigationCreate","contactPatch","link","investigationComplete","tptStart","tptPatch","tptClose"}) void sourceDenialRollsBackAllWritesAndSuccessAudits(String operation) throws Exception {
        JsonNode c=null,i=null,t=null;
        if(!operation.endsWith("Create")) { c=create(false); i=investigation(c); if(operation.startsWith("tpt")) { i=transition(i,"complete",eligibility(true,true),200); if(!operation.equals("tptStart")) t=start(i); } }
        var before=snapshot(); int auditBefore=contactAudits()+jdbc.queryForObject("select count(*) from audit_logs where action like 'TPT_%'",Integer.class);
        if(operation.startsWith("contact") || operation.equals("link")) doThrow(ApplicationFailure.forbidden()).when(contactSource).requireLocalContactWrite(any(),anyString(),any(),any(),nullable(UUID.class));
        else if(operation.startsWith("investigation")) doThrow(ApplicationFailure.forbidden()).when(contactSource).requireLocalInvestigationTransition(any(),anyString(),any(),nullable(UUID.class));
        else doThrow(ApplicationFailure.forbidden()).when(contactSource).requireLocalTptWrite(any(),anyString(),any(),any(),nullable(UUID.class));
        switch(operation) {
            case "contactCreate","investigationCreate" -> call(post(createPath()),createInput(false),403);
            case "contactPatch" -> call(patch(contactPath(c)).header("If-Match",version(c)),Map.of("fullName","No"),403);
            case "link" -> call(post(contactPath(c)+"/link-patient").header("If-Match",version(c)),link(linkedPatient),403);
            case "investigationComplete" -> transition(i,"complete",eligibility(true,true),403);
            case "tptStart" -> call(post(ikPath(i)+"/tpt"),tptInput(),403);
            case "tptPatch" -> call(patch(tptPath(t)).header("If-Match",version(t)),Map.of("notes","No"),403);
            default -> call(post(tptPath(t)+"/complete").header("If-Match",version(t)),Map.of(),403);
        }
        assertThat(snapshot()).isEqualTo(before); assertThat(contactAudits()+jdbc.queryForObject("select count(*) from audit_logs where action like 'TPT_%'",Integer.class)).isEqualTo(auditBefore);
    }
    @ParameterizedTest @ValueSource(booleans={false,true}) void waitingReceiveOrCancelReadsFreshInvestigationUnderContactLock(boolean receiveFirst) throws Exception {
        var i=investigation(create(true)); var locked=new CountDownLatch(1); var release=new CountDownLatch(1); UUID firstFacility=receiveFirst ? destination : source;
        doAnswer(inv -> { locked.countDown(); if(!release.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Lock gate timeout"); return inv.callRealMethod(); }).when(contactSource).requireLocalInvestigationTransition(any(),eq("CONTACT_WRITE"),eq(firstFacility),eq(uuid(i)));
        try(var pool=Executors.newFixedThreadPool(2)) {
            var first=pool.submit(() -> direct(receiveFirst ? destinationCookie : sourceCookie,ikPath(i)+(receiveFirst ? "/receive" : "/cancel"),Map.of(),version(i)));
            Future<Integer> second=null; try { assertThat(locked.await(30,TimeUnit.SECONDS)).isTrue(); second=pool.submit(() -> direct(receiveFirst ? sourceCookie : destinationCookie,ikPath(i)+(receiveFirst ? "/cancel" : "/receive"),Map.of(),version(i))); assertContactLockWait(); } finally { release.countDown(); }
            assertThat(first.get(30,TimeUnit.SECONDS)).isEqualTo(200); assertThat(second.get(30,TimeUnit.SECONDS)).isEqualTo(409);
        }
        assertThat(jdbc.queryForObject("select status from contact_investigations",String.class)).isEqualTo(receiveFirst ? "RECEIVED" : "CANCELLED");
    }
    private Map<String,List<Map<String,Object>>> snapshot() { var result=new LinkedHashMap<String,List<Map<String,Object>>>(); for(String table:List.of("contacts","contact_investigations","preventive_treatments","patients","tb_registrations","tb_cases")) result.put(table,jdbc.queryForList("select * from "+table+" order by id")); return result; }
    private int direct(Cookie cookie,String path,Object body,String match) throws Exception { var r=post(path).cookie(cookie).with(csrf()).contentType("application/json").content(json.writeValueAsString(body)); if(match!=null) r.header("If-Match",match); return mvc.perform(r).andReturn().getResponse().getStatus(); }
    private void assertContactLockWait() throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15); boolean waiting=false;
        while(System.nanoTime()<deadline) { waiting=Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%contacts%' and cardinality(pg_blocking_pids(pid))>0)",Boolean.class)); if(waiting) break; Thread.sleep(25); }
        assertThat(waiting).as("Competing HTTP command must actually wait on the PostgreSQL Contact lock").isTrue();
    }
    private JsonNode create(boolean outgoing) throws Exception { return call(post(createPath()),createInput(outgoing),201); }
    private Map<String,Object> createInput(boolean outgoing) { var m=new HashMap<String,Object>(Map.of("fullName","Contact Snapshot","phone","0812-3456-789","address","PRIVATE ADDRESS","birthDate","2000-01-01","sexCode","PEREMPUAN","householdContact",true,"workflowType",outgoing ? "OUTGOING_REFERRAL" : "INTERNAL","notes","PRIVATE IK NOTE")); if(outgoing) m.put("destinationFacilityId",destination); return m; }
    private Map<String,Object> link(UUID patient) { return new HashMap<>(Map.of("patientId",patient,"citizenship","WNI","nik",patient.equals(linkedPatient) ? "2234567890123456" : "1234567890123456","fullName",patient.equals(linkedPatient) ? " exact linked patient " : "PRIVATE INDEX")); }
    private Map<String,Object> eligibility(boolean excluded,boolean eligible) { return new HashMap<>(Map.of("activeTbExcluded",excluded,"tptEligible",eligible,"resultCode","PRIVATE RESULT","notes","PRIVATE IK NOTE")); }
    private Map<String,Object> tptInput() { return new HashMap<>(Map.of("regimenCode","TPT_SO_6H","startDate",today().toString())); }
    private JsonNode completed(boolean outgoing) throws Exception { caller=sourceCookie; var i=investigation(create(outgoing)); if(outgoing) { caller=destinationCookie; i=transition(i,"receive",Map.of(),200); i=transition(i,"start",Map.of(),200); } return transition(i,"complete",eligibility(true,true),200); }
    private JsonNode investigation(JsonNode c) throws Exception { return call(get("/api/v1/contact-investigations/"+c.path("investigations").get(0).path("id").asText()),null,200); }
    private JsonNode start(JsonNode i) throws Exception { return call(post(ikPath(i)+"/tpt"),tptInput(),201); }
    private JsonNode transition(JsonNode i,String action,Object body,int status) throws Exception { return call(post(ikPath(i)+"/"+action).header("If-Match",version(i)),body,status); }
    private String createPath() { return "/api/v1/cases/"+caseId+"/contacts"; }
    private String contactPath(JsonNode c) { return "/api/v1/contacts/"+uuid(c); }
    private String ikPath(JsonNode i) { return "/api/v1/contact-investigations/"+uuid(i); }
    private String tptPath(JsonNode t) { return "/api/v1/preventive-treatments/"+uuid(t); }
    private UUID uuid(JsonNode node) { return UUID.fromString(node.path("id").asText()); }
    private String version(JsonNode node) { return "\""+node.path("version").asLong()+"\""; }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int status) throws Exception { request.cookie(caller).with(csrf()); if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body)); var response=mvc.perform(request).andExpect(status().is(status)).andReturn().getResponse(); return json.readTree(response.getContentAsString()); }
    private List<Integer> race(Cookie a,String pathA,Object bodyA,String matchA,Cookie b,String pathB,Object bodyB,String matchB) throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) { CountDownLatch ready=new CountDownLatch(2),go=new CountDownLatch(1); var x=pool.submit(() -> raw(a,pathA,bodyA,matchA,ready,go)); var y=pool.submit(() -> raw(b,pathB,bodyB,matchB,ready,go)); try { assertThat(ready.await(30,TimeUnit.SECONDS)).isTrue(); } finally { go.countDown(); } return List.of(x.get(30,TimeUnit.SECONDS),y.get(30,TimeUnit.SECONDS)); }
    }
    private int raw(Cookie cookie,String path,Object body,String match,CountDownLatch ready,CountDownLatch go) throws Exception { ready.countDown(); if(!go.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Race timeout"); var r=post(path).cookie(cookie).with(csrf()).contentType("application/json").content(json.writeValueAsString(body)); if(match!=null) r.header("If-Match",match); return mvc.perform(r).andReturn().getResponse().getStatus(); }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID patient(String name,String nik) { return jdbc.queryForObject("insert into patients(full_name,citizenship,nik,birth_date,sex_code) values (?,'WNI',?,'2000-01-01','PEREMPUAN') returning id",UUID.class,name,nik); }
    private UUID user(String email,String role,UUID facility) { UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash); jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role); if(facility!=null) jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,facility); return id; }
    private Cookie login(String email) throws Exception { return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION"); }
    private int count(String table) { return jdbc.queryForObject("select count(*) from "+table,Integer.class); }
    private int contactAudits() { return jdbc.queryForObject("select count(*) from audit_logs where action like 'CONTACT_%'",Integer.class); }
    private LocalDate today() { return LocalDate.now(clock); } private OffsetDateTime now() { return OffsetDateTime.now(clock); }
}
