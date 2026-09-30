package id.tbcall.persistence;

import id.tbcall.persistence.entity.*;
import id.tbcall.persistence.repository.*;
import jakarta.persistence.EntityManager;
import java.net.InetAddress;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Testcontainers
@Transactional
class PersistenceIntegrationTest {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine")
            .withDatabaseName("tbcall_test")
            .withUsername("tbcall")
            .withPassword("tbcall");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;
    @Autowired PatientRepository patients;
    @Autowired TBRegistrationRepository registrations;
    @Autowired DiagnosisRepository diagnoses;
    @Autowired TBCaseRepository cases;
    @Autowired LabRequestRepository labRequests;
    @Autowired LabRequestTestRepository requestedTests;
    @Autowired LabSpecimenRepository specimens;
    @Autowired LabResultRepository labResults;
    @Autowired TreatmentRepository treatments;
    @Autowired TreatmentDrugRepository treatmentDrugs;
    @Autowired DoseEventRepository doseEvents;
    @Autowired FollowUpRepository followUps;
    @Autowired TreatmentOutcomeRepository outcomes;
    @Autowired ReferralRepository referrals;
    @Autowired ContactRepository contacts;
    @Autowired ContactInvestigationRepository investigations;
    @Autowired PreventiveTreatmentRepository preventiveTreatments;
    @Autowired PatientUserLinkRepository patientLinks;
    @Autowired ExternalIdentifierRepository externalIdentifiers;
    @Autowired DrugResistancePatternRepository resistancePatterns;
    @Autowired AdditionalConditionTypeRepository conditionTypes;
    @Autowired CaseConditionObservationRepository conditionObservations;

