package id.tbcall.application;

import id.tbcall.authorization.ClinicalSourceAuthorityPolicy;
import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false","tbcall.security.expose-verification-tokens=true"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class ClinicalIntakeIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordHasher passwords;
    @Autowired Clock clock;
    @MockitoSpyBean ClinicalSourceAuthorityPolicy source;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PASSWORD="Clinical intake password 123!",NIK="1234567890123456";
    private static String passwordHash;
    private UUID facility,otherFacility,officer;
    private Cookie caller;
    @BeforeEach void setup() throws Exception {
        if(passwordHash==null) passwordHash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade"); clearInvocations(source);
        facility=facility("Fasyankes A"); otherFacility=facility("Fasyankes B");
        officer=user("officer@example.org","TB_OFFICER",facility); caller=login("officer@example.org");
    }

    @Test void migrationAddsOnlyOfficerResolutionPermissionAndPartialIndex() {
        assertThat(jdbc.queryForList("select r.code from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where p.code='PATIENT_IDENTITY_RESOLVE'",String.class)).containsExactly("TB_OFFICER");
        assertThat(jdbc.queryForObject("select indexdef from pg_indexes where indexname='idx_patients_other_identity'",String.class))
                .contains("other_identity_number","WHERE (other_identity_number IS NOT NULL)");
    }
    @Test void createWniRegistrationIsAtomicAndUsesExplicitProjection() throws Exception {
        JsonNode reg=create(); UUID patient=UUID.fromString(reg.path("patient").path("patientId").asText());
        assertThat(reg.path("status").asText()).isEqualTo("OPEN"); assertThat(reg.path("version").asLong()).isZero();
        JsonNode detail=call(get("/api/v1/patients/"+patient),null,200);
        assertThat(detail.path("demographics").path("nik").asText()).isEqualTo(NIK);
        assertThat(detail.path("demographics").path("phone").asText()).isEqualTo("+6281234567890");
        assertThat(jdbc.queryForObject("select count(*) from patients",Integer.class)).isEqualTo(1);
        assertThat(reg.toString()).doesNotContain("createdAt","password","sync"); audited("PATIENT_CREATED","TB_REGISTRATION_CREATED");
    }
    @Test void invalidRegistrationRollsBackNewPatientAndAudit() throws Exception {
        Map<String,Object> request=newRegistration(); request.put("suspectTypeCode","UNKNOWN_CODE"); call(post("/api/v1/registrations"),request,400);
        assertThat(jdbc.queryForObject("select count(*) from patients",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='PATIENT_CREATED'",Integer.class)).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"missingNik","badNik","futureBirth","missingBirth","missingSex","badCitizenship","inactiveSex","invalidPhone"})
    void wniDemographicRulesAreEnforced(String invalid) throws Exception {
        Map<String,Object> patient=demographics();
        switch(invalid) {
            case "missingNik" -> patient.remove("nik"); case "badNik" -> patient.put("nik","123");
            case "futureBirth" -> patient.put("birthDate",LocalDate.now(clock).plusDays(1).toString());
            case "missingBirth" -> patient.remove("birthDate"); case "missingSex" -> patient.remove("sexCode");
            case "badCitizenship" -> patient.put("citizenship","OTHER");
            case "inactiveSex" -> jdbc.update("update sex_codes set active=false where code='PEREMPUAN'");
            default -> patient.put("phone","not-phone");
        }
        Map<String,Object> request=newRegistration(); request.put("newPatient",patient);
        try { call(post("/api/v1/registrations"),request,400); }
        finally { jdbc.update("update sex_codes set active=true where code='PEREMPUAN'"); }
    }
    @Test void wnaAndUnknownBirthDateAreSupported() throws Exception {
        Map<String,Object> patient=demographics(); patient.remove("nik"); patient.remove("birthDate");
        patient.put("citizenship","WNA"); patient.put("otherIdentityNumber","  PASSPORT-123  "); patient.put("birthDateUnknown",true);
        Map<String,Object> request=newRegistration(); request.put("newPatient",patient); JsonNode reg=call(post("/api/v1/registrations"),request,201);
        assertThat(reg.path("patient").path("birthDateUnknown").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("select other_identity_number from patients",String.class)).isEqualTo("PASSPORT-123");
        patient.remove("otherIdentityNumber"); call(post("/api/v1/registrations"),request,400);
    }
    @Test void duplicateNikAndBpjsProduceStableExplicitConflict() throws Exception {
        create(); JsonNode duplicate=call(post("/api/v1/registrations"),newRegistration(),409);
        assertThat(duplicate.path("code").asText()).isEqualTo("PATIENT_IDENTITY_DUPLICATE");
        Map<String,Object> patient=demographics(); patient.put("nik","9999999999999999");
        Map<String,Object> request=newRegistration(); request.put("newPatient",patient);
        assertThat(call(post("/api/v1/registrations"),request,409).path("code").asText()).isEqualTo("PATIENT_IDENTITY_DUPLICATE");
        assertThat(jdbc.queryForObject("select count(*) from patients",Integer.class)).isEqualTo(1);
    }
    @Test void resolverRequiresExactAuthoritativeAndSecondaryIdentityAndMasksResponse() throws Exception {
        UUID patient=patient(NIK,"Pasien Uji");
        JsonNode resolved=call(post("/api/v1/patients/resolve"),identity(),200);
        assertThat(resolved.path("patientId").asText()).isEqualTo(patient.toString());
        assertThat(resolved.toString()).doesNotContain(NIK,"hiv","dmStatus","registrations","facilities");
        call(post("/api/v1/patients/resolve"),Map.of("citizenship","WNI","nik",NIK),400);
        call(post("/api/v1/patients/resolve"),Map.of("citizenship","WNI","nik",NIK,"fullName","Pasien"),404);
        call(post("/api/v1/patients/resolve"),Map.of("bpjsNumber","BPJS-123","fullName","Pasien Uji"),400);
        Map<String,Object> byDate=new HashMap<>(identity()); byDate.remove("fullName"); byDate.put("birthDate","1990-01-01");
        call(post("/api/v1/patients/resolve"),byDate,200); audited("PATIENT_IDENTITY_RESOLVED");
    }
    @Test void ambiguousWnaIsEvaluatedAfterSecondaryConfirmation() throws Exception {
        UUID a=patient(null,"Nama Sama"),b=patient(null,"Nama Sama");
        jdbc.update("update patients set citizenship='WNA',other_identity_number='P-1' where id in (?,?)",a,b);
        Map<String,Object> input=Map.of("citizenship","WNA","otherIdentityNumber","P-1","fullName","Nama Sama");
        assertThat(call(post("/api/v1/patients/resolve"),input,409).path("code").asText()).isEqualTo("PATIENT_IDENTITY_AMBIGUOUS");
        jdbc.update("update patients set birth_date='1991-01-01' where id=?",b);
        call(post("/api/v1/patients/resolve"),Map.of("citizenship","WNA","otherIdentityNumber","P-1","birthDate","1990-01-01"),200);
    }
    @Test void historicalPatientRequiresReconfirmationButCurrentPatientIdCanBeReused() throws Exception {
        UUID patient=patient(NIK,"Pasien Uji"); registration(patient,otherFacility,"CLOSED");
        Map<String,Object> request=existingRegistration(patient,false); call(post("/api/v1/registrations"),request,404);
        request=existingRegistration(patient,true); JsonNode first=call(post("/api/v1/registrations"),request,201);
        JsonNode second=call(post("/api/v1/registrations"),existingRegistration(patient,false),201);
        assertThat(second.path("patient").path("patientId").asText()).isEqualTo(patient.toString());
        assertThat(first.path("id").asText()).isNotEqualTo(second.path("id").asText());
        assertThat(jdbc.queryForObject("select count(*) from patients",Integer.class)).isEqualTo(1);
    }
    @Test void registrationCreationRequiresOneModeActiveScopedFacilityAndActiveReferences() throws Exception {
        Map<String,Object> request=newRegistration(); request.put("existingPatient",Map.of("patientId",UUID.randomUUID())); call(post("/api/v1/registrations"),request,400);
        request=newRegistration(); request.remove("newPatient"); call(post("/api/v1/registrations"),request,400);
        request=newRegistration(); request.put("facilityId",otherFacility); call(post("/api/v1/registrations"),request,404);
        request=newRegistration(); request.put("previousTreatmentCategoryCode","SETELAH_GAGAL_KAT_1");
        assertThat(call(post("/api/v1/registrations"),request,400).path("code").asText()).isEqualTo("REFERENCE_CODE_INVALID");
        request=newRegistration(); request.put("registrationDate",LocalDate.now(clock).plusDays(1).toString()); call(post("/api/v1/registrations"),request,400);
        request=newRegistration(); request.put("initialWeightKg",0); call(post("/api/v1/registrations"),request,400);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",officer,otherFacility);
        jdbc.update("update facilities set active=false where id=?",facility); call(post("/api/v1/registrations"),newRegistration(),404);
    }
    @Test void patientListsAreCurrentScopedBoundedAndMinimallyProjected() throws Exception {
        JsonNode created=create(); UUID historical=patient("9999999999999999","Historical"); registration(historical,facility,"CLOSED");
        UUID unrelated=patient("8888888888888888","Unrelated"); registration(unrelated,otherFacility,"OPEN");
        JsonNode list=call(get("/api/v1/patients"),null,200); assertThat(list.path("content")).hasSize(1);
        assertThat(list.path("totalElements").asLong()).isEqualTo(1);
        assertThat(list.toString()).doesNotContain(NIK,"BPJS-123","hivStatus","dmStatus","referralNotes",historical.toString(),unrelated.toString());
        call(get("/api/v1/patients").param("size","51"),null,400); call(get("/api/v1/patients").param("name","Pa"),null,400);
        call(get("/api/v1/patients").param("facilityId",otherFacility.toString()),null,404);
        assertThat(call(get("/api/v1/patients").param("name","Pasien").param("nik",NIK).param("registrationStatus","OPEN"),null,200).path("content")).hasSize(1);
        assertThat(call(get("/api/v1/patients").param("caseStatus","ACTIVE"),null,200).path("content")).isEmpty();
    }
    @Test void patientDetailOmitsUnrelatedEpisodesAndHistoricalAssociationDoesNotAuthorizeIt() throws Exception {
        UUID patient=patient(NIK,"Pasien Uji"); UUID own=registration(patient,facility,"OPEN"),foreign=registration(patient,otherFacility,"OPEN");
        JsonNode detail=call(get("/api/v1/patients/"+patient),null,200);
        assertThat(detail.path("registrations")).hasSize(1); assertThat(detail.toString()).doesNotContain(foreign.toString(),otherFacility.toString());
        jdbc.update("update tb_registrations set status='CLOSED' where id=?",own);
        call(get("/api/v1/patients/"+patient),null,404);
        call(get("/api/v1/registrations/"+own),null,200);
        JsonNode hidden=call(get("/api/v1/registrations/"+foreign),null,404);
        assertThat(hidden.path("code").asText()).isEqualTo(call(get("/api/v1/registrations/"+UUID.randomUUID()),null,404).path("code").asText());
    }
    @Test void patientPatchMergesAndRevalidatesWithVersions() throws Exception {
        JsonNode reg=create(); String path="/api/v1/patients/"+reg.path("patient").path("patientId").asText();
        call(patch(path),Map.of("fullName","Nama Baru"),428);
        JsonNode updated=call(patch(path).header("If-Match","\"0\""),Map.of("fullName","  Nama Baru  "),200);
        assertThat(updated.path("version").asLong()).isEqualTo(1); assertThat(updated.path("demographics").path("fullName").asText()).isEqualTo("Nama Baru");
        call(patch(path).header("If-Match","\"0\""),Map.of("fullName","Stale"),409);
        Map<String,Object> empty=new HashMap<>(); empty.put("nik",null); call(patch(path).header("If-Match","\"1\""),empty,400);
        call(patch(path).header("If-Match","\"1\""),Map.of("status","CLOSED"),400); audited("PATIENT_UPDATED");
    }
    @Test void registrationPatchOnlyOpenAndCannotReassignOrChangeStatus() throws Exception {
        JsonNode reg=create(); String path="/api/v1/registrations/"+reg.path("id").asText();
        call(patch(path),Map.of("medicalRecordNumber","RM-1"),428);
        JsonNode updated=call(patch(path).header("If-Match","\"0\""),Map.of("medicalRecordNumber","RM-1"),200);
        call(patch(path).header("If-Match","\"1\""),Map.of("facilityId",otherFacility),400);
        call(patch(path).header("If-Match","\"1\""),Map.of("status","CLOSED"),400);
        recordDiagnosis(updated); call(patch(path).header("If-Match",version(path)),Map.of("medicalRecordNumber","RM-2"),409); audited("TB_REGISTRATION_UPDATED");
    }
    @Test void diagnosisAndCaseFollowExplicitTransitionsAndExposeUpdatedVersions() throws Exception {
        JsonNode reg=create(); String regPath="/api/v1/registrations/"+reg.path("id").asText();
        call(post(regPath+"/diagnoses"),diagnosis(),428);
        JsonNode diagnosis=recordDiagnosis(reg); assertThat(call(get(regPath),null,200).path("status").asText()).isEqualTo("DIAGNOSED");
        JsonNode confirmed=confirm(reg.path("id").asText(),diagnosis.path("id").asText(),"TB_SO",null,201);
        assertThat(confirmed.path("currentFacility").path("id").asText()).isEqualTo(facility.toString());
        assertThat(confirmed.path("status").asText()).isEqualTo("ACTIVE"); assertThat(confirmed.path("confirmedAt").asText()).isNotBlank();
        assertThat(call(get(regPath),null,200).path("status").asText()).isEqualTo("CONVERTED_TO_CASE");
        confirm(reg.path("id").asText(),diagnosis.path("id").asText(),"TB_SO",null,409);
        call(patch("/api/v1/diagnoses/"+diagnosis.path("id").asText()).header("If-Match","\"0\""),Map.of("notes","Change"),409);
        audited("DIAGNOSIS_RECORDED","TB_CASE_CONFIRMED");
    }
    @Test void additionalDiagnosesAdvanceRegistrationVersionAndUnconfirmedDiagnosisCanBeEdited() throws Exception {
        JsonNode reg=create(),first=recordDiagnosis(reg); String regPath="/api/v1/registrations/"+reg.path("id").asText();
        String before=version(regPath); call(post(regPath+"/diagnoses").header("If-Match",before),diagnosis(),201);
        assertThat(version(regPath)).isNotEqualTo(before);
        call(post(regPath+"/diagnoses").header("If-Match",before),diagnosis(),409);
        JsonNode updated=call(patch("/api/v1/diagnoses/"+first.path("id").asText()).header("If-Match","\"0\""),Map.of("notes","Catatan"),200);
        assertThat(updated.path("version").asLong()).isEqualTo(1); audited("DIAGNOSIS_UPDATED");
    }
    @ParameterizedTest @ValueSource(strings={"pastDate","futureDate","inactiveAnatomy","wrongType","sameReferral","inactiveReferral","missingReferral"})
    void diagnosisValidation(String invalid) throws Exception {
        JsonNode reg=create(); Map<String,Object> d=diagnosis();
        switch(invalid) {
            case "pastDate" -> d.put("diagnosisDate","2000-01-01"); case "futureDate" -> d.put("diagnosisDate",LocalDate.now(clock).plusDays(1).toString());
            case "inactiveAnatomy" -> jdbc.update("update anatomical_sites set active=false where code='PARU'");
            case "wrongType" -> d.put("diagnosisTypeCode","UNKNOWN_CODE");
            case "sameReferral" -> { d.put("treatmentDisposition","REFERRED"); d.put("referredToFacilityId",facility); }
            case "inactiveReferral" -> { jdbc.update("update facilities set active=false where id=?",otherFacility); d.put("treatmentDisposition","REFERRED"); d.put("referredToFacilityId",otherFacility); }
            default -> d.put("treatmentDisposition","REFERRED");
        }
        try { call(post("/api/v1/registrations/"+reg.path("id").asText()+"/diagnoses").header("If-Match","\"0\""),d,400); }
        finally { jdbc.update("update anatomical_sites set active=true where code='PARU'"); }
    }
    @Test void caseRequiresDiagnosedParentAndCorrectDiagnosisLineage() throws Exception {
        JsonNode reg=create(); call(post("/api/v1/registrations/"+reg.path("id").asText()+"/cases").header("If-Match","\"0\""),Map.of("diagnosisId",UUID.randomUUID(),"caseCategoryCode","TB_SO","previousTreatmentCategoryCode","BARU"),409);
        JsonNode d=recordDiagnosis(reg); UUID p=patient("9999999999999999","Other"),otherReg=registration(p,facility,"DIAGNOSED");
        UUID otherDiagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,anatomical_site_code,diagnosis_type_code) values (?,current_date,'PARU','KLINIS') returning id",UUID.class,otherReg);
        confirm(reg.path("id").asText(),otherDiagnosis.toString(),"TB_SO",null,400);
        confirm(reg.path("id").asText(),d.path("id").asText(),"TB_SO","TB_MDR",400);
        confirm(reg.path("id").asText(),d.path("id").asText(),"TB_RO","TB_SO",400);
        confirm(reg.path("id").asText(),d.path("id").asText(),"TB_RO","TB_MDR",201);
    }
    @Test void casePatchRestrictsStateProfileAndResistance() throws Exception {
        JsonNode reg=create(),d=recordDiagnosis(reg),c=confirm(reg.path("id").asText(),d.path("id").asText(),"TB_SO",null,201);
        String path="/api/v1/cases/"+c.path("id").asText(); call(patch(path),Map.of("weightKg",60),428);
        call(patch(path).header("If-Match","\"0\""),Map.of("weightKg",60),200);
        call(patch(path).header("If-Match","\"1\""),Map.of("status","REFERRED"),400);
        call(patch(path).header("If-Match","\"1\""),Map.of("drugResistancePatternCode","TB_MDR"),400);
        jdbc.update("update tb_cases set status='COMPLETED',version=version+1 where id=?",UUID.fromString(c.path("id").asText()));
        call(patch(path).header("If-Match","\"2\""),Map.of("weightKg",61),409); audited("TB_CASE_UPDATED");
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","LAB_STAFF"})
    void administrativeAndLabRolesCannotUseClinicalIntake(String role) throws Exception {
        JsonNode reg=create(),diagnosis=recordDiagnosis(reg),tbCase=confirm(reg.path("id").asText(),diagnosis.path("id").asText(),"TB_SO",null,201);
        String patientPath="/api/v1/patients/"+reg.path("patient").path("patientId").asText(),registrationPath="/api/v1/registrations/"+reg.path("id").asText();
        String casePath="/api/v1/cases/"+tbCase.path("id").asText(),diagnosisPath="/api/v1/diagnoses/"+diagnosis.path("id").asText();
        user("other@example.org",role,facility); Cookie saved=caller; caller=login("other@example.org");
        try {
            call(get("/api/v1/patients"),null,403); call(post("/api/v1/patients/resolve"),identity(),403);
            call(post("/api/v1/registrations"),newRegistration(),403);
            call(get(patientPath),null,403); call(patch(patientPath).header("If-Match","\"0\""),Map.of("fullName","Nama"),403);
            call(get(registrationPath),null,403); call(patch(registrationPath).header("If-Match","\"2\""),Map.of("medicalRecordNumber","RM"),403);
            call(post(registrationPath+"/diagnoses").header("If-Match","\"2\""),diagnosis(),403);
            call(patch(diagnosisPath).header("If-Match","\"0\""),Map.of("notes","Catatan"),403);
            call(post(registrationPath+"/cases").header("If-Match","\"2\""),Map.of("diagnosisId",diagnosis.path("id").asText(),"caseCategoryCode","TB_SO","previousTreatmentCategoryCode","BARU"),403);
            call(get(casePath),null,403); call(patch(casePath).header("If-Match","\"0\""),Map.of("weightKg",60),403);
            call(get("/api/v1/me/patient"),null,403);
        } finally { caller=saved; }
    }
    @Test void patientSelfProjectionExcludesHivDmNotesAndSupporters() throws Exception {
        JsonNode reg=create(),d=recordDiagnosis(reg),c=confirm(reg.path("id").asText(),d.path("id").asText(),"TB_SO",null,201);
        UUID p=UUID.fromString(reg.path("patient").path("patientId").asText()),self=user("self@example.org","PATIENT",null);
        jdbc.update("insert into patient_user_links(user_id,patient_id,verification_status,verified_by,verified_at) values (?,?,'VERIFIED',?,now())",self,p,officer);
        Cookie saved=caller; caller=login("self@example.org");
        try {
            JsonNode view=call(get("/api/v1/me/patient"),null,200);
            assertThat(view.path("patientId").asText()).isEqualTo(p.toString());
            assertThat(view.toString()).doesNotContain("hiv","dmStatus","notes","referral","supporter","metadata",NIK,"BPJS-123");
            call(get("/api/v1/patients/"+p),null,403);
            jdbc.update("update patient_user_links set verification_status='REVOKED' where user_id=?",self); call(get("/api/v1/me/patient"),null,403);
        } finally { caller=saved; }
    }
    @Test void everyClinicalWriteCallsSourcePolicyAndAuditExcludesSensitivePayloads() throws Exception {
        JsonNode reg=create(); String rp="/api/v1/registrations/"+reg.path("id").asText(),pp="/api/v1/patients/"+reg.path("patient").path("patientId").asText();
        call(patch(pp).header("If-Match","\"0\""),Map.of("address","Alamat rahasia"),200);
        reg=call(patch(rp).header("If-Match","\"0\""),Map.of("referralNotes","Catatan rahasia"),200);
        JsonNode d=recordDiagnosis(reg); call(patch("/api/v1/diagnoses/"+d.path("id").asText()).header("If-Match","\"0\""),Map.of("notes","Catatan rahasia"),200);
        JsonNode c=confirm(reg.path("id").asText(),d.path("id").asText(),"TB_SO",null,201);
        call(patch("/api/v1/cases/"+c.path("id").asText()).header("If-Match","\"0\""),Map.of("hivStatusCode","POSITIF"),200);
        var calls=mockingDetails(source).getInvocations().stream().filter(i -> i.getMethod().getName().startsWith("requireLocal")).toList();
        assertThat(calls).hasSize(8); assertThat(calls.stream().map(i -> i.getMethod().getName())).contains("requireLocalCreate","requireLocalEdit");
        assertThat(jdbc.queryForList("select metadata::text from audit_logs",String.class).toString()).doesNotContain(NIK,"BPJS-123","Catatan rahasia","Alamat rahasia","POSITIF");
    }
    @Test void concurrentCaseConfirmationSucceedsOnce() throws Exception {
        JsonNode reg=create(),d=recordDiagnosis(reg); String path="/api/v1/registrations/"+reg.path("id").asText()+"/cases",match=version("/api/v1/registrations/"+reg.path("id").asText());
        Map<String,Object> input=Map.of("diagnosisId",d.path("id").asText(),"caseCategoryCode","TB_SO","previousTreatmentCategoryCode","BARU");
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch start=new CountDownLatch(1); Callable<Integer> task=() -> { start.await(); return mvc.perform(post(path).cookie(caller).with(csrf()).header("If-Match",match).contentType("application/json").content(json.writeValueAsString(input))).andReturn().getResponse().getStatus(); };
            var a=pool.submit(task); var b=pool.submit(task); start.countDown();
            assertThat(List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        }
        assertThat(jdbc.queryForObject("select count(*) from tb_cases",Integer.class)).isEqualTo(1);
    }
    @Test void sourceDenialRollsBackDemographicUpdateAndAudit() throws Exception {
        JsonNode reg=create(); UUID patient=UUID.fromString(reg.path("patient").path("patientId").asText());
        doThrow(id.tbcall.application.common.ApplicationFailure.forbidden()).when(source)
                .requireLocalEdit(any(),eq("PATIENT_UPDATE"),eq(facility),eq("PATIENT"),eq(patient));
        try {
            call(patch("/api/v1/patients/"+patient).header("If-Match","\"0\""),Map.of("fullName","Blocked name"),403);
            assertThat(jdbc.queryForObject("select full_name from patients where id=?",String.class,patient)).isEqualTo("Pasien Uji");
            assertThat(jdbc.queryForObject("select version from patients where id=?",Long.class,patient)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='PATIENT_UPDATED'",Integer.class)).isZero();
        } finally { doCallRealMethod().when(source).requireLocalEdit(any(),anyString(),any(),anyString(),any()); }
    }
    @Test void caseCurrentFacilityGrantsPatientScopeWithoutExposingForeignRegistration() throws Exception {
        UUID p=patient(NIK,"Pasien Uji"),r=registration(p,otherFacility,"CONVERTED_TO_CASE");
        UUID d=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,anatomical_site_code,diagnosis_type_code) values (?,current_date,'PARU','KLINIS') returning id",UUID.class,r);
        UUID c=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,status,case_category_code,previous_treatment_category_code) values (?,?,?,'REFERRED','TB_SO','BARU') returning id",UUID.class,r,d,facility);
        JsonNode detail=call(get("/api/v1/patients/"+p),null,200); assertThat(detail.path("registrations")).isEmpty(); assertThat(detail.path("cases")).hasSize(1);
        assertThat(call(get("/api/v1/patients").param("caseStatus","REFERRED"),null,200).path("content")).hasSize(1);
        call(get("/api/v1/registrations/"+r),null,404);
        call(patch("/api/v1/registrations/"+r).header("If-Match","\"0\""),Map.of("medicalRecordNumber","RM"),404);
        call(patch("/api/v1/diagnoses/"+d).header("If-Match","\"0\""),Map.of("notes","Catatan"),404);
        call(get("/api/v1/cases/"+c),null,200); call(patch("/api/v1/cases/"+c).header("If-Match","\"0\""),Map.of("weightKg",60),200);
        jdbc.update("update tb_cases set status='TRANSFERRED',version=version+1 where id=?",c); call(get("/api/v1/patients/"+p),null,404);
    }
    @Test void officerWithoutActiveMembershipCannotResolveOrReadClinicalIntake() throws Exception {
        jdbc.update("update user_facilities set active=false where user_id=?",officer);
        call(post("/api/v1/patients/resolve"),identity(),403); call(get("/api/v1/patients"),null,403);
        call(post("/api/v1/registrations"),newRegistration(),403);
    }
    @Test void concurrentNewPatientIdentityCreationHasOneWinnerAndExplicitConflict() throws Exception {
        Map<String,Object> input=newRegistration();
        try(var pool=Executors.newFixedThreadPool(2)) {
            CountDownLatch start=new CountDownLatch(1); Callable<JsonNode> task=() -> {
                start.await(); var result=mvc.perform(post("/api/v1/registrations").cookie(caller).with(csrf())
                        .contentType("application/json").content(json.writeValueAsString(input))).andReturn().getResponse();
                return json.readTree(result.getContentAsString());
            };
            var a=pool.submit(task);var b=pool.submit(task);start.countDown(); var results=List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS));
            assertThat(results.stream().filter(r -> r.has("id"))).hasSize(1);
            assertThat(results.stream().filter(r -> r.has("code")).map(r -> r.path("code").asText())).containsExactly("PATIENT_IDENTITY_DUPLICATE");
        }
        assertThat(jdbc.queryForObject("select count(*) from patients",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from tb_registrations",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='PATIENT_CREATED'",Integer.class)).isEqualTo(1);
    }
    @Test void malformedExistingConfirmationDoesNotDisclosePatientExistence() throws Exception {
        UUID present=patient(NIK,"Pasien Uji"); registration(present,otherFacility,"CLOSED");
        for(UUID id:List.of(present,UUID.randomUUID())) {
            Map<String,Object> request=existingRegistration(id,false);
            request.put("existingPatient",Map.of("patientId",id,"citizenship","WNI","nik",NIK));
            assertThat(call(post("/api/v1/registrations"),request,400).path("code").asText()).isEqualTo("VALIDATION_ERROR");
        }
    }
    @Test void ambiguousExistingConfirmationIsIndependentOfSuppliedPatientUuid() throws Exception {
        UUID a=patient(null,"Nama Sama"),b=patient(null,"Nama Sama"),unrelated=patient(NIK,"Pasien Lain");
        jdbc.update("update patients set citizenship='WNA',other_identity_number='P-1' where id in (?,?)",a,b);
        for(UUID id:List.of(unrelated,UUID.randomUUID())) {
            Map<String,Object> request=existingRegistration(id,false);
            request.put("existingPatient",Map.of("patientId",id,"citizenship","WNA","otherIdentityNumber","P-1","fullName","Nama Sama"));
            assertThat(call(post("/api/v1/registrations"),request,409).path("code").asText()).isEqualTo("PATIENT_IDENTITY_AMBIGUOUS");
        }
        assertThat(jdbc.queryForObject("select count(*) from tb_registrations",Integer.class)).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"nik","bpjsNumber"})
    void duplicateIdentityPatchReturnsStableCodeAndRollsBack(String identityField) throws Exception {
        JsonNode created=create(); UUID other=patient("9999999999999999","Other patient");
        jdbc.update("update patients set bpjs_number='OTHER-BPJS' where id=?",other);
        String path="/api/v1/patients/"+created.path("patient").path("patientId").asText();
        String value="nik".equals(identityField) ? "9999999999999999" : "OTHER-BPJS";
        assertThat(call(patch(path).header("If-Match","\"0\""),Map.of(identityField,value),409).path("code").asText()).isEqualTo("PATIENT_IDENTITY_DUPLICATE");
        JsonNode unchanged=call(get(path),null,200);
        assertThat(unchanged.path("demographics").path("nik").asText()).isEqualTo(NIK);
        assertThat(unchanged.path("demographics").path("bpjsNumber").asText()).isEqualTo("BPJS-123");
        assertThat(unchanged.path("version").asLong()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='PATIENT_UPDATED'",Integer.class)).isZero();
    }
    private JsonNode create() throws Exception { return call(post("/api/v1/registrations"),newRegistration(),201); }
    private JsonNode recordDiagnosis(JsonNode reg) throws Exception {
        String path="/api/v1/registrations/"+reg.path("id").asText(); return call(post(path+"/diagnoses").header("If-Match",version(path)),diagnosis(),201);
    }
    private JsonNode confirm(String reg,String diagnosis,String category,String resistance,int status) throws Exception {
        Map<String,Object> body=new HashMap<>(Map.of("diagnosisId",diagnosis,"caseCategoryCode",category,"previousTreatmentCategoryCode","BARU"));
        if(resistance!=null) body.put("drugResistancePatternCode",resistance);
        String path="/api/v1/registrations/"+reg; return call(post(path+"/cases").header("If-Match",version(path)),body,status);
    }
    private Map<String,Object> demographics() {
        return new HashMap<>(Map.of("fullName","  Pasien Uji  ","citizenship","WNI","nik",NIK,"bpjsNumber","BPJS-123","sexCode","PEREMPUAN","birthDate","1990-01-01","phone","081234567890"));
    }
    private Map<String,Object> newRegistration() { return new HashMap<>(Map.of("facilityId",facility,"registrationDate",LocalDate.now(clock).toString(),"suspectTypeCode","TB_SO","previousTreatmentCategoryCode","BARU","newPatient",demographics(),"hivStatusCode","POSITIF","dmStatusCode","YA")); }
    private Map<String,Object> existingRegistration(UUID patient,boolean confirmation) {
        Map<String,Object> request=newRegistration(); request.remove("newPatient"); Map<String,Object> existing=new HashMap<>(); existing.put("patientId",patient);
        if(confirmation) existing.putAll(identity()); request.put("existingPatient",existing); return request;
    }
    private Map<String,Object> identity() { return new HashMap<>(Map.of("citizenship","WNI","nik",NIK,"fullName"," pasien   UJI ")); }
    private Map<String,Object> diagnosis() { return new HashMap<>(Map.of("diagnosisDate",LocalDate.now(clock).toString(),"anatomicalSiteCode","PARU","diagnosisTypeCode","KLINIS","diagnosisResult","TBC","treatmentDisposition","TREAT_HERE")); }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        String output=mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return output.isEmpty() ? json.nullNode() : json.readTree(output);
    }
    private String version(String path) throws Exception { return "\""+call(get(path),null,200).path("version").asLong()+"\""; }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID user(String email,String role,UUID facility) {
        UUID user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,passwordHash);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",user,role);
        if(facility!=null) jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,facility); return user;
    }
    private Cookie login(String identity) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",identity,"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
    }
    private UUID patient(String nik,String name) { return jdbc.queryForObject("insert into patients(nik,full_name,citizenship,birth_date,sex_code) values (?,?,'WNI','1990-01-01','PEREMPUAN') returning id",UUID.class,nik,name); }
    private UUID registration(UUID patient,UUID facility,String status) { return jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,current_date,?) returning id",UUID.class,patient,facility,status); }
    private void audited(String... actions) { for(String action:actions) assertThat(jdbc.queryForObject("select count(*) from audit_logs where action=?",Integer.class,action)).isGreaterThan(0); }
}
