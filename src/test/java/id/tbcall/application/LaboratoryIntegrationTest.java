package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.LaboratorySourceAuthorityPolicy;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
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
class LaboratoryIntegrationTest {
    @TestConfiguration static class TimeConfig {
        // Keep chronology assertions independent of host clock adjustments and PostgreSQL rounding.
        @Bean @Primary Clock laboratoryTestClock() {
            return Clock.fixed(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS),ZoneOffset.UTC);
        }
    }
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordHasher passwords;
    @Autowired Clock clock;
    @MockitoSpyBean LaboratorySourceAuthorityPolicy source;
    private final JsonMapper json=JsonMapper.builder().build();
    private static String passwordHash;
    private static final String PASSWORD="Laboratory password 123!";
    private UUID sending,testing,foreign,patient,registration,officer;
    private Cookie sourceCookie,labCookie,caller;
    @BeforeEach void setup() throws Exception {
        clearInvocations(source);
        if(passwordHash==null) passwordHash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        sending=facility("Pengirim"); testing=facility("Laboratorium"); foreign=facility("Lain");
        officer=user("officer@example.org","TB_OFFICER",sending); user("lab@example.org","LAB_STAFF",testing);
        sourceCookie=login("officer@example.org"); labCookie=login("lab@example.org"); caller=sourceCookie;
        patient=jdbc.queryForObject("insert into patients(full_name,nik,bpjs_number,birth_date,citizenship,sex_code,address) values ('Pasien Lab','1234567890123456','BPJS-SECRET','1990-01-01','WNI','PEREMPUAN','Alamat rahasia') returning id",UUID.class);
        registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status,hiv_status_code,dm_status_code,referral_notes) values (?,?,?,'OPEN','POSITIF','YA','Catatan klinis rahasia') returning id",UUID.class,patient,sending,LocalDate.now(clock));
    }
    @ParameterizedTest @ValueSource(booleans={true,false})
    void requestDerivesFacilitiesOwnerReferralAndInitialTests(boolean internal) throws Exception {
        JsonNode r=create(internal,List.of("TCM","MIKROSKOPIS_BTA"));
        assertThat(r.path("status").asText()).isEqualTo("REQUESTED");
        assertThat(r.path("referralType").asText()).isEqualTo(internal ? "INTERNAL" : "EXTERNAL");
        assertThat(r.path("requestingFacility").path("id").asText()).isEqualTo(sending.toString());
        assertThat(r.path("testingFacility").path("id").asText()).isEqualTo((internal ? sending : testing).toString());
        assertThat(r.path("owner").path("type").asText()).isEqualTo("REGISTRATION");
        assertThat(r.path("tests")).hasSize(2);
        assertThat(r.path("tests").get(0).path("status").asText()).isEqualTo("REQUESTED");
        assertThat(r.path("requestedAt").asText()).isNotBlank(); audited("LAB_REQUEST_CREATED");
    }
    @ParameterizedTest @CsvSource({"OPEN,201","DIAGNOSED,201","CONVERTED_TO_CASE,409","CLOSED,409","CANCELLED,409"})
    void registrationOwnerStateGate(String state,int status) throws Exception {
        jdbc.update("update tb_registrations set status=? where id=?",state,registration);
        call(post("/api/v1/lab-requests"),request(false,List.of("TCM")),status);
    }
    @ParameterizedTest @CsvSource({"ACTIVE,201","REFERRED,409","TRANSFERRED,409","COMPLETED,409","CLOSED,409","CANCELLED,409"})
    void caseOwnerRequiresActiveFollowUp(String state,int status) throws Exception {
        UUID c=tbCase(state); Map<String,Object> body=request(false,List.of("TCM")); body.remove("registrationId"); body.put("caseId",c); body.put("requestReasonCode","FOLLOW_UP");
        JsonNode result=call(post("/api/v1/lab-requests"),body,status);
        if(status==201) assertThat(result.path("owner").path("type").asText()).isEqualTo("CASE");
    }
    @ParameterizedTest @ValueSource(strings={"bothOwners","noOwner","registrationFollowUp","caseDiagnosis","emptyTests","duplicateTests","tooManyTests","unknownType","inactiveType","inactiveReason","inactiveFacility","foreignOwner","protectedField"})
    void createRejectsInvalidOwnersReferencesAndClientDerivedFields(String invalid) throws Exception {
        Map<String,Object> body=request(false,List.of("TCM")); int status=400;
        switch(invalid) {
            case "bothOwners" -> body.put("caseId",tbCase("ACTIVE"));
            case "noOwner" -> body.remove("registrationId");
            case "registrationFollowUp" -> body.put("requestReasonCode","FOLLOW_UP");
            case "caseDiagnosis" -> { body.remove("registrationId"); body.put("caseId",tbCase("ACTIVE")); }
            case "emptyTests" -> body.put("testTypeCodes",List.of());
            case "duplicateTests" -> body.put("testTypeCodes",List.of("TCM"," TCM "));
            case "tooManyTests" -> body.put("testTypeCodes",Collections.nCopies(11,"TCM"));
            case "unknownType" -> body.put("testTypeCodes",List.of("UNKNOWN_TYPE"));
            case "inactiveType" -> jdbc.update("update lab_test_types set active=false where code='TCM'");
            case "inactiveReason" -> jdbc.update("update lab_request_reasons set active=false where code='DIAGNOSIS'");
            case "inactiveFacility" -> jdbc.update("update facilities set active=false where id=?",testing);
            case "foreignOwner" -> { jdbc.update("update tb_registrations set facility_id=? where id=?",foreign,registration); status=404; }
            default -> body.put("status","COMPLETED");
        }
        try { call(post("/api/v1/lab-requests"),body,status); }
        finally { jdbc.update("update lab_test_types set active=true where code='TCM'"); jdbc.update("update lab_request_reasons set active=true where code='DIAGNOSIS'"); }
        assertThat(jdbc.queryForObject("select count(*) from lab_requests",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='LAB_REQUEST_CREATED'",Integer.class)).isZero();
    }
    @Test void readUnionIsDeduplicatedBoundedAndMinimal() throws Exception {
        JsonNode external=create(false,List.of("TCM")),internal=create(true,List.of("TCM"));
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='LAB_STAFF'",officer);
        UUID otherReg=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,current_date) returning id",UUID.class,patient,testing);
        jdbc.update("insert into lab_requests(registration_id,requesting_facility_id,testing_facility_id,referral_type,requested_at,request_reason_code) values (?,?,?,'EXTERNAL',now(),'DIAGNOSIS')",otherReg,testing,sending);
        JsonNode page=call(get("/api/v1/lab-requests"),null,200); assertThat(page.path("content")).hasSize(3); assertThat(page.path("totalElements").asLong()).isEqualTo(3);
        assertThat(page.toString()).doesNotContain("1234567890123456","BPJS-SECRET","POSITIF","hivStatus","dmStatus","Catatan klinis","Alamat rahasia","password","metadata");
        assertThat(call(get("/api/v1/lab-requests").param("ownerType","REGISTRATION").param("status","REQUESTED").param("size","1"),null,200).path("content")).hasSize(1);
        call(get("/api/v1/lab-requests").param("size","51"),null,400); call(get("/api/v1/lab-requests").param("page","-1"),null,400);
        call(get("/api/v1/lab-requests").param("status","UNKNOWN"),null,400); call(get("/api/v1/lab-requests").param("ownerType","PATIENT"),null,400);
        call(get("/api/v1/lab-requests").param("testingFacilityId",testing.toString()),null,404);
        caller=labCookie;
        assertThat(call(get("/api/v1/lab-requests"),null,200).path("content")).hasSize(1);
        call(get(path(internal)),null,404); call(get(path(external)),null,200);
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"})
    void otherRolesHaveNoLabOperationalBypass(String role) throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false); caller=labCookie; JsonNode received=receive(s,true); JsonNode result=result(r,received);
        user("other@example.org",role,testing); caller=login("other@example.org");
        call(get("/api/v1/lab-requests"),null,403); call(get(path(r)),null,403);
        call(post("/api/v1/lab-requests"),request(false,List.of("TCM")),403);
        call(post(path(r)+"/specimens").header("If-Match","\"0\""),specimen(false),403);
        call(post("/api/v1/lab-specimens/"+s.path("id").asText()+"/receive").header("If-Match","\"0\""),receipt(true),403);
        call(post(path(r)+"/cancel").header("If-Match","\"0\""),null,403);
        call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(received),403);
        call(post("/api/v1/lab-results/"+result.path("id").asText()+"/corrections").header("If-Match","\"0\""),correction(),403);
    }
    @Test void officerCannotWriteResultsAndLaboratoryCannotCreateOrCancelSourceRequests() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false);
        call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(s),403);
        caller=labCookie; call(post("/api/v1/lab-requests"),request(false,List.of("TCM")),403);
        call(post(path(r)+"/specimens").header("If-Match",version(path(r))),specimen(false),403);
        call(post(path(r)+"/cancel").header("If-Match",version(path(r))),null,403);
        user("foreignlab@example.org","LAB_STAFF",foreign); caller=login("foreignlab@example.org");
        call(get(path(r)),null,404);
        call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(s),404);
        call(post("/api/v1/lab-specimens/"+s.path("id").asText()+"/receive").header("If-Match","\"0\""),receipt(true),404);
        user("foreignofficer@example.org","TB_OFFICER",foreign); caller=login("foreignofficer@example.org");
        call(get(path(r)),null,404); call(post(path(r)+"/cancel").header("If-Match","\"0\""),null,404);
    }
    @ParameterizedTest @ValueSource(booleans={true,false})
    void shippingAndReceiptAdvanceParentVersionWithCorrectStates(boolean internal) throws Exception {
        JsonNode r=create(internal,List.of("TCM")); String before=version(path(r));
        JsonNode s=add(r,true); assertThat(version(path(r))).isNotEqualTo(before);
        assertThat(call(get(path(r)),null,200).path("status").asText()).isEqualTo(internal ? "REQUESTED" : "SENT");
        call(post(path(r)+"/specimens").header("If-Match",before),specimen(false),409);
        if(internal) { jdbc.update("insert into user_facilities(user_id,facility_id) select user_id,? from user_facilities where facility_id=?",sending,testing); }
        caller=labCookie; JsonNode received=receive(s,true);
        assertThat(received.path("version").asLong()).isEqualTo(1);
        JsonNode detail=call(get(path(r)),null,200); assertThat(detail.path("status").asText()).isEqualTo("RECEIVED");
        assertThat(detail.path("completeness").path("needsNewSpecimen").asBoolean()).isFalse();
        caller=sourceCookie; call(post(path(r)+"/specimens").header("If-Match",version(path(r))),specimen(false),409);
        audited("LAB_SPECIMEN_RECORDED","LAB_SPECIMEN_RECEIVED");
    }
    @Test void specimenAndReceiptRequireVersionsAndValidTimeline() throws Exception {
        JsonNode r=create(false,List.of("TCM")); call(post(path(r)+"/specimens"),specimen(false),428);
        Map<String,Object> body=specimen(false); body.put("collectedAt",now().plusDays(1).toString()); call(post(path(r)+"/specimens").header("If-Match","\"0\""),body,400);
        body=specimen(true); body.put("collectedAt",now().toString()); body.put("sentAt",now().minusHours(1).toString()); call(post(path(r)+"/specimens").header("If-Match","\"0\""),body,400);
        JsonNode s=add(r,true); caller=labCookie; String p="/api/v1/lab-specimens/"+s.path("id").asText()+"/receive";
        call(post(p),receipt(true),428); Map<String,Object> rec=receipt(true); rec.put("receivedAt",now().minusDays(1).toString()); call(post(p).header("If-Match","\"0\""),rec,400);
        rec=receipt(true); rec.put("receivedAt",now().plusDays(1).toString()); call(post(p).header("If-Match","\"0\""),rec,400);
        rec=receipt(false); rec.remove("rejectionReason"); call(post(p).header("If-Match","\"0\""),rec,400);
        receive(s,true); call(post(p).header("If-Match","\"0\""),receipt(true),409);
    }
    @Test void rejectedSpecimenNeedsReplacementAndCancellationIsExplicit() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,true); caller=labCookie; receive(s,false);
        JsonNode detail=call(get(path(r)),null,200); assertThat(detail.path("status").asText()).isEqualTo("RECEIVED");
        assertThat(detail.path("completeness").path("needsNewSpecimen").asBoolean()).isTrue();
        assertThat(detail.path("tests").get(0).path("status").asText()).isEqualTo("REQUESTED");
        call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(s),409);
        caller=sourceCookie; call(post(path(r)+"/cancel"),null,428);
        JsonNode cancelled=call(post(path(r)+"/cancel").header("If-Match",version(path(r))),null,200);
        assertThat(cancelled.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(cancelled.path("tests").get(0).path("status").asText()).isEqualTo("CANCELLED");
        assertThat(cancelled.path("specimens")).hasSize(1); audited("LAB_SPECIMEN_REJECTED","LAB_REQUEST_CANCELLED");
        caller=labCookie; call(post(resultPath(r)).header("If-Match","\"1\""),resultInput(null),409);
    }
    @Test void twoTestsAggregatePartialThenCompletedWithoutClinicalMutation() throws Exception {
        JsonNode r=create(false,List.of("TCM","MIKROSKOPIS_BTA")),s=add(r,false); caller=labCookie; JsonNode received=receive(s,true);
        String firstId=r.path("tests").get(0).path("id").asText(),secondId=r.path("tests").get(1).path("id").asText();
        call(post("/api/v1/lab-request-tests/"+firstId+"/results").header("If-Match","\"0\""),resultInput(received),201);
        JsonNode partial=call(get(path(r)),null,200); assertThat(partial.path("status").asText()).isEqualTo("PARTIAL");
        caller=sourceCookie; call(post(path(r)+"/cancel").header("If-Match",version(path(r))),null,409); caller=labCookie;
        call(post("/api/v1/lab-request-tests/"+secondId+"/results").header("If-Match","\"0\""),resultInput(received),201);
        JsonNode completed=call(get(path(r)),null,200); assertThat(completed.path("status").asText()).isEqualTo("COMPLETED");
        assertThat(completed.path("completeness").path("completedTests").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select status from tb_registrations where id=?",String.class,registration)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("select count(*) from diagnoses",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from tb_cases",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from treatments",Integer.class)).isZero();
    }
    @Test void resultValidatesRequiredValuesTimeSpecimenAndVersion() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false); caller=labCookie;
        call(post(resultPath(r)),resultInput(null),428);
        call(post(resultPath(r)).header("If-Match","\"0\""),Map.of("testedAt",now().toString()),400);
        Map<String,Object> value=resultInput(null); value.put("testedAt",now().plusDays(1).toString()); call(post(resultPath(r)).header("If-Match","\"0\""),value,400);
        call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(s),409);
        caller=sourceCookie; JsonNode other=create(false,List.of("TCM")),otherS=add(other,false); caller=labCookie; JsonNode usable=receive(otherS,true);
        call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(usable),404);
        JsonNode result=result(r,null); assertThat(result.path("status").asText()).isEqualTo("FINAL");
        call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(null),409);
    }
    @Test void correctionsAppendAndOnlyLatestMayBeCorrected() throws Exception {
        JsonNode r=create(false,List.of("TCM")); caller=labCookie; JsonNode first=result(r,null);
        UUID resultId=UUID.fromString(first.path("id").asText()); Map<String,Object> original=jdbc.queryForMap("select * from lab_results where id=?",resultId);
        String p="/api/v1/lab-results/"+resultId+"/corrections"; call(post(p),correction(),428);
        call(post(p).header("If-Match","\"1\""),correction(),409);
        JsonNode corrected=call(post(p).header("If-Match","\"0\""),correction(),201);
        assertThat(corrected.path("status").asText()).isEqualTo("CORRECTED"); assertThat(corrected.path("sequenceNo").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForMap("select * from lab_results where id=?",resultId)).isEqualTo(original);
        assertThat(call(post(p).header("If-Match","\"0\""),correction(),409).path("code").asText()).isEqualTo("LAB_RESULT_NOT_LATEST");
        JsonNode latest=call(get(path(r)),null,200).path("tests").get(0).path("latestResults");
        assertThat(latest).hasSize(1); assertThat(latest.get(0).path("id").asText()).isEqualTo(corrected.path("id").asText());
        audited("LAB_RESULT_RECORDED","LAB_RESULT_CORRECTED");
    }
    @Test void sequenceContextsAreSeparateAndAllWritesAdvanceTestVersion() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false); caller=labCookie; JsonNode usable=receive(s,true),noSpecimen=result(r,null);
        JsonNode withSpecimen=call(post(resultPath(r)).header("If-Match","\"1\""),resultInput(usable),201);
        assertThat(withSpecimen.path("sequenceNo").asInt()).isEqualTo(1); assertThat(noSpecimen.path("sequenceNo").asInt()).isEqualTo(1);
        assertThat(call(get(path(r)),null,200).path("tests").get(0).path("latestResults")).hasSize(2);
        call(post(resultPath(r)).header("If-Match","\"1\""),resultInput(usable),409);
    }
    @Test void diagnosticCorrectionStopsAfterCaseConfirmation() throws Exception {
        JsonNode r=create(false,List.of("TCM")); caller=labCookie; JsonNode result=result(r,null); caller=sourceCookie;
        JsonNode diagnosis=call(post("/api/v1/registrations/"+registration+"/diagnoses").header("If-Match","\"0\""),Map.of("diagnosisDate",LocalDate.now(clock).toString(),"anatomicalSiteCode","PARU","diagnosisTypeCode","KLINIS","diagnosisResult","Catatan","treatmentDisposition","TREAT_HERE"),201);
        call(post("/api/v1/registrations/"+registration+"/cases").header("If-Match","\"1\""),Map.of("diagnosisId",diagnosis.path("id").asText(),"caseCategoryCode","TB_SO","previousTreatmentCategoryCode","BARU"),201);
        caller=labCookie; call(post("/api/v1/lab-results/"+result.path("id").asText()+"/corrections").header("If-Match","\"0\""),correction(),409);
        assertThat(jdbc.queryForObject("select count(*) from lab_results",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='LAB_RESULT_CORRECTED'",Integer.class)).isZero();
    }
    @Test void followUpCorrectionStopsAfterOutcomeWithoutChangingCase() throws Exception {
        UUID c=tbCase("ACTIVE"); Map<String,Object> body=request(false,List.of("TCM")); body.remove("registrationId"); body.put("caseId",c); body.put("requestReasonCode","FOLLOW_UP");
        JsonNode r=call(post("/api/v1/lab-requests"),body,201); caller=labCookie; JsonNode first=result(r,null);
        JsonNode corrected=call(post("/api/v1/lab-results/"+first.path("id").asText()+"/corrections").header("If-Match","\"0\""),correction(),201);
        UUID treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date) values (?,?,current_date) returning id",UUID.class,c,sending);
        String outcome=jdbc.queryForObject("select code from treatment_outcome_codes where active=true limit 1",String.class);
        jdbc.update("insert into treatment_outcomes(treatment_id,outcome_code,outcome_date) values (?,?,current_date)",treatment,outcome);
        call(post("/api/v1/lab-results/"+corrected.path("id").asText()+"/corrections").header("If-Match","\"0\""),correction(),409);
        assertThat(jdbc.queryForObject("select status from tb_cases where id=?",String.class,c)).isEqualTo("ACTIVE");
    }
    @Test void readResultPayloadRequiresResultReadPermissionAndAuditIsPrivate() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false); caller=labCookie; result(r,receive(s,true));
        String detail=call(get(path(r)),null,200).toString(); assertThat(detail).contains("Valeur sensible").doesNotContain("POSITIF","hivStatus","dmStatus","Catatan klinis","BPJS-SECRET","1234567890123456","Alamat rahasia","metadata");
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='LAB_STAFF') and permission_id=(select id from permissions where code='LAB_RESULT_READ')");
        try { assertThat(call(get(path(r)),null,200).path("tests").get(0).path("latestResults")).isEmpty(); }
        finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='LAB_STAFF' and p.code='LAB_RESULT_READ'"); }
        assertThat(jdbc.queryForList("select metadata::text from audit_logs",String.class).toString()).doesNotContain("Valeur sensible","Correction sensible","raison sensible","notes sensibles","1234567890123456");
    }
    @Test void concurrentSameTestResultsHaveOneVersionWinner() throws Exception {
        JsonNode r=create(false,List.of("TCM")); caller=labCookie; String path=resultPath(r);
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch start=new CountDownLatch(1); Callable<Integer> task=() -> { start.await(); return mvc.perform(post(path).cookie(labCookie).with(csrf()).header("If-Match","\"0\"").contentType("application/json").content(json.writeValueAsString(resultInput(null)))).andReturn().getResponse().getStatus(); };
            var a=pool.submit(task); var b=pool.submit(task); start.countDown();
            assertThat(List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        }
        assertThat(jdbc.queryForObject("select count(*) from lab_results",Integer.class)).isEqualTo(1);
    }
    @Test void allLaboratoryCommandsInvokeIndependentSourcePolicy() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false); caller=labCookie;
        receive(s,true); JsonNode first=result(r,null);
        call(post("/api/v1/lab-results/"+first.path("id").asText()+"/corrections").header("If-Match","\"0\""),correction(),201);
        caller=sourceCookie; JsonNode replacement=create(false,List.of("TCM")),rejected=add(replacement,false);
        caller=labCookie; receive(rejected,false); caller=sourceCookie;
        call(post(path(replacement)+"/cancel").header("If-Match",version(path(replacement))),null,200);
        verify(source,times(2)).requireLocalCreate(any(),eq("LAB_REQUEST_WRITE"),eq(sending),eq("LAB_REQUEST"));
        verify(source,times(2)).requireLocalCreate(any(),eq("LAB_REQUEST_WRITE"),eq(sending),eq("LAB_SPECIMEN"));
        verify(source,times(2)).requireLocalEdit(any(),eq("LAB_RESULT_WRITE"),eq(testing),eq("LAB_SPECIMEN"),any());
        verify(source).requireLocalCreate(any(),eq("LAB_RESULT_WRITE"),eq(testing),eq("LAB_RESULT"));
        verify(source).requireLocalEdit(any(),eq("LAB_RESULT_WRITE"),eq(testing),eq("LAB_RESULT"),eq(UUID.fromString(first.path("id").asText())));
        verify(source).requireLocalEdit(any(),eq("LAB_REQUEST_WRITE"),eq(sending),eq("LAB_REQUEST"),eq(UUID.fromString(replacement.path("id").asText())));
        verifyNoMoreInteractions(source);
        audited("LAB_REQUEST_CREATED","LAB_SPECIMEN_RECORDED","LAB_SPECIMEN_RECEIVED","LAB_SPECIMEN_REJECTED","LAB_REQUEST_CANCELLED","LAB_RESULT_RECORDED","LAB_RESULT_CORRECTED");
    }
    @Test void sourcePolicyDenialRollsBackResultAndAggregate() throws Exception {
        JsonNode r=create(false,List.of("TCM")); caller=labCookie;
        doThrow(ApplicationFailure.forbidden()).when(source).requireLocalCreate(any(),eq("LAB_RESULT_WRITE"),any(),eq("LAB_RESULT"));
        try { call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(null),403); }
        finally { doCallRealMethod().when(source).requireLocalCreate(any(),eq("LAB_RESULT_WRITE"),any(),eq("LAB_RESULT")); }
        assertThat(jdbc.queryForObject("select count(*) from lab_results",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='LAB_RESULT_RECORDED'",Integer.class)).isZero();
        JsonNode current=call(get(path(r)),null,200); assertThat(current.path("status").asText()).isEqualTo("REQUESTED");
        assertThat(current.path("version").asLong()).isZero(); assertThat(current.path("tests").get(0).path("version").asLong()).isZero();
    }
    @Test void currentFacilityMembershipAndPermissionsAreRequiredOnEveryRequest() throws Exception {
        JsonNode r=create(false,List.of("TCM")); caller=labCookie;
        jdbc.update("update user_facilities set active=false where facility_id=?",testing);
        call(get(path(r)),null,403); call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(null),403);
        jdbc.update("update user_facilities set active=true where facility_id=?",testing);
        jdbc.update("update facilities set active=false where id=?",testing);
        call(get(path(r)),null,403);
        jdbc.update("update facilities set active=true where id=?",testing);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='LAB_STAFF') and permission_id=(select id from permissions where code='LAB_RESULT_WRITE')");
        try { call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(null),403); call(get(path(r)),null,200); }
        finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='LAB_STAFF' and p.code='LAB_RESULT_WRITE'"); }
    }
    @Test void concurrentDifferentTestsPreserveCompleteAggregation() throws Exception {
        JsonNode r=create(false,List.of("TCM","MIKROSKOPIS_BTA")); caller=labCookie;
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch start=new CountDownLatch(1); List<Future<Integer>> results=new ArrayList<>();
            for(JsonNode test:r.path("tests")) {
                String endpoint="/api/v1/lab-request-tests/"+test.path("id").asText()+"/results";
                results.add(pool.submit(() -> { start.await(); return mvc.perform(post(endpoint).cookie(labCookie).with(csrf()).header("If-Match","\"0\"").contentType("application/json").content(json.writeValueAsString(resultInput(null)))).andReturn().getResponse().getStatus(); }));
            }
            start.countDown(); for(var result:results) assertThat(result.get(30,TimeUnit.SECONDS)).isEqualTo(201);
        }
        assertThat(call(get(path(r)),null,200).path("status").asText()).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("select count(*) from lab_results",Integer.class)).isEqualTo(2);
    }
    @Test void concurrentCorrectionsAppendExactlyOneLatestSuccessor() throws Exception {
        JsonNode r=create(false,List.of("TCM")); caller=labCookie; JsonNode original=result(r,null);
        String endpoint="/api/v1/lab-results/"+original.path("id").asText()+"/corrections";
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch start=new CountDownLatch(1); Callable<Integer> task=() -> { start.await(); return mvc.perform(post(endpoint).cookie(labCookie).with(csrf()).header("If-Match","\"0\"").contentType("application/json").content(json.writeValueAsString(correction()))).andReturn().getResponse().getStatus(); };
            var a=pool.submit(task); var b=pool.submit(task); start.countDown();
            assertThat(List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        }
        assertThat(jdbc.queryForObject("select count(*) from lab_results",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select max(sequence_no) from lab_results",Integer.class)).isEqualTo(2);
    }
    @Test void cancellationAndResultRaceHaveExactlyOneSuccessfulCommand() throws Exception {
        JsonNode r=create(false,List.of("TCM"));
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch start=new CountDownLatch(1);
            var cancellation=pool.submit(() -> { start.await(); return mvc.perform(post(path(r)+"/cancel").cookie(sourceCookie).with(csrf()).header("If-Match","\"0\"")).andReturn().getResponse().getStatus(); });
            var result=pool.submit(() -> { start.await(); return mvc.perform(post(resultPath(r)).cookie(labCookie).with(csrf()).header("If-Match","\"0\"").contentType("application/json").content(json.writeValueAsString(resultInput(null)))).andReturn().getResponse().getStatus(); });
            start.countDown(); int cancelled=cancellation.get(30,TimeUnit.SECONDS),recorded=result.get(30,TimeUnit.SECONDS);
            assertThat((cancelled==200 && recorded==409) || (cancelled==409 && recorded==201)).isTrue();
        }
        JsonNode current=call(get(path(r)),null,200);
        int results=jdbc.queryForObject("select count(*) from lab_results",Integer.class);
        assertThat(current.path("status").asText()).isEqualTo(results==0 ? "CANCELLED" : "COMPLETED");
    }
    @Test void receiptCannotBeOverwrittenAndCorrectionPayloadCannotReassignLineage() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false); caller=labCookie; receive(s,true);
        String endpoint="/api/v1/lab-specimens/"+s.path("id").asText()+"/receive";
        assertThat(call(post(endpoint).header("If-Match","\"1\""),receipt(false),409).path("code").asText()).isEqualTo("LAB_SPECIMEN_STATE_CONFLICT");
        JsonNode first=result(r,s); Map<String,Object> body=new HashMap<>(correction()); body.put("specimenId",UUID.randomUUID());
        call(post("/api/v1/lab-results/"+first.path("id").asText()+"/corrections").header("If-Match","\"0\""),body,400);
        assertThat(jdbc.queryForObject("select count(*) from lab_results",Integer.class)).isEqualTo(1);
    }
    @Test void duplicateFinalForUsableSpecimenDoesNotMutateVersionsRowsOrAudit() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false); caller=labCookie; JsonNode usable=receive(s,true);
        JsonNode first=result(r,usable); assertThat(first.path("status").asText()).isEqualTo("FINAL");
        assertThat(first.path("sequenceNo").asInt()).isEqualTo(1);
        assertDuplicateUnchanged(r,usable);
    }
    @Test void duplicateNullFinalAfterCorrectionMustStillUseCorrectionCommand() throws Exception {
        JsonNode r=create(false,List.of("TCM")); caller=labCookie; JsonNode first=result(r,null);
        JsonNode corrected=call(post("/api/v1/lab-results/"+first.path("id").asText()+"/corrections").header("If-Match","\"0\""),correction(),201);
        assertDuplicateUnchanged(r,null);
        JsonNode next=call(post("/api/v1/lab-results/"+corrected.path("id").asText()+"/corrections").header("If-Match","\"0\""),correction(),201);
        assertThat(next.path("sequenceNo").asInt()).isEqualTo(3);
    }
    @Test void separateSpecimenAndNullLineagesPreservePartialAndCompleteAggregation() throws Exception {
        JsonNode r=create(false,List.of("TCM","MIKROSKOPIS_BTA")),a=add(r,false),b=add(r,false); caller=labCookie;
        JsonNode usableA=receive(a,true),usableB=receive(b,true); result(r,usableA);
        JsonNode second=call(post(resultPath(r)).header("If-Match",currentTestVersion(r)),resultInput(usableB),201);
        JsonNode noSpecimen=call(post(resultPath(r)).header("If-Match",currentTestVersion(r)),resultInput(null),201);
        assertThat(second.path("sequenceNo").asInt()).isEqualTo(1); assertThat(noSpecimen.path("sequenceNo").asInt()).isEqualTo(1);
        JsonNode partial=call(get(path(r)),null,200); assertThat(partial.path("status").asText()).isEqualTo("PARTIAL");
        assertThat(partial.path("completeness").path("completedTests").asInt()).isEqualTo(1);
        assertThat(partial.path("tests").get(0).path("latestResults")).hasSize(3);
        assertDuplicateUnchanged(r,usableA); assertDuplicateUnchanged(r,usableB); assertDuplicateUnchanged(r,null);
        String remaining="/api/v1/lab-request-tests/"+r.path("tests").get(1).path("id").asText()+"/results";
        call(post(remaining).header("If-Match","\"0\""),resultInput(null),201);
        JsonNode completed=call(get(path(r)),null,200); assertThat(completed.path("status").asText()).isEqualTo("COMPLETED");
        assertThat(completed.path("completeness").path("completedTests").asInt()).isEqualTo(2);
    }
    @ParameterizedTest @CsvSource({"DIAGNOSIS,false","DIAGNOSIS,true","FOLLOW_UP,false","FOLLOW_UP,true"})
    void lateFirstFinalRemainsAllowedButBothRevisionPathsStayClosed(String reason,boolean withSpecimen) throws Exception {
        UUID caseId=null; Map<String,Object> body=request(false,List.of("TCM","MIKROSKOPIS_BTA"));
        if("FOLLOW_UP".equals(reason)) { caseId=tbCase("ACTIVE"); body.remove("registrationId"); body.put("caseId",caseId); body.put("requestReasonCode",reason); }
        JsonNode r=call(post("/api/v1/lab-requests"),body,201),usable=null;
        if(withSpecimen) { JsonNode s=add(r,false); caller=labCookie; usable=receive(s,true); }
        caller=sourceCookie;
        if("DIAGNOSIS".equals(reason)) {
            JsonNode diagnosis=call(post("/api/v1/registrations/"+registration+"/diagnoses").header("If-Match","\"0\""),Map.of("diagnosisDate",LocalDate.now(clock).toString(),"anatomicalSiteCode","PARU","diagnosisTypeCode","KLINIS","diagnosisResult","Catatan","treatmentDisposition","TREAT_HERE"),201);
            call(post("/api/v1/registrations/"+registration+"/cases").header("If-Match","\"1\""),Map.of("diagnosisId",diagnosis.path("id").asText(),"caseCategoryCode","TB_SO","previousTreatmentCategoryCode","BARU"),201);
        } else {
            UUID treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date) values (?,?,current_date) returning id",UUID.class,caseId,sending);
            String outcome=jdbc.queryForObject("select code from treatment_outcome_codes where active=true limit 1",String.class);
            jdbc.update("insert into treatment_outcomes(treatment_id,outcome_code,outcome_date) values (?,?,current_date)",treatment,outcome);
        }
        var registrations=jdbc.queryForList("select * from tb_registrations order by id"); var cases=jdbc.queryForList("select * from tb_cases order by id");
        var treatments=jdbc.queryForList("select * from treatments order by id"); var outcomes=jdbc.queryForList("select * from treatment_outcomes order by id");
        caller=labCookie; JsonNode first=result(r,usable); assertThat(first.path("sequenceNo").asInt()).isEqualTo(1);
        assertDuplicateUnchanged(r,usable);
        JsonNode conflict=call(post("/api/v1/lab-results/"+first.path("id").asText()+"/corrections").header("If-Match","\"0\""),correction(),409);
        assertThat(conflict.path("code").asText()).isEqualTo("LAB_RESULT_STATE_CONFLICT");
        String remaining="/api/v1/lab-request-tests/"+r.path("tests").get(1).path("id").asText()+"/results";
        call(post(remaining).header("If-Match","\"0\""),resultInput(usable),201);
        assertThat(call(get(path(r)),null,200).path("status").asText()).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForList("select * from tb_registrations order by id")).isEqualTo(registrations);
        assertThat(jdbc.queryForList("select * from tb_cases order by id")).isEqualTo(cases);
        assertThat(jdbc.queryForList("select * from treatments order by id")).isEqualTo(treatments);
        assertThat(jdbc.queryForList("select * from treatment_outcomes order by id")).isEqualTo(outcomes);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='LAB_RESULT_CORRECTED'",Integer.class)).isZero();
    }
    @ParameterizedTest @CsvSource({"PRELIMINARY,false","PRELIMINARY,true","CANCELLED,false","CANCELLED,true"})
    void firstFinalAfterNonfinalHistoryUsesMaximumSequence(String historicalStatus,boolean withSpecimen) throws Exception {
        JsonNode r=create(false,List.of("TCM")),usable=null;
        if(withSpecimen) { JsonNode s=add(r,false); caller=labCookie; usable=receive(s,true); } else caller=labCookie;
        UUID test=UUID.fromString(r.path("tests").get(0).path("id").asText()),specimen=usable==null ? null : UUID.fromString(usable.path("id").asText());
        jdbc.update("insert into lab_results(lab_request_test_id,specimen_id,sequence_no,status,tested_at,result_text) values (?,?,7,?,now(),'Historical result')",test,specimen,historicalStatus);
        JsonNode first=result(r,usable); assertThat(first.path("status").asText()).isEqualTo("FINAL");
        assertThat(first.path("sequenceNo").asInt()).isEqualTo(8);
        assertThat(jdbc.queryForObject("select status from lab_results where lab_request_test_id=? and sequence_no=7",String.class,test)).isEqualTo(historicalStatus);
    }
    @ParameterizedTest @CsvSource({"FINAL,false","FINAL,true","CORRECTED,false","CORRECTED,true"})
    void anyFinalOrCorrectedHistoryBlocksInitialEntryEvenWithLaterCancelledRow(String historicalStatus,boolean withSpecimen) throws Exception {
        JsonNode r=create(false,List.of("TCM")),usable=null;
        if(withSpecimen) { JsonNode s=add(r,false); caller=labCookie; usable=receive(s,true); } else caller=labCookie;
        UUID test=UUID.fromString(r.path("tests").get(0).path("id").asText()),specimen=usable==null ? null : UUID.fromString(usable.path("id").asText());
        jdbc.update("insert into lab_results(lab_request_test_id,specimen_id,sequence_no,status,tested_at,result_text) values (?,?,7,?,now(),'Historical result')",test,specimen,historicalStatus);
        jdbc.update("insert into lab_results(lab_request_test_id,specimen_id,sequence_no,status,tested_at,result_text) values (?,?,9,'CANCELLED',now(),'Cancelled history')",test,specimen);
        assertDuplicateUnchanged(r,usable);
    }
    @Test void concurrentFirstFinalForSpecimenHasOneWinnerAndRefreshingVersionCannotSupersedeIt() throws Exception {
        JsonNode r=create(false,List.of("TCM")),s=add(r,false); caller=labCookie; JsonNode usable=receive(s,true);
        String endpoint=resultPath(r),payload=json.writeValueAsString(resultInput(usable));
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);
            Callable<Integer> task=() -> { ready.countDown(); if(!start.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent start timed out"); return mvc.perform(post(endpoint).cookie(labCookie).with(csrf()).header("If-Match","\"0\"").contentType("application/json").content(payload)).andReturn().getResponse().getStatus(); };
            var a=pool.submit(task); var b=pool.submit(task);
            try { assertThat(ready.await(30,TimeUnit.SECONDS)).isTrue(); } finally { start.countDown(); }
            assertThat(List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        }
        assertThat(jdbc.queryForObject("select count(*) from lab_results",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='LAB_RESULT_RECORDED'",Integer.class)).isEqualTo(1);
        assertDuplicateUnchanged(r,usable);
    }
    private String currentTestVersion(JsonNode r) throws Exception { return "\""+call(get(path(r)),null,200).path("tests").get(0).path("version").asLong()+"\""; }
    private void assertDuplicateUnchanged(JsonNode r,JsonNode specimen) throws Exception {
        UUID id=UUID.fromString(r.path("id").asText());
        var request=jdbc.queryForMap("select * from lab_requests where id=?",id);
        var tests=jdbc.queryForList("select * from lab_request_tests where lab_request_id=? order by id",id);
        var results=jdbc.queryForList("select v.* from lab_results v join lab_request_tests t on t.id=v.lab_request_test_id where t.lab_request_id=? order by v.id",id);
        var audits=jdbc.queryForList("select * from audit_logs where action='LAB_RESULT_RECORDED' order by id");
        JsonNode conflict=call(post(resultPath(r)).header("If-Match",currentTestVersion(r)),resultInput(specimen),409);
        assertThat(conflict.path("code").asText()).isEqualTo("LAB_RESULT_ALREADY_EXISTS");
        assertThat(conflict.path("detail").asText()).containsIgnoringCase("koreksi");
        assertThat(jdbc.queryForMap("select * from lab_requests where id=?",id)).isEqualTo(request);
        assertThat(jdbc.queryForList("select * from lab_request_tests where lab_request_id=? order by id",id)).isEqualTo(tests);
        assertThat(jdbc.queryForList("select v.* from lab_results v join lab_request_tests t on t.id=v.lab_request_test_id where t.lab_request_id=? order by v.id",id)).isEqualTo(results);
        assertThat(jdbc.queryForList("select * from audit_logs where action='LAB_RESULT_RECORDED' order by id")).isEqualTo(audits);
    }
    private JsonNode create(boolean internal,List<String> types) throws Exception { return call(post("/api/v1/lab-requests"),request(internal,types),201); }
    private Map<String,Object> request(boolean internal,List<String> types) { return new HashMap<>(Map.of("registrationId",registration,"testingFacilityId",internal ? sending : testing,"requestReasonCode","DIAGNOSIS","testTypeCodes",types,"notes","notes sensibles")); }
    private JsonNode add(JsonNode r,boolean sent) throws Exception { return call(post(path(r)+"/specimens").header("If-Match",version(path(r))),specimen(sent),201); }
    private Map<String,Object> specimen(boolean sent) { Map<String,Object> body=new HashMap<>(Map.of("specimenType","Dahak","collectedAt",now().minusHours(1).toString())); if(sent) body.put("sentAt",now().minusMinutes(10).toString()); return body; }
    private Map<String,Object> receipt(boolean possible) { Map<String,Object> body=new HashMap<>(Map.of("receivedAt",now().toString(),"examinationPossible",possible)); if(!possible) body.put("rejectionReason","raison sensible"); return body; }
    private JsonNode receive(JsonNode specimen,boolean possible) throws Exception { return call(post("/api/v1/lab-specimens/"+specimen.path("id").asText()+"/receive").header("If-Match","\""+specimen.path("version").asLong()+"\""),receipt(possible),200); }
    private JsonNode result(JsonNode r,JsonNode specimen) throws Exception { return call(post(resultPath(r)).header("If-Match","\"0\""),resultInput(specimen),201); }
    private Map<String,Object> resultInput(JsonNode specimen) { Map<String,Object> body=new HashMap<>(Map.of("testedAt",now().toString(),"resultText","Valeur sensible")); if(specimen!=null) body.put("specimenId",specimen.path("id").asText()); return body; }
    private Map<String,Object> correction() { return Map.of("testedAt",now().toString(),"resultText","Correction sensible"); }
    private String path(JsonNode r) { return "/api/v1/lab-requests/"+r.path("id").asText(); }
    private String resultPath(JsonNode r) { return "/api/v1/lab-request-tests/"+r.path("tests").get(0).path("id").asText()+"/results"; }
    private String version(String path) throws Exception { return "\""+call(get(path),null,200).path("version").asLong()+"\""; }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int status) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        String output=mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(status)).andReturn().getResponse().getContentAsString();
        return output.isEmpty() ? json.nullNode() : json.readTree(output);
    }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID user(String email,String role,UUID facility) { UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,passwordHash); jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role); jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,facility); return id; }
    private Cookie login(String email) throws Exception { return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION"); }
    private UUID tbCase(String status) { jdbc.update("update tb_registrations set status='CONVERTED_TO_CASE' where id=?",registration); return jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,status,case_category_code,previous_treatment_category_code) values (?,?,?,'TB_SO','BARU') returning id",UUID.class,registration,sending,status); }
    private void audited(String... actions) { for(String action:actions) assertThat(jdbc.queryForObject("select count(*) from audit_logs where action=?",Integer.class,action)).isGreaterThan(0); }
}
