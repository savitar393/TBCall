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
class AdminReadContractsIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username",POSTGRES::getUsername);
        registry.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordHasher passwords;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String FACILITIES="/api/v1/admin/facilities", REFERENCES="/api/v1/admin/reference-data";
    private static final String PASSWORD="Admin read contract password 123!";
    private static String hash;
    private final Map<UUID,List<UUID>> originalGrants=new LinkedHashMap<>();
    private Cookie caller;
    private UUID user,actorRole;

    @BeforeEach void setup() {
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
    }
    @AfterEach void restoreGrants() {
        originalGrants.forEach((role,grants)->{
            jdbc.update("delete from role_permissions where role_id=?",role);
            for(UUID grant:grants) jdbc.update("insert into role_permissions(role_id,permission_id) values (?,?)",role,grant);
        });
    }

    @Test void systemAdminWithoutAssignmentReadsDefaultPageAndExactSafeSummary() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE");
        UUID parent=facility("Parent",true), child=facility("Alpha",false);
        jdbc.update("update facilities set parent_facility_id=?,province_code='31',regency_code='3171',address='PRIVATE ADDRESS',district_code='PRIVATE',village_code='PRIVATE',postal_code='12345',latitude=1,longitude=2 where id=?",parent,child);
        var response=mvc.perform(get(FACILITIES).cookie(caller)).andExpect(status().isOk()).andReturn().getResponse();
        JsonNode page=json.readTree(response.getContentAsString());
        assertThat(page.propertyNames()).containsExactlyInAnyOrder("content","page","size","totalElements");
        assertThat(page.path("page").asInt()).isZero(); assertThat(page.path("size").asInt()).isEqualTo(20);
        assertThat(page.path("totalElements").asLong()).isEqualTo(2);
        JsonNode summary=page.path("content").get(0);
        assertThat(summary.propertyNames()).containsExactlyInAnyOrder("id","name","facilityTypeCode","parentFacilityId","provinceCode","regencyCode","active");
        assertThat(summary.path("id").asText()).isEqualTo(child.toString());
        assertThat(summary.path("parentFacilityId").asText()).isEqualTo(parent.toString());
        assertThat(summary.path("facilityTypeCode").asText()).isEqualTo("PUSKESMAS");
        assertThat(summary.path("provinceCode").asText()).isEqualTo("31");
        assertThat(summary.path("regencyCode").asText()).isEqualTo("3171");
        assertThat(summary.path("active").asBoolean()).isFalse();
        assertThat(page.toString()).doesNotContain("PRIVATE","version","membership","latitude","longitude");
        assertThat(response.getHeader("ETag")).isNull();
        assertThat(jdbc.queryForObject("select count(*) from user_facilities",Long.class)).isZero();
    }

    @ParameterizedTest @ValueSource(booleans={true,false})
    void explicitActiveFilterReturnsOnlyRequestedState(boolean active) throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); facility("Open",true); facility("Closed",false);
        JsonNode page=call(get(FACILITIES).param("active",String.valueOf(active)),null,200);
        assertThat(page.path("totalElements").asLong()).isEqualTo(1);
        assertThat(page.path("content").get(0).path("active").asBoolean()).isEqualTo(active);
    }

    @Test void searchIsTrimmedCaseInsensitiveSubstring() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); facility("Klinik AbCdEf",true); facility("Other",true);
        JsonNode page=call(get(FACILITIES).param("query","  bCDe  "),null,200);
        assertThat(page.path("totalElements").asLong()).isEqualTo(1);
        assertThat(page.path("content").get(0).path("name").asText()).isEqualTo("Klinik AbCdEf");
    }

    @ParameterizedTest @CsvSource({"A%,Clinic A% literal,Clinic AA decoy","A_,Clinic A_ literal,Clinic AB decoy","A!,Clinic A! literal,Clinic AB decoy"})
    void searchEscapesLiteralWildcardsAndEscapeCharacter(String query,String match,String decoy) throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); facility(match,true); facility(decoy,true);
        JsonNode page=call(get(FACILITIES).param("query",query),null,200);
        assertThat(page.path("totalElements").asLong()).isEqualTo(1);
        assertThat(page.path("content").get(0).path("name").asText()).isEqualTo(match);
    }

    @ParameterizedTest @CsvSource({"page,-1","page,2147483647","size,0","size,51","page,abc","size,abc","active,abc"})
    void invalidPagingAndBooleanParametersAreRejected(String param,String value) throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); call(get(FACILITIES).param(param,value),null,400);
    }

    @ParameterizedTest @ValueSource(strings={""," ","a"," a ","LONG"})
    void invalidTrimmedQueryLengthsAreRejected(String query) throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE");
        call(get(FACILITIES).param("query",query.equals("LONG")?"x".repeat(256):query),null,400);
    }

    @Test void pagingIsStableByNameThenUuidAndSupportsBoundarySizesAndEmptyPages() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE");
        UUID low=UUID.fromString("00000000-0000-4000-8000-000000000001"),high=UUID.fromString("00000000-0000-4000-8000-000000000002");
        jdbc.update("insert into facilities(id,name) values (?,'Alpha'),(?,'Alpha')",high,low);
        UUID last=facility("Beta",true);
        for(int i=0;i<3;i++) {
            JsonNode page=call(get(FACILITIES).param("page",String.valueOf(i)).param("size","1"),null,200);
            assertThat(page.path("page").asInt()).isEqualTo(i); assertThat(page.path("size").asInt()).isEqualTo(1);
            assertThat(page.path("totalElements").asLong()).isEqualTo(3);
            assertThat(page.path("content").get(0).path("id").asText()).isEqualTo(List.of(low,high,last).get(i).toString());
        }
        assertThat(call(get(FACILITIES).param("size","50"),null,200).path("content")).hasSize(3);
        JsonNode empty=call(get(FACILITIES).param("page","3").param("size","1"),null,200);
        assertThat(empty.path("content")).isEmpty(); assertThat(empty.path("totalElements").asLong()).isEqualTo(3);
    }

    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","TB_OFFICER","LAB_STAFF","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"})
    void facilityReadsRequireBothSystemRoleAndFacilityManage(String role) throws Exception {
        signIn(role,role.equals("SYSTEM_ADMIN")?new String[]{"ROLE_MANAGE"}:new String[]{"FACILITY_MANAGE"});
        call(get(FACILITIES),null,403); call(get(FACILITIES+"/"+UUID.randomUUID()),null,403);
    }

    @Test void detailReturnsExistingMasterProjectionAndAuthoritativeEtagWithoutMutation() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); UUID parent=facility("Parent",true),id=facility("Child",false);
        jdbc.update("update facilities set version=7,parent_facility_id=?,address='Alamat',province_code='31',regency_code='3171',district_code='D',village_code='V',postal_code='12345',latitude=1.250000,longitude=2.500000 where id=?",parent,id);
        Map<String,List<String>> before=snapshot();
        var response=mvc.perform(get(FACILITIES+"/"+id).cookie(caller)).andExpect(status().isOk()).andReturn().getResponse();
        JsonNode detail=json.readTree(response.getContentAsString());
        assertThat(detail.propertyNames()).containsExactlyInAnyOrder("id","version","name","facilityTypeCode","parentFacilityId","address","provinceCode","regencyCode","districtCode","villageCode","postalCode","latitude","longitude","active");
        assertThat(detail.path("id").asText()).isEqualTo(id.toString()); assertThat(detail.path("version").asLong()).isEqualTo(7);
        assertThat(response.getHeader("ETag")).isEqualTo("\"7\"");
        assertThat(detail.path("parentFacilityId").asText()).isEqualTo(parent.toString());
        assertThat(detail.path("address").asText()).isEqualTo("Alamat"); assertThat(detail.path("active").asBoolean()).isFalse();
        assertThat(detail.path("latitude").asDouble()).isEqualTo(1.25); assertThat(detail.path("longitude").asDouble()).isEqualTo(2.5);
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test void authorizedMissingDetailIsNotFound() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); call(get(FACILITIES+"/"+UUID.randomUUID()),null,404);
    }

    @Test void detailEtagSupportsExistingPatchAndRejectsOldTagAfterChange() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); UUID id=facility("Original",true);
        String path=FACILITIES+"/"+id;
        String tag=mvc.perform(get(path).cookie(caller)).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
        assertThat(tag).isEqualTo("\"0\"");
        call(patch(path).header("If-Match",tag),Map.of("name","Updated"),200);
        call(patch(path).header("If-Match",tag),Map.of("name","Stale"),409);
        var response=mvc.perform(get(path).cookie(caller)).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getHeader("ETag")).isEqualTo("\"1\"");
        assertThat(json.readTree(response.getContentAsString()).path("name").asText()).isEqualTo("Updated");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='FACILITY_UPDATED'",Long.class)).isEqualTo(1);
    }

    @Test void detailEtagSupportsExistingDeactivateWithNoReactivationRoute() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); UUID id=facility("Original",true); String path=FACILITIES+"/"+id;
        String tag=mvc.perform(get(path).cookie(caller)).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
        call(post(path+"/deactivate").header("If-Match",tag),null,200);
        assertThat(call(get(path),null,200).path("active").asBoolean()).isFalse();
        call(post(path+"/reactivate"),null,404);
    }

    @ParameterizedTest @ValueSource(strings={"FACILITY_MANAGE","USER_MANAGE_FACILITY","ROLE_MANAGE","USER_ACCOUNT_MANAGE"})
    void eachActuallyHeldAdminGrantPermitsSystemReferenceReadWithoutAssignment(String permission) throws Exception {
        signIn("SYSTEM_ADMIN",permission); assertThat(call(get(REFERENCES),null,200).path("adminManagedRoles")).hasSize(5);
        assertThat(jdbc.queryForObject("select count(*) from user_facilities",Long.class)).isZero();
    }

    @ParameterizedTest @ValueSource(strings={"NONE","PATIENT_READ"})
    void systemRoleAloneOrUnrelatedGrantDoesNotPermitReferenceRead(String permission) throws Exception {
        signIn("SYSTEM_ADMIN",permission.equals("NONE")?new String[]{}:new String[]{permission}); call(get(REFERENCES),null,403);
    }

    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","LAB_STAFF","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"})
    void unrelatedRolesCannotUseArtificialAdminGrants(String role) throws Exception {
        signIn(role,"FACILITY_MANAGE","USER_MANAGE_FACILITY","ROLE_MANAGE","USER_ACCOUNT_MANAGE");
        assign(facility("Assigned",true),true); call(get(REFERENCES),null,403);
    }

    @ParameterizedTest @ValueSource(strings={"MISSING_PERMISSION","NO_ASSIGNMENT","INACTIVE_ASSIGNMENT","INACTIVE_FACILITY"})
    void facilityAdminReferenceReadRequiresGrantAndActiveAssignment(String condition) throws Exception {
        signIn("FACILITY_ADMIN",condition.equals("MISSING_PERMISSION")?new String[]{"ROLE_MANAGE"}:new String[]{"USER_MANAGE_FACILITY"});
        if(!condition.equals("NO_ASSIGNMENT")) assign(facility("Assigned",!condition.equals("INACTIVE_FACILITY")),!condition.equals("INACTIVE_ASSIGNMENT"));
        call(get(REFERENCES),null,403);
    }

    @Test void facilityAdminReferenceVisibilityDoesNotExpandFacilityRoleOrAccountWrites() throws Exception {
        signIn("FACILITY_ADMIN","USER_MANAGE_FACILITY","FACILITY_MANAGE","ROLE_MANAGE","USER_ACCOUNT_MANAGE");
        UUID f=facility("Assigned",true); assign(f,true); call(get(REFERENCES),null,200);
        call(get(FACILITIES),null,403); call(get(FACILITIES+"/"+f),null,403);
        call(post(FACILITIES),Map.of("name","Forbidden"),403);
        call(patch(FACILITIES+"/"+f).header("If-Match","\"0\""),Map.of("name","Forbidden"),403);
        call(post(FACILITIES+"/"+f+"/deactivate").header("If-Match","\"0\""),null,403);
        call(post("/api/v1/admin/users/"+user+"/roles/SYSTEM_ADMIN"),null,403);
        call(delete("/api/v1/admin/users/"+user+"/roles/FACILITY_ADMIN"),null,403);
        call(post("/api/v1/admin/users/"+user+"/suspend").header("If-Match","\"0\""),null,403);
        assertThat(jdbc.queryForObject("select name from facilities where id=?",String.class,f)).isEqualTo("Assigned");
        assertThat(jdbc.queryForObject("select status from users where id=?",String.class,user)).isEqualTo("ACTIVE");
    }

    @Test void referencesAreDatabaseBackedSortedActiveAndOnlyTwoCodeNameGroups() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE");
        jdbc.update("insert into facility_types(code,name,description,active) values ('ZZ_TEST_ACTIVE','Live type','PRIVATE',true),('ZZ_TEST_INACTIVE','Hidden type','PRIVATE',false)");
        String oldName=jdbc.queryForObject("select name from roles where code='TB_OFFICER'",String.class);
        try {
            jdbc.update("update roles set name='Live officer label' where code='TB_OFFICER'");
            JsonNode data=call(get(REFERENCES),null,200);
            assertThat(data.propertyNames()).containsExactlyInAnyOrder("facilityTypes","adminManagedRoles");
            List<String> types=codes(data.path("facilityTypes"));
            assertThat(types).isSorted().contains("ZZ_TEST_ACTIVE").doesNotContain("ZZ_TEST_INACTIVE");
            assertThat(codes(data.path("adminManagedRoles"))).containsExactly("FACILITY_ADMIN","LAB_STAFF","PROGRAM_MONITOR","SYSTEM_ADMIN","TB_OFFICER");
            assertThat(data.path("adminManagedRoles").get(4).path("name").asText()).isEqualTo("Live officer label");
            for(String group:data.propertyNames()) for(JsonNode option:data.path(group)) assertThat(option.propertyNames()).containsExactlyInAnyOrder("code","name");
            assertThat(data.toString()).contains("Live type").doesNotContain("Hidden type","PRIVATE","PATIENT","TREATMENT_SUPPORTER","permissions","description");
        } finally {
            jdbc.update("update roles set name=? where code='TB_OFFICER'",oldName);
            jdbc.update("delete from facility_types where code in ('ZZ_TEST_ACTIVE','ZZ_TEST_INACTIVE')");
        }
    }

    @Test void allSuccessfulReadsCreateNoAuditOrDatabaseMutation() throws Exception {
        signIn("SYSTEM_ADMIN","FACILITY_MANAGE"); UUID id=facility("Read only",true);
        Map<String,List<String>> before=snapshot();
        for(int i=0;i<2;i++) { call(get(FACILITIES),null,200); call(get(FACILITIES+"/"+id),null,200); call(get(REFERENCES),null,200); }
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test void facilityAdminSuccessfulReferenceReadCreatesNoAuditOrMutation() throws Exception {
        signIn("FACILITY_ADMIN","USER_MANAGE_FACILITY"); assign(facility("Assigned",true),true);
        Map<String,List<String>> before=snapshot(); call(get(REFERENCES),null,200); assertThat(snapshot()).isEqualTo(before);
    }

    @Test void existingSessionReflectsRevokedAdminGrantAndAssignment() throws Exception {
        signIn("FACILITY_ADMIN","USER_MANAGE_FACILITY"); UUID id=facility("Assigned",true); assign(id,true);
        call(get(REFERENCES),null,200); jdbc.update("update user_facilities set active=false where user_id=?",user);
        call(get(REFERENCES),null,403); jdbc.update("update user_facilities set active=true where user_id=?",user);
        grants(actorRole); call(get(REFERENCES),null,403);
    }

    @Test void anonymousReadsAreUnauthorized() throws Exception {
        for(String path:List.of(FACILITIES,FACILITIES+"/"+UUID.randomUUID(),REFERENCES)) mvc.perform(get(path)).andExpect(status().isUnauthorized());
    }

    private UUID facility(String name,boolean active) {
        return jdbc.queryForObject("insert into facilities(name,active,facility_type_code) values (?,?,'PUSKESMAS') returning id",UUID.class,name,active);
    }
    private void assign(UUID facility,boolean active) {
        jdbc.update("insert into user_facilities(user_id,facility_id,active) values (?,?,?)",user,facility,active);
    }
    private void signIn(String role,String... permissions) throws Exception {
        user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('admin-read@example.org',?,'ACTIVE',now()) returning id",UUID.class,hash);
        actorRole=jdbc.queryForObject("select id from roles where code=?",UUID.class,role);
        jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",user,actorRole); grants(actorRole,permissions);
        caller=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("identity","admin-read@example.org","password",PASSWORD))))
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
    private List<String> codes(JsonNode options) {
        List<String> codes=new ArrayList<>(); for(JsonNode option:options) codes.add(option.path("code").asText()); return codes;
    }
    private Map<String,List<String>> snapshot() {
        Map<String,List<String>> result=new LinkedHashMap<>();
        for(String table:jdbc.queryForList("select tablename from pg_tables where schemaname='public' order by tablename",String.class)) {
            String identifier="\""+table.replace("\"","\"\"")+"\"";
            result.put(table,jdbc.queryForList("select to_jsonb(r)::text from "+identifier+" r order by to_jsonb(r)::text",String.class));
        }
        return result;
    }
}
