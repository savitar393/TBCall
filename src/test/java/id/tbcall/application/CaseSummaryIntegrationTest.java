package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Prepared PostgreSQL regressions. Execution requires separate disposable-database authorization. */
@SpringBootTest(properties={"tbcall.security.production=false","tbcall.security.expose-verification-tokens=true"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class CaseSummaryIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords;
    final JsonMapper json=JsonMapper.builder().build();
    static String hash;
    static final String PASSWORD="Fictional summary password 123!";
    UUID facility,foreign,officer,patient,registration,caseId,treatment,caseRequest,registrationRequest,test,original,corrected,specimenResult;
    Cookie cookie;

    @BeforeEach void setup() throws Exception {
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=facility("Fictional current facility"); foreign=facility("Fictional foreign facility");
        officer=user("officer-summary@example.org","TB_OFFICER",facility); cookie=login("officer-summary@example.org");
        patient=jdbc.queryForObject("insert into patients(full_name,nik,address) values ('Fictional summary patient','1234567890123456','PRIVATE-ADDRESS') returning id",UUID.class);
        registration=registration(patient,facility);
        UUID diagnosis=diagnosis(registration,"Recorded diagnosis");
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,hiv_status_code,dm_status_code) values (?,?,?,'TB_SO','POSITIF','YA') returning id",UUID.class,registration,diagnosis,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,'2026-01-02','ACTIVE','PRIVATE-TREATMENT') returning id",UUID.class,caseId,facility);
        jdbc.update("insert into treatment_drugs(treatment_id,drug_name_snapshot,start_date,notes) values (?,'Fictional snapshot','2026-01-02','PRIVATE-DRUG')",treatment);
        jdbc.update("insert into dose_events(treatment_id,scheduled_date,recorded_at,status,source,recorded_by_user_id,notes) values (?,'2026-01-03','2026-01-03T01:00:00Z','TAKEN_SELF_REPORTED','PATIENT',?,'PRIVATE-DOSE')",treatment,officer);
        jdbc.update("insert into follow_ups(treatment_id,follow_up_type,scheduled_at,status,facility_id) values (?,'Fictional scheduled','2026-01-04T00:00:00Z','SCHEDULED',?)",treatment,facility);
        jdbc.update("insert into follow_ups(treatment_id,follow_up_type,scheduled_at,completed_at,status,facility_id,weight_kg,symptom_summary,adherence_assessment,notes) values (?,'Fictional completed','2026-01-03T00:00:00Z','2026-01-03T01:00:00Z','COMPLETED',?,50,'Recorded observation','Recorded assessment','PRIVATE-FOLLOW')",treatment,facility);
        caseRequest=request(null,caseId,facility); registrationRequest=request(registration,null,facility);
        test=jdbc.queryForObject("insert into lab_request_tests(lab_request_id,test_type_code,status) values (?,'TCM','RESULT_AVAILABLE') returning id",UUID.class,caseRequest);
        original=result(test,null,1,"FINAL","Original recorded value"); corrected=result(test,null,2,"CORRECTED","Corrected recorded value");
        UUID specimen=jdbc.queryForObject("insert into lab_specimens(lab_request_id) values (?) returning id",UUID.class,caseRequest);
        specimenResult=result(test,specimen,1,"FINAL","Separate specimen value");
        // Same patient, different episode: never included just because the patient identity matches.
        UUID unrelated=registration(patient,facility); diagnosis(unrelated,"Unrelated diagnosis"); request(unrelated,null,facility);
        request(null,caseId,foreign); // Testing facility alone never grants the officer requesting-facility access.
    }

    @ParameterizedTest @ValueSource(strings={"ACTIVE","COMPLETED"})
    void summaryIncludesOnlyThisEpisodeAndExplicitReportedHistory(String state) throws Exception {
        jdbc.update("update tb_cases set status=? where id=?",state,caseId);
        if(state.equals("COMPLETED")) {
            jdbc.update("update treatments set status='COMPLETED',actual_end_date='2026-01-05' where id=?",treatment);
            jdbc.update("insert into treatment_outcomes(treatment_id,outcome_code,outcome_date,notes) values (?,'MENINGGAL','2026-01-05','PRIVATE-OUTCOME')",treatment);
        }
        JsonNode s=read("");
        assertThat(s.path("status").asText()).isEqualTo(state);
        assertThat(s.path("registration").path("data").path("id").asText()).isEqualTo(registration.toString());
        JsonNode diagnoses=s.path("diagnoses").path("data"); assertThat(diagnoses.path("totalElements").asInt()).isEqualTo(1);
        assertThat(diagnoses.path("content").get(0).path("confirming").asBoolean()).isTrue();
        JsonNode labs=s.path("laboratory").path("data"); assertThat(labs.path("totalElements").asInt()).isEqualTo(2);
        assertThat(ids(labs.path("content"))).containsExactlyInAnyOrder(caseRequest.toString(),registrationRequest.toString());
        JsonNode request=find(labs.path("content"),caseRequest); JsonNode results=request.path("results").path("content");
        assertThat(ids(results)).containsExactlyInAnyOrder(original.toString(),corrected.toString(),specimenResult.toString());
        assertThat(find(results,original).path("latest").asBoolean()).isFalse(); assertThat(find(results,corrected).path("latest").asBoolean()).isTrue();
        assertThat(find(results,specimenResult).path("latest").asBoolean()).isTrue();
        JsonNode episode=s.path("treatments").path("data").path("content").get(0);
        assertThat(episode.path("id").asText()).isEqualTo(treatment.toString()); assertThat(episode.path("drugs").path("content").get(0).path("doseValue").isNull()).isTrue();
        assertThat(episode.path("doses").path("data").path("content").get(0).path("source").asText()).isEqualTo("PATIENT");
        assertThat(episode.path("followUps").path("data").path("content")).hasSize(2);
        assertThat(episode.path("outcome").path("data").isNull()).isEqualTo(state.equals("ACTIVE"));
        assertThat(s.toString()).doesNotContain("1234567890123456","PRIVATE-","hivStatus","dmStatus","recordedByUser","Unrelated diagnosis");
    }

    @ParameterizedTest @ValueSource(strings={"REGISTRATION_READ","DIAGNOSIS_READ","LAB_REQUEST_READ","LAB_RESULT_READ","TREATMENT_READ","ADHERENCE_READ","FOLLOW_UP_READ","OUTCOME_READ"})
    void absentPermissionHidesItsSectionWithoutCountsOrIdentity(String permission) throws Exception {
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code=?)",permission);
        try {
            JsonNode s=read("");
            JsonNode target=s.path(switch(permission) { case "REGISTRATION_READ" -> "registration"; case "DIAGNOSIS_READ" -> "diagnoses"; case "LAB_REQUEST_READ","LAB_RESULT_READ" -> "laboratory"; default -> "treatments"; });
            if(Set.of("ADHERENCE_READ","FOLLOW_UP_READ","OUTCOME_READ").contains(permission)) target=target.path("data").path("content").get(0).path(switch(permission) { case "ADHERENCE_READ" -> "doses"; case "FOLLOW_UP_READ" -> "followUps"; default -> "outcome"; });
            assertThat(target.path("state").asText()).isEqualTo("PERMISSION_DENIED"); assertThat(target.path("data").isNull()).isTrue();
            assertThat(target.toString()).doesNotContain("totalElements","hasMore","\"id\"");
        } finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code=?",permission); }
    }

    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER","LAB_STAFF","FACILITY_ADMIN","SYSTEM_ADMIN","PROGRAM_MONITOR"})
    void otherRolesCannotLoadTheSummary(String role) throws Exception {
        user("wrong-summary@example.org",role,facility); cookie=login("wrong-summary@example.org");
        mvc.perform(get(path()).cookie(cookie)).andExpect(status().isForbidden());
    }
    @Test void missingCasePermissionFailsBeforeSummaryPayload() throws Exception {
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code='CASE_READ')");
        try { mvc.perform(get(path()).cookie(cookie)).andExpect(status().isForbidden()); }
        finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code='CASE_READ'"); }
    }
    @Test void transferRetainsOriginalDomainScopeInsteadOfBroadeningHistoricalReads() throws Exception {
        jdbc.update("update tb_cases set current_facility_id=? where id=?",foreign,caseId);
        mvc.perform(get(path()).cookie(cookie)).andExpect(status().isNotFound());
        jdbc.update("delete from user_facilities where user_id=?",officer); jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",officer,foreign);
        JsonNode s=read(""); assertThat(s.path("registration").path("state").asText()).isEqualTo("OUT_OF_SCOPE"); assertThat(s.path("diagnoses").path("data").isNull()).isTrue();
        assertThat(s.path("treatments").path("data").path("totalElements").asInt()).isZero();
        assertThat(s.path("laboratory").path("data").path("totalElements").asInt()).isEqualTo(1); // Only the foreign-requesting facility's own request.
        mvc.perform(get("/api/v1/treatments/"+treatment).cookie(cookie)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/lab-requests/"+caseRequest).cookie(cookie)).andExpect(status().isNotFound());
    }
    @Test void inactiveCurrentFacilityCannotSupplyCaseOrChildCounts() throws Exception {
        // Live session resolution removes inactive facilities before the officer-scope gate.
        jdbc.update("update facilities set active=false where id=?",facility); mvc.perform(get(path()).cookie(cookie)).andExpect(status().isForbidden());
    }
    @Test void stablePagesExcludeForeignAndUnrelatedRecordsAndChildListsAreBounded() throws Exception {
        for(int i=0;i<6;i++) { request(null,caseId,facility); diagnosis(registration,"Recorded additional diagnosis"); jdbc.update("insert into treatments(case_id,facility_id,start_date,status) values (?,?,'2025-01-01','COMPLETED')",caseId,facility); }
        for(int i=0;i<10;i++) jdbc.update("insert into follow_ups(treatment_id,follow_up_type,scheduled_at,status) values (?,'Recorded additional follow-up','2026-01-02T00:00:00Z','SCHEDULED')",treatment);
        for(int i=3;i<=22;i++) result(test,null,i,"CORRECTED","Recorded additional revision");
        JsonNode first=read(""),repeat=read(""),second=read("?diagnosisPage=1&labPage=1&treatmentPage=1");
        assertThat(first).isEqualTo(repeat);
        for(String section:List.of("diagnoses","laboratory","treatments")) {
            JsonNode a=first.path(section).path("data"),b=second.path(section).path("data");
            assertThat(a.path("size").asInt()).isEqualTo(5); assertThat(a.path("content")).hasSize(5);
            assertThat(b.path("content").size()).isBetween(1,3); assertThat(ids(a.path("content"))).doesNotContainAnyElementsOf(ids(b.path("content")));
        }
        JsonNode episode=find(first.path("treatments").path("data").path("content"),treatment);
        assertThat(episode.path("followUps").path("data").path("content")).hasSize(10); assertThat(episode.path("followUps").path("data").path("hasMore").asBoolean()).isTrue();
        List<JsonNode> labItems=new ArrayList<>(); first.path("laboratory").path("data").path("content").forEach(labItems::add); second.path("laboratory").path("data").path("content").forEach(labItems::add);
        JsonNode lab=find(labItems,caseRequest); assertThat(lab.path("results").path("content")).hasSize(20); assertThat(lab.path("results").path("hasMore").asBoolean()).isTrue();
    }
    @Test void validIncompleteRecordsAndEmptyListsRemainReadableWithoutMutation() throws Exception {
        jdbc.update("update lab_requests set request_reason_code=null where id=?",caseRequest); jdbc.update("update lab_results set tested_at=null where id=?",original);
        jdbc.update("update treatment_drugs set drug_id=(select id from drugs where code='H'),drug_name_snapshot=null,start_date=null where treatment_id=?",treatment);
        jdbc.update("update dose_events set recorded_at=null where treatment_id=?",treatment);
        Map<String,Object> before=jdbc.queryForMap("select version,status from tb_cases where id=?",caseId);
        JsonNode s=read(""); assertThat(find(s.path("laboratory").path("data").path("content"),caseRequest).path("requestReasonCode").isNull()).isTrue();
        assertThat(s.path("treatments").path("data").path("content").get(0).path("drugs").path("content").get(0).path("drugName").isNull()).isTrue();
        mvc.perform(post(path()).cookie(cookie).with(csrf())).andExpect(status().isMethodNotAllowed());
        assertThat(jdbc.queryForMap("select version,status from tb_cases where id=?",caseId)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action in ('CASE_UPDATED','TREATMENT_STARTED','LAB_RESULT_RECORDED','TREATMENT_OUTCOME_RECORDED')",Integer.class)).isZero();
        assertThat(find(s.path("laboratory").path("data").path("content"),registrationRequest).path("results").path("content")).isEmpty();
    }
    @Test void authorizedNewEpisodeHasEmptySectionsRatherThanDeniedSections() throws Exception {
        UUID reg=registration(patient,facility);
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,status) values (?,?,'ACTIVE') returning id",UUID.class,reg,facility);
        JsonNode s=read("");
        for(String section:List.of("diagnoses","laboratory","treatments")) {
            assertThat(s.path(section).path("state").asText()).isEqualTo("AVAILABLE");
            assertThat(s.path(section).path("data").path("totalElements").asInt()).isZero();
            assertThat(s.path(section).path("data").path("content")).isEmpty();
        }
        assertThat(s.path("confirmedAt").isNull()).isTrue();
    }
    private JsonNode read(String query) throws Exception { return json.readTree(mvc.perform(get(path()+query).cookie(cookie)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()); }
    private String path() { return "/api/v1/cases/"+caseId+"/summary"; }
    private List<String> ids(JsonNode rows) { List<String> ids=new ArrayList<>(); rows.forEach(row -> ids.add(row.path("id").asText())); return ids; }
    private JsonNode find(Iterable<JsonNode> rows,UUID id) { for(JsonNode row:rows) if(row.path("id").asText().equals(id.toString())) return row; throw new AssertionError("Expected synthetic record missing"); }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID user(String email,String role,UUID f) { UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash); jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role); jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,f); return id; }
    private UUID registration(UUID p,UUID f) { return jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-01-01','CONVERTED_TO_CASE') returning id",UUID.class,p,f); }
    private UUID diagnosis(UUID reg,String text) { return jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,'2026-01-01',?,'TREAT_HERE') returning id",UUID.class,reg,text); }
    private UUID request(UUID reg,UUID c,UUID f) { return jdbc.queryForObject("insert into lab_requests(registration_id,case_id,requesting_facility_id,testing_facility_id,referral_type,requested_at,request_reason_code) values (?,?,?,?,'EXTERNAL','2026-01-02T00:00:00Z','DIAGNOSIS') returning id",UUID.class,reg,c,f,foreign); }
    private UUID result(UUID t,UUID specimen,int sequence,String status,String text) { return jdbc.queryForObject("insert into lab_results(lab_request_test_id,specimen_id,sequence_no,status,tested_at,result_text) values (?,?,?,?,'2026-01-03T00:00:00Z',?) returning id",UUID.class,t,specimen,sequence,status,text); }
    private Cookie login(String email) throws Exception { return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION"); }
}
