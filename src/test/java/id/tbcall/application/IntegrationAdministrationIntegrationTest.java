package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"tbcall.security.production=false", "tbcall.monitoring.scheduler-enabled=false"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class IntegrationAdministrationIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl); r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords;
    final JsonMapper json = JsonMapper.builder().build();
    static final String PASSWORD = "Integration boundary password 123!";
    static String passwordHash;
    UUID system, otherSystem, run, otherRun, entity, conflict;
    Cookie caller;

    @BeforeEach void setup() throws Exception {
        if (passwordHash == null) passwordHash = passwords.encode(PASSWORD);
        jdbc.execute("truncate external_source_authorities,integration_conflicts,external_identifiers,sync_runs,users,patients,facilities restart identity cascade");
        jdbc.update("delete from external_systems where code <> 'SITB'");
        system = jdbc.queryForObject("select id from external_systems where code='SITB'", UUID.class);
        otherSystem = jdbc.queryForObject("insert into external_systems(code,name) values ('OTHER','Other source') returning id", UUID.class);
        entity = UUID.randomUUID();
        jdbc.update("insert into external_identifiers(external_system_id,entity_type,entity_id,external_id,external_version) values (?,'PATIENT',?,'record-1','version-1')", system, entity);
        jdbc.update("insert into external_source_authorities(external_system_id,entity_type,entity_id,authority_scope,external_id,source_version) values (?,'PATIENT',?,'CLINICAL','record-1','version-1')", system, entity);
        conflict = jdbc.queryForObject("insert into integration_conflicts(external_system_id,entity_type,entity_id,external_id,authority_scope,source_version,resolution_note) values (?,'PATIENT',?,'record-1','CLINICAL','version-1','PRIVATE OPERATOR NOTE') returning id", UUID.class, system, entity);
        run = jdbc.queryForObject("insert into sync_runs(external_system_id,status,records_received,records_failed,cursor_value,error_message) values (?,'FAILED',1,1,'cursor-1','PRIVATE ERROR SECRET TOKEN') returning id", UUID.class, system);
        otherRun = jdbc.queryForObject("insert into sync_runs(external_system_id) values (?) returning id", UUID.class, otherSystem);
        jdbc.update("insert into sync_items(sync_run_id,entity_type,external_id,resolved_entity_id,operation,status,content_hash,local_content_hash,conflict_id,error_message,raw_payload) values (?,'PATIENT','record-1',?,'UPSERT','FAILED','source-hash','local-hash',?,'PRIVATE ITEM ERROR SECRET TOKEN','{\"patientName\":\"PRIVATE PATIENT\",\"token\":\"SECRET TOKEN\"}')", run, entity, conflict);
        user("admin@example.org", "SYSTEM_ADMIN"); caller = login("admin@example.org");
    }

    @Test void adminReadsAllSevenSafeProjectionsWithoutSuccessAudit() throws Exception {
        long before = count("audit_logs");
        for (String route : routes()) safe(call(get(route), 200));
        var system = call(get("/api/v1/integrations/SITB"), 200);
        assertThat(system.path("active").asBoolean()).isFalse();
        assertThat(system.path("configurationStatus").asText()).isEqualTo("UNCONFIGURED");
        assertThat(system.path("identifierCount").asLong()).isEqualTo(1);
        assertThat(system.path("activeAuthorityCount").asLong()).isEqualTo(1);
        assertThat(system.path("latestSyncRun").path("id").asText()).isEqualTo(run.toString());
        var detail = call(get("/api/v1/integrations/SITB/sync-runs/" + run), 200);
        var item = detail.path("items").path("content").get(0);
        assertThat(item.path("localContentHash").asText()).isEqualTo("local-hash");
        assertThat(item.path("contentHash").asText()).isEqualTo("source-hash");
        assertThat(item.path("conflictId").asText()).isEqualTo(conflict.toString());
        assertThat(item.path("errorSummary").asText()).isNotBlank();
        assertThat(detail.path("run").path("cursorValue").asText()).isEqualTo("cursor-1");
        assertThat(count("audit_logs")).isEqualTo(before);
    }

    @ParameterizedTest @ValueSource(strings = {"FACILITY_ADMIN", "PROGRAM_MONITOR", "TB_OFFICER", "LAB_STAFF", "PATIENT", "TREATMENT_SUPPORTER"})
    void otherRolesCannotReadEvenWhenGrantedIntegrationPermission(String role) throws Exception {
        jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code=? and p.code='INTEGRATION_MANAGE' on conflict do nothing", role);
        try {
            user("denied@example.org", role); caller = login("denied@example.org");
            for (String route : routes()) call(get(route), 403);
            call(get("/api/v1/integrations/UNKNOWN"), 403);
        } finally {
            jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id=(select id from permissions where code='INTEGRATION_MANAGE')", role);
        }
    }

    @Test void systemAdminStillNeedsIntegrationPermission() throws Exception {
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='SYSTEM_ADMIN') and permission_id=(select id from permissions where code='INTEGRATION_MANAGE')");
        try { for (String route : routes()) call(get(route), 403); }
        finally { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='SYSTEM_ADMIN' and p.code='INTEGRATION_MANAGE'"); }
    }

    @Test void unauthenticatedReadsRequireSession() throws Exception {
        for (String route : routes()) mvc.perform(get(route)).andExpect(status().isUnauthorized());
    }

    @Test void unknownSystemAndCrossSystemRunAreNotEnumerated() throws Exception {
        call(get("/api/v1/integrations/UNKNOWN"), 404);
        for (String suffix : List.of("external-identifiers", "authorities", "sync-runs", "conflicts"))
            call(get("/api/v1/integrations/UNKNOWN/" + suffix), 404);
        call(get("/api/v1/integrations/UNKNOWN/sync-runs/" + run), 404);
        call(get("/api/v1/integrations/SITB/sync-runs/" + otherRun), 404);
        call(get("/api/v1/integrations/SITB/sync-runs/" + UUID.randomUUID()), 404);
    }

    @ParameterizedTest @CsvSource({"-1,20", "0,0", "0,51", "2147483647,50"})
    void invalidPaginationIsRejected(int page, int size) throws Exception {
        for (String route : pagedRoutes()) call(get(route).param("page", "" + page).param("size", "" + size), 400);
    }

    @Test void listsAndRunItemsHaveBoundedStablePagination() throws Exception {
        for (int i = 0; i < 55; i++) {
            jdbc.update("insert into external_identifiers(external_system_id,entity_type,entity_id,external_id) values (?,'PATIENT',?,?)", system, UUID.randomUUID(), "page-" + i);
            jdbc.update("insert into sync_items(sync_run_id,entity_type,external_id,operation,status) values (?,'PATIENT',?,'IGNORE','SKIPPED')", run, "page-" + i);
        }
        var first = call(get("/api/v1/integrations/SITB/external-identifiers").param("size", "50"), 200);
        var second = call(get("/api/v1/integrations/SITB/external-identifiers").param("size", "50").param("page", "1"), 200);
        assertThat(first.path("content").size()).isEqualTo(50); assertThat(first.path("totalElements").asLong()).isEqualTo(56);
        assertThat(second.path("content").size()).isEqualTo(6);
        Set<String> ids = new HashSet<>(); first.path("content").forEach(row -> ids.add(row.path("id").asText()));
        second.path("content").forEach(row -> assertThat(ids).doesNotContain(row.path("id").asText()));
        var detail = call(get("/api/v1/integrations/SITB/sync-runs/" + run).param("size", "50"), 200);
        assertThat(detail.path("items").path("content").size()).isEqualTo(50);
        assertThat(detail.path("items").path("totalElements").asLong()).isEqualTo(56); safe(detail);
    }

    @ParameterizedTest @ValueSource(strings = {"POST", "PUT", "PATCH", "DELETE"})
    void noIntegrationMutationMethodsExist(String method) throws Exception {
        long identifiers = count("external_identifiers"), authorities = count("external_source_authorities"), runs = count("sync_runs"), conflicts = count("integration_conflicts");
        for (String route : routes()) call(request(org.springframework.http.HttpMethod.valueOf(method), route), 405);
        assertThat(count("external_identifiers")).isEqualTo(identifiers); assertThat(count("external_source_authorities")).isEqualTo(authorities);
        assertThat(count("sync_runs")).isEqualTo(runs); assertThat(count("integration_conflicts")).isEqualTo(conflicts);
    }

    @Test void noStartImportPushResolutionOrCredentialRoutesExist() throws Exception {
        for (String path : List.of("sync-runs/start", "import", "push", "conflicts/" + conflict + "/resolve", "credentials", "authorities/" + UUID.randomUUID(), "external-identifiers/" + UUID.randomUUID()))
            call(post("/api/v1/integrations/SITB/" + path), path.equals("sync-runs/start") ? 405 : 404);
    }

    @Test void readsLeaveStoredPayloadUntouched() throws Exception {
        String before = jdbc.queryForObject("select raw_payload::text from sync_items where sync_run_id=?", String.class, run);
        safe(call(get("/api/v1/integrations/SITB/sync-runs/" + run), 200));
        assertThat(jdbc.queryForObject("select raw_payload::text from sync_items where sync_run_id=?", String.class, run)).isEqualTo(before);
    }

    private void safe(JsonNode response) {
        assertThat(response.toString()).doesNotContain("PRIVATE", "SECRET", "rawPayload", "raw_payload", "resolutionNote", "resolution_note", "password", "metadata");
    }
    private List<String> routes() {
        return List.of("/api/v1/integrations", "/api/v1/integrations/SITB", "/api/v1/integrations/SITB/external-identifiers",
                "/api/v1/integrations/SITB/authorities", "/api/v1/integrations/SITB/sync-runs", "/api/v1/integrations/SITB/sync-runs/" + run, "/api/v1/integrations/SITB/conflicts");
    }
    private List<String> pagedRoutes() { return routes().stream().filter(r -> !r.equals("/api/v1/integrations/SITB")).toList(); }
    private long count(String table) { return jdbc.queryForObject("select count(*) from " + table, Long.class); }
    private void user(String email, String role) {
        UUID id = jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id", UUID.class, email, passwordHash);
        assertThat(jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?", id, role)).isEqualTo(1);
    }
    private Cookie login(String email) throws Exception {
        var result = mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("identity", email, "password", PASSWORD)))).andExpect(status().isOk()).andReturn();
        Cookie cookie = result.getResponse().getCookie("TBCALL_SESSION"); assertThat(cookie).isNotNull(); return cookie;
    }
    private JsonNode call(MockHttpServletRequestBuilder request, int expected) throws Exception {
        var response = mvc.perform(request.cookie(caller).with(csrf()).contentType("application/json").content("{}"))
                .andExpect(status().is(expected)).andReturn().getResponse();
        return json.readTree(response.getContentAsString());
    }
}
