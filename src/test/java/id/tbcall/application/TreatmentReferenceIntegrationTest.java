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
class TreatmentReferenceIntegrationTest {
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
    private static final String PATH="/api/v1/treatment-reference-data";
    private static final String PASSWORD="Treatment reference password 123!";
    private static String passwordHash;
    private UUID facility,caseId;
    private Cookie caller;

    @BeforeEach void setup() {
        if(passwordHash==null) passwordHash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=jdbc.queryForObject("insert into facilities(name) values ('Private reference facility') returning id",UUID.class);
        UUID patient=jdbc.queryForObject("insert into patients(full_name,citizenship,nik,birth_date,sex_code) values ('Private reference patient','WNI','1234567890123456','1990-01-01','PEREMPUAN') returning id",UUID.class);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,?,'CONVERTED_TO_CASE') returning id",UUID.class,patient,facility,today().minusDays(3));
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,?,'PRIVATE DIAGNOSIS','TREAT_HERE') returning id",UUID.class,registration,today().minusDays(2));
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,?,'TB_SO','BARU') returning id",UUID.class,registration,diagnosis,facility);
    }

    @Test void treatmentReaderDoesNotNeedClinicalDirectoryPermission() throws Exception {
        signIn("TB_OFFICER");
        removeGrant("PATIENT_READ");
        try { assertThat(call(get(PATH),null,200).path("regimens")).isNotEmpty(); }
        finally { restoreGrant("PATIENT_READ"); }
    }

    @Test void officerRoleCannotReplaceTreatmentReadPermission() throws Exception {
        signIn("TB_OFFICER"); removeGrant("TREATMENT_READ");
        try { call(get(PATH),null,403); }
        finally { restoreGrant("TREATMENT_READ"); }
    }

    @ParameterizedTest @ValueSource(strings={"LAB_STAFF","SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"})
    void artificialTreatmentReadGrantCannotBypassOfficerRole(String role) throws Exception {
        UUID user=signIn(role);
        UUID extra=jdbc.queryForObject("insert into roles(code,name) values (?, 'Read-only test grant') returning id",UUID.class,"TREATMENT_REF_TEST_"+UUID.randomUUID());
        try {
            jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",user,extra);
            jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code='TREATMENT_READ'",extra);
            call(get(PATH),null,403);
        } finally { jdbc.update("delete from roles where id=?",extra); }
    }

    @ParameterizedTest @ValueSource(strings={"none","inactiveAssignment","inactiveFacility"})
    void treatmentReadRequiresAnActiveAssignedFacility(String state) throws Exception {
        UUID user=signIn("TB_OFFICER");
        switch(state) {
            case "none" -> jdbc.update("delete from user_facilities where user_id=?",user);
            case "inactiveAssignment" -> jdbc.update("update user_facilities set active=false where user_id=?",user);
            default -> jdbc.update("update facilities set active=false where id=?",facility);
        }
        call(get(PATH),null,403);
    }

    @Test void regimensAreActiveTreatmentOnlyAndOrderedByCategoryThenCode() throws Exception {
        signIn("TB_OFFICER");
        jdbc.update("""
                insert into regimens(code,name,regimen_kind,tb_case_category_code,active,description,effective_from,effective_until) values
                ('ZZ_REF_SO','SO last','TB_TREATMENT','TB_SO',true,'PRIVATE DESCRIPTION','2200-01-01','2201-01-01'),
                ('AA_REF_SO','SO first','TB_TREATMENT','TB_SO',true,null,null,null),
                ('ZZ_REF_RO','RO last','TB_TREATMENT','TB_RO',true,null,null,null),
                ('AA_REF_RO','RO first','TB_TREATMENT','TB_RO',true,null,null,null),
                ('MM_REF_INACTIVE','Inactive private regimen','TB_TREATMENT','TB_SO',false,null,null,null),
                ('AA_REF_PREVENTIVE','Preventive private regimen','PREVENTIVE',null,true,null,null,null)
                """);
        try {
            JsonNode catalog=call(get(PATH),null,200).path("regimens");
            List<String> ordering=new ArrayList<>(),fixtureCodes=new ArrayList<>();
            for(JsonNode entry:catalog) {
                assertThat(entry.propertyNames()).containsExactlyInAnyOrder("code","name","caseCategoryCode");
                String code=entry.path("code").asText();
                ordering.add(entry.path("caseCategoryCode").asText()+"|"+code);
                if(code.contains("_REF_")) fixtureCodes.add(code);
            }
            assertThat(ordering).isSorted();
            assertThat(fixtureCodes).containsExactly("AA_REF_RO","ZZ_REF_RO","AA_REF_SO","ZZ_REF_SO");
            assertThat(catalog.toString()).doesNotContain("PRIVATE DESCRIPTION","2200-01-01","2201-01-01","Inactive private regimen","Preventive private regimen");
        } finally { jdbc.update("delete from regimens where code like '%_REF_%'"); }
    }

    @Test void activeTreatmentRegimenWithoutCategoryIsExcluded() throws Exception {
        signIn("TB_OFFICER");
        jdbc.update("insert into regimens(code,name,regimen_kind,tb_case_category_code,active) values ('NULL_CATEGORY_REF','Uncategorized treatment','TB_TREATMENT',null,true)");
        try {
            JsonNode catalog=call(get(PATH),null,200).path("regimens");
            List<String> codes=new ArrayList<>();
            for(JsonNode entry:catalog) {
                codes.add(entry.path("code").asText());
                assertThat(entry.path("caseCategoryCode").isNull()).isFalse();
            }
            assertThat(codes).contains("SO_6M_2HRZE_4HR").doesNotContain("NULL_CATEGORY_REF");
        } finally { jdbc.update("delete from regimens where code='NULL_CATEGORY_REF'"); }
    }

    @ParameterizedTest @CsvSource({"drugs,drugs","outcomeCodes,treatment_outcome_codes"})
    void codeNameCatalogsAreActiveOnlyAndSorted(String group,String table) throws Exception {
        signIn("TB_OFFICER");
        jdbc.update("insert into "+table+"(code,name,active) values ('ZZ_REF','Last active',true),('MM_REF','Inactive private reference',false),('AA_REF','First active',true)");
        try {
            if(group.equals("drugs")) jdbc.update("update drugs set strength='PRIVATE STRENGTH',dosage_form='PRIVATE DOSAGE FORM' where code='AA_REF'");
            else jdbc.update("update treatment_outcome_codes set description='PRIVATE OUTCOME DESCRIPTION' where code='AA_REF'");
            JsonNode catalog=call(get(PATH),null,200).path(group); List<String> codes=new ArrayList<>();
            for(JsonNode entry:catalog) {
                assertThat(entry.propertyNames()).containsExactlyInAnyOrder("code","name");
                codes.add(entry.path("code").asText());
            }
            assertThat(codes).isSorted().contains("AA_REF","ZZ_REF").doesNotContain("MM_REF");
            assertThat(catalog.get(0).path("code").asText()).isEqualTo("AA_REF");
            assertThat(catalog.get(0).path("name").asText()).isEqualTo("First active");
            assertThat(catalog.toString()).doesNotContain("PRIVATE STRENGTH","PRIVATE DOSAGE FORM","PRIVATE OUTCOME DESCRIPTION","Inactive private reference");
        } finally { jdbc.update("delete from "+table+" where code in ('AA_REF','MM_REF','ZZ_REF')"); }
    }

    @Test void fixedWorkflowListsHaveExactlyApprovedCodesLabelsAndOrder() throws Exception {
        signIn("TB_OFFICER"); JsonNode data=call(get(PATH),null,200);
        assertOptions(data,"treatmentStatuses",List.of("PLANNED|Direncanakan","ACTIVE|Aktif","PAUSED|Dijeda","TRANSFERRED|Dialihkan","COMPLETED|Selesai","STOPPED|Dihentikan","CANCELLED|Dibatalkan"));
        assertOptions(data,"staffDoseStatuses",List.of("TAKEN_OBSERVED|Diminum terobservasi","TAKEN_SELF_REPORTED|Diminum berdasarkan laporan","DISPENSED_HOME|Obat dibawa pulang","MISSED|Tidak diminum","UNKNOWN|Tidak diketahui"));
        assertOptions(data,"administrationModes",List.of("DIRECTLY_OBSERVED|Diawasi langsung","SELF_ADMINISTERED|Diminum mandiri","OTHER|Lainnya"));
        assertOptions(data,"followUpStatuses",List.of("SCHEDULED|Terjadwal","COMPLETED|Selesai"));
    }

    @Test void exactProjectionCannotLeakCompositionDoseDatesIdentifiersOrClinicalData() throws Exception {
        signIn("TB_OFFICER");
        UUID regimen=jdbc.queryForObject("select id from regimens where code='SO_6M_2HRZE_4HR'",UUID.class);
        UUID drug=jdbc.queryForObject("select id from drugs where code='H'",UUID.class);
        jdbc.update("insert into regimen_drugs(regimen_id,drug_id,phase,dose_text,frequency_text,sequence_no) values (?,?,'PRIVATE PHASE','PRIVATE DOSE','PRIVATE FREQUENCY',999)",regimen,drug);
        try {
            JsonNode data=call(get(PATH),null,200);
            assertThat(data.propertyNames()).containsExactlyInAnyOrder("regimens","drugs","outcomeCodes","treatmentStatuses","staffDoseStatuses","administrationModes","followUpStatuses");
            for(String group:data.propertyNames()) for(JsonNode option:data.path(group)) {
                if(group.equals("regimens")) assertThat(option.propertyNames()).containsExactlyInAnyOrder("code","name","caseCategoryCode");
                else assertThat(option.propertyNames()).containsExactlyInAnyOrder("code","name");
            }
            assertThat(data.toString()).doesNotContain("PRIVATE PHASE","PRIVATE DOSE","PRIVATE FREQUENCY","Private reference patient","1234567890123456",facility.toString(),caseId.toString(),regimen.toString(),drug.toString(),"description","effectiveFrom","effectiveUntil","doseText","frequencyText","regimenDrugs","strength","dosageForm","sitb");
        } finally { jdbc.update("delete from regimen_drugs where regimen_id=? and drug_id=? and sequence_no=999",regimen,drug); }
    }

    @Test void repeatedSuccessfulReadsHaveNoAuditOrPersistenceSideEffect() throws Exception {
        signIn("TB_OFFICER"); var before=snapshot();
        long audits=jdbc.queryForObject("select count(*) from audit_logs",Long.class);
        call(get(PATH),null,200); call(get(PATH),null,200);
        assertThat(snapshot()).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs",Long.class)).isEqualTo(audits);
    }

    @Test void referenceReadDoesNotGrantTreatmentWrites() throws Exception {
        signIn("TB_OFFICER"); removeGrant("TREATMENT_WRITE");
        try {
            call(get(PATH),null,200); call(post(startPath()),startInput(),403);
            assertThat(jdbc.queryForObject("select count(*) from treatments",Long.class)).isZero();
        } finally { restoreGrant("TREATMENT_WRITE"); }
    }

    @ParameterizedTest @ValueSource(strings={"categoryMismatch","inactiveDrug","unknownDrug"})
    void referenceReadDoesNotRelaxExistingTreatmentStartValidation(String invalid) throws Exception {
        signIn("TB_OFFICER"); call(get(PATH),null,200); Map<String,Object> input=startInput();
        switch(invalid) {
            case "categoryMismatch" -> input.put("regimenCode","RO_BPALM");
            case "inactiveDrug" -> jdbc.update("update drugs set active=false where code='H'");
            default -> input.put("drugs",List.of(Map.of("drugCode","UNKNOWN_DRUG","startDate",today().minusDays(1).toString())));
        }
        try { call(post(startPath()),input,400); }
        finally { if(invalid.equals("inactiveDrug")) jdbc.update("update drugs set active=true where code='H'"); }
        assertThat(jdbc.queryForObject("select count(*) from treatments",Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='TREATMENT_STARTED'",Long.class)).isZero();
    }

    @ParameterizedTest @ValueSource(strings={"inactive","unknown"})
    void referenceReadDoesNotRelaxExistingOutcomeValidation(String invalid) throws Exception {
        signIn("TB_OFFICER"); call(get(PATH),null,200);
        JsonNode treatment=call(post(startPath()),startInput(),201);
        String code=invalid.equals("unknown") ? "UNKNOWN_OUTCOME" : "SEMBUH";
        if(invalid.equals("inactive")) jdbc.update("update treatment_outcome_codes set active=false where code='SEMBUH'");
        try {
            call(post("/api/v1/treatments/"+treatment.path("id").asText()+"/outcome").header("If-Match","\"0\""),Map.of("outcomeCode",code,"outcomeDate",today().toString()),400);
        } finally { if(invalid.equals("inactive")) jdbc.update("update treatment_outcome_codes set active=true where code='SEMBUH'"); }
        assertThat(jdbc.queryForObject("select count(*) from treatment_outcomes",Long.class)).isZero();
        assertThat(jdbc.queryForObject("select status from treatments where id=?",String.class,UUID.fromString(treatment.path("id").asText()))).isEqualTo("ACTIVE");
    }

    @Test void anonymousReferenceReadRequiresAuthentication() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
    }

    private UUID signIn(String role) throws Exception {
        UUID user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('treatment-reference@example.org',?,'ACTIVE',now()) returning id",UUID.class,passwordHash);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",user,role);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,facility);
        caller=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity","treatment-reference@example.org","password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
        return user;
    }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        return json.readTree(mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    private void removeGrant(String permission) { jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code=?)",permission); }
    private void restoreGrant(String permission) { jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code=? on conflict do nothing",permission); }
    private LocalDate today() { return LocalDate.now(clock); }
    private String startPath() { return "/api/v1/cases/"+caseId+"/treatments"; }
    private Map<String,Object> startInput() { return new HashMap<>(Map.of("regimenCode","SO_6M_2HRZE_4HR","startDate",today().minusDays(1).toString(),"drugs",List.of(Map.of("drugCode","H","startDate",today().minusDays(1).toString())))); }
    private void assertOptions(JsonNode data,String group,List<String> expected) {
        List<String> options=new ArrayList<>();
        for(JsonNode option:data.path(group)) options.add(option.path("code").asText()+"|"+option.path("name").asText());
        assertThat(options).containsExactlyElementsOf(expected);
    }
    private Map<String,List<Map<String,Object>>> snapshot() {
        Map<String,List<Map<String,Object>>> values=new LinkedHashMap<>();
        for(String table:List.of("users","user_roles","user_facilities","patients","tb_registrations","tb_cases","treatments","treatment_drugs","dose_events","follow_ups","adverse_events","treatment_outcomes","regimens","regimen_drugs","drugs","treatment_outcome_codes")) values.put(table,jdbc.queryForList("select * from "+table));
        return values;
    }
}
