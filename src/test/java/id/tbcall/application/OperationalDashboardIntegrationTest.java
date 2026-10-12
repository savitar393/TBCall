package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
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

@SpringBootTest(properties={"tbcall.security.production=false"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
@Import(OperationalDashboardIntegrationTest.TimeConfiguration.class)
class OperationalDashboardIntegrationTest {
    @TestConfiguration static class TimeConfiguration {
        @Bean @Primary Clock dashboardClock() { return Clock.fixed(Instant.parse("2026-10-11T00:00:00Z"),ZoneOffset.UTC); }
    }
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername); r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    static final String PATH="/api/v1/operational-dashboard",PASSWORD="Fictional dashboard password 123!";
    static String hash;
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords; @Autowired Clock clock;
    final JsonMapper json=JsonMapper.builder().build();
    UUID facility,foreign,inactive,officer,patient,active,completed,referred,treatment;
    UUID atNow,atEnd,overdue,lab;
    Cookie cookie;
    @BeforeEach void setup() throws Exception {
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=facility("Fictional assigned facility"); foreign=facility("Fictional foreign facility"); inactive=facility("Fictional inactive facility");
        jdbc.update("update facilities set active=false where id=?",inactive);
        officer=user("dashboard-officer@example.org","TB_OFFICER",facility); cookie=login("dashboard-officer@example.org");
        patient=jdbc.queryForObject("insert into patients(full_name,nik,address) values ('Fictional dashboard patient','1234567890123456','PRIVATE-ADDRESS') returning id",UUID.class);
        active=tbCase(facility,"ACTIVE"); completed=tbCase(facility,"COMPLETED"); referred=tbCase(facility,"REFERRED");
        for(String status:List.of("TRANSFERRED","CLOSED","CANCELLED")) tbCase(facility,status);
        tbCase(foreign,"ACTIVE"); tbCase(foreign,"COMPLETED"); tbCase(inactive,"ACTIVE");
        treatment=treatment(active,facility,"ACTIVE");
        overdue=follow(treatment,"2026-10-10T23:59:59Z","SCHEDULED");
        atNow=follow(treatment,"2026-10-11T00:00:00Z","SCHEDULED"); atEnd=follow(treatment,"2026-10-18T00:00:00Z","SCHEDULED");
        follow(treatment,"2026-10-18T00:00:01Z","SCHEDULED");
        for(String status:List.of("COMPLETED","MISSED","CANCELLED")) follow(treatment,"2026-10-10T00:00:00Z",status);
        UUID inconsistent=follow(treatment,"2026-10-10T00:00:00Z","SCHEDULED"); jdbc.update("update follow_ups set completed_at='2026-10-10T01:00:00Z' where id=?",inconsistent);
        follow(treatment(completed,facility,"COMPLETED"),"2026-10-10T00:00:00Z","SCHEDULED");
        follow(treatment(tbCase(facility,"ACTIVE"),facility,"PAUSED"),"2026-10-12T00:00:00Z","SCHEDULED");
        follow(treatment(tbCase(facility,"ACTIVE"),facility,"PLANNED"),"2026-10-12T00:00:00Z","SCHEDULED");
        follow(treatment(tbCase(foreign,"ACTIVE"),facility,"ACTIVE"),"2026-10-12T00:00:00Z","SCHEDULED");
        follow(treatment(tbCase(facility,"ACTIVE"),foreign,"ACTIVE"),"2026-10-12T00:00:00Z","SCHEDULED");
        follow(treatment(tbCase(inactive,"ACTIVE"),inactive,"ACTIVE"),"2026-10-12T00:00:00Z","SCHEDULED");
        lab=request(active,facility,foreign,"REQUESTED",false);
        for(String status:List.of("SENT","RECEIVED","PARTIAL","DRAFT","COMPLETED","CANCELLED")) request(active,facility,foreign,status,status.equals("PARTIAL"));
        request(active,foreign,facility,"REQUESTED",false); request(active,foreign,foreign,"PARTIAL",false); request(active,inactive,foreign,"REQUESTED",false);
    }
    @Test void exactStatusesDatesAndCountsMatchScopedRowsWithMinimalProjection() throws Exception {
        JsonNode data=read("");
        assertThat(data.path("cases").path("data").path("active").asInt()).isEqualTo(4);
        assertThat(data.path("cases").path("data").path("completed").asInt()).isEqualTo(1);
        JsonNode follows=data.path("followUps").path("data");
        assertThat(ids(follows.path("upcoming").path("content"))).containsExactly(atNow.toString(),atEnd.toString());
        assertThat(follows.path("upcoming").path("totalElements").asInt()).isEqualTo(2);
        assertThat(ids(follows.path("overdue").path("content"))).containsExactly(overdue.toString());
        assertThat(follows.path("overdue").path("totalElements").asInt()).isEqualTo(1);
        assertThat(data.path("laboratory").path("data").path("totalElements").asInt()).isEqualTo(4);
        assertThat(data.path("laboratory").path("data").path("content").size()).isEqualTo(4);
        assertThat(data.toString()).doesNotContain("1234567890123456","PRIVATE-","address","hivStatus","resultText","weightKg","patientId");
        assertThat(data.path("asOf").asText()).isEqualTo("2026-10-11T00:00:00Z");
    }
    @Test void paginationHasStableOrderAndForeignRowsNeverAffectTotalsOrOffsets() throws Exception {
        for(int i=0;i<13;i++) follow(treatment,"2026-10-12T00:00:00Z","SCHEDULED");
        for(int i=0;i<13;i++) { request(active,facility,foreign,"REQUESTED",false); request(active,foreign,facility,"REQUESTED",false); }
        JsonNode first=read(""),second=read("?upcomingPage=1&labPage=1");
        var p1=first.path("followUps").path("data").path("upcoming"); var p2=second.path("followUps").path("data").path("upcoming");
        assertThat(p1.path("totalElements").asInt()).isEqualTo(15); assertThat(p2.path("totalElements").asInt()).isEqualTo(15);
        assertThat(p1.path("content").size()).isEqualTo(10); assertThat(p2.path("content").size()).isEqualTo(5);
        assertThat(ids(p1.path("content"))).doesNotContainAnyElementsOf(ids(p2.path("content")));
        assertThat(ids(read("").path("followUps").path("data").path("upcoming").path("content"))).isEqualTo(ids(p1.path("content")));
        assertThat(first.path("laboratory").path("data").path("totalElements").asInt()).isEqualTo(17);
        assertThat(second.path("laboratory").path("data").path("content").size()).isEqualTo(7);
        assertThat(read("?labPage=2").path("laboratory").path("data").path("content")).isEmpty();
    }
    @ParameterizedTest @ValueSource(strings={"CASE_READ","TREATMENT_READ","FOLLOW_UP_READ","LAB_REQUEST_READ"})
    void missingDomainPermissionsHideExistenceWithoutBlockingOtherReads(String permission) throws Exception {
        permission(permission,false);
        try {
            JsonNode data=read(""); String section=switch(permission) { case "CASE_READ" -> "cases"; case "LAB_REQUEST_READ" -> "laboratory"; default -> "followUps"; };
            assertThat(data.path(section).path("state").asText()).isEqualTo("PERMISSION_DENIED"); assertThat(data.path(section).path("data").isNull()).isTrue();
            assertThat(data.path(section).toString()).doesNotContain("totalElements","patientName","\"id\"");
        } finally { permission(permission,true); }
    }
    @Test void requestsNeedNoResultPermissionAndDualRolesRetainExistingTestingFacilityScope() throws Exception {
        permission("LAB_RESULT_READ",false);
        try {
            assertThat(read("").path("laboratory").path("data").path("totalElements").asInt()).isEqualTo(4);
            jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='LAB_STAFF'",officer);
            // Same request matching both roles counts once; foreign requesting/assigned testing is now visible.
            request(active,facility,facility,"PARTIAL",false);
            assertThat(read("").path("laboratory").path("data").path("totalElements").asInt()).isEqualTo(6);
        } finally { permission("LAB_RESULT_READ",true); }
    }
    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER","LAB_STAFF","FACILITY_ADMIN","SYSTEM_ADMIN","PROGRAM_MONITOR"})
    void wrongRolesCannotReadDashboardAndDenialsAreAudited(String role) throws Exception {
        String email="dashboard-other@example.org"; user(email,role,facility);
        Cookie other=login(email); mvc.perform(get(PATH).cookie(other)).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='AUTHORIZATION_DENIED'",Integer.class)).isGreaterThan(0);
    }
    @Test void inactiveAssignmentAndNoEligiblePermissionsAreDenied() throws Exception {
        jdbc.update("update user_facilities set active=false where user_id=?",officer);
        mvc.perform(get(PATH).cookie(cookie)).andExpect(status().isForbidden());
        jdbc.update("update user_facilities set active=true where user_id=?",officer);
        for(String permission:List.of("CASE_READ","TREATMENT_READ","FOLLOW_UP_READ","LAB_REQUEST_READ")) permission(permission,false);
        try { mvc.perform(get(PATH).cookie(cookie)).andExpect(status().isForbidden()); }
        finally { for(String permission:List.of("CASE_READ","TREATMENT_READ","FOLLOW_UP_READ","LAB_REQUEST_READ")) permission(permission,true); }
    }
    @Test void facilityTransferRemovesCaseAndTreatmentReadsWithoutChangingHistoricalLabScope() throws Exception {
        jdbc.update("update tb_cases set current_facility_id=? where id=?",foreign,active);
        var data=read(""); assertThat(data.path("cases").path("data").path("active").asInt()).isEqualTo(3);
        assertThat(data.path("followUps").path("data").path("upcoming").path("totalElements").asInt()).isZero();
        assertThat(data.path("laboratory").path("data").path("totalElements").asInt()).isEqualTo(4);
        mvc.perform(get("/api/v1/cases/"+active).cookie(cookie)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/treatments/"+treatment).cookie(cookie)).andExpect(status().isNotFound());
    }
    @Test void existingDetailsRetainTheirOwnPermissionsAndDashboardNeverMutatesRecords() throws Exception {
        Map<String,Object> before=jdbc.queryForMap("select status,version from tb_cases where id=?",active);
        read(""); mvc.perform(post(PATH).cookie(cookie).with(csrf())).andExpect(status().isMethodNotAllowed());
        assertThat(jdbc.queryForMap("select status,version from tb_cases where id=?",active)).isEqualTo(before);
        permission("TREATMENT_READ",false);
        try { read(""); mvc.perform(get("/api/v1/treatments/"+treatment).cookie(cookie)).andExpect(status().isForbidden()); }
        finally { permission("TREATMENT_READ",true); }
        permission("CASE_READ",false);
        try { read(""); mvc.perform(get("/api/v1/cases/"+active).cookie(cookie)).andExpect(status().isForbidden()); }
        finally { permission("CASE_READ",true); }
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action in ('CASE_UPDATED','TREATMENT_STARTED','FOLLOW_UP_COMPLETED','LAB_REQUEST_CREATED')",Integer.class)).isZero();
    }
    private JsonNode read(String query) throws Exception { return json.readTree(mvc.perform(get(PATH+query).cookie(cookie)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()); }
    private List<String> ids(JsonNode rows) { List<String> values=new ArrayList<>(); rows.forEach(row -> values.add(row.path("id").asText())); return values; }
    private void permission(String code,boolean grant) {
        if(grant) jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code=? on conflict do nothing",code);
        else jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code=?)",code);
    }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID user(String email,String role,UUID f) { UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash); jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role); jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,f); return id; }
    private UUID tbCase(UUID f,String state) {
        UUID reg=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-10-01','CONVERTED_TO_CASE') returning id",UUID.class,patient,f);
        return jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,status) values (?,?,?) returning id",UUID.class,reg,f,state);
    }
    private UUID treatment(UUID c,UUID f,String status) { return jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,'2026-10-01',?,'PRIVATE-TREATMENT') returning id",UUID.class,c,f,status); }
    private UUID follow(UUID t,String scheduled,String status) { return jdbc.queryForObject("insert into follow_ups(treatment_id,follow_up_type,scheduled_at,status,notes) values (?,'Recorded fictional review',?::timestamptz,?,'PRIVATE-FOLLOW') returning id",UUID.class,t,scheduled,status); }
    private UUID request(UUID c,UUID requesting,UUID testing,String status,boolean registrationOwner) {
        UUID reg=jdbc.queryForObject("select registration_id from tb_cases where id=?",UUID.class,c);
        return jdbc.queryForObject("insert into lab_requests(case_id,registration_id,requesting_facility_id,testing_facility_id,referral_type,requested_at,status,notes) values (?,?,?,?,'EXTERNAL','2026-10-10T00:00:00Z',?,'PRIVATE-LAB') returning id",UUID.class,registrationOwner ? null : c,registrationOwner ? reg : null,requesting,testing,status);
    }
    private Cookie login(String email) throws Exception {
        // Align this owned test DB's session default with its fixed dashboard clock.
        jdbc.execute("alter table user_sessions alter column created_at set default timestamptz '"+clock.instant()+"'"); return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION"); }
}
