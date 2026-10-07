package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false","tbcall.security.expose-verification-tokens=true"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class MonitoringReferenceIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username",POSTGRES::getUsername);
        registry.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordHasher passwords;
    @Autowired Clock clock;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PATH="/api/v1/monitoring-reference-data";
    private static final String PASSWORD="Monitoring reference password 123!";
    private static String hash;
    private UUID facility,patient,caseId,treatment,tpt,officerRole,extraRole;
    private List<UUID> originalGrants;
    private Cookie caller;

    @BeforeEach void setup() {
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        officerRole=jdbc.queryForObject("select id from roles where code='TB_OFFICER'",UUID.class);
        originalGrants=jdbc.queryForList("select permission_id from role_permissions where role_id=?",UUID.class,officerRole);
        facility=jdbc.queryForObject("insert into facilities(name) values ('PRIVATE FACILITY') returning id",UUID.class);
        patient=jdbc.queryForObject("insert into patients(full_name,nik) values ('PRIVATE PATIENT','1234567890123456') returning id",UUID.class);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,?) returning id",UUID.class,patient,facility,today().minusDays(6));
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code,status) values (?,?,'TB_SO','BARU','ACTIVE') returning id",UUID.class,registration,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,?,'ACTIVE','PRIVATE TREATMENT') returning id",UUID.class,caseId,facility,today().minusDays(5));
        UUID contact=jdbc.queryForObject("insert into contacts(index_case_id,full_name) values (?,'PRIVATE CONTACT') returning id",UUID.class,caseId);
        tpt=jdbc.queryForObject("insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date,status,regimen_description) values (?,?,?,?,'ACTIVE','PRIVATE REGIMEN') returning id",UUID.class,contact,caseId,facility,today().minusDays(5));
    }

    @AfterEach void restore() {
        if(originalGrants!=null) {
            jdbc.update("delete from role_permissions where role_id=?",officerRole);
            for(UUID grant:originalGrants) jdbc.update("insert into role_permissions(role_id,permission_id) values (?,?)",officerRole,grant);
        }
        if(extraRole!=null) { jdbc.update("delete from roles where id=?",extraRole); extraRole=null; }
    }

    @ParameterizedTest @ValueSource(strings={"MONITORING_READ","MONITORING_MANAGE","ALERT_READ","ALERT_ACKNOWLEDGE","ALERT_RESOLVE","NOTIFICATION_READ_SELF"})
    void eachRelevantPermissionIndependentlyAuthorizesOfficer(String permission) throws Exception {
        signIn("TB_OFFICER",permission);
        JsonNode me=call(get("/api/v1/me"),null,200);
        assertThat(codes(me.path("permissions"))).containsExactly(permission);
        assertThat(call(get(PATH),null,200).path("treatmentEventTypes")).hasSize(7);
    }

    @Test void officerRoleCannotSubstituteForRelevantPermission() throws Exception {
        signIn("TB_OFFICER"); call(get(PATH),null,403);
    }

    @Test void unrelatedTreatmentPermissionCannotAuthorizeMonitoringReferences() throws Exception {
        signIn("TB_OFFICER","TREATMENT_READ"); call(get(PATH),null,403);
    }

    @ParameterizedTest @ValueSource(strings={"LAB_STAFF","SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"})
    void artificialRelevantGrantsCannotBypassOfficerRole(String role) throws Exception {
        signIn(role,"MONITORING_READ","MONITORING_MANAGE","ALERT_READ","ALERT_ACKNOWLEDGE","ALERT_RESOLVE","NOTIFICATION_READ_SELF");
        call(get(PATH),null,403);
    }

    @ParameterizedTest @ValueSource(strings={"none","inactiveAssignment","inactiveFacility"})
    void referencesRequireAnActiveAssignedFacility(String state) throws Exception {
        UUID user=signIn("TB_OFFICER","NOTIFICATION_READ_SELF");
        switch(state) {
            case "none" -> jdbc.update("delete from user_facilities where user_id=?",user);
            case "inactiveAssignment" -> jdbc.update("update user_facilities set active=false where user_id=?",user);
            default -> jdbc.update("update facilities set active=false where id=?",facility);
        }
        call(get(PATH),null,403);
    }

    @Test void oneActiveAssignmentIsEnoughEvenWithAnInactiveFacility() throws Exception {
        UUID user=signIn("TB_OFFICER","ALERT_READ");
        UUID active=jdbc.queryForObject("insert into facilities(name) values ('Other active') returning id",UUID.class);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,active);
        jdbc.update("update facilities set active=false where id=?",facility);
        call(get(PATH),null,200);
    }

    @Test void anonymousReadRequiresAuthentication() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest @MethodSource("approvedGroups")
    void exactGroupCodesLabelsAndOrder(String group,List<String> expected) throws Exception {
        signIn("TB_OFFICER","MONITORING_READ");
        JsonNode data=call(get(PATH),null,200);
        List<String> actual=new ArrayList<>();
        for(JsonNode option:data.path(group)) {
            assertThat(option.propertyNames()).containsExactlyInAnyOrder("code","name");
            actual.add(option.path("code").asText()+"|"+option.path("name").asText());
        }
        assertThat(actual).containsExactlyElementsOf(expected);
    }

    @Test void tptOptionsExcludeTreatmentOnlyEventsAndUnavailableChannels() throws Exception {
        signIn("TB_OFFICER","MONITORING_READ"); JsonNode data=call(get(PATH),null,200);
        assertThat(optionCodes(data.path("tptEventTypes"))).doesNotContain("BACTERIOLOGY_FOLLOW_UP","SAFETY_MONITORING");
        assertThat(optionCodes(data.path("notificationChannels"))).containsExactly("IN_APP");
        assertThat(optionCodes(data.path("alertTypes"))).containsExactly("MONITORING_OVERDUE");
    }

    @Test void codeNameProjectionContainsNoClinicalOrRulesMetadata() throws Exception {
        signIn("TB_OFFICER","MONITORING_MANAGE");
        createPlan(false,"CLINICAL_REVIEW",true);
        jdbc.update("update monitoring_events set metadata='{"+"\"secret\":\"PRIVATE METADATA\"}',source_entity_type='PRIVATE SOURCE'");
        jdbc.update("update alerts set details='{"+"\"secret\":\"PRIVATE ALERT\"}'");
        JsonNode data=call(get(PATH),null,200);
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("treatmentEventTypes","tptEventTypes","planStatuses","eventStatuses","alertTypes","alertStatuses","alertSeverities","alertTargetTypes","notificationStatuses","notificationChannels");
        for(String group:data.propertyNames()) {
            assertThat(data.path(group).isArray()).isTrue();
            for(JsonNode option:data.path(group)) assertThat(option.propertyNames()).containsExactlyInAnyOrder("code","name");
        }
        assertThat(data.toString()).doesNotContain("PRIVATE","1234567890123456",facility.toString(),patient.toString(),caseId.toString(),treatment.toString(),tpt.toString(),"rulesVersion","scheduledAt","dueAt","frequency","metadata","details","recipient","eligibility","regimen","dose");
    }

    @Test void repeatedSuccessfulReadsHaveNoAuditOrPersistenceSideEffect() throws Exception {
        signIn("TB_OFFICER","MONITORING_READ"); var before=snapshot();
        List<Map<String,Object>> audits=jdbc.queryForList("select * from audit_logs order by id");
        call(get(PATH),null,200); call(get(PATH),null,200);
        assertThat(snapshot()).isEqualTo(before);
        assertThat(jdbc.queryForList("select * from audit_logs order by id")).isEqualTo(audits);
    }

    @Test void referenceReadDoesNotExpandMonitoringAlertOrNotificationWrites() throws Exception {
        UUID user=signIn("TB_OFFICER","MONITORING_MANAGE"); JsonNode plan=createPlan(false,"CLINICAL_REVIEW",true);
        UUID alert=jdbc.queryForObject("select id from alerts",UUID.class);
        UUID notification=jdbc.queryForObject("insert into notifications(alert_id,user_id,channel,status) values (?,?,'IN_APP','DELIVERED') returning id",UUID.class,alert,user);
        grants("MONITORING_READ"); call(get(PATH),null,200); var before=snapshot();
        call(post(createPath(false)),planInput("CLINICAL_REVIEW",false),403);
        call(patch("/api/v1/monitoring-plans/"+plan.path("id").asText()).header("If-Match","\"0\""),Map.of("notes","attempted mutation"),403);
        call(post("/api/v1/alerts/"+alert+"/acknowledge").header("If-Match","\"0\""),Map.of(),403);
        call(post("/api/v1/alerts/"+alert+"/resolve").header("If-Match","\"0\""),Map.of(),403);
        call(post("/api/v1/me/notifications/"+notification+"/read").header("If-Match","\"0\""),Map.of(),403);
        assertThat(snapshot()).isEqualTo(before);
        assertThat(codes(call(get("/api/v1/me"),null,200).path("permissions"))).containsExactly("MONITORING_READ");
    }

    @ParameterizedTest @ValueSource(strings={"BACTERIOLOGY_FOLLOW_UP","SAFETY_MONITORING"})
    void referenceReadDoesNotRelaxTptEventValidation(String eventType) throws Exception {
        signIn("TB_OFFICER","MONITORING_MANAGE"); call(get(PATH),null,200);
        call(post(createPath(true)),planInput(eventType,false),400);
        assertThat(count("monitoring_plans")).isZero(); assertThat(count("monitoring_events")).isZero(); assertThat(count("alerts")).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='MONITORING_PLAN_CREATED'",Long.class)).isZero();
    }

    @ParameterizedTest @ValueSource(strings={"BACTERIOLOGY_FOLLOW_UP","SAFETY_MONITORING"})
    void treatmentOnlyEventsStillWorkForTreatment(String eventType) throws Exception {
        signIn("TB_OFFICER","MONITORING_MANAGE"); call(get(PATH),null,200);
        createPlan(false,eventType,false); assertThat(count("monitoring_events")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select event_type from monitoring_events",String.class)).isEqualTo(eventType);
        assertThat(count("alerts")).isZero();
    }

    @ParameterizedTest @ValueSource(booleans={false,true})
    void currentOverdueAlertRemainsMonitoringOverdueWarningAndInApp(boolean preventive) throws Exception {
        signIn("TB_OFFICER","MONITORING_MANAGE","NOTIFICATION_READ_SELF"); call(get(PATH),null,200);
        createPlan(preventive,"CLINICAL_REVIEW",true);
        assertThat(jdbc.queryForList("select alert_type || '|' || severity || '|' || status from alerts",String.class)).containsExactly("MONITORING_OVERDUE|WARNING|OPEN");
        assertThat(jdbc.queryForList("select channel || '|' || status from notifications",String.class)).containsExactly("IN_APP|DELIVERED");
    }

    @Test void referencesExposeOnlyTheGetMethod() throws Exception {
        signIn("TB_OFFICER","MONITORING_MANAGE"); call(get(PATH),null,200);
        call(post(PATH),Map.of(),405); assertThat(count("monitoring_plans")).isZero();
    }

    private static Stream<Arguments> approvedGroups() {
        return Stream.of(
                Arguments.of("treatmentEventTypes",List.of("CLINICAL_REVIEW|Tinjauan klinis","WEIGHT_REVIEW|Tinjauan berat badan","ADHERENCE_REVIEW|Tinjauan kepatuhan","ADVERSE_EVENT_REVIEW|Tinjauan kejadian tidak diinginkan","BACTERIOLOGY_FOLLOW_UP|Tindak lanjut bakteriologis","SAFETY_MONITORING|Pemantauan keamanan","MEDICATION_PICKUP|Pengambilan obat")),
                Arguments.of("tptEventTypes",List.of("CLINICAL_REVIEW|Tinjauan klinis","WEIGHT_REVIEW|Tinjauan berat badan","ADHERENCE_REVIEW|Tinjauan kepatuhan","ADVERSE_EVENT_REVIEW|Tinjauan kejadian tidak diinginkan","MEDICATION_PICKUP|Pengambilan obat")),
                Arguments.of("planStatuses",List.of("DRAFT|Draf","ACTIVE|Aktif","PAUSED|Dijeda","COMPLETED|Selesai","CANCELLED|Dibatalkan")),
                Arguments.of("eventStatuses",List.of("SCHEDULED|Terjadwal","DUE|Jatuh tempo","OVERDUE|Terlambat","COMPLETED|Selesai","CANCELLED|Dibatalkan")),
                Arguments.of("alertTypes",List.of("MONITORING_OVERDUE|Pemantauan terlambat")),
                Arguments.of("alertStatuses",List.of("OPEN|Terbuka","ACKNOWLEDGED|Diakui","RESOLVED|Terselesaikan","DISMISSED|Dikesampingkan")),
                Arguments.of("alertSeverities",List.of("INFO|Informasi","WARNING|Peringatan","HIGH|Tinggi","CRITICAL|Kritis")),
                Arguments.of("alertTargetTypes",List.of("TREATMENT|Pengobatan","TPT|TPT")),
                Arguments.of("notificationStatuses",List.of("PENDING|Menunggu","SENT|Dikirim","DELIVERED|Terkirim","READ|Dibaca","FAILED|Gagal","CANCELLED|Dibatalkan")),
                Arguments.of("notificationChannels",List.of("IN_APP|Dalam aplikasi")));
    }

    private UUID signIn(String role,String... permissions) throws Exception {
        UUID user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('monitoring-reference@example.org',?,'ACTIVE',now()) returning id",UUID.class,hash);
        assertThat(jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",user,role)).isEqualTo(1);
        if(role.equals("TB_OFFICER")) grants(permissions);
        else {
            extraRole=jdbc.queryForObject("insert into roles(code,name) values (?, 'Artificial monitoring reference grants') returning id",UUID.class,"MONREF_"+UUID.randomUUID());
            jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",user,extraRole);
            for(String permission:permissions) assertThat(jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code=?",extraRole,permission)).isEqualTo(1);
        }
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,facility);
        caller=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity","monitoring-reference@example.org","password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
        return user;
    }
    private void grants(String... permissions) {
        jdbc.update("delete from role_permissions where role_id=?",officerRole);
        for(String permission:permissions) assertThat(jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code=?",officerRole,permission)).isEqualTo(1);
    }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        var response=mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn().getResponse();
        return json.readTree(response.getContentAsString());
    }
    private List<String> codes(JsonNode array) { List<String> result=new ArrayList<>(); for(JsonNode value:array) result.add(value.asText()); return result; }
    private List<String> optionCodes(JsonNode array) { List<String> result=new ArrayList<>(); for(JsonNode value:array) result.add(value.path("code").asText()); return result; }
    private LocalDate today() { return LocalDate.now(clock); }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
    private String createPath(boolean preventive) { return "/api/v1/"+(preventive ? "preventive-treatments/"+tpt : "treatments/"+treatment)+"/monitoring-plans"; }
    private Map<String,Object> planInput(String code,boolean overdue) {
        Map<String,Object> event=new LinkedHashMap<>(); event.put("eventType",code); event.put("scheduledAt",(overdue ? now().minusHours(2) : now().plusDays(1)).toString());
        if(overdue) event.put("dueAt",now().minusHours(1).toString());
        return Map.of("startDate",today().minusDays(5).toString(),"notes","PRIVATE PLAN","events",List.of(event));
    }
    private JsonNode createPlan(boolean preventive,String code,boolean overdue) throws Exception { return call(post(createPath(preventive)),planInput(code,overdue),201); }
    private int count(String table) { return jdbc.queryForObject("select count(*) from "+table,Integer.class); }
    private Map<String,List<Map<String,Object>>> snapshot() {
        Map<String,List<Map<String,Object>>> state=new LinkedHashMap<>();
        for(String table:List.of("users","user_sessions","roles","permissions","role_permissions","user_roles","user_facilities","facilities","patients","tb_registrations","tb_cases","treatments","contacts","preventive_treatments","monitoring_plans","monitoring_events","alerts","alert_acknowledgements","notifications","lab_requests","follow_ups","dose_events","external_identifiers"))
            state.put(table,jdbc.queryForList("select * from "+table+" order by 1"));
        return state;
    }
}
