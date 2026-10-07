package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.LocalDate;
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
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Testcontainers
class PortalReferenceIntegrationTest {
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
    private static final String PATH="/api/v1/me/portal-reference-data";
    private static final String PASSWORD="Portal reference password 123!";
    private static String hash;
    private static final List<String> PERMISSIONS=List.of("TREATMENT_READ","ADHERENCE_READ","ADHERENCE_RECORD",
            "FOLLOW_UP_READ","TPT_READ","MONITORING_READ","ALERT_READ","ALERT_ACKNOWLEDGE","NOTIFICATION_READ_SELF");
    private final Map<UUID,List<UUID>> originalGrants=new LinkedHashMap<>();
    private Cookie caller;
    private UUID user,actorRole;
    private UUID patient,facility,caseId,treatment;

    @BeforeEach void setup() {
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
    }

    @AfterEach void restore() {
        originalGrants.forEach((role,grants)->{
            jdbc.update("delete from role_permissions where role_id=?",role);
            for(UUID grant:grants) jdbc.update("insert into role_permissions(role_id,permission_id) values (?,?)",role,grant);
        });
    }

    @Test void patientReadsVocabularyWithoutFacilityLinkOrTreatment() throws Exception {
        signIn("PATIENT","ADHERENCE_READ");
        JsonNode me=call(get("/api/v1/me"),null,200);
        assertThat(me.path("activeFacilities")).isEmpty();
        assertThat(me.path("patientLink").isNull()).isTrue();
        assertThat(call(get(PATH),null,200).path("patientDoseStatuses")).hasSize(3);
    }

    @Test void supporterReadsWithoutFacilityOrSupporterCaseLinkage() throws Exception {
        signIn("TREATMENT_SUPPORTER","MONITORING_READ");
        JsonNode me=call(get("/api/v1/me"),null,200);
        assertThat(me.path("activeFacilities")).isEmpty();
        assertThat(me.path("supporterCaseIds")).isEmpty();
        assertThat(call(get(PATH),null,200).path("supporterDoseStatuses")).hasSize(4);
    }

    @ParameterizedTest @MethodSource("rolePermissions")
    void eachPermissionIndependentlyAuthorizesEachPortalRole(String role,String permission) throws Exception {
        signIn(role,permission);
        JsonNode me=call(get("/api/v1/me"),null,200);
        assertThat(texts(me.path("permissions"))).containsExactly(permission);
        call(get(PATH),null,200);
    }

    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER"})
    void portalRoleWithoutRelevantGrantIsDenied(String role) throws Exception {
        signIn(role);
        call(get(PATH),null,403);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='AUTHORIZATION_DENIED'",Long.class)).isEqualTo(1);
    }

    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER"})
    void unrelatedGrantDoesNotSubstituteForPortalPermission(String role) throws Exception {
        signIn(role,"PATIENT_READ");
        call(get(PATH),null,403);
    }

    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","LAB_STAFF","SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR"})
    void nonPortalRoleCannotBypassWithAllArtificialPortalGrants(String role) throws Exception {
        signIn(role,PERMISSIONS.toArray(String[]::new));
        assertThat(texts(call(get("/api/v1/me"),null,200).path("permissions"))).containsExactlyInAnyOrderElementsOf(PERMISSIONS);
        call(get(PATH),null,403);
    }

