package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.LocalDate;
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

@SpringBootTest(properties={"tbcall.security.production=false","tbcall.security.expose-verification-tokens=true"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class LaboratoryReferenceIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordHasher passwords;
    @Autowired Clock clock;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PATH="/api/v1/laboratory-reference-data";
    private static final String PASSWORD="Laboratory reference password 123!";
    private static String passwordHash;
    private UUID facility,registration;
    private Cookie caller;

    @BeforeEach void setup() {
        if(passwordHash==null) passwordHash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=jdbc.queryForObject("insert into facilities(name) values ('Private laboratory facility') returning id",UUID.class);
        UUID patient=jdbc.queryForObject("insert into patients(full_name,citizenship,nik,birth_date,sex_code) values ('Private patient','WNI','1234567890123456','1990-01-01','PEREMPUAN') returning id",UUID.class);
        registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,?) returning id",UUID.class,patient,facility,LocalDate.now(clock));
    }

    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","LAB_STAFF"})
    void laboratoryReadActorsCanReadWithoutClinicalDirectoryPermission(String role) throws Exception {
        signIn(role);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id=(select id from permissions where code='PATIENT_READ')",role);
        try { assertThat(call(get(PATH),null,200).path("testTypes")).isNotEmpty(); }
        finally { restoreGrant(role,"PATIENT_READ"); }
        // Temporary grant removal must not change the next case's seeded actor context.
        assertThat(jdbc.queryForObject("select count(*) from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where r.code=? and p.code='PATIENT_READ'",Long.class,role)).isEqualTo(1);
    }

    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","LAB_STAFF"})
    void actorRoleCannotReplaceMissingLaboratoryReadPermission(String role) throws Exception {
        signIn(role);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id=(select id from permissions where code='LAB_REQUEST_READ')",role);
        try { call(get(PATH),null,403); }
        finally { restoreGrant(role,"LAB_REQUEST_READ"); }
    }

    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"})
    void artificialReadGrantCannotBypassLaboratoryActorType(String role) throws Exception {
        UUID user=signIn(role);
        UUID extra=jdbc.queryForObject("insert into roles(code,name) values (?, 'Read-only test grant') returning id",UUID.class,"LAB_REF_TEST_"+UUID.randomUUID());
        jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",user,extra);
        jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code='LAB_REQUEST_READ'",extra);
        call(get(PATH),null,403);
    }

    @ParameterizedTest @CsvSource({"TB_OFFICER,none","TB_OFFICER,inactiveAssignment","TB_OFFICER,inactiveFacility",
            "LAB_STAFF,none","LAB_STAFF,inactiveAssignment","LAB_STAFF,inactiveFacility"})
    void laboratoryReadRequiresAnActiveAssignedFacility(String role,String state) throws Exception {
        UUID user=signIn(role);
        switch(state) {
            case "none" -> jdbc.update("delete from user_facilities where user_id=?",user);
            case "inactiveAssignment" -> jdbc.update("update user_facilities set active=false where user_id=?",user);
            default -> jdbc.update("update facilities set active=false where id=?",facility);
        }
        call(get(PATH),null,403);
    }

    @ParameterizedTest @CsvSource({"testTypes,lab_test_types","requestReasons,lab_request_reasons"})
    void catalogsIncludeOnlyActiveCodeNameRowsInCodeOrder(String group,String table) throws Exception {
        signIn("TB_OFFICER");
        jdbc.update("insert into "+table+"(code,name,active) values ('Z_REF','Last active',true),('M_REF','Inactive private reference',false),('A_REF','First active',true)");
        try {
            if(table.equals("lab_test_types")) jdbc.update("update lab_test_types set description='PRIVATE DESCRIPTION SITB MAPPING' where code='A_REF'");
            JsonNode catalog=call(get(PATH),null,200).path(group);
            List<String> codes=new ArrayList<>();
            for(JsonNode entry:catalog) {
                assertThat(entry.propertyNames()).containsExactlyInAnyOrder("code","name");
                codes.add(entry.path("code").asText());
            }
            assertThat(codes).isSorted().contains("A_REF","Z_REF").doesNotContain("M_REF");
            assertThat(catalog.get(0).path("code").asText()).isEqualTo("A_REF");
            assertThat(catalog.get(0).path("name").asText()).isEqualTo("First active");
            assertThat(catalog.toString()).doesNotContain("PRIVATE DESCRIPTION","SITB MAPPING","Inactive private reference");
        } finally { jdbc.update("delete from "+table+" where code in ('A_REF','M_REF','Z_REF')"); }
    }

    @Test void fixedWorkflowOptionsUseExactlyTheApprovedCodeLabelPairsAndOrder() throws Exception {
        signIn("TB_OFFICER"); JsonNode data=call(get(PATH),null,200);
        assertOptions(data,"requestStatuses",List.of("DRAFT|Draf","REQUESTED|Diminta","SENT|Dikirim","RECEIVED|Diterima","PARTIAL|Hasil sebagian","COMPLETED|Selesai","CANCELLED|Dibatalkan"));
        assertOptions(data,"ownerTypes",List.of("REGISTRATION|Registrasi","CASE|Kasus"));
        assertOptions(data,"referralTypes",List.of("INTERNAL|Internal","EXTERNAL|Eksternal"));
        assertOptions(data,"testStatuses",List.of("REQUESTED|Diminta","RESULT_AVAILABLE|Hasil tersedia","CANCELLED|Dibatalkan"));
        assertOptions(data,"resultStatuses",List.of("FINAL|Final","CORRECTED|Dikoreksi"));
    }

    @Test void projectionContainsOnlySevenCodeNameGroupsAndNoClinicalOrMappingData() throws Exception {
        signIn("TB_OFFICER"); JsonNode data=call(get(PATH),null,200);
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("testTypes","requestReasons","requestStatuses","ownerTypes","referralTypes","testStatuses","resultStatuses");
        for(String group:data.propertyNames()) for(JsonNode option:data.path(group)) assertThat(option.propertyNames()).containsExactlyInAnyOrder("code","name");
        assertThat(data.toString()).doesNotContain("Private patient","Private laboratory facility","1234567890123456",facility.toString(),registration.toString(),"description","resultValue","audit","specimenTypes","resultCodes","sitb");
    }

    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","LAB_STAFF"})
    void successfulReferenceReadsHaveNoAuditOrClinicalWriteSideEffect(String role) throws Exception {
        signIn(role);
        var before=snapshot(); long audits=jdbc.queryForObject("select count(*) from audit_logs",Long.class);
        call(get(PATH),null,200); call(get(PATH),null,200);
        assertThat(snapshot()).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs",Long.class)).isEqualTo(audits);
    }

    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","LAB_STAFF"})
    void referenceVisibilityDoesNotGrantLaboratoryRequestWrites(String role) throws Exception {
        signIn(role);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id=(select id from permissions where code='LAB_REQUEST_WRITE')",role);
        try {
            call(get(PATH),null,200); call(post("/api/v1/lab-requests"),requestInput(),403);
            assertThat(jdbc.queryForObject("select count(*) from lab_requests",Long.class)).isZero();
        } finally { if(role.equals("TB_OFFICER")) restoreGrant(role,"LAB_REQUEST_WRITE"); }
    }

    @ParameterizedTest @ValueSource(strings={"reasonOwner","inactiveTest","inactiveReason","inactiveTestingFacility","unknownTest"})
    void referenceReadDoesNotRelaxExistingRequestCreateValidation(String invalid) throws Exception {
        signIn("TB_OFFICER"); call(get(PATH),null,200);
        Map<String,Object> input=requestInput();
        switch(invalid) {
            case "reasonOwner" -> input.put("requestReasonCode","FOLLOW_UP");
            case "inactiveTest" -> jdbc.update("update lab_test_types set active=false where code='TCM'");
            case "inactiveReason" -> jdbc.update("update lab_request_reasons set active=false where code='DIAGNOSIS'");
            case "inactiveTestingFacility" -> {
                UUID inactive=jdbc.queryForObject("insert into facilities(name,active) values ('Inactive testing',false) returning id",UUID.class);
                input.put("testingFacilityId",inactive);
            }
            default -> input.put("testTypeCodes",List.of("UNKNOWN_TEST"));
        }
        try { call(post("/api/v1/lab-requests"),input,400); }
        finally { jdbc.update("update lab_test_types set active=true where code='TCM'"); jdbc.update("update lab_request_reasons set active=true where code='DIAGNOSIS'"); }
        assertThat(jdbc.queryForObject("select count(*) from lab_requests",Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='LAB_REQUEST_CREATED'",Long.class)).isZero();
    }

    @Test void anonymousReferenceReadRequiresAuthentication() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
    }

    private UUID signIn(String role) throws Exception {
        UUID user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('lab-reference@example.org',?,'ACTIVE',now()) returning id",UUID.class,passwordHash);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",user,role);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,facility);
        caller=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity","lab-reference@example.org","password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
        return user;
    }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        return json.readTree(mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    private Map<String,Object> requestInput() { return new HashMap<>(Map.of("registrationId",registration,"testingFacilityId",facility,"requestReasonCode","DIAGNOSIS","testTypeCodes",List.of("TCM"))); }
    private void restoreGrant(String role,String permission) { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code=? and p.code=? on conflict do nothing",role,permission); }
    private void assertOptions(JsonNode data,String group,List<String> expected) {
        List<String> options=new ArrayList<>(); for(JsonNode option:data.path(group)) options.add(option.path("code").asText()+"|"+option.path("name").asText());
        assertThat(options).containsExactlyElementsOf(expected);
    }
    private Map<String,List<Map<String,Object>>> snapshot() {
        Map<String,List<Map<String,Object>>> values=new LinkedHashMap<>();
        for(String table:List.of("patients","tb_registrations","facilities","lab_requests","lab_request_tests","lab_specimens","lab_results")) values.put(table,jdbc.queryForList("select * from "+table+" order by id"));
        return values;
    }
}
