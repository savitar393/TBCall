package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.sql.Connection;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
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
class ContinuityReadIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username",POSTGRES::getUsername);
        registry.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired PasswordHasher passwords;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PASSWORD="Continuity read password 123!";
    private static String hash;
    private UUID source,destination,caseId,diagnosis,patient,officerRole,extraRole;
    private List<UUID> originalGrants;
    private Cookie caller;

    @BeforeEach void setup() {
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        officerRole=jdbc.queryForObject("select id from roles where code='TB_OFFICER'",UUID.class);
        originalGrants=jdbc.queryForList("select permission_id from role_permissions where role_id=?",UUID.class,officerRole);
        source=facility("Source",true);
        destination=facility("Destination",true);
        patient=jdbc.queryForObject("insert into patients(full_name,nik,bpjs_number,sex_code) values ('PRIVATE PATIENT','1234567890123456','PRIVATE BPJS','PEREMPUAN') returning id",UUID.class);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-01-01','CONVERTED_TO_CASE') returning id",UUID.class,patient,source);
        diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition,referred_to_facility_id,notes) values (?,'2026-01-02','PRIVATE DIAGNOSIS','REFERRED',?,'PRIVATE NOTES') returning id",UUID.class,registration,destination);
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code,status) values (?,?,?,'TB_SO','BARU','REFERRED') returning id",UUID.class,registration,diagnosis,source);
    }
    @AfterEach void restore() {
        for(UUID grant:originalGrants) jdbc.update("insert into role_permissions(role_id,permission_id) values (?,?) on conflict do nothing",officerRole,grant);
        if(extraRole!=null) { jdbc.update("delete from roles where id=?",extraRole); extraRole=null; }
        jdbc.update("delete from regimen_drugs where regimen_id in (select id from regimens where code like 'CONTREF%')");
        jdbc.update("delete from regimens where code like 'CONTREF%'");
    }

    @Test void preparationNeedsOnlyReferralWriteAndHasExactSafeProjectionWithoutEtag() throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        JsonNode data=call(get(path("preparation")),null,200);
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("caseId","caseStatus","caseCategoryCode","sourceFacility","preTreatmentDestination","openTreatment","inFlightReferral");
        assertThat(data.path("caseId").asText()).isEqualTo(caseId.toString());
        assertThat(data.path("caseStatus").asText()).isEqualTo("REFERRED");
        assertThat(data.path("caseCategoryCode").asText()).isEqualTo("TB_SO");
        assertFacility(data.path("sourceFacility"),source,"Source");
        assertFacility(data.path("preTreatmentDestination"),destination,"Destination");
        assertThat(data.path("openTreatment").isNull()).isTrue();
        assertThat(data.path("inFlightReferral").asBoolean()).isFalse();
        assertThat(data.toString()).doesNotContain("PRIVATE PATIENT","1234567890123456","PRIVATE BPJS","PRIVATE DIAGNOSIS","PRIVATE NOTES",patient.toString(),diagnosis.toString());
        for(String read:List.of("PATIENT_READ","CASE_READ","DIAGNOSIS_READ","TREATMENT_READ")) assertThat(grants()).doesNotContain(read);
    }

    @ParameterizedTest @ValueSource(strings={"TREAT_HERE","NO_TARGET_TREAT_HERE","NO_DIAGNOSIS"})
    void preparationOnlyUsesConfirmingReferredDiagnosis(String state) throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        switch(state) {
            case "TREAT_HERE" -> jdbc.update("update diagnoses set treatment_disposition='TREAT_HERE' where id=?",diagnosis);
            case "NO_TARGET_TREAT_HERE" -> jdbc.update("update diagnoses set treatment_disposition='TREAT_HERE',referred_to_facility_id=null where id=?",diagnosis);
            default -> jdbc.update("update tb_cases set confirming_diagnosis_id=null where id=?",caseId);
        }
        assertThat(call(get(path("preparation")),null,200).path("preTreatmentDestination").isNull()).isTrue();
    }

    @Test void inactiveCaseFacilityIsHiddenEvenWhenActorHasAnotherActiveAssignment() throws Exception {
        UUID user=signIn("TB_OFFICER","REFERRAL_WRITE");
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,destination);
        jdbc.update("update facilities set active=false where id=?",source);
        call(get(path("preparation")),null,404);
    }

    @Test void anotherDiagnosisCannotSupplyPreparationDestination() throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        jdbc.update("update diagnoses set treatment_disposition='TREAT_HERE' where id=?",diagnosis);
        jdbc.update("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition,referred_to_facility_id) select registration_id,'2026-01-03','OTHER PRIVATE DIAGNOSIS','REFERRED',? from diagnoses where id=?",destination,diagnosis);
        assertThat(call(get(path("preparation")),null,200).path("preTreatmentDestination").isNull()).isTrue();
    }

    @ParameterizedTest @ValueSource(strings={"PLANNED","ACTIVE","PAUSED"})
    void preparationProjectsEachOpenEpisodeIncludingInactiveHistoricalRegimen(String state) throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        UUID treatment=treatment(state,true);
        jdbc.update("update regimens set active=false where code='SO_6M_2HRZE_4HR'");
        try {
            JsonNode open=call(get(path("preparation")),null,200).path("openTreatment");
            assertThat(open.propertyNames()).containsExactlyInAnyOrder("id","status","startDate","plannedEndDate","regimenCode","regimenName");
            assertThat(open.path("id").asText()).isEqualTo(treatment.toString());
            assertThat(open.path("status").asText()).isEqualTo(state);
            assertThat(open.path("startDate").asText()).isEqualTo("2026-01-03");
            assertThat(open.path("plannedEndDate").asText()).isEqualTo("2026-07-03");
            assertThat(open.path("regimenCode").asText()).isEqualTo("SO_6M_2HRZE_4HR");
            assertThat(open.path("regimenName").asText()).isEqualTo(jdbc.queryForObject("select name from regimens where code='SO_6M_2HRZE_4HR'",String.class));
            assertThat(open.toString()).doesNotContain("PRIVATE TREATMENT","regimenDescription","notes","facilityId","version");
        } finally { jdbc.update("update regimens set active=true where code='SO_6M_2HRZE_4HR'"); }
    }

    @Test void nullableRegimenAndEndDateDoNotHideOpenEpisode() throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        UUID id=treatment("ACTIVE",false);
        jdbc.update("update treatments set planned_end_date=null where id=?",id);
        JsonNode open=call(get(path("preparation")),null,200).path("openTreatment");
        assertThat(open.path("id").asText()).isEqualTo(id.toString());
        for(String field:List.of("regimenCode","regimenName","plannedEndDate")) assertThat(open.path(field).isNull()).isTrue();
    }

    @ParameterizedTest @ValueSource(strings={"TRANSFERRED","COMPLETED","STOPPED","CANCELLED"})
    void terminalEpisodesAreNotOpen(String status) throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE"); treatment(status,true);
        assertThat(call(get(path("preparation")),null,200).path("openTreatment").isNull()).isTrue();
    }

    @ParameterizedTest @CsvSource({"DRAFT,false","SENT,true","RECEIVED,true","REPORTED,false","CANCELLED,false","RETURNED,false"})
    void inFlightUsesOnlySentAndReceived(String status,boolean expected) throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        jdbc.update("insert into referrals(case_id,source_facility_id,destination_facility_id,referral_type,status,sent_at) values (?,?,?,'PRE_TREATMENT_REFERRAL',?,now())",caseId,source,destination,status);
        assertThat(call(get(path("preparation")),null,200).path("inFlightReferral").asBoolean()).isEqualTo(expected);
    }

    @ParameterizedTest @ValueSource(strings={"foreign","inactive","missing"})
    void preparationIsolatesCasesWith404(String scope) throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        switch(scope) {
            case "foreign" -> jdbc.update("update tb_cases set current_facility_id=? where id=?",destination,caseId);
            case "inactive" -> jdbc.update("update facilities set active=false where id=?",source);
            default -> caseId=UUID.randomUUID();
        }
        call(get(path("preparation")),null,scope.equals("inactive") ? 403 : 404);
    }

    @Test void preparationDoesNotAcquireCaseWriteLock() throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        ExecutorService worker=Executors.newSingleThreadExecutor();
        try(Connection connection=dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try(var lock=connection.prepareStatement("select id from tb_cases where id=? for update")) {
                lock.setObject(1,caseId); lock.executeQuery().close();
                try { assertThat(worker.submit(() -> call(get(path("preparation")),null,200)).get(5,TimeUnit.SECONDS).path("caseId").asText()).isEqualTo(caseId.toString()); }
                finally { connection.rollback(); }
            }
        } finally { worker.shutdownNow(); }
    }

    @ParameterizedTest @ValueSource(strings={"REFERRAL_WRITE","CONTACT_WRITE"})
    void facilityDirectoryAllowsEitherWritePermissionWithoutPatientRead(String permission) throws Exception {
        signIn("TB_OFFICER",permission);
        JsonNode data=call(get(path("facilities")),null,200);
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("content","page","size","totalElements");
        assertThat(data.path("page").asInt()).isZero(); assertThat(data.path("size").asInt()).isEqualTo(20);
        assertThat(data.path("totalElements").asLong()).isEqualTo(2);
        assertThat(data.path("content").get(0).path("id").asText()).isEqualTo(destination.toString());
        assertThat(grants()).containsExactly(permission);
    }

    @Test void facilityDirectoryIsGlobalActiveOnlySortedPaginatedAndSafe() throws Exception {
        signIn("TB_OFFICER","CONTACT_WRITE");
        UUID first=UUID.fromString("00000000-0000-0000-0000-000000000001"),second=UUID.fromString("00000000-0000-0000-0000-000000000002");
        for(UUID id:List.of(second,first)) jdbc.update("insert into facilities(id,name,facility_type_code,province_code,regency_code,address,latitude,longitude,parent_facility_id) values (?,'Alpha','PUSKESMAS','31','3171','PRIVATE ADDRESS',1,2,?)",id,source);
        facility("AAAA inactive",false);
        JsonNode page=call(get(path("facilities")).param("size","1").param("page","1"),null,200);
        assertThat(page.path("totalElements").asLong()).isEqualTo(4);
        JsonNode item=page.path("content").get(0);
        assertThat(item.propertyNames()).containsExactlyInAnyOrder("id","name","facilityTypeCode","provinceCode","regencyCode");
        assertThat(item.path("id").asText()).isEqualTo(second.toString());
        assertThat(item.path("facilityTypeCode").asText()).isEqualTo("PUSKESMAS");
        assertThat(item.path("provinceCode").asText()).isEqualTo("31");
        assertThat(item.path("regencyCode").asText()).isEqualTo("3171");
        assertThat(page.toString()).doesNotContain("PRIVATE ADDRESS","latitude","longitude","parent","assignment","createdAt","updatedAt","version");
        JsonNode firstPage=call(get(path("facilities")).param("size","1"),null,200);
        assertThat(firstPage.path("content").get(0).path("id").asText()).isEqualTo(first.toString());
        assertThat(call(get(path("facilities")).param("page","20"),null,200).path("content")).isEmpty();
    }

    @ParameterizedTest @CsvSource({"' soUR ',Source","'xy%',Literal xy% clinic","'xy_',Literal xy_ clinic","'xy!',Literal xy! clinic"})
    void facilitySearchIsTrimmedCaseInsensitiveAndEscapesWildcards(String query,String expected) throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        facility("Literal xy% clinic",true); facility("Literal xy_ clinic",true); facility("Literal xy! clinic",true); facility("Literal xyZ clinic",true);
        JsonNode result=call(get(path("facilities")).param("query",query),null,200);
        assertThat(result.path("totalElements").asInt()).isEqualTo(1);
        assertThat(result.path("content").get(0).path("name").asText()).isEqualTo(expected);
    }

    @ParameterizedTest @ValueSource(strings={""," ","x"})
    void suppliedShortOrBlankQueryIsInvalid(String query) throws Exception {
        signIn("TB_OFFICER","CONTACT_WRITE"); call(get(path("facilities")).param("query",query),null,400);
    }
    @Test void queryLengthBoundaryIsEnforcedAfterTrimming() throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE");
        facility("a".repeat(255),true);
        assertThat(call(get(path("facilities")).param("query","  "+"a".repeat(255)+"  "),null,200).path("totalElements").asInt()).isEqualTo(1);
        call(get(path("facilities")).param("query","a".repeat(256)),null,400);
    }

    @ParameterizedTest @CsvSource({"-1,20","0,0","0,51","2147483647,50"})
    void invalidPageOrSizeIsRejected(int page,int size) throws Exception {
        signIn("TB_OFFICER","CONTACT_WRITE");
        call(get(path("facilities")).param("page",Integer.toString(page)).param("size",Integer.toString(size)),null,400);
    }
    @Test void maximumPageSizeIsAccepted() throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE"); assertThat(call(get(path("facilities")).param("size","50"),null,200).path("size").asInt()).isEqualTo(50);
    }

    @Test void referralLabelsAreExactServerOwnedWorkflowOptions() throws Exception {
        signIn("TB_OFFICER","REFERRAL_READ"); JsonNode data=call(get(path("referral")),null,200);
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("referralTypes","referralStatuses");
        options(data,"referralTypes","PRE_TREATMENT_REFERRAL|Rujukan sebelum pengobatan","TREATMENT_TRANSFER|Alih pengobatan");
        options(data,"referralStatuses","DRAFT|Draf","SENT|Dikirim","RECEIVED|Diterima","REPORTED|Pasien dilaporkan datang","CANCELLED|Dibatalkan","RETURNED|Dikembalikan");
    }
    @Test void contactLabelsDisplayIncomingButDoNotOfferItForCreation() throws Exception {
        signIn("TB_OFFICER","CONTACT_READ"); JsonNode data=call(get(path("contact")),null,200);
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("workflowTypes","creatableWorkflowTypes","investigationStatuses");
        options(data,"workflowTypes","INTERNAL|Internal","INCOMING_REFERRAL|Rujukan masuk","OUTGOING_REFERRAL|Rujukan keluar");
        options(data,"creatableWorkflowTypes","INTERNAL|Internal","OUTGOING_REFERRAL|Rujukan keluar");
        options(data,"investigationStatuses","NEW|Baru","SENT|Dikirim","RECEIVED|Diterima","IN_PROGRESS|Sedang diinvestigasi","COMPLETED|Selesai","RETURNED|Dikembalikan","CANCELLED|Dibatalkan");
    }
    @ParameterizedTest @ValueSource(strings={"TPT_READ","TPT_WRITE"})
    void tptReferencesAllowEitherPermissionAndHaveExactLabels(String permission) throws Exception {
        signIn("TB_OFFICER",permission); JsonNode data=call(get(path("tpt")),null,200);
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("preventiveRegimens","tptStatuses","durationUnits");
        options(data,"tptStatuses","PLANNED|Direncanakan","ACTIVE|Aktif","COMPLETED|Selesai","STOPPED|Dihentikan","LOST_TO_FOLLOW_UP|Putus tindak lanjut","CANCELLED|Dibatalkan");
        options(data,"durationUnits","DAY|Hari","WEEK|Minggu","MONTH|Bulan");
    }
    @Test void preventiveCatalogIsLiveOrderedCategorizedAndContainsNoGuidance() throws Exception {
        signIn("TB_OFFICER","TPT_WRITE");
        jdbc.update("""
                insert into regimens(code,name,regimen_kind,tb_case_category_code,active,description,effective_from,effective_until) values
                ('CONTREF_ZSO','Last SO','PREVENTIVE','TB_SO',true,'PRIVATE REGIMEN','2200-01-01','2201-01-01'),
                ('CONTREF_ASO','First SO','PREVENTIVE','TB_SO',true,null,null,null),
                ('CONTREF_RO','RO','PREVENTIVE','TB_RO',true,null,null,null),
                ('CONTREF_NULL','NULL CATEGORY','PREVENTIVE',null,true,null,null,null),
                ('CONTREF_INACTIVE','INACTIVE REGIMEN','PREVENTIVE','TB_SO',false,null,null,null),
                ('CONTREF_TREAT','TREATMENT REGIMEN','TB_TREATMENT','TB_SO',true,null,null,null)
                """);
        UUID regimen=jdbc.queryForObject("select id from regimens where code='CONTREF_ZSO'",UUID.class);
        jdbc.update("insert into regimen_drugs(regimen_id,drug_id,phase,dose_text,frequency_text,sequence_no) select ?,id,'PRIVATE PHASE','PRIVATE DOSE','PRIVATE FREQUENCY',1 from drugs where code='H'",regimen);
        JsonNode catalog=call(get(path("tpt")),null,200).path("preventiveRegimens");
        List<String> order=new ArrayList<>(),fixtures=new ArrayList<>();
        for(JsonNode item:catalog) {
            assertThat(item.propertyNames()).containsExactlyInAnyOrder("code","name","caseCategoryCode");
            assertThat(item.path("caseCategoryCode").isNull()).isFalse();
            String code=item.path("code").asText(); order.add(item.path("caseCategoryCode").asText()+"|"+code);
            if(code.startsWith("CONTREF")) fixtures.add(code);
            assertThat(jdbc.queryForObject("select regimen_kind from regimens where code=?",String.class,code)).isEqualTo("PREVENTIVE");
        }
        assertThat(order).isSorted(); assertThat(fixtures).containsExactly("CONTREF_RO","CONTREF_ASO","CONTREF_ZSO");
        assertThat(catalog.toString()).doesNotContain("PRIVATE REGIMEN","2200-01-01","2201-01-01","PRIVATE PHASE","PRIVATE DOSE","PRIVATE FREQUENCY","NULL CATEGORY","INACTIVE REGIMEN","TREATMENT REGIMEN",regimen.toString());
        jdbc.update("update regimens set active=false where id=?",regimen);
        assertThat(call(get(path("tpt")),null,200).path("preventiveRegimens").toString()).doesNotContain("CONTREF_ZSO");
    }

    @ParameterizedTest @ValueSource(strings={"preparation","facilities","referral","contact","tpt"})
    void missingPermissionIsDeniedEvenForOfficer(String endpoint) throws Exception {
        signIn("TB_OFFICER","CASE_READ"); call(get(path(endpoint)),null,403);
    }
    static java.util.stream.Stream<Arguments> roleMatrix() {
        return List.of("LAB_STAFF","SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER").stream()
                .flatMap(role -> List.of("preparation","facilities","referral","contact","tpt").stream().map(endpoint -> Arguments.of(role,endpoint)));
    }
    @ParameterizedTest @MethodSource("roleMatrix")
    void artificialPermissionsCannotBypassOfficerRole(String role,String endpoint) throws Exception {
        signIn(role,"REFERRAL_WRITE","REFERRAL_READ","CONTACT_WRITE","CONTACT_READ","TPT_READ","TPT_WRITE"); call(get(path(endpoint)),null,403);
    }
    static java.util.stream.Stream<Arguments> assignmentMatrix() {
        return List.of("none","inactiveAssignment","inactiveFacility").stream()
                .flatMap(state -> List.of("preparation","facilities","referral","contact","tpt").stream().map(endpoint -> Arguments.of(state,endpoint)));
    }
    @ParameterizedTest @MethodSource("assignmentMatrix")
    void allContractsRequireActiveAssignment(String state,String endpoint) throws Exception {
        UUID user=signIn("TB_OFFICER","REFERRAL_WRITE","REFERRAL_READ","CONTACT_WRITE","CONTACT_READ","TPT_READ");
        switch(state) {
            case "none" -> jdbc.update("delete from user_facilities where user_id=?",user);
            case "inactiveAssignment" -> jdbc.update("update user_facilities set active=false where user_id=?",user);
            default -> jdbc.update("update facilities set active=false where id=?",source);
        }
        call(get(path(endpoint)),null,403);
    }
    @ParameterizedTest @ValueSource(strings={"preparation","facilities","referral","contact","tpt"})
    void anonymousRequestsAreDenied(String endpoint) throws Exception { mvc.perform(get(path(endpoint))).andExpect(status().isUnauthorized()); }

    @ParameterizedTest @ValueSource(strings={"REFERRAL_WRITE","CONTACT_WRITE"})
    void destinationVisibilityDoesNotGrantForeignCaseWrites(String permission) throws Exception {
        signIn("TB_OFFICER",permission); call(get(path("facilities")),null,200);
        jdbc.update("update tb_cases set current_facility_id=? where id=?",destination,caseId);
        if(permission.equals("REFERRAL_WRITE")) call(post("/api/v1/cases/"+caseId+"/referrals"),Map.of("referralType","PRE_TREATMENT_REFERRAL","destinationFacilityId",source),404);
        else call(post("/api/v1/cases/"+caseId+"/contacts"),Map.of("fullName","Contact","workflowType","INTERNAL"),404);
        assertThat(jdbc.queryForObject("select count(*) from referrals",Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from contacts",Long.class)).isZero();
    }
    @Test void referencesDoNotGrantWrites() throws Exception {
        signIn("TB_OFFICER","REFERRAL_READ","CONTACT_READ","TPT_READ");
        for(String endpoint:List.of("referral","contact","tpt")) call(get(path(endpoint)),null,200);
        call(post("/api/v1/cases/"+caseId+"/referrals"),Map.of("referralType","PRE_TREATMENT_REFERRAL","destinationFacilityId",destination),403);
        call(post("/api/v1/cases/"+caseId+"/contacts"),Map.of("fullName","Contact","workflowType","INTERNAL"),403);
        call(post("/api/v1/contact-investigations/"+UUID.randomUUID()+"/tpt"),Map.of("startDate",LocalDate.now().toString()),403);
    }
    @Test void repeatedSuccessfulReadsHaveNoClinicalAuthorizationOrAuditSideEffects() throws Exception {
        signIn("TB_OFFICER","REFERRAL_WRITE","REFERRAL_READ","CONTACT_WRITE","CONTACT_READ","TPT_READ");
        treatment("ACTIVE",true); var before=snapshot();
        long audits=jdbc.queryForObject("select count(*) from audit_logs",Long.class);
        for(int repeat=0;repeat<2;repeat++) for(String endpoint:List.of("preparation","facilities","referral","contact","tpt")) call(get(path(endpoint)),null,200);
        assertThat(snapshot()).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs",Long.class)).isEqualTo(audits);
    }

    private String path(String endpoint) {
        return switch(endpoint) {
            case "preparation" -> "/api/v1/cases/"+caseId+"/referral-preparation";
            case "facilities" -> "/api/v1/continuity-facilities";
            default -> "/api/v1/"+endpoint+"-reference-data";
        };
    }
    private UUID facility(String name,boolean active) { return jdbc.queryForObject("insert into facilities(name,active) values (?,?) returning id",UUID.class,name,active); }
    private UUID treatment(String status,boolean regimen) {
        return jdbc.queryForObject("insert into treatments(case_id,facility_id,regimen_id,start_date,planned_end_date,status,notes,regimen_description) values (?,?,(select id from regimens where code=?),'2026-01-03','2026-07-03',?,'PRIVATE TREATMENT','PRIVATE COMPOSITION') returning id",UUID.class,caseId,source,regimen ? "SO_6M_2HRZE_4HR" : "missing",status);
    }
    private UUID signIn(String role,String... permissions) throws Exception {
        UUID user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('continuity@example.org',?,'ACTIVE',now()) returning id",UUID.class,hash);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",user,role);
        if(role.equals("TB_OFFICER")) {
            jdbc.update("delete from role_permissions where role_id=?",officerRole);
            for(String permission:permissions) jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code=?",officerRole,permission);
        } else {
            extraRole=jdbc.queryForObject("insert into roles(code,name) values (?, 'Artificial continuity grants') returning id",UUID.class,"CONTREF_"+UUID.randomUUID());
            jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",user,extraRole);
            for(String permission:permissions) jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code=?",extraRole,permission);
        }
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,source);
        caller=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity","continuity@example.org","password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
        return user;
    }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        var response=mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn().getResponse();
        if(expected==200) assertThat(response.getHeader("ETag")).isNull();
        return json.readTree(response.getContentAsString());
    }
    private Set<String> grants() { return new HashSet<>(jdbc.queryForList("select p.code from permissions p join role_permissions rp on rp.permission_id=p.id where rp.role_id=?",String.class,officerRole)); }
    private void assertFacility(JsonNode node,UUID id,String name) {
        assertThat(node.propertyNames()).containsExactlyInAnyOrder("id","name");
        assertThat(node.path("id").asText()).isEqualTo(id.toString()); assertThat(node.path("name").asText()).isEqualTo(name);
    }
    private void options(JsonNode data,String group,String... expected) {
        List<String> actual=new ArrayList<>();
        for(JsonNode item:data.path(group)) { assertThat(item.propertyNames()).containsExactlyInAnyOrder("code","name"); actual.add(item.path("code").asText()+"|"+item.path("name").asText()); }
        assertThat(actual).containsExactly(expected);
    }
    private Map<String,List<Map<String,Object>>> snapshot() {
        Map<String,List<Map<String,Object>>> state=new LinkedHashMap<>();
        for(String table:List.of("users","roles","role_permissions","user_roles","user_facilities","patients","facilities","tb_registrations","diagnoses","tb_cases","treatments","referrals","contacts","contact_investigations","preventive_treatments","regimens","regimen_drugs","external_identifiers"))
            state.put(table,jdbc.queryForList("select * from "+table+" order by 1"));
        return state;
    }
}