    @Test
    void flywayBuildsEmptyDatabaseAndHibernateValidatesIt() {
        assertThat(jdbc.queryForList("select version from flyway_schema_history where success order by installed_rank", String.class))
                .containsExactly("1", "2", "3", "4", "5", "6", "7", "8");
        assertThat(jdbc.queryForObject("select count(*) from pg_tables where schemaname = 'public'", Integer.class)).isEqualTo(59);
        assertThat(jdbc.queryForObject("select count(*) from patients", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from roles", Integer.class)).isEqualTo(7);
        assertThat(jdbc.queryForObject("select count(*) from external_systems", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from lab_test_types where code = 'TCM'", Integer.class)).isEqualTo(1);
    }

    @Test
    void resistanceAndConditionHistoryRoundTripWithoutReplacingHivOrDm() {
        Facility facility = facility("Puskesmas A");
        TBRegistration registration = registration(patient("Pasien A"), facility, LocalDate.of(2026, 1, 1));
        TBCase tbCase = tbCase(registration, diagnosis(registration), facility);
        tbCase.setDrugResistancePatternCode("TB_HR");
        tbCase.setHivStatusCode("NEGATIF");
        tbCase.setDmStatusCode("TIDAK");
        OffsetDateTime observed = OffsetDateTime.parse("2026-01-03T08:00:00+07:00");
        CaseConditionObservation first = new CaseConditionObservation();
        first.setTbCase(tbCase);
        first.setConditionTypeCode("KURANG_GIZI");
        first.setStatusCode("PRESENT");
        first.setClassificationCode("TEST_CLASSIFICATION");
        first.setObservedAt(observed);
        first.setSource("TBCALL");
        conditionObservations.save(first);
        CaseConditionObservation later = new CaseConditionObservation();
        later.setTbCase(tbCase);
        later.setConditionTypeCode("KURANG_GIZI");
        later.setStatusCode("ABSENT");
        later.setObservedAt(observed.plusMonths(1));
        later.setSource("IMPORT");
        conditionObservations.save(later);
        flushAndClear();

        assertThat(resistancePatterns.findById("TB_HR").orElseThrow().getName())
                .isEqualTo("TBC Sensitif Rifampisin, Resistan Isoniazid (TBC Hr)");
        assertThat(conditionTypes.findById("KURANG_GIZI").orElseThrow().getActive()).isTrue();
        var history = conditionObservations.findByTbCase_IdOrderByObservedAtAsc(tbCase.getId());
        assertThat(history).extracting(CaseConditionObservation::getStatusCode).containsExactly("PRESENT", "ABSENT");
        assertThat(history.getFirst().getClassificationCode()).isEqualTo("TEST_CLASSIFICATION");
        assertThat(history.getFirst().getCreatedAt()).isNotNull();
        assertThat(history.getFirst().getUpdatedAt()).isNotNull();
        assertThat(history.getFirst().getTbCase().getDrugResistancePatternCode()).isEqualTo("TB_HR");
        assertThat(history.getFirst().getTbCase().getHivStatusCode()).isEqualTo("NEGATIF");
        assertThat(history.getFirst().getTbCase().getDmStatusCode()).isEqualTo("TIDAK");
        assertThat(history.getFirst().getTbCase().getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void patientHasMultipleRegistrationsAndDiagnosisCanConfirmOneCase() {
        Facility facility = facility("Puskesmas A");
        Patient patient = patient("Patient A");
        TBRegistration first = registration(patient, facility, LocalDate.of(2026, 1, 10));
        TBRegistration second = registration(patient, facility, LocalDate.of(2026, 8, 10));
        Diagnosis diagnosis = diagnosis(first);
        TBCase tbCase = tbCase(first, diagnosis, facility);
        flushAndClear();

        assertThat(registrations.findByPatient_IdOrderByRegistrationDateAsc(patient.getId()))
                .extracting(TBRegistration::getId).containsExactly(first.getId(), second.getId());
        assertThat(diagnoses.findByRegistration_Id(first.getId())).extracting(Diagnosis::getId).containsExactly(diagnosis.getId());
        assertThat(cases.findByRegistration_Id(first.getId()).orElseThrow().getConfirmingDiagnosis().getId())
                .isEqualTo(diagnosis.getId());
        assertThat(cases.findById(tbCase.getId()).orElseThrow().getRegistration().getId()).isEqualTo(first.getId());
    }

    @Test
    void laboratoryRequestCarriesMultipleTestsSpecimensAndResults() {
        Facility facility = facility("Puskesmas A");
        Patient patient = patient("Patient A");
        TBRegistration registration = registration(patient, facility, LocalDate.of(2026, 1, 10));
        TBCase tbCase = tbCase(registration, diagnosis(registration), facility);
        Facility laboratory = facility("Laboratory B");

        LabRequest request = new LabRequest();
        request.setRegistration(registration);
        request.setRequestingFacility(facility);
        request.setTestingFacility(laboratory);
        request.setRequestReasonCode("DIAGNOSIS");
        request.setReferralType("EXTERNAL");
        request.setRequestedAt(OffsetDateTime.now());
        em.persist(request);

        LabRequestTest tcm = requestedTest(request, "TCM");
        LabRequestTest culture = requestedTest(request, "BIAKAN");
        LabSpecimen specimen = new LabSpecimen();
        specimen.setLabRequest(request);
        specimen.setSpecimenType("Sputum");
        em.persist(specimen);
        LabResult firstResult = result(tcm, specimen, 1, "NEGATIVE");
        LabResult corrected = result(tcm, specimen, 2, "POSITIVE");
        LabResult cultureResult = result(culture, specimen, 1, "POSITIVE");
        LabRequest caseRequest = new LabRequest();
        caseRequest.setTbCase(tbCase);
        caseRequest.setRequestingFacility(facility);
        caseRequest.setTestingFacility(laboratory);
        caseRequest.setRequestReasonCode("FOLLOW_UP");
        caseRequest.setReferralType("EXTERNAL");
        caseRequest.setRequestedAt(OffsetDateTime.now());
        em.persist(caseRequest);
        flushAndClear();

        assertThat(labRequests.findByRegistration_Id(registration.getId())).hasSize(1);
        assertThat(labRequests.findByTbCase_Id(tbCase.getId())).extracting(LabRequest::getId)
                .containsExactly(caseRequest.getId());
        assertThat(requestedTests.findByLabRequest_Id(request.getId())).extracting(LabRequestTest::getId)
                .containsExactlyInAnyOrder(tcm.getId(), culture.getId());
        assertThat(specimens.findByLabRequest_Id(request.getId())).extracting(LabSpecimen::getId)
                .containsExactly(specimen.getId());
        assertThat(labResults.findByLabRequestTest_IdOrderBySequenceNoAsc(tcm.getId()))
                .extracting(LabResult::getId).containsExactly(firstResult.getId(), corrected.getId());
        assertThat(labResults.findByLabRequestTest_IdOrderBySequenceNoAsc(culture.getId()))
                .extracting(LabResult::getId).containsExactly(cultureResult.getId());
    }

    @Test
    void caseRetainsTreatmentReferralContactAndPreventiveTreatmentHistory() {
        Facility source = facility("Puskesmas A");
        Facility destination = facility("Puskesmas B");
        Patient patient = patient("Patient A");
        TBRegistration registration = registration(patient, source, LocalDate.of(2026, 1, 10));
        TBCase tbCase = tbCase(registration, diagnosis(registration), source);
        Drug drug = new Drug();
        drug.setCode("TEST_DRUG");
        drug.setName("Test drug");
        em.persist(drug);

        Treatment treatment = new Treatment();
        treatment.setTbCase(tbCase);
        treatment.setFacility(source);
        treatment.setStartDate(LocalDate.of(2026, 1, 12));
        treatment.setActualEndDate(LocalDate.of(2026, 6, 12));
        treatment.setStatus("COMPLETED");
        em.persist(treatment);
        TreatmentDrug treatmentDrug = new TreatmentDrug();
        treatmentDrug.setTreatment(treatment);
        treatmentDrug.setDrug(drug);
        em.persist(treatmentDrug);
        DoseEvent dose = new DoseEvent();
        dose.setTreatment(treatment);
        dose.setScheduledDate(LocalDate.of(2026, 1, 13));
        dose.setStatus("TAKEN_OBSERVED");
        em.persist(dose);
        FollowUp followUp = new FollowUp();
        followUp.setTreatment(treatment);
        followUp.setFollowUpType("CLINICAL");
        followUp.setScheduledAt(OffsetDateTime.now().plusDays(1));
        em.persist(followUp);
        TreatmentOutcome outcome = new TreatmentOutcome();
        outcome.setTreatment(treatment);
        outcome.setOutcomeCode("GAGAL");
        outcome.setOutcomeDate(LocalDate.of(2026, 6, 12));
        em.persist(outcome);

        Referral referral = new Referral();
        referral.setTbCase(tbCase);
        referral.setTreatment(treatment);
        referral.setReferralType("TREATMENT_TRANSFER");
        referral.setSourceFacility(source);
        referral.setDestinationFacility(destination);
        referral.setSentAt(OffsetDateTime.now());
        em.persist(referral);
        Contact contact = new Contact();
        contact.setIndexCase(tbCase);
        contact.setFullName("Household contact");
        contact.setHouseholdContact(true);
        em.persist(contact);
        ContactInvestigation investigation = new ContactInvestigation();
        investigation.setContact(contact);
        investigation.setWorkflowType("OUTGOING_REFERRAL");
        investigation.setSourceFacility(source);
        investigation.setDestinationFacility(destination);
        em.persist(investigation);
        PreventiveTreatment tpt = new PreventiveTreatment();
        tpt.setContact(contact);
        tpt.setIndexCase(tbCase);
        tpt.setFacility(destination);
        tpt.setStartDate(LocalDate.of(2026, 2, 1));
        em.persist(tpt);
        flushAndClear();

        assertThat(treatments.findByTbCase_Id(tbCase.getId())).extracting(Treatment::getId).containsExactly(treatment.getId());
        assertThat(treatmentDrugs.findByTreatment_Id(treatment.getId())).extracting(TreatmentDrug::getId).containsExactly(treatmentDrug.getId());
        assertThat(doseEvents.findByTreatment_Id(treatment.getId())).extracting(DoseEvent::getId).containsExactly(dose.getId());
        assertThat(followUps.findByTreatment_Id(treatment.getId())).extracting(FollowUp::getId).containsExactly(followUp.getId());
        assertThat(outcomes.findByTreatment_Id(treatment.getId()).orElseThrow().getId()).isEqualTo(outcome.getId());
        assertThat(referrals.findByTbCase_Id(tbCase.getId())).extracting(Referral::getId).containsExactly(referral.getId());
        assertThat(contacts.findByIndexCase_Id(tbCase.getId())).extracting(Contact::getId).containsExactly(contact.getId());
        assertThat(investigations.findByContact_Id(contact.getId())).extracting(ContactInvestigation::getId).containsExactly(investigation.getId());
        assertThat(preventiveTreatments.findByContact_Id(contact.getId())).extracting(PreventiveTreatment::getId).containsExactly(tpt.getId());
    }

    @Test
    void userPatientLinkAndExternalIdentityRemainSeparateFromPatientPrimaryKey() {
        Patient patient = patient("Patient A");
        User user = new User();
        user.setEmail("patient@example.test");
        user.setPasswordHash("test-hash");
        em.persist(user);
        PatientUserLink link = new PatientUserLink();
        link.setPatient(patient);
        link.setUser(user);
        em.persist(link);
        ExternalSystem externalSystem = new ExternalSystem();
        externalSystem.setCode("TEST_SOURCE");
        externalSystem.setName("Integration test source");
        em.persist(externalSystem);
        ExternalIdentifier externalId = new ExternalIdentifier();
        externalId.setExternalSystem(externalSystem);
        externalId.setEntityType("PATIENT");
        externalId.setEntityId(patient.getId());
        externalId.setExternalId("source-patient-123");
        em.persist(externalId);
        flushAndClear();

        assertThat(patientLinks.findByPatient_Id(patient.getId())).extracting(PatientUserLink::getId).containsExactly(link.getId());
        assertThat(patientLinks.findByUser_Id(user.getId()).getFirst().getPatient().getId()).isEqualTo(patient.getId());
        assertThat(externalIdentifiers.findByExternalSystem_IdAndEntityTypeAndExternalId(
                externalSystem.getId(), "PATIENT", "source-patient-123").orElseThrow().getEntityId()).isEqualTo(patient.getId());
        assertThat(externalId.getExternalId()).isNotEqualTo(patient.getId().toString());
    }

    @Test
    void compositeKeysAndPostgresSpecificColumnsRoundTrip() throws Exception {
        Facility facility = facility("Puskesmas A");
        User user = new User();
        user.setEmail("Case.Mixed@Example.Test");
        user.setPasswordHash("test-hash");
        em.persist(user);
        Role role = new Role();
        role.setCode("TEST_ROLE");
        role.setName("Test role");
        em.persist(role);
        Permission permission = new Permission();
        permission.setCode("TEST_READ");
        permission.setName("Test read");
        em.persist(permission);

        UserRole userRole = new UserRole();
        userRole.setUserId(user.getId());
        userRole.setRoleId(role.getId());
        em.persist(userRole);
        RolePermission rolePermission = new RolePermission();
        rolePermission.setRoleId(role.getId());
        rolePermission.setPermissionId(permission.getId());
        em.persist(rolePermission);
        UserFacility userFacility = new UserFacility();
        userFacility.setUserId(user.getId());
        userFacility.setFacilityId(facility.getId());
        userFacility.setIsPrimary(true);
        em.persist(userFacility);

        Regimen regimen = new Regimen();
        regimen.setCode("TEST_REGIMEN");
        regimen.setName("Test regimen");
        regimen.setRegimenKind("TB_TREATMENT");
        em.persist(regimen);
        Drug drug = new Drug();
        drug.setCode("TEST_DRUG");
        drug.setName("Test drug");
        em.persist(drug);
        RegimenDrug regimenDrug = new RegimenDrug();
        regimenDrug.setRegimenId(regimen.getId());
        regimenDrug.setDrugId(drug.getId());
        regimenDrug.setSequenceNo(1);
        em.persist(regimenDrug);

        UserSession session = new UserSession();
        session.setUser(user);
        session.setTokenHash("test-token-hash");
        session.setExpiresAt(OffsetDateTime.now().plusDays(1));
        session.setIpAddress(InetAddress.getByName("127.0.0.1"));
        em.persist(session);
        ExternalSystem source = new ExternalSystem();
        source.setCode("TEST_SOURCE");
        source.setName("Integration test source");
        em.persist(source);
        SyncRun run = new SyncRun();
        run.setExternalSystem(source);
        em.persist(run);
        SyncItem item = new SyncItem();
        item.setSyncRun(run);
        item.setEntityType("PATIENT");
        item.setExternalId("external-123");
        item.setOperation("UPSERT");
        item.setStatus("SUCCEEDED");
        item.setRawPayload(Map.of("source", "test", "revision", 2));
        em.persist(item);
        AuditLog audit = new AuditLog();
        audit.setActorUser(user);
        audit.setAction("TEST_ACTION");
        audit.setEntityType("PATIENT");
        audit.setMetadata(Map.of("source", "test"));
        em.persist(audit);
        flushAndClear();

        UserRole.Key userRoleKey = new UserRole.Key();
        userRoleKey.userId = user.getId();
        userRoleKey.roleId = role.getId();
        assertThat(em.find(UserRole.class, userRoleKey).getRole().getCode()).isEqualTo("TEST_ROLE");
        RolePermission.Key rolePermissionKey = new RolePermission.Key();
        rolePermissionKey.roleId = role.getId();
        rolePermissionKey.permissionId = permission.getId();
        assertThat(em.find(RolePermission.class, rolePermissionKey).getPermission().getCode()).isEqualTo("TEST_READ");
        UserFacility.Key userFacilityKey = new UserFacility.Key();
        userFacilityKey.userId = user.getId();
        userFacilityKey.facilityId = facility.getId();
        assertThat(em.find(UserFacility.class, userFacilityKey).getFacility().getName()).isEqualTo("Puskesmas A");
        RegimenDrug.Key regimenDrugKey = new RegimenDrug.Key();
        regimenDrugKey.regimenId = regimen.getId();
        regimenDrugKey.drugId = drug.getId();
        regimenDrugKey.sequenceNo = 1;
        assertThat(em.find(RegimenDrug.class, regimenDrugKey).getDrug().getName()).isEqualTo("Test drug");
        assertThat(em.find(UserSession.class, session.getId()).getIpAddress().getHostAddress()).isEqualTo("127.0.0.1");
        assertThat(em.find(SyncItem.class, item.getId()).getRawPayload()).containsEntry("source", "test");
        assertThat(em.find(AuditLog.class, audit.getId()).getMetadata()).containsEntry("source", "test");
        assertThat(jdbc.queryForObject("select count(*) from users where email = 'case.mixed@example.test'", Integer.class)).isEqualTo(1);
    }

    private Facility facility(String name) {
        Facility facility = new Facility();
        facility.setName(name);
        facility.setFacilityTypeCode("PUSKESMAS");
        em.persist(facility);
        return facility;
    }

    private Patient patient(String name) {
        Patient patient = new Patient();
        patient.setFullName(name);
        patient.setSexCode("LAKI_LAKI");
        em.persist(patient);
        return patient;
    }

    private TBRegistration registration(Patient patient, Facility facility, LocalDate date) {
        TBRegistration registration = new TBRegistration();
        registration.setPatient(patient);
        registration.setFacility(facility);
        registration.setRegistrationDate(date);
        registration.setSuspectTypeCode("TB_SO");
        em.persist(registration);
        return registration;
    }

    private Diagnosis diagnosis(TBRegistration registration) {
        Diagnosis diagnosis = new Diagnosis();
        diagnosis.setRegistration(registration);
        diagnosis.setDiagnosisDate(registration.getRegistrationDate().plusDays(1));
        diagnosis.setDiagnosisTypeCode("BAKTERIOLOGIS");
        em.persist(diagnosis);
        return diagnosis;
    }

    private TBCase tbCase(TBRegistration registration, Diagnosis diagnosis, Facility facility) {
        TBCase tbCase = new TBCase();
        tbCase.setRegistration(registration);
        tbCase.setConfirmingDiagnosis(diagnosis);
        tbCase.setCurrentFacility(facility);
        tbCase.setCaseCategoryCode("TB_SO");
        em.persist(tbCase);
        return tbCase;
    }

    private LabRequestTest requestedTest(LabRequest request, String code) {
        LabRequestTest test = new LabRequestTest();
        test.setLabRequest(request);
        test.setTestTypeCode(code);
        em.persist(test);
        return test;
    }

    private LabResult result(LabRequestTest test, LabSpecimen specimen, int sequence, String value) {
        LabResult result = new LabResult();
        result.setLabRequestTest(test);
        result.setSpecimen(specimen);
        result.setSequenceNo(sequence);
        result.setResultValue(value);
        em.persist(result);
        return result;
    }

    private void flushAndClear() {
        em.flush();
        em.clear();
    }
}
