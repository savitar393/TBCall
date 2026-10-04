package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.*;
import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
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
class TreatmentIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords; @Autowired Clock clock;
    @MockitoSpyBean ClinicalSourceAuthorityPolicy clinicalSource;
    @MockitoSpyBean LaboratorySourceAuthorityPolicy laboratorySource;
    final JsonMapper json=JsonMapper.builder().build();
    static String hash;
    static final String PASSWORD="Treatment password 123!";
    UUID facility,foreign,patient,registration,caseId,officer,self,supporter;
    Cookie staffCookie,selfCookie,supportCookie,caller;
    @BeforeEach void setup() throws Exception {
        reset(clinicalSource,laboratorySource);
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=facility("Fasyankes"); foreign=facility("Lain");
        officer=user("officer@example.org","TB_OFFICER",facility); self=user("self@example.org","PATIENT",null);
        supporter=user("support@example.org","TREATMENT_SUPPORTER",null);
        patient=jdbc.queryForObject("insert into patients(full_name,nik,bpjs_number,birth_date,sex_code) values ('Pasien Pengobatan','1234567890123456','BPJS-SECRET','1990-01-01','PEREMPUAN') returning id",UUID.class);
        registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?, ?, ?, 'CONVERTED_TO_CASE') returning id",UUID.class,patient,facility,today().minusDays(3));
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,?,'PRIVATE-DIAGNOSIS','TREAT_HERE') returning id",UUID.class,registration,today().minusDays(2));
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code,hiv_status_code,dm_status_code) values (?,?,?,'TB_SO','BARU','POSITIF','YA') returning id",UUID.class,registration,diagnosis,facility);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",self,patient);
        jdbc.update("insert into patient_supporters(case_id,supporter_type,full_name,linked_user_id,active) values (?,'PMO','PMO',?,true)",caseId,supporter);
        staffCookie=login("officer@example.org"); selfCookie=login("self@example.org"); supportCookie=login("support@example.org"); caller=staffCookie;
    }
    @Test void startStoresExplicitSnapshotAndNeverInfersCompositionOrDose() throws Exception {
        JsonNode t=start();
        assertThat(t.path("status").asText()).isEqualTo("ACTIVE"); assertThat(t.path("facility").path("id").asText()).isEqualTo(facility.toString());
        assertThat(t.path("drugs")).hasSize(1); assertThat(t.path("drugs").get(0).path("drugName").asText()).isEqualTo("Isoniazid");
        assertThat(t.path("drugs").get(0).path("doseValue").isNull()).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from treatment_drugs",Integer.class)).isEqualTo(1);
        assertThat(call(get("/api/v1/cases/"+caseId+"/treatments"),null,200)).hasSize(1); audited("TREATMENT_STARTED");
        assertThat(t.path("caseId").asText()).isEqualTo(caseId.toString());
    }
    @ParameterizedTest @ValueSource(strings={"REFERRED","COMPLETED","CANCELLED","TRANSFERRED","CLOSED"})
    void onlyActiveCaseStarts(String state) throws Exception {
        jdbc.update("update tb_cases set status=? where id=?",state,caseId); call(post(startPath()),startInput(),409);
        assertThat(jdbc.queryForObject("select count(*) from treatments",Integer.class)).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"PLANNED","ACTIVE","PAUSED"})
    void existingOpenTreatmentBlocksStart(String state) throws Exception {
        jdbc.update("insert into treatments(case_id,facility_id,start_date,status) values (?,?,?,?)",caseId,facility,today().minusDays(1),state);
        call(post(startPath()),startInput(),409);
    }
    @ParameterizedTest @ValueSource(strings={"TRANSFERRED","COMPLETED","STOPPED","CANCELLED"})
    void terminalHistoryWithoutOutcomeDoesNotBlockNewTreatment(String state) throws Exception {
        jdbc.update("insert into treatments(case_id,facility_id,start_date,status) values (?,?,?,?)",caseId,facility,today().minusDays(1),state); start();
        assertThat(jdbc.queryForObject("select count(*) from treatments",Integer.class)).isEqualTo(2);
    }
    @Test void anyHistoricalFinalOutcomeBlocksAnotherTreatment() throws Exception {
        UUID t=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status) values (?,?,?,'COMPLETED') returning id",UUID.class,caseId,facility,today().minusDays(1));
        jdbc.update("insert into treatment_outcomes(treatment_id,outcome_code,outcome_date) values (?,'SEMBUH',?)",t,today());
        call(post(startPath()),startInput(),409);
    }
    @ParameterizedTest @ValueSource(strings={"wrongCategory","inactiveRegimen","wrongKind","inactiveDrug","noDrugs","tooMany","duplicate","futureStart","beforeDiagnosis","badEnd","badPhase","badWeight","badDose","missingUnit","frequency","drugBeforeStart","drugEnd","derivedField"})
    void invalidStartIsAtomic(String invalid) throws Exception {
        Map<String,Object> input=startInput(); var drug=new HashMap<>(drugInput());
        switch(invalid) {
            case "wrongCategory" -> input.put("regimenCode","RO_BPALM");
            case "inactiveRegimen" -> jdbc.update("update regimens set active=false where code='SO_6M_2HRZE_4HR'");
            case "wrongKind" -> jdbc.update("update regimens set regimen_kind='PREVENTIVE' where code='SO_6M_2HRZE_4HR'");
            case "inactiveDrug" -> jdbc.update("update drugs set active=false where code='H'");
            case "noDrugs" -> input.put("drugs",List.of());
            case "tooMany" -> input.put("drugs",Collections.nCopies(21,drug));
            case "duplicate" -> input.put("drugs",List.of(drug,drug));
            case "futureStart" -> input.put("startDate",today().plusDays(1).toString());
            case "beforeDiagnosis" -> input.put("startDate",today().minusDays(5).toString());
            case "badEnd" -> input.put("plannedEndDate",today().minusDays(2).toString());
            case "badPhase" -> { input.put("intensiveStartDate",today().toString()); input.put("intensiveEndDate",today().minusDays(1).toString()); }
            case "badWeight" -> input.put("initialWeightKg",0);
            case "badDose" -> drug.put("doseValue",-1);
            case "missingUnit" -> drug.put("doseValue",100);
            case "frequency" -> drug.put("frequencyPerWeek",8);
            case "drugBeforeStart" -> drug.put("startDate",today().minusDays(2).toString());
            case "drugEnd" -> drug.put("endDate",today().minusDays(2).toString());
            default -> input.put("status","COMPLETED");
        }
        if(Set.of("badDose","missingUnit","frequency","drugBeforeStart","drugEnd").contains(invalid)) input.put("drugs",List.of(drug));
        try { call(post(startPath()),input,400); }
        finally { jdbc.update("update regimens set active=true,regimen_kind='TB_TREATMENT' where code='SO_6M_2HRZE_4HR'"); jdbc.update("update drugs set active=true where code='H'"); }
        assertThat(jdbc.queryForObject("select count(*) from treatments",Integer.class)).isZero(); assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='TREATMENT_STARTED'",Integer.class)).isZero();
    }
    @Test void metadataPatchRequiresVersionAndPreservesOmittedFields() throws Exception {
        JsonNode t=start(); String p=path(t);
        call(patch(p),Map.of("notes","Changed"),428); call(patch(p).header("If-Match","\"99\""),Map.of("notes","Changed"),409);
        JsonNode updated=call(patch(p).header("If-Match","\"0\""),Map.of("initialWeightKg",new BigDecimal("52.25"),"plannedEndDate",today().plusMonths(6).toString()),200);
        assertThat(updated.path("version").asLong()).isEqualTo(1); assertThat(updated.path("notes").asText()).isEqualTo("PRIVATE-TREATMENT");
        Map<String,Object> nullNotes=new HashMap<>(); nullNotes.put("notes",null);
        assertThat(call(patch(p).header("If-Match","\"1\""),nullNotes,200).path("notes").isNull()).isTrue();
        call(patch(p).header("If-Match","\"0\""),Map.of("notes","Stale"),409); audited("TREATMENT_UPDATED");
    }
    @ParameterizedTest @ValueSource(strings={"caseId","facilityId","regimenCode","startDate","status","actualEndDate","drugs"})
    void patchRejectsImmutableFields(String field) throws Exception {
        JsonNode t=start(); call(patch(path(t)).header("If-Match","\"0\""),Map.of(field,"FORBIDDEN"),400);
        assertThat(call(get(path(t)),null,200).path("version").asLong()).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","LAB_STAFF","PATIENT","TREATMENT_SUPPORTER"})
    void otherRolesHaveNoStaffBypass(String role) throws Exception {
        JsonNode t=start(); user("other@example.org",role,facility); caller=login("other@example.org");
        call(post(startPath()),startInput(),403); call(get(path(t)),null,403); call(get(startPath()),null,403);
        call(patch(path(t)).header("If-Match","\"0\""),Map.of("notes","x"),403);
        call(post(path(t)+"/dose-events"),dose("MISSED"),403);
        call(post(path(t)+"/follow-ups").header("If-Match","\"0\""),schedule(),403);
        call(post(path(t)+"/adverse-events"),adverse(),403);
        call(post(path(t)+"/outcome").header("If-Match","\"0\""),outcome(),403);
    }
    @Test void facilityScopeAndRevokedMembershipAreEnforced() throws Exception {
        JsonNode t=start(); user("foreign@example.org","TB_OFFICER",foreign); caller=login("foreign@example.org");
        call(get(path(t)),null,404); call(post(startPath()),startInput(),404); call(get(startPath()),null,404);
        caller=staffCookie; jdbc.update("update tb_cases set current_facility_id=? where id=?",foreign,caseId); call(get(path(t)),null,404);
        jdbc.update("update tb_cases set current_facility_id=? where id=?",facility,caseId);
        jdbc.update("update user_facilities set active=false where user_id=?",officer); call(get(path(t)),null,403);
    }
    @ParameterizedTest @CsvSource({"staff,TAKEN_OBSERVED,HEALTH_WORKER","staff,TAKEN_SELF_REPORTED,HEALTH_WORKER","staff,DISPENSED_HOME,HEALTH_WORKER","staff,MISSED,HEALTH_WORKER","staff,UNKNOWN,HEALTH_WORKER","patient,TAKEN_SELF_REPORTED,PATIENT","patient,MISSED,PATIENT","patient,UNKNOWN,PATIENT","supporter,TAKEN_OBSERVED,TREATMENT_SUPPORTER","supporter,TAKEN_SELF_REPORTED,TREATMENT_SUPPORTER","supporter,MISSED,TREATMENT_SUPPORTER","supporter,UNKNOWN,TREATMENT_SUPPORTER"})
    void doseRoutesDeriveProvenanceAndPreserveClinicalState(String route,String status,String source) throws Exception {
        JsonNode t=start(); String p=dosePath(t,route); var original=jdbc.queryForMap("select * from treatments where id=?",id(t));
        var c=jdbc.queryForMap("select * from tb_cases where id=?",caseId);
        JsonNode event=call(post(p),dose(status),201);
        assertThat(event.path("source").asText()).isEqualTo(source); assertThat(event.path("recordedAt").asText()).isNotBlank();
        assertThat(jdbc.queryForObject("select recorded_by_user_id from dose_events where id=?",UUID.class,id(event))).isEqualTo(route.equals("staff") ? officer : route.equals("patient") ? self : supporter);
        assertThat(call(get(p),null,200).path("content")).hasSize(1);
        assertThat(jdbc.queryForMap("select * from treatments where id=?",id(t))).isEqualTo(original); assertThat(jdbc.queryForMap("select * from tb_cases where id=?",caseId)).isEqualTo(c);
        assertThat(jdbc.queryForObject("select count(*) from treatment_outcomes",Integer.class)).isZero(); audited("DOSE_EVENT_RECORDED");
    }
    @ParameterizedTest @CsvSource({"staff,TAKEN","patient,TAKEN_OBSERVED","patient,DISPENSED_HOME","supporter,DISPENSED_HOME","patient,TAKEN","supporter,TAKEN"})
    void routeSpecificDoseStatusesRejectInvalidEvidence(String route,String status) throws Exception {
        JsonNode t=start(); call(post(dosePath(t,route)),dose(status),400); assertThat(jdbc.queryForObject("select count(*) from dose_events",Integer.class)).isZero();
    }
    @Test void sameActorDayIsDuplicateDifferentActorsCoexistAndEvidenceIsImmutable() throws Exception {
        JsonNode t=start(); JsonNode e=call(post(path(t)+"/dose-events"),dose("MISSED"),201);
        assertThat(call(post(path(t)+"/dose-events"),dose("UNKNOWN"),409).path("code").asText()).isEqualTo("DOSE_EVENT_ALREADY_RECORDED");
        caller=selfCookie; call(post("/api/v1/me/treatment/dose-events"),dose("TAKEN_SELF_REPORTED"),201);
        caller=supportCookie; call(post("/api/v1/me/supporting-cases/"+caseId+"/dose-events"),dose("TAKEN_OBSERVED"),201);
        assertThat(jdbc.queryForObject("select count(*) from dose_events",Integer.class)).isEqualTo(3);
        caller=staffCookie; call(patch("/api/v1/dose-events/"+id(e)),dose("UNKNOWN"),404); call(delete("/api/v1/dose-events/"+id(e)),null,404);
        call(get(path(t)+"/dose-events").param("size","101"),null,400); call(get(path(t)+"/dose-events").param("page","-1"),null,400);
    }
    @ParameterizedTest @ValueSource(strings={"future","beforeStart","mode","source","actor"})
    void doseDatesAndDerivedFieldsAreValidated(String invalid) throws Exception {
        JsonNode t=start(); Map<String,Object> b=dose("MISSED");
        switch(invalid) { case "future" -> b.put("scheduledDate",today().plusDays(1).toString()); case "beforeStart" -> b.put("scheduledDate",today().minusDays(3).toString()); case "mode" -> b.put("administrationMode","UNKNOWN_MODE"); case "source" -> b.put("source","SITB"); default -> b.put("recordedByUserId",officer); }
        call(post(path(t)+"/dose-events"),b,400);
    }
    @Test void selfAndSupporterLinksAreExactAndRevocationTakesEffect() throws Exception {
        JsonNode t=start(); caller=selfCookie; call(get(path(t)),null,403);
        call(post(path(t)+"/dose-events"),dose("MISSED"),403);
        caller=supportCookie; call(get("/api/v1/me/supporting-cases/"+UUID.randomUUID()+"/treatment"),null,404);
        call(post("/api/v1/me/supporting-cases/"+UUID.randomUUID()+"/dose-events"),dose("MISSED"),404);
        jdbc.update("update patient_supporters set active=false where linked_user_id=?",supporter);
        call(get("/api/v1/me/supporting-cases/"+caseId+"/treatment"),null,404);
        caller=selfCookie; jdbc.update("update patient_user_links set verification_status='REVOKED' where user_id=?",self);
        call(get("/api/v1/me/treatment"),null,403); call(post("/api/v1/me/treatment/dose-events"),dose("MISSED"),403);
    }
    @Test void followUpScheduleCompletePersistsStructuredObservationsAndDoesNotAutomate() throws Exception {
        JsonNode t=start(); String p=path(t)+"/follow-ups";
        call(post(p),schedule(),428); call(post(p).header("If-Match","\"99\""),schedule(),409);
        JsonNode f=call(post(p).header("If-Match","\"0\""),schedule(),201);
        assertThat(call(get(path(t)),null,200).path("version").asLong()).isEqualTo(1);
        call(post(p).header("If-Match","\"0\""),schedule(),409);
        String complete="/api/v1/follow-ups/"+id(f)+"/complete";
        call(post(complete),completion(),428); call(post(complete).header("If-Match","\"99\""),completion(),409);
        JsonNode done=call(post(complete).header("If-Match","\"0\""),completion(),200);
        assertThat(done.path("status").asText()).isEqualTo("COMPLETED"); assertThat(done.path("weightKg").decimalValue()).isEqualByComparingTo("53.25");
        var row=jdbc.queryForMap("select * from follow_ups where id=?",id(f)); assertThat(row.get("health_worker_id")).isEqualTo(officer); assertThat(row.get("symptom_summary")).isEqualTo("PRIVATE-SYMPTOM"); assertThat(row.get("adherence_assessment")).isEqualTo("PRIVATE-ASSESSMENT");
        call(post(complete).header("If-Match","\"1\""),completion(),409);
        assertThat(jdbc.queryForObject("select count(*) from lab_requests",Integer.class)).isZero(); assertThat(jdbc.queryForObject("select count(*) from dose_events",Integer.class)).isZero(); assertThat(jdbc.queryForObject("select count(*) from treatment_outcomes",Integer.class)).isZero();
        caller=selfCookie; JsonNode safe=call(get("/api/v1/me/follow-ups"),null,200); assertThat(safe).hasSize(1); assertThat(safe.toString()).doesNotContain("PRIVATE","adherenceAssessment","symptomSummary","healthWorker");
        caller=supportCookie; call(get("/api/v1/me/follow-ups"),null,403); audited("FOLLOW_UP_SCHEDULED","FOLLOW_UP_COMPLETED");
    }
    @Test void followUpRejectsForeignFacilityFutureCompletionAndBadWeight() throws Exception {
        JsonNode t=start(); var s=schedule(); s.put("facilityId",foreign); call(post(path(t)+"/follow-ups").header("If-Match","\"0\""),s,404);
        JsonNode f=call(post(path(t)+"/follow-ups").header("If-Match","\"0\""),schedule(),201);
        String p="/api/v1/follow-ups/"+id(f)+"/complete";
        var b=completion(); b.put("completedAt",now().plusDays(1).toString()); call(post(p).header("If-Match","\"0\""),b,400);
        b=completion(); b.put("completedAt",now().minusDays(2).toString()); call(post(p).header("If-Match","\"0\""),b,400);
        b=completion(); b.put("weightKg",0); call(post(p).header("If-Match","\"0\""),b,400);
    }
    @Test void adverseEventsRequireValidTimelineVersionAndRemainUpdatableAfterClosure() throws Exception {
        JsonNode t=start(); JsonNode e=call(post(path(t)+"/adverse-events"),adverse(),201); String p="/api/v1/adverse-events/"+id(e);
        call(patch(p),Map.of("serious",true),428); call(patch(p).header("If-Match","\"99\""),Map.of("serious",true),409);
        var b=adverse(); b.put("startedAt",now().plusDays(1).toString()); call(post(path(t)+"/adverse-events"),b,400);
        b=adverse(); b.put("startedAt",now().toString()); b.put("endedAt",now().minusHours(1).toString()); call(post(path(t)+"/adverse-events"),b,400);
        call(post(path(t)+"/outcome").header("If-Match","\"0\""),outcome(),201);
        JsonNode updated=call(patch(p).header("If-Match","\"0\""),Map.of("serious",true,"actionTaken","PRIVATE-ACTION"),200);
        assertThat(updated.path("serious").asBoolean()).isTrue(); assertThat(updated.path("eventType").asText()).isEqualTo("Mual");
        call(post(path(t)+"/adverse-events"),adverse(),409); audited("ADVERSE_EVENT_RECORDED","ADVERSE_EVENT_UPDATED");
    }
    @Test void outcomeClosesLifecycleExplicitlyAndStopsActiveOnlyCommands() throws Exception {
        JsonNode t=start(); String p=path(t)+"/outcome";
        call(post(p),outcome(),428); call(post(p).header("If-Match","\"99\""),outcome(),409);
        JsonNode result=call(post(p).header("If-Match","\"0\""),outcome(),201); assertThat(result.path("outcomeCode").asText()).isEqualTo("SEMBUH");
        JsonNode closed=call(get(path(t)),null,200); assertThat(closed.path("status").asText()).isEqualTo("COMPLETED"); assertThat(closed.path("actualEndDate").asText()).isEqualTo(today().toString());
        var c=jdbc.queryForMap("select status,closed_at from tb_cases where id=?",caseId); assertThat(c.get("status")).isEqualTo("COMPLETED"); assertThat(c.get("closed_at")).isNotNull();
        call(post(p).header("If-Match","\"1\""),outcome(),409); call(patch(path(t)).header("If-Match","\"1\""),Map.of("notes","x"),409);
        call(post(path(t)+"/dose-events"),dose("MISSED"),409); call(post(path(t)+"/follow-ups").header("If-Match","\"1\""),schedule(),409);
        call(patch(p).header("If-Match","\"1\""),outcome(),405); call(delete(p),null,405); audited("TREATMENT_OUTCOME_RECORDED");
    }
    @ParameterizedTest @ValueSource(strings={"inactive","unknown","future","beforeStart"})
    void outcomeReferenceAndDatesAreValidated(String invalid) throws Exception {
        JsonNode t=start(); var b=outcome();
        switch(invalid) { case "inactive" -> jdbc.update("update treatment_outcome_codes set active=false where code='SEMBUH'"); case "unknown" -> b.put("outcomeCode","UNKNOWN_CODE"); case "future" -> b.put("outcomeDate",today().plusDays(1).toString()); default -> b.put("outcomeDate",today().minusDays(2).toString()); }
        try { call(post(path(t)+"/outcome").header("If-Match","\"0\""),b,400); } finally { jdbc.update("update treatment_outcome_codes set active=true where code='SEMBUH'"); }
        assertThat(jdbc.queryForObject("select count(*) from treatment_outcomes",Integer.class)).isZero(); assertThat(call(get(path(t)),null,200).path("status").asText()).isEqualTo("ACTIVE");
    }
    @Test void projectionsExcludeClinicalOperationalTextAndOtherUserIdentity() throws Exception {
        JsonNode t=start(); call(post(path(t)+"/dose-events"),dose("MISSED"),201); call(post(path(t)+"/adverse-events"),adverse(),201);
        JsonNode staff=call(get(path(t)),null,200); assertThat(staff.path("notes").asText()).isEqualTo("PRIVATE-TREATMENT");
        caller=selfCookie; JsonNode own=call(get("/api/v1/me/treatment"),null,200);
        assertThat(own.path("drugs")).hasSize(1); assertThat(own.path("adverseEvents")).hasSize(1);
        safe(own); assertThat(own.toString()).doesNotContain(officer.toString(),"recordedByUser","drugSource","batchNumber");
        caller=supportCookie; JsonNode support=call(get("/api/v1/me/supporting-cases/"+caseId+"/treatment"),null,200); safe(support);
        assertThat(support.path("patientDisplayName").asText()).isEqualTo("Pasien Pengobatan"); assertThat(support.has("adverseEvents")).isFalse(); assertThat(support.has("outcome")).isFalse();
        JsonNode events=call(get("/api/v1/me/supporting-cases/"+caseId+"/dose-events"),null,200); safe(events); assertThat(events.toString()).doesNotContain(officer.toString());
    }
    @Test void clinicalSourceDenialRollsBackWritesButMonitoringEvidenceDoesNotConsultIt() throws Exception {
        doThrow(ApplicationFailure.forbidden()).when(clinicalSource).requireLocalCreate(any(),anyString(),any(),eq("TREATMENT"));
        call(post(startPath()),startInput(),403); assertThat(jdbc.queryForObject("select count(*) from treatments",Integer.class)).isZero();
        reset(clinicalSource); JsonNode t=start();
        doThrow(ApplicationFailure.forbidden()).when(clinicalSource).requireLocalEdit(any(),anyString(),any(),anyString(),any());
        call(patch(path(t)).header("If-Match","\"0\""),Map.of("notes","x"),403);
        call(post(path(t)+"/outcome").header("If-Match","\"0\""),outcome(),403);
        caller=selfCookie; call(post("/api/v1/me/treatment/dose-events"),dose("MISSED"),201);
        caller=supportCookie; call(post("/api/v1/me/supporting-cases/"+caseId+"/dose-events"),dose("UNKNOWN"),201);
    }
    @Test void auditMetadataHasCorrelationOnly() throws Exception {
        JsonNode t=start(); call(patch(path(t)).header("If-Match","\"0\""),Map.of("notes","PRIVATE-UPDATE"),200);
        call(post(path(t)+"/dose-events"),dose("MISSED"),201);
        JsonNode f=call(post(path(t)+"/follow-ups").header("If-Match","\"1\""),schedule(),201);
        call(post("/api/v1/follow-ups/"+id(f)+"/complete").header("If-Match","\"0\""),completion(),200);
        JsonNode e=call(post(path(t)+"/adverse-events"),adverse(),201);
        call(patch("/api/v1/adverse-events/"+id(e)).header("If-Match","\"0\""),Map.of("description","PRIVATE-UPDATE-EVENT"),200);
        String match="\""+call(get(path(t)),null,200).path("version").asLong()+"\"";
        call(post(path(t)+"/outcome").header("If-Match",match),outcome(),201);
        for(var row:jdbc.queryForList("select metadata::text,entity_id,actor_user_id from audit_logs where action in ('TREATMENT_STARTED','TREATMENT_UPDATED','DOSE_EVENT_RECORDED','FOLLOW_UP_SCHEDULED','FOLLOW_UP_COMPLETED','ADVERSE_EVENT_RECORDED','ADVERSE_EVENT_UPDATED','TREATMENT_OUTCOME_RECORDED')")) {
            assertThat(json.readTree(row.get("metadata").toString()).properties()).hasSize(1); assertThat(row.get("metadata").toString()).contains("traceId").doesNotContain("PRIVATE","MISSED","SEMBUH","1234567890123456"); assertThat(row.get("entity_id")).isNotNull(); assertThat(row.get("actor_user_id")).isEqualTo(officer);
        }
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action<>'LOGIN_SUCCEEDED'",Integer.class)).isGreaterThanOrEqualTo(8);
    }
    @Test void concurrentStartsHaveExactlyOneWinnerWithoutRetry() throws Exception {
        assertThat(race(post(startPath()),startInput(),staffCookie,post(startPath()),startInput(),staffCookie)).containsExactlyInAnyOrder(201,409);
        assertThat(jdbc.queryForObject("select count(*) from treatments",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='TREATMENT_STARTED'",Integer.class)).isEqualTo(1);
    }
    @ParameterizedTest @CsvSource({"ADHERENCE_READ,recentDoseEvents","FOLLOW_UP_READ,followUps","ADVERSE_EVENT_READ,adverseEvents","OUTCOME_READ,outcome","LAB_REQUEST_READ,followUpLabRequests"})
    void aggregateDetailDoesNotBypassChildReadPermissions(String permission,String field) throws Exception {
        JsonNode t=start(); call(post(path(t)+"/dose-events"),dose("MISSED"),201);
        call(post(path(t)+"/follow-ups").header("If-Match","\"0\""),schedule(),201); call(post(path(t)+"/adverse-events"),adverse(),201);
        call(post("/api/v1/lab-requests"),Map.of("caseId",caseId,"testingFacilityId",facility,"requestReasonCode","FOLLOW_UP","testTypeCodes",List.of("TCM")),201);
        call(post(path(t)+"/outcome").header("If-Match","\"1\""),outcome(),201);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code=?)",permission);
        try {
            JsonNode detail=call(get(path(t)),null,200);
            if(field.equals("outcome")) assertThat(detail.path(field).isNull()).isTrue(); else assertThat(detail.path(field)).isEmpty();
            if(permission.equals("ADHERENCE_READ")) assertThat(detail.path("adherenceSummary").isNull()).isTrue();
        } finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='TB_OFFICER' and p.code=?",permission); }
    }
    @ParameterizedTest @CsvSource({"FOLLOW_UP,create","FOLLOW_UP,edit","ADVERSE_EVENT,create","ADVERSE_EVENT,edit"})
    void followUpAndAdverseWritesHonorSourceDenialWithNoSideEffects(String type,String command) throws Exception {
        JsonNode t=start(); JsonNode f=call(post(path(t)+"/follow-ups").header("If-Match","\"0\""),schedule(),201); JsonNode e=call(post(path(t)+"/adverse-events"),adverse(),201);
        var beforeF=jdbc.queryForList("select * from follow_ups"); var beforeE=jdbc.queryForList("select * from adverse_events");
        var beforeT=jdbc.queryForMap("select * from treatments where id=?",id(t)); int auditCount=jdbc.queryForObject("select count(*) from audit_logs",Integer.class);
        if(command.equals("create")) doThrow(ApplicationFailure.forbidden()).when(clinicalSource).requireLocalCreate(any(),anyString(),any(),eq(type));
        else doThrow(ApplicationFailure.forbidden()).when(clinicalSource).requireLocalEdit(any(),anyString(),any(),eq(type),any());
        if(type.equals("FOLLOW_UP")) {
            if(command.equals("create")) call(post(path(t)+"/follow-ups").header("If-Match","\"1\""),schedule(),403);
            else call(post("/api/v1/follow-ups/"+id(f)+"/complete").header("If-Match","\"0\""),completion(),403);
        } else {
            if(command.equals("create")) call(post(path(t)+"/adverse-events"),adverse(),403);
            else call(patch("/api/v1/adverse-events/"+id(e)).header("If-Match","\"0\""),Map.of("serious",true),403);
        }
        assertThat(jdbc.queryForList("select * from follow_ups")).isEqualTo(beforeF); assertThat(jdbc.queryForList("select * from adverse_events")).isEqualTo(beforeE);
        assertThat(jdbc.queryForMap("select * from treatments where id=?",id(t))).isEqualTo(beforeT); assertThat(jdbc.queryForObject("select count(*) from audit_logs",Integer.class)).isEqualTo(auditCount);
    }
    @ParameterizedTest @CsvSource({"PATIENT,ADHERENCE_READ,recentDoseEvents","PATIENT,ADVERSE_EVENT_READ,adverseEvents","PATIENT,OUTCOME_READ,outcome","TREATMENT_SUPPORTER,ADHERENCE_READ,recentDoseEvents"})
    void safeAggregateDoesNotBypassItsChildReadPermissions(String role,String permission,String field) throws Exception {
        JsonNode t=start(); call(post(path(t)+"/dose-events"),dose("MISSED"),201); call(post(path(t)+"/adverse-events"),adverse(),201);
        call(post(path(t)+"/outcome").header("If-Match","\"0\""),outcome(),201);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id=(select id from permissions where code=?)",role,permission);
        caller=role.equals("PATIENT") ? selfCookie : supportCookie;
        try {
            JsonNode detail=call(get(role.equals("PATIENT") ? "/api/v1/me/treatment" : "/api/v1/me/supporting-cases/"+caseId+"/treatment"),null,200);
            if(field.equals("outcome")) assertThat(detail.path(field).isNull()).isTrue(); else assertThat(detail.path(field)).isEmpty();
            if(role.equals("TREATMENT_SUPPORTER")) assertThat(detail.path("adherenceSummary").isNull()).isTrue();
        } finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code=? and p.code=?",role,permission); }
    }
    @Test void suppliedDoseScheduleIsStoredAndCatalogRenamingDoesNotChangeDrugSnapshot() throws Exception {
        var body=startInput(); var drug=drugInput(); drug.put("doseValue",new BigDecimal("100.125")); drug.put("doseUnit","mg"); drug.put("frequencyPerWeek",6); drug.put("treatmentPhase","INTENSIVE"); body.put("drugs",List.of(drug));
        JsonNode t=call(post(startPath()),body,201);
        jdbc.update("update drugs set name='Changed catalog name' where code='H'");
        try {
            JsonNode d=call(get(path(t)),null,200).path("drugs").get(0);
            assertThat(d.path("drugName").asText()).isEqualTo("Isoniazid"); assertThat(d.path("doseValue").decimalValue()).isEqualByComparingTo("100.125"); assertThat(d.path("frequencyPerWeek").asInt()).isEqualTo(6);
            caller=selfCookie; assertThat(call(get("/api/v1/me/treatment"),null,200).path("drugs").get(0).path("doseUnit").asText()).isEqualTo("mg");
        } finally { jdbc.update("update drugs set name='Isoniazid' where code='H'"); }
    }
    @ParameterizedTest @ValueSource(strings={"TREATMENT_READ","TREATMENT_WRITE","ADHERENCE_READ","ADHERENCE_RECORD","FOLLOW_UP_WRITE","ADVERSE_EVENT_WRITE","OUTCOME_WRITE"})
    void eachStaffCommandRequiresItsSpecificPermission(String permission) throws Exception {
        JsonNode t=start(); JsonNode f=call(post(path(t)+"/follow-ups").header("If-Match","\"0\""),schedule(),201); JsonNode e=call(post(path(t)+"/adverse-events"),adverse(),201);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code=?)",permission);
        try {
            switch(permission) {
                case "TREATMENT_READ" -> { call(get(path(t)),null,403); call(get(startPath()),null,403); }
                case "TREATMENT_WRITE" -> { call(post(startPath()),startInput(),403); call(patch(path(t)).header("If-Match","\"1\""),Map.of("notes","x"),403); }
                case "ADHERENCE_READ" -> call(get(path(t)+"/dose-events"),null,403);
                case "ADHERENCE_RECORD" -> call(post(path(t)+"/dose-events"),dose("MISSED"),403);
                case "FOLLOW_UP_WRITE" -> { call(post(path(t)+"/follow-ups").header("If-Match","\"1\""),schedule(),403); call(post("/api/v1/follow-ups/"+id(f)+"/complete").header("If-Match","\"0\""),completion(),403); }
                case "ADVERSE_EVENT_WRITE" -> { call(post(path(t)+"/adverse-events"),adverse(),403); call(patch("/api/v1/adverse-events/"+id(e)).header("If-Match","\"0\""),Map.of("serious",true),403); }
                default -> call(post(path(t)+"/outcome").header("If-Match","\"1\""),outcome(),403);
            }
        } finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='TB_OFFICER' and p.code=?",permission); }
    }
    @Test void sameApplicationActorCannotBypassDailyUniquenessThroughAnotherRoleRoute() throws Exception {
        JsonNode t=start(); jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='TB_OFFICER'",self); jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",self,facility);
        caller=selfCookie; call(post(path(t)+"/dose-events"),dose("TAKEN_OBSERVED"),201);
        assertThat(call(post("/api/v1/me/treatment/dose-events"),dose("MISSED"),409).path("code").asText()).isEqualTo("DOSE_EVENT_ALREADY_RECORDED");
    }
    @Test void selfReadsLatestOwnHistoryAndWritesFailSafelyForAmbiguousActiveEpisodes() throws Exception {
        JsonNode t=start();
        UUID other=jdbc.queryForObject("insert into patients(full_name) values ('Another patient') returning id",UUID.class);
        UUID reg=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,?) returning id",UUID.class,other,facility,today());
        UUID c=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,'TB_SO','BARU') returning id",UUID.class,reg,facility);
        jdbc.update("insert into treatments(case_id,facility_id,start_date) values (?,?,?)",c,facility,today());
        caller=selfCookie; assertThat(call(get("/api/v1/me/treatment"),null,200).path("id").asText()).isEqualTo(id(t).toString());
        reg=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,?) returning id",UUID.class,patient,facility,today());
        c=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,'TB_SO','BARU') returning id",UUID.class,reg,facility);
        UUID ownLatest=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date) values (?,?,?) returning id",UUID.class,c,facility,today());
        assertThat(call(get("/api/v1/me/treatment"),null,200).path("id").asText()).isEqualTo(ownLatest.toString());
        assertThat(call(post("/api/v1/me/treatment/dose-events"),dose("MISSED"),409).path("code").asText()).isEqualTo("ACTIVE_TREATMENT_AMBIGUOUS");
        assertThat(jdbc.queryForObject("select count(*) from dose_events",Integer.class)).isZero();
    }
    @Test void explicitFailureOutcomeClosesLifecycleWithoutClaimingClinicalSuccess() throws Exception {
        JsonNode t=start(); var b=outcome(); b.put("outcomeCode","GAGAL"); call(post(path(t)+"/outcome").header("If-Match","\"0\""),b,201);
        caller=selfCookie; JsonNode projected=call(get("/api/v1/me/treatment"),null,200); safe(projected);
        assertThat(projected.path("status").asText()).isEqualTo("COMPLETED"); assertThat(projected.path("outcome").path("outcomeCode").asText()).isEqualTo("GAGAL");
    }
    @Test void concurrentSameActorDayReportsHaveExactlyOneWinner() throws Exception {
        JsonNode t=start(); String p=path(t)+"/dose-events";
        assertThat(race(post(p),dose("MISSED"),staffCookie,post(p),dose("UNKNOWN"),staffCookie)).containsExactlyInAnyOrder(201,409);
        assertThat(jdbc.queryForObject("select count(*) from dose_events",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='DOSE_EVENT_RECORDED'",Integer.class)).isEqualTo(1);
    }
    @Test void concurrentDifferentActorsSameDayBothPersistIndependentEvidence() throws Exception {
        start();
        assertThat(race(post("/api/v1/me/treatment/dose-events"),dose("MISSED"),selfCookie,post("/api/v1/me/supporting-cases/"+caseId+"/dose-events"),dose("TAKEN_OBSERVED"),supportCookie)).containsExactly(201,201);
        assertThat(jdbc.queryForList("select source from dose_events",String.class)).containsExactlyInAnyOrder("PATIENT","TREATMENT_SUPPORTER");
    }
    @Test void concurrentOutcomesHaveExactlyOneWinnerAndAtomicClosure() throws Exception {
        JsonNode t=start(); String p=path(t)+"/outcome";
        assertThat(race(post(p).header("If-Match","\"0\""),outcome(),staffCookie,post(p).header("If-Match","\"0\""),outcome(),staffCookie)).containsExactlyInAnyOrder(201,409);
        assertThat(jdbc.queryForObject("select count(*) from treatment_outcomes",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='TREATMENT_OUTCOME_RECORDED'",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from tb_cases where id=?",String.class,caseId)).isEqualTo("COMPLETED");
    }
    @ParameterizedTest @ValueSource(booleans={true,false})
    void outcomeAndLabCorrectionSerializeOnCaseInBothOrdersAndAllowLateFirstResult(boolean outcomeFirst) throws Exception {
        JsonNode t=start();
        JsonNode request=call(post("/api/v1/lab-requests"),Map.of("caseId",caseId,"testingFacilityId",facility,"requestReasonCode","FOLLOW_UP","testTypeCodes",List.of("TCM","MIKROSKOPIS_BTA")),201);
        user("lab@example.org","LAB_STAFF",facility); Cookie lab=login("lab@example.org"); caller=lab;
        String testPath="/api/v1/lab-request-tests/"+request.path("tests").get(0).path("id").asText()+"/results";
        JsonNode first=call(post(testPath).header("If-Match","\"0\""),Map.of("testedAt",now().toString(),"resultText","PRIVATE-LAB"),201);
        String correction="/api/v1/lab-results/"+id(first)+"/corrections";
        CountDownLatch locked=new CountDownLatch(1),release=new CountDownLatch(1);
        org.mockito.stubbing.Answer<Object> gate=invocation -> { invocation.callRealMethod(); locked.countDown(); if(!release.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Lock gate timeout"); return null; };
        if(outcomeFirst) doAnswer(gate).when(clinicalSource).requireLocalEdit(any(),eq("OUTCOME_WRITE"),any(),eq("TREATMENT"),eq(id(t)));
        else doAnswer(gate).when(laboratorySource).requireLocalEdit(any(),eq("LAB_RESULT_WRITE"),any(),eq("LAB_RESULT"),eq(id(first)));
        var outcomeRequest=post(path(t)+"/outcome").header("If-Match","\"0\"");
        var correctionRequest=post(correction).header("If-Match","\"0\"");
        Map<String,Object> correctionBody=Map.of("testedAt",now().toString(),"resultText","PRIVATE-CORRECTION");
        try(var pool=Executors.newFixedThreadPool(2)) {
            Future<Integer> leading=pool.submit(() -> outcomeFirst ? perform(outcomeRequest,outcome(),staffCookie) : perform(correctionRequest,correctionBody,lab));
            Future<Integer> trailing=null;
            try {
                assertThat(locked.await(30,TimeUnit.SECONDS)).isTrue();
                trailing=pool.submit(() -> outcomeFirst ? perform(correctionRequest,correctionBody,lab) : perform(outcomeRequest,outcome(),staffCookie));
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10); boolean waiting=false;
                do {
                    waiting=jdbc.queryForObject("select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query ilike '%tb_cases%' and cardinality(pg_blocking_pids(pid))>0)",Boolean.class);
                    if(!waiting) Thread.sleep(25);
                } while(!waiting && System.nanoTime()<deadline);
                assertThat(waiting).as("The trailing HTTP transaction must actually wait for the TBCase lock").isTrue();
                assertThat(trailing.isDone()).isFalse();
            } finally { release.countDown(); }
            assertThat(leading.get(30,TimeUnit.SECONDS)).isEqualTo(201);
            assertThat(trailing.get(30,TimeUnit.SECONDS)).isEqualTo(outcomeFirst ? 409 : 201);
        } finally { reset(clinicalSource,laboratorySource); }
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='LAB_RESULT_CORRECTED'",Integer.class)).isEqualTo(outcomeFirst ? 0 : 1);
        UUID latest=jdbc.queryForObject("select id from lab_results where lab_request_test_id=? order by sequence_no desc limit 1",UUID.class,UUID.fromString(request.path("tests").get(0).path("id").asText()));
        caller=lab;
        assertThat(call(post("/api/v1/lab-results/"+latest+"/corrections").header("If-Match","\"0\""),correctionBody,409).path("code").asText()).isEqualTo("LAB_RESULT_STATE_CONFLICT");
        String late="/api/v1/lab-request-tests/"+request.path("tests").get(1).path("id").asText()+"/results";
        call(post(late).header("If-Match","\"0\""),Map.of("testedAt",now().toString(),"resultText","PRIVATE-LATE"),201);
        assertThat(jdbc.queryForObject("select count(*) from treatment_outcomes",Integer.class)).isEqualTo(1);
    }
    private List<Integer> race(MockHttpServletRequestBuilder a,Object ab,Cookie ac,MockHttpServletRequestBuilder b,Object bb,Cookie bc) throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch ready=new CountDownLatch(2),go=new CountDownLatch(1);
            Callable<Integer> first=() -> { ready.countDown(); if(!go.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout"); return perform(a,ab,ac); };
            Callable<Integer> second=() -> { ready.countDown(); if(!go.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout"); return perform(b,bb,bc); };
            var fa=pool.submit(first); var fb=pool.submit(second);
            try { assertThat(ready.await(30,TimeUnit.SECONDS)).isTrue(); } finally { go.countDown(); }
            return List.of(fa.get(30,TimeUnit.SECONDS),fb.get(30,TimeUnit.SECONDS));
        }
    }
    private int perform(MockHttpServletRequestBuilder request,Object body,Cookie cookie) throws Exception { return mvc.perform(request.cookie(cookie).with(csrf()).contentType("application/json").content(json.writeValueAsString(body))).andReturn().getResponse().getStatus(); }
    private void safe(JsonNode n) { assertThat(n.toString()).doesNotContain("PRIVATE","1234567890123456","BPJS-SECRET","hivStatus","dmStatus","diagnosisResult","labResults","metadata","notes"); }
    private String dosePath(JsonNode t,String route) { caller=route.equals("staff") ? staffCookie : route.equals("patient") ? selfCookie : supportCookie; return route.equals("staff") ? path(t)+"/dose-events" : route.equals("patient") ? "/api/v1/me/treatment/dose-events" : "/api/v1/me/supporting-cases/"+caseId+"/dose-events"; }
    private Map<String,Object> startInput() { return new HashMap<>(Map.of("regimenCode","SO_6M_2HRZE_4HR","startDate",today().minusDays(1).toString(),"notes","PRIVATE-TREATMENT","drugs",List.of(drugInput()))); }
    private Map<String,Object> drugInput() { return new HashMap<>(Map.of("drugCode","H","startDate",today().minusDays(1).toString(),"batchNumber","PRIVATE-BATCH","drugSource","PRIVATE-SOURCE","notes","PRIVATE-DRUG")); }
    private Map<String,Object> dose(String status) { return new HashMap<>(Map.of("scheduledDate",today().toString(),"status",status,"notes","PRIVATE-DOSE")); }
    private Map<String,Object> schedule() { return new HashMap<>(Map.of("followUpType","Kontrol","scheduledAt",now().minusHours(1).toString(),"notes","PRIVATE-FOLLOWUP")); }
    private Map<String,Object> completion() { return new HashMap<>(Map.of("completedAt",now().toString(),"weightKg",new BigDecimal("53.25"),"symptomSummary","PRIVATE-SYMPTOM","adherenceAssessment","PRIVATE-ASSESSMENT","notes","PRIVATE-FOLLOWUP")); }
    private Map<String,Object> adverse() { return new HashMap<>(Map.of("eventType","Mual","description","PRIVATE-ADVERSE","startedAt",now().minusHours(1).toString())); }
    private Map<String,Object> outcome() { return new HashMap<>(Map.of("outcomeCode","SEMBUH","outcomeDate",today().toString(),"notes","PRIVATE-OUTCOME")); }
    private JsonNode start() throws Exception { return call(post(startPath()),startInput(),201); }
    private String startPath() { return "/api/v1/cases/"+caseId+"/treatments"; }
    private String path(JsonNode t) { return "/api/v1/treatments/"+id(t); }
    private UUID id(JsonNode n) { return UUID.fromString(n.path("id").asText()); }
    private LocalDate today() { return LocalDate.now(clock); }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int status) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        String output=mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(status)).andReturn().getResponse().getContentAsString();
        return output.isEmpty() ? json.nullNode() : json.readTree(output);
    }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID user(String email,String role,UUID f) { UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash); jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role); if(f!=null) jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,f); return id; }
    private Cookie login(String email) throws Exception { return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION"); }
    private void audited(String... actions) { for(String action:actions) assertThat(jdbc.queryForObject("select count(*) from audit_logs where action=?",Integer.class,action)).isPositive(); }
}