    @Test void anonymousReadIsUnauthorized() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
    }

    @Test void grantRevocationIsEffectiveOnExistingSession() throws Exception {
        signIn("PATIENT","ADHERENCE_READ"); call(get(PATH),null,200);
        grants(actorRole);
        call(get(PATH),null,403);
    }

    @Test void portalRoleRemovalIsEffectiveDespiteRetainedArtificialGrant() throws Exception {
        signIn("PATIENT","ADHERENCE_READ"); call(get(PATH),null,200);
        UUID otherRole=jdbc.queryForObject("select id from roles where code='TB_OFFICER'",UUID.class);
        grants(otherRole,"ADHERENCE_READ");
        jdbc.update("delete from user_roles where user_id=?",user);
        jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",user,otherRole);
        call(get(PATH),null,403);
    }

    @Test void inactiveAccountCannotReuseSessionForReferenceRead() throws Exception {
        signIn("PATIENT","NOTIFICATION_READ_SELF"); call(get(PATH),null,200);
        jdbc.update("update users set status='SUSPENDED' where id=?",user);
        call(get(PATH),null,401);
    }

    @Test void expiredSessionCannotReadReferences() throws Exception {
        signIn("TREATMENT_SUPPORTER","ADHERENCE_READ");
        jdbc.update("update user_sessions set created_at=now()-interval '2 minutes', expires_at=now()-interval '1 minute' where user_id=?",user);
        call(get(PATH),null,401);
    }

    @Test void portalRoleAlongsideStaffRoleStillMeetsApprovedOrRoleGate() throws Exception {
        signIn("PATIENT","ADHERENCE_READ");
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='TB_OFFICER'",user);
        call(get(PATH),null,200);
    }

    @Test void linkedPatientWithOnlyTerminalTreatmentCanReadWithoutWriteExpansion() throws Exception {
        signIn("PATIENT","ADHERENCE_RECORD"); seedTarget("PATIENT");
        jdbc.update("update treatments set status='COMPLETED' where id=?",treatment);
        call(get(PATH),null,200);
        call(post(dosePath("PATIENT")),dose("MISSED"),409);
        assertThat(jdbc.queryForObject("select count(*) from dose_events",Long.class)).isZero();
    }

    @ParameterizedTest @MethodSource("approvedGroups")
    void exactCodesLabelsAndOrderForEveryGroup(String group,List<String> expected) throws Exception {
        signIn("PATIENT","ADHERENCE_READ");
        JsonNode data=call(get(PATH),null,200);
        List<String> actual=new ArrayList<>();
        for(JsonNode option:data.path(group)) {
            assertThat(option.propertyNames()).containsExactlyInAnyOrder("code","name");
            actual.add(option.path("code").asText()+"|"+option.path("name").asText());
        }
        assertThat(actual).containsExactlyElementsOf(expected);
    }

    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER"})
    void safeProjectionContainsOnlyFourteenCodeNameGroups(String role) throws Exception {
        signIn(role,"ADHERENCE_READ"); seedTarget(role);
        JsonNode data=call(get(PATH),null,200);
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("treatmentStatuses","tptStatuses","patientDoseStatuses",
                "supporterDoseStatuses","administrationModes","followUpStatuses","treatmentMonitoringEventTypes",
                "tptMonitoringEventTypes","monitoringEventStatuses","alertTypes","alertStatuses","alertSeverities",
                "notificationStatuses","notificationChannels");
        for(String group:data.propertyNames()) {
            assertThat(data.path(group).isArray()).isTrue();
            for(JsonNode option:data.path(group)) assertThat(option.propertyNames()).containsExactlyInAnyOrder("code","name");
        }
        assertThat(data.toString()).doesNotContain("PRIVATE",user.toString(),patient.toString(),facility.toString(),
                caseId.toString(),treatment.toString(),"regimen","patientId","scheduledAt","dueAt","frequency",
                "payload","recipient","outcome","adherenceScore");
        assertThat(optionCodes(data.path("patientDoseStatuses"))).doesNotContain("TAKEN_OBSERVED","DISPENSED_HOME");
        assertThat(optionCodes(data.path("supporterDoseStatuses"))).doesNotContain("DISPENSED_HOME");
        assertThat(optionCodes(data.path("tptMonitoringEventTypes"))).doesNotContain("BACTERIOLOGY_FOLLOW_UP","SAFETY_MONITORING");
        assertThat(optionCodes(data.path("notificationChannels"))).containsExactly("IN_APP");
    }

    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER"})
    void repeatedSuccessfulReadsHaveNoAuditOrDatabaseSideEffect(String role) throws Exception {
        signIn(role,"ADHERENCE_READ"); seedTarget(role);
        jdbc.update("insert into notifications(user_id,channel,status) values (?,'IN_APP','DELIVERED')",user);
        Map<String,List<String>> before=snapshot();
        call(get(PATH),null,200); call(get(PATH),null,200);
        assertThat(snapshot()).isEqualTo(before);
    }

    @ParameterizedTest @MethodSource("doseStatuses")
    void advertisedStatusesMatchExistingActorSpecificDoseWriteValidation(String role,String doseStatus) throws Exception {
        signIn(role,"ADHERENCE_RECORD"); seedTarget(role);
        JsonNode data=call(get(PATH),null,200);
        boolean allowed=(role.equals("PATIENT")?Set.of("TAKEN_SELF_REPORTED","MISSED","UNKNOWN"):
                Set.of("TAKEN_OBSERVED","TAKEN_SELF_REPORTED","MISSED","UNKNOWN")).contains(doseStatus);
        String group=role.equals("PATIENT")?"patientDoseStatuses":"supporterDoseStatuses";
        assertThat(optionCodes(data.path(group)).contains(doseStatus)).isEqualTo(allowed);
        call(post(dosePath(role)),dose(doseStatus),allowed?201:400);
        assertThat(jdbc.queryForObject("select count(*) from dose_events",Long.class)).isEqualTo(allowed?1:0);
        if(allowed) {
            assertThat(jdbc.queryForObject("select status from dose_events",String.class)).isEqualTo(doseStatus);
            assertThat(jdbc.queryForObject("select source from dose_events",String.class)).isEqualTo(role);
        }
    }

    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER"})
    void vocabularyReadDoesNotGrantDoseAlertOrNotificationWrite(String role) throws Exception {
        signIn(role,"ADHERENCE_READ"); seedTarget(role);
        UUID notification=jdbc.queryForObject("insert into notifications(user_id,channel,status) values (?,'IN_APP','DELIVERED') returning id",UUID.class,user);
        call(get(PATH),null,200);
        Map<String,List<String>> before=snapshot();
        call(post(dosePath(role)),dose("MISSED"),403);
        String receipt=role.equals("PATIENT")?"/api/v1/me/alerts/":"/api/v1/me/supporting-cases/"+caseId+"/alerts/";
        call(post(receipt+UUID.randomUUID()+"/acknowledge"),Map.of(),403);
        call(post("/api/v1/me/notifications/"+notification+"/read").header("If-Match","\"0\""),Map.of(),403);
        Map<String,List<String>> after=snapshot();
        // The denied writes retain their existing audit; successful vocabulary GET has no audit.
        before.remove("audit_logs"); after.remove("audit_logs");
        assertThat(after).isEqualTo(before);
        assertThat(texts(call(get("/api/v1/me"),null,200).path("permissions"))).containsExactly("ADHERENCE_READ");
    }

    @ParameterizedTest @ValueSource(strings={"POST","PATCH","DELETE"})
    void endpointAddsNoWriteMethod(String method) throws Exception {
        signIn("PATIENT","ADHERENCE_RECORD");
        call(request(org.springframework.http.HttpMethod.valueOf(method),PATH),Map.of(),405);
    }

    @Test void freshDatabaseUsesExactlyV1ThroughV17() {
        assertThat(jdbc.queryForList("select version from flyway_schema_history where success order by installed_rank",String.class))
                .containsExactly("1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17");
    }

    private static Stream<Arguments> rolePermissions() {
        return Stream.of("PATIENT","TREATMENT_SUPPORTER").flatMap(role->PERMISSIONS.stream().map(permission->Arguments.of(role,permission)));
    }

    private static Stream<Arguments> doseStatuses() {
        return Stream.of("PATIENT","TREATMENT_SUPPORTER").flatMap(role->Stream.of("TAKEN_OBSERVED","TAKEN_SELF_REPORTED",
                "DISPENSED_HOME","MISSED","UNKNOWN","BOGUS").map(status->Arguments.of(role,status)));
    }

    private static Stream<Arguments> approvedGroups() {
        return Stream.of(
                Arguments.of("treatmentStatuses",List.of("PLANNED|Direncanakan","ACTIVE|Aktif","PAUSED|Dijeda","TRANSFERRED|Dialihkan","COMPLETED|Selesai","STOPPED|Dihentikan","CANCELLED|Dibatalkan")),
                Arguments.of("tptStatuses",List.of("PLANNED|Direncanakan","ACTIVE|Aktif","COMPLETED|Selesai","STOPPED|Dihentikan","LOST_TO_FOLLOW_UP|Putus tindak lanjut","CANCELLED|Dibatalkan")),
                Arguments.of("patientDoseStatuses",List.of("TAKEN_SELF_REPORTED|Diminum berdasarkan laporan sendiri","MISSED|Tidak diminum","UNKNOWN|Tidak diketahui")),
                Arguments.of("supporterDoseStatuses",List.of("TAKEN_OBSERVED|Diminum terobservasi","TAKEN_SELF_REPORTED|Diminum berdasarkan laporan","MISSED|Tidak diminum","UNKNOWN|Tidak diketahui")),
                Arguments.of("administrationModes",List.of("DIRECTLY_OBSERVED|Diawasi langsung","SELF_ADMINISTERED|Diminum mandiri","OTHER|Lainnya")),
                Arguments.of("followUpStatuses",List.of("SCHEDULED|Terjadwal","COMPLETED|Selesai")),
                Arguments.of("treatmentMonitoringEventTypes",List.of("CLINICAL_REVIEW|Tinjauan klinis","WEIGHT_REVIEW|Tinjauan berat badan","ADHERENCE_REVIEW|Tinjauan kepatuhan","ADVERSE_EVENT_REVIEW|Tinjauan kejadian tidak diinginkan","BACTERIOLOGY_FOLLOW_UP|Tindak lanjut bakteriologis","SAFETY_MONITORING|Pemantauan keamanan","MEDICATION_PICKUP|Pengambilan obat")),
                Arguments.of("tptMonitoringEventTypes",List.of("CLINICAL_REVIEW|Tinjauan klinis","WEIGHT_REVIEW|Tinjauan berat badan","ADHERENCE_REVIEW|Tinjauan kepatuhan","ADVERSE_EVENT_REVIEW|Tinjauan kejadian tidak diinginkan","MEDICATION_PICKUP|Pengambilan obat")),
                Arguments.of("monitoringEventStatuses",List.of("SCHEDULED|Terjadwal","DUE|Jatuh tempo","OVERDUE|Terlambat","COMPLETED|Selesai","CANCELLED|Dibatalkan")),
                Arguments.of("alertTypes",List.of("MONITORING_OVERDUE|Pemantauan terlambat")),
                Arguments.of("alertStatuses",List.of("OPEN|Terbuka","ACKNOWLEDGED|Diakui","RESOLVED|Terselesaikan","DISMISSED|Dikesampingkan")),
                Arguments.of("alertSeverities",List.of("INFO|Informasi","WARNING|Peringatan","HIGH|Tinggi","CRITICAL|Kritis")),
                Arguments.of("notificationStatuses",List.of("PENDING|Menunggu","SENT|Dikirim","DELIVERED|Terkirim","READ|Dibaca","FAILED|Gagal","CANCELLED|Dibatalkan")),
                Arguments.of("notificationChannels",List.of("IN_APP|Dalam aplikasi")));
    }

    private void seedTarget(String role) {
        LocalDate start=LocalDate.now(clock).minusDays(5);
        facility=jdbc.queryForObject("insert into facilities(name) values ('PRIVATE FACILITY') returning id",UUID.class);
        patient=jdbc.queryForObject("insert into patients(full_name,nik) values ('PRIVATE PATIENT','1234567890123456') returning id",UUID.class);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,?) returning id",UUID.class,patient,facility,start.minusDays(1));
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code,status) values (?,?,'TB_SO','BARU','ACTIVE') returning id",UUID.class,registration,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,?,'ACTIVE','PRIVATE TREATMENT') returning id",UUID.class,caseId,facility,start);
        if(role.equals("PATIENT")) jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",user,patient);
        else jdbc.update("insert into patient_supporters(case_id,supporter_type,full_name,linked_user_id,active) values (?,'PMO','PRIVATE SUPPORTER',?,true)",caseId,user);
    }

    private String dosePath(String role) {
        return role.equals("PATIENT")?"/api/v1/me/treatment/dose-events":"/api/v1/me/supporting-cases/"+caseId+"/dose-events";
    }

    private Map<String,Object> dose(String status) {
        return Map.of("scheduledDate",LocalDate.now(clock).toString(),"status",status,"administrationMode","SELF_ADMINISTERED");
    }

    private List<String> texts(JsonNode array) {
        List<String> values=new ArrayList<>(); for(JsonNode value:array) values.add(value.asText()); return values;
    }

    private List<String> optionCodes(JsonNode array) {
        List<String> values=new ArrayList<>(); for(JsonNode value:array) values.add(value.path("code").asText()); return values;
    }

    private Map<String,List<String>> snapshot() {
        Map<String,List<String>> result=new LinkedHashMap<>();
        // Database-provided table identifiers are quoted; fixtures and canonical reference rows are included.
        for(String table:jdbc.queryForList("select tablename from pg_tables where schemaname='public' order by tablename",String.class)) {
            String identifier="\""+table.replace("\"","\"\"")+"\"";
            result.put(table,jdbc.queryForList("select to_jsonb(r)::text from "+identifier+" r order by to_jsonb(r)::text",String.class));
        }
        return result;
    }

    private void signIn(String role,String... permissions) throws Exception {
        user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('portal-reference@example.org',?,'ACTIVE',now()) returning id",UUID.class,hash);
        actorRole=jdbc.queryForObject("select id from roles where code=?",UUID.class,role);
        jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",user,actorRole);
        grants(actorRole,permissions);
        caller=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("identity","portal-reference@example.org","password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
    }

    private void grants(UUID role,String... permissions) {
        originalGrants.computeIfAbsent(role,id->jdbc.queryForList("select permission_id from role_permissions where role_id=?",UUID.class,id));
        jdbc.update("delete from role_permissions where role_id=?",role);
        for(String permission:permissions) assertThat(jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code=?",role,permission)).isEqualTo(1);
    }

    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        var response=mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn().getResponse();
        return response.getContentAsString().isEmpty()?null:json.readTree(response.getContentAsString());
    }
}
