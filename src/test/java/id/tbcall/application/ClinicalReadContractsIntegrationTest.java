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
class ClinicalReadContractsIntegrationTest {
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
    private static final String PASSWORD="Read contract password 123!";
    private static String passwordHash;
    private UUID facility,foreignFacility,officer,registration,diagnosis;
    private Cookie caller;
    private static final Map<String,String> CATALOGS=Map.ofEntries(
            Map.entry("sexCodes","sex_codes"),Map.entry("suspectTypes","tb_suspect_types"),
            Map.entry("previousTreatmentCategories","previous_treatment_categories"),Map.entry("hivStatuses","hiv_statuses"),
            Map.entry("dmStatuses","dm_statuses"),Map.entry("anatomicalSites","anatomical_sites"),
            Map.entry("diagnosisTypes","diagnosis_types"),Map.entry("caseCategories","tb_case_categories"),
            Map.entry("drugResistancePatterns","drug_resistance_patterns"),Map.entry("pregnancyStatuses","pregnancy_statuses"),
            Map.entry("bcgStatuses","bcg_statuses"));

    @BeforeEach void setup() throws Exception {
        if(passwordHash==null) passwordHash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=facility("Fasyankes A"); foreignFacility=facility("Fasyankes B");
        officer=user("officer@example.org","TB_OFFICER"); caller=login("officer@example.org");
        registration=registration(facility); diagnosis=diagnosis(registration,LocalDate.of(2026,1,1),UUID.randomUUID());
    }
    @Test void registrationWithNoDiagnosesReturnsEmptyList() throws Exception {
        assertThat(call(get(listPath(registration(facility))),null,200)).isEmpty();
    }
    @Test void diagnosesUseDateThenIdOrderAndExcludeAnotherRegistration() throws Exception {
        UUID first=UUID.fromString("00000000-0000-0000-0000-000000000010"),second=UUID.fromString("00000000-0000-0000-0000-000000000020");
        UUID reg=registration(facility);
        diagnosis(reg,LocalDate.of(2026,2,1),second); diagnosis(reg,LocalDate.of(2026,2,1),first);
        UUID early=diagnosis(reg,LocalDate.of(2026,1,1),UUID.randomUUID());
        JsonNode list=call(get(listPath(reg)),null,200);
        assertThat(ids(list)).containsExactly(early.toString(),first.toString(),second.toString());
        assertThat(list.toString()).doesNotContain(diagnosis.toString());
    }
    @Test void diagnosisDetailHasExistingSafeProjectionAndNormalEtag() throws Exception {
        jdbc.update("update diagnoses set version=7 where id=?",diagnosis);
        var response=request(get(detailPath(diagnosis)),null,200).getResponse();
        assertThat(response.getHeader("ETag")).isEqualTo("\"7\"");
        JsonNode view=json.readTree(response.getContentAsString());
        assertThat(view.path("id").asText()).isEqualTo(diagnosis.toString());
        assertThat(view.path("registrationId").asText()).isEqualTo(registration.toString());
        assertThat(fields(view)).containsExactlyInAnyOrder("id","version","registrationId","registrationVersion","diagnosisDate","anatomicalSite","diagnosisType",
                "diagnosisResult","chestXrayResult","chestXrayDate","chestXraySerial","chestXrayImpression","icd10Code","treatmentDisposition","referredToFacility","notes");
        assertThat(call(get(listPath(registration)),null,200).get(0)).isEqualTo(view);
    }
    @Test void freshGetsRecoverCreatedDiagnosisAndResumeDiagnosedRegistrationWithServerEtag() throws Exception {
        Map<String,Object> patient=Map.of("fullName","Pasien Reload","citizenship","WNI","nik","1234567890123456","sexCode","PEREMPUAN","birthDate","1990-01-01");
        JsonNode reg=call(post("/api/v1/registrations"),Map.of("facilityId",facility,"registrationDate",LocalDate.now(clock).toString(),"suspectTypeCode","TB_SO","previousTreatmentCategoryCode","BARU","newPatient",patient),201);
        String regPath="/api/v1/registrations/"+reg.path("id").asText();
        request(post(regPath+"/diagnoses").header("If-Match","\"0\""),Map.of("diagnosisDate",LocalDate.now(clock).toString(),"anatomicalSiteCode","PARU","diagnosisTypeCode","KLINIS","diagnosisResult","TBC","treatmentDisposition","TREAT_HERE"),201);
        assertThat(call(get(regPath),null,200).path("status").asText()).isEqualTo("DIAGNOSED");
        JsonNode recovered=call(get(regPath+"/diagnoses"),null,200).get(0);
        UUID recoveredId=UUID.fromString(recovered.path("id").asText());
        var detail=request(get(detailPath(recoveredId)),null,200).getResponse();
        JsonNode edited=call(patch(detailPath(recoveredId)).header("If-Match",detail.getHeader("ETag")),Map.of("notes","Resume setelah reload"),200);
        assertThat(edited.path("notes").asText()).isEqualTo("Resume setelah reload");
        assertThat(edited.path("version").asLong()).isEqualTo(1);
    }
    @Test void diagnosisReadPermissionDoesNotRequireWritePermission() throws Exception {
        UUID role=jdbc.queryForObject("insert into roles(code,name) values ('READ_CONTRACT_TEST','Read fixture') returning id",UUID.class);
        jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",officer,role);
        jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code='DIAGNOSIS_READ'",role);
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code='DIAGNOSIS_READ')");
        // The normal officer role still supplies DIAGNOSIS_WRITE. Remove it only
        // for this fixture, and restore both grants even if an assertion fails.
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code='DIAGNOSIS_WRITE')");
        try { call(get(listPath(registration)),null,200); call(get(detailPath(diagnosis)),null,200); }
        finally { restoreGrant("DIAGNOSIS_READ"); restoreGrant("DIAGNOSIS_WRITE"); jdbc.update("delete from roles where id=?",role); }
    }
    @ParameterizedTest @ValueSource(strings={"DIAGNOSIS_READ","PATIENT_READ"})
    void requiredReadPermissionCannotBeBypassed(String permission) throws Exception {
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code=?)",permission);
        try {
            if("DIAGNOSIS_READ".equals(permission)) { call(get(listPath(registration)),null,403); call(get(detailPath(diagnosis)),null,403); }
            else { call(get("/api/v1/clinical-reference-data"),null,403); call(get("/api/v1/clinical-facilities"),null,403); }
        } finally { restoreGrant(permission); }
    }
    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER","LAB_STAFF","SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR"})
    void nonOfficerRolesCannotUseAnyNewReadEvenWithBothPermissions(String role) throws Exception {
        user("other@example.org",role); caller=login("other@example.org");
        List<String> missing=new ArrayList<>();
        for(String permission:List.of("DIAGNOSIS_READ","PATIENT_READ")) {
            int inserted=jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code=? and p.code=? on conflict do nothing",role,permission);
            if(inserted>0) missing.add(permission);
        }
        try { for(String path:readPaths()) call(get(path),null,403); }
        finally { for(String permission:missing) jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id=(select id from permissions where code=?)",role,permission); }
    }
    @ParameterizedTest @ValueSource(strings={"noAssignment","inactiveAssignment","inactiveFacility"})
    void readsRequireAnActiveAssignedFacility(String mode) throws Exception {
        switch(mode) {
            case "noAssignment" -> jdbc.update("delete from user_facilities where user_id=?",officer);
            case "inactiveAssignment" -> jdbc.update("update user_facilities set active=false where user_id=?",officer);
            default -> jdbc.update("update facilities set active=false where id=?",facility);
        }
        for(String path:readPaths()) call(get(path),null,403);
    }
    @Test void foreignAndMissingDiagnosesAndRegistrationsAreNonEnumerating404() throws Exception {
        UUID foreignReg=registration(foreignFacility),foreignDiagnosis=diagnosis(foreignReg,LocalDate.of(2026,1,1),UUID.randomUUID());
        for(String path:List.of(listPath(foreignReg),detailPath(foreignDiagnosis),listPath(UUID.randomUUID()),detailPath(UUID.randomUUID())))
            assertThat(call(get(path),null,404).path("code").asText()).isEqualTo("RESOURCE_NOT_FOUND");
    }
    @Test void retiredRegistrationFacilityIsHiddenEvenWithAnotherActiveAssignment() throws Exception {
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",officer,foreignFacility);
        jdbc.update("update facilities set active=false where id=?",facility);
        call(get(listPath(registration)),null,404); call(get(detailPath(diagnosis)),null,404);
    }
    @ParameterizedTest @ValueSource(strings={"OPEN","DIAGNOSED","CONVERTED_TO_CASE","CLOSED","CANCELLED"})
    void diagnosisReadsDoNotInventRegistrationStateRestrictions(String state) throws Exception {
        jdbc.update("update tb_registrations set status=? where id=?",state,registration);
        call(get(listPath(registration)),null,200); call(get(detailPath(diagnosis)),null,200);
    }
    @Test void historicalDiagnosisKeepsInactiveLabelsWhileReferenceOptionsExcludeThem() throws Exception {
        jdbc.update("update anatomical_sites set active=false where code='PARU'");
        try {
            assertThat(call(get(detailPath(diagnosis)),null,200).path("anatomicalSite").path("name").asText()).isNotBlank();
            assertThat(codes(call(get("/api/v1/clinical-reference-data"),null,200).path("anatomicalSites"))).doesNotContain("PARU");
        } finally { jdbc.update("update anatomical_sites set active=true where code='PARU'"); }
    }
    @ParameterizedTest @ValueSource(strings={"sexCodes","suspectTypes","previousTreatmentCategories","hivStatuses","dmStatuses","anatomicalSites","diagnosisTypes","caseCategories","drugResistancePatterns","pregnancyStatuses","bcgStatuses"})
    void catalogGroupsReturnOnlyActiveCodeNameEntriesSortedByCode(String group) throws Exception {
        String table=CATALOGS.get(group);
        jdbc.update("insert into "+table+"(code,name,active) values ('ZZ_TEST_READ_B','Test B',true),('ZZ_TEST_READ_A','Test A',true),('ZZ_TEST_READ_INACTIVE','Test inactive',false)");
        try {
            JsonNode entries=call(get("/api/v1/clinical-reference-data"),null,200).path(group);
            assertThat(codes(entries)).isSorted().contains("ZZ_TEST_READ_A","ZZ_TEST_READ_B").doesNotContain("ZZ_TEST_READ_INACTIVE");
            for(JsonNode entry:entries) assertThat(fields(entry)).containsExactlyInAnyOrder("code","name");
            assertThat(entries.toString()).contains("Test A","Test B");
        } finally { jdbc.update("delete from "+table+" where code like 'ZZ_TEST_READ_%'"); }
    }
    @Test void referencesContainExactlyElevenGroupsAndApprovedWorkflowOptions() throws Exception {
        JsonNode data=call(get("/api/v1/clinical-reference-data"),null,200);
        Set<String> expected=new HashSet<>(CATALOGS.keySet()); expected.addAll(List.of("citizenships","treatmentDispositions","registrationStatusFilters","caseStatusFilters"));
        assertThat(fields(data)).containsExactlyInAnyOrderElementsOf(expected);
        assertThat(data.path("citizenships")).isEqualTo(json.readTree("[{\"code\":\"WNI\",\"name\":\"Warga Negara Indonesia\"},{\"code\":\"WNA\",\"name\":\"Warga Negara Asing\"}]"));
        assertThat(data.path("treatmentDispositions")).isEqualTo(json.readTree("[{\"code\":\"TREAT_HERE\",\"name\":\"Diobati di fasyankes ini\"},{\"code\":\"REFERRED\",\"name\":\"Dirujuk ke fasyankes lain\"},{\"code\":\"NOT_TREATED\",\"name\":\"Tidak diobati\"},{\"code\":\"UNKNOWN\",\"name\":\"Belum ditentukan\"}]"));
        assertThat(data.path("registrationStatusFilters")).isEqualTo(json.readTree("[{\"code\":\"OPEN\",\"name\":\"Terbuka\"},{\"code\":\"DIAGNOSED\",\"name\":\"Sudah didiagnosis\"}]"));
        assertThat(data.path("caseStatusFilters")).isEqualTo(json.readTree("[{\"code\":\"ACTIVE\",\"name\":\"Aktif\"},{\"code\":\"REFERRED\",\"name\":\"Dirujuk\"}]"));
        Set<String> inactive=new HashSet<>(jdbc.queryForList("select code from previous_treatment_categories where active=false",String.class));
        assertThat(inactive).isNotEmpty(); assertThat(codes(data.path("previousTreatmentCategories"))).doesNotContainAnyElementsOf(inactive);
    }
    @Test void facilityDirectoryIsActiveGlobalAndOnlyContainsSafeProjection() throws Exception {
        jdbc.update("update facilities set facility_type_code='PUSKESMAS',province_code='11',regency_code='1101',address='Private address',latitude=1.2,longitude=3.4,parent_facility_id=? where id=?",facility,foreignFacility);
        UUID inactive=facility("Inactive directory"); jdbc.update("update facilities set active=false where id=?",inactive);
        JsonNode page=call(get("/api/v1/clinical-facilities"),null,200);
        assertThat(page.path("page").asInt()).isZero(); assertThat(page.path("size").asInt()).isEqualTo(20); assertThat(page.path("totalElements").asInt()).isEqualTo(2);
        assertThat(ids(page.path("content"))).containsExactly(facility.toString(),foreignFacility.toString());
        for(JsonNode entry:page.path("content")) assertThat(fields(entry)).containsExactlyInAnyOrder("id","name","facilityTypeCode","provinceCode","regencyCode");
        JsonNode foreign=page.path("content").get(1);
        assertThat(foreign.path("facilityTypeCode").asText()).isEqualTo("PUSKESMAS"); assertThat(foreign.path("provinceCode").asText()).isEqualTo("11"); assertThat(foreign.path("regencyCode").asText()).isEqualTo("1101");
        assertThat(page.toString()).doesNotContain("Private address","latitude","parentFacility","userId");
    }
    @ParameterizedTest @CsvSource({"alPHA,Alpha literal","'  alpha  ',Alpha literal","'%%',Unit %% literal","'__',Unit __ literal","'!!',Unit !! literal","'%_',Unit %_ literal"})
    void facilitySearchIsTrimmedCaseInsensitiveAndEscapesWildcards(String query,String name) throws Exception {
        UUID expected=facility(name); facility("Another unmatched facility");
        assertThat(ids(call(get("/api/v1/clinical-facilities").param("query",query),null,200).path("content"))).containsExactly(expected.toString());
    }
    @Test void facilityPaginationOrdersByNameThenIdAndReportsTotal() throws Exception {
        UUID first=UUID.fromString("00000000-0000-0000-0000-000000000010"),second=UUID.fromString("00000000-0000-0000-0000-000000000020");
        jdbc.update("insert into facilities(id,name) values (?,'Directory A'),(?,'Directory A')",second,first); facility("Directory B");
        JsonNode one=call(get("/api/v1/clinical-facilities").param("query","Directory").param("size","2"),null,200);
        assertThat(ids(one.path("content"))).containsExactly(first.toString(),second.toString()); assertThat(one.path("totalElements").asInt()).isEqualTo(3);
        JsonNode two=call(get("/api/v1/clinical-facilities").param("query","Directory").param("size","2").param("page","1"),null,200);
        assertThat(two.path("content")).hasSize(1); assertThat(two.path("content").get(0).path("name").asText()).isEqualTo("Directory B");
        assertThat(call(get("/api/v1/clinical-facilities").param("page","100"),null,200).path("content")).isEmpty();
        call(get("/api/v1/clinical-facilities").param("size","50"),null,200);
    }
    @ParameterizedTest @CsvSource({"page,-1","size,0","size,51","page,2147483647","page,not-a-number","size,not-a-number","query,a","unexpected,value"})
    void facilityDirectoryRejectsInvalidParameters(String parameter,String value) throws Exception {
        call(get("/api/v1/clinical-facilities").param(parameter,value),null,400);
    }
    @ParameterizedTest @ValueSource(strings={"","   "})
    void suppliedBlankSearchIsInvalid(String query) throws Exception { call(get("/api/v1/clinical-facilities").param("query",query),null,400); }
    @Test void searchLengthBoundsAreExactAfterTrimming() throws Exception {
        call(get("/api/v1/clinical-facilities").param("query","ab"),null,200);
        call(get("/api/v1/clinical-facilities").param("query","a".repeat(255)),null,200);
        call(get("/api/v1/clinical-facilities").param("query","a".repeat(256)),null,400);
    }
    @Test void directoryVisibilityDoesNotAuthorizeForeignClinicalMutation() throws Exception {
        assertThat(ids(call(get("/api/v1/clinical-facilities"),null,200).path("content"))).contains(foreignFacility.toString());
        UUID foreignReg=registration(foreignFacility),foreignDiagnosis=diagnosis(foreignReg,LocalDate.of(2026,1,1),UUID.randomUUID());
        call(patch(detailPath(foreignDiagnosis)).header("If-Match","\"0\""),Map.of("notes","Unauthorized"),404);
        assertThat(jdbc.queryForObject("select notes from diagnoses where id=?",String.class,foreignDiagnosis)).isNull();
    }
    @Test void successfulReadsDoNotWriteClinicalRowsVersionsTimestampsOrAudit() throws Exception {
        Map<String,List<Map<String,Object>>> before=snapshot(); long audits=countAudit();
        for(String path:readPaths()) call(get(path),null,200);
        assertThat(snapshot()).isEqualTo(before); assertThat(countAudit()).isEqualTo(audits);
    }
    @Test void anonymousRequestsRequireAuthentication() throws Exception {
        for(String path:readPaths()) mvc.perform(get(path)).andExpect(status().isUnauthorized());
    }
    private List<String> readPaths() { return List.of(listPath(registration),detailPath(diagnosis),"/api/v1/clinical-reference-data","/api/v1/clinical-facilities"); }
    private static String listPath(UUID id) { return "/api/v1/registrations/"+id+"/diagnoses"; }
    private static String detailPath(UUID id) { return "/api/v1/diagnoses/"+id; }
    private static List<String> fields(JsonNode node) { return new ArrayList<>(node.propertyNames()); }
    private static List<String> ids(JsonNode array) { List<String> values=new ArrayList<>(); for(JsonNode node:array) values.add(node.path("id").asText()); return values; }
    private static List<String> codes(JsonNode array) { List<String> values=new ArrayList<>(); for(JsonNode node:array) values.add(node.path("code").asText()); return values; }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int status) throws Exception { return json.readTree(request(request,body,status).getResponse().getContentAsString()); }
    private MvcResult request(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        return mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn();
    }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID user(String email,String role) {
        UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,passwordHash);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,facility); return id;
    }
    private Cookie login(String identity) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",identity,"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
    }
    private UUID registration(UUID facilityId) {
        UUID patient=jdbc.queryForObject("insert into patients(full_name,citizenship,birth_date,sex_code) values ('Read fixture','WNI','1990-01-01','PEREMPUAN') returning id",UUID.class);
        return jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,current_date,'DIAGNOSED') returning id",UUID.class,patient,facilityId);
    }
    private UUID diagnosis(UUID reg,LocalDate date,UUID id) {
        jdbc.update("insert into diagnoses(id,registration_id,diagnosis_date,anatomical_site_code,diagnosis_type_code,diagnosis_result,treatment_disposition) values (?,?,?,'PARU','KLINIS','TBC','TREAT_HERE')",id,reg,date); return id;
    }
    private void restoreGrant(String permission) { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code=? on conflict do nothing",permission); }
    private long countAudit() { return jdbc.queryForObject("select count(*) from audit_logs",Long.class); }
    private Map<String,List<Map<String,Object>>> snapshot() {
        Map<String,List<Map<String,Object>>> result=new LinkedHashMap<>();
        for(String table:List.of("patients","tb_registrations","diagnoses","tb_cases","facilities")) result.put(table,jdbc.queryForList("select * from "+table+" order by id"));
        return result;
    }
}
