package id.tbcall.persistence;

import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.OptimisticLockException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers
@Transactional
class RuntimePersistenceIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired EntityManager em;
    @Autowired EntityManagerFactory emf;
    @Autowired JdbcTemplate jdbc;

    private static final LocalDate START = LocalDate.of(2026, 1, 1);
    private static final OffsetDateTime SCHEDULED = OffsetDateTime.parse("2026-01-02T08:00:00+07:00");

    // Independent, approved v1.2 scope, including entities that have no deterministic business defaults.
    private static final Map<Class<?>, String> VERSIONED = Map.ofEntries(
            Map.entry(Facility.class, "facilities"), Map.entry(User.class, "users"),
            Map.entry(Patient.class, "patients"), Map.entry(PatientUserLink.class, "patient_user_links"),
            Map.entry(TBRegistration.class, "tb_registrations"), Map.entry(Diagnosis.class, "diagnoses"),
            Map.entry(TBCase.class, "tb_cases"), Map.entry(LabRequest.class, "lab_requests"),
            Map.entry(LabRequestTest.class, "lab_request_tests"), Map.entry(LabSpecimen.class, "lab_specimens"),
            Map.entry(LabResult.class, "lab_results"), Map.entry(Treatment.class, "treatments"),
            Map.entry(TreatmentDrug.class, "treatment_drugs"), Map.entry(DoseEvent.class, "dose_events"),
            Map.entry(FollowUp.class, "follow_ups"), Map.entry(TreatmentOutcome.class, "treatment_outcomes"),
            Map.entry(PatientSupporter.class, "patient_supporters"), Map.entry(Referral.class, "referrals"),
            Map.entry(Contact.class, "contacts"), Map.entry(ContactInvestigation.class, "contact_investigations"),
            Map.entry(PreventiveTreatment.class, "preventive_treatments"), Map.entry(AdverseEvent.class, "adverse_events"),
            Map.entry(MonitoringPlan.class, "monitoring_plans"), Map.entry(MonitoringEvent.class, "monitoring_events"),
            Map.entry(Alert.class, "alerts"), Map.entry(Notification.class, "notifications"));

    @Test
    void versionColumnsAndJpaVersionsCoverExactlyTheApprovedTables() {
        assertThat(jdbc.queryForList("""
                select table_name from information_schema.columns
                where table_schema='public' and column_name='version' and table_name<>'flyway_schema_history'
                """, String.class)).containsExactlyInAnyOrderElementsOf(VERSIONED.values());
        assertThat(jdbc.queryForObject("""
                select count(*) from information_schema.columns where table_schema='public'
                and column_name='version' and data_type='bigint' and is_nullable='NO' and column_default='0'
                """, Integer.class)).isEqualTo(26);
        Map<Class<?>, Object> fixtures = fixtures();
        em.flush();
        for (var entry : VERSIONED.entrySet()) {
            Class<?> type = entry.getKey();
            Object fixture = fixtures.get(type);
            assertThat(emf.getMetamodel().entity(type).getVersion(long.class).getName()).isEqualTo("version");
            assertThat(property(fixture, "version")).isEqualTo(0L);
            UUID id = (UUID) emf.getPersistenceUnitUtil().getIdentifier(fixture);
            assertThat(jdbc.queryForObject("select version from " + entry.getValue() + " where id=?", Long.class, id))
                    .isZero();
        }
        assertThat(emf.getMetamodel().getEntities().stream().filter(e -> e.hasSingleIdAttribute())
                .filter(e -> ((jakarta.persistence.metamodel.IdentifiableType<?>) e).hasVersionAttribute()).count()).isEqualTo(26);
    }

    @Test
    void deterministicDefaultsAreAvailableBeforeReloadAndMatchDatabaseState() throws Exception {
        Map<Class<?>, Map<String, Object>> expected = defaults();
        for (var entry : expected.entrySet()) {
            Object newEntity = entry.getKey().getConstructor().newInstance();
            entry.getValue().forEach((field, value) -> assertThat(property(newEntity, field))
                    .as(entry.getKey().getSimpleName() + "." + field + " before persist").isEqualTo(value));
        }
        Map<Class<?>, Object> fixtures = fixtures();
        expected.forEach((type, values) -> values.forEach((field, value) ->
                assertThat(property(fixtures.get(type), field)).as(type.getSimpleName() + "." + field).isEqualTo(value)));
        em.flush();
        Map<Class<?>, Object> ids = new LinkedHashMap<>();
        fixtures.forEach((type, entity) -> ids.put(type, emf.getPersistenceUnitUtil().getIdentifier(entity)));
        em.clear();
        expected.forEach((type, values) -> {
            Object reloaded = em.find(type, ids.get(type));
            values.forEach((field, value) -> assertThat(property(reloaded, field))
                    .as(type.getSimpleName() + "." + field + " after reload").isEqualTo(value));
        });
    }

    @Test
    @SuppressWarnings("unchecked")
    void mapDefaultsAreMutableAndNotSharedBetweenInstances() throws Exception {
        for (var entry : Map.of(MonitoringEvent.class, "metadata", Alert.class, "details",
                Notification.class, "payload", AuditLog.class, "metadata").entrySet()) {
            Object first = entry.getKey().getConstructor().newInstance();
            Object second = entry.getKey().getConstructor().newInstance();
            Map<String, Object> firstMap = (Map<String, Object>) property(first, entry.getValue());
            Map<String, Object> secondMap = (Map<String, Object>) property(second, entry.getValue());
            assertThat(firstMap).isNotNull().isEmpty();
            firstMap.put("test", "Uji");
            assertThat(firstMap).containsEntry("test", "Uji");
            assertThat(secondMap).isNotSameAs(firstMap).isEmpty();
        }
    }

    @Test
    void tbSoDescriptionUsesTheApprovedProgramClassificationWording() {
        assertThat(jdbc.queryForObject("select description from drug_resistance_patterns where code='TB_SO'", String.class))
                .isEqualTo("TBC Sensitif Obat sesuai klasifikasi program; interpretasi rinci mengikuti hasil uji kepekaan dan pedoman nasional.");
    }

    @Test
    void timestampsRemainDatabaseOwnedWhileJavaDefaultsAreImmediate() {
        Facility facility = new Facility();
        facility.setName("Fasyankes uji");
        assertThat(facility.getActive()).isTrue();
        assertThat(facility.getCreatedAt()).isNull();
        assertThat(facility.getUpdatedAt()).isNull();
        em.persist(facility);
        em.flush();
        em.refresh(facility);
        OffsetDateTime created = facility.getCreatedAt();
        assertThat(created).isNotNull();
        assertThat(facility.getUpdatedAt()).isNotNull();
        facility.setCreatedAt(SCHEDULED.minusYears(20));
        facility.setUpdatedAt(SCHEDULED.minusYears(20));
        facility.setName("Fasyankes diperbarui");
        em.flush();
        em.refresh(facility);
        assertThat(facility.getCreatedAt()).isEqualTo(created);
        assertThat(facility.getUpdatedAt()).isNotEqualTo(SCHEDULED.minusYears(20));
        assertThat(property(facility, "version")).isEqualTo(1L);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Patient", "TBCase", "Treatment"})
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void staleWritesFailAcrossSeparateTransactionsAndTheWinnerIncrementsVersion(String entityName) {
        Seed seed = seed();
        Class<?> type = switch (entityName) {
            case "Patient" -> Patient.class;
            case "TBCase" -> TBCase.class;
            case "Treatment" -> Treatment.class;
            default -> throw new IllegalArgumentException(entityName);
        };
        UUID id = switch (entityName) {
            case "Patient" -> seed.patient;
            case "TBCase" -> seed.tbCase;
            default -> seed.treatment;
        };
        EntityManager winner = emf.createEntityManager();
        EntityManager stale = emf.createEntityManager();
        try {
            winner.getTransaction().begin();
            stale.getTransaction().begin();
            assertThat(winner.createNativeQuery("show transaction_isolation", String.class).getSingleResult()).isEqualTo("read committed");
            assertThat(stale.createNativeQuery("show transaction_isolation", String.class).getSingleResult()).isEqualTo("read committed");
            assertThat(winner.createNativeQuery("select pg_backend_pid()", Integer.class).getSingleResult())
                    .isNotEqualTo(stale.createNativeQuery("select pg_backend_pid()", Integer.class).getSingleResult());
            Object winningRecord = winner.find(type, id);
            Object staleRecord = stale.find(type, id);
            assertThat(winningRecord).isNotSameAs(staleRecord);
            assertThat(property(winningRecord, "version")).isEqualTo(0L);
            assertThat(property(staleRecord, "version")).isEqualTo(0L);
            change(winningRecord, "WINNER");
            winner.getTransaction().commit();
            assertThat(property(winningRecord, "version")).isEqualTo(1L);
            change(staleRecord, "STALE");
            assertThatThrownBy(stale::flush).isInstanceOf(OptimisticLockException.class);
            stale.getTransaction().rollback();
            try (EntityManager verification = emf.createEntityManager()) {
                verification.getTransaction().begin();
                Object saved = verification.find(type, id);
                assertThat(property(saved, "version")).isEqualTo(1L);
                assertThat(marker(saved)).isEqualTo("WINNER");
                verification.getTransaction().commit();
            }
        } finally {
            if (winner.getTransaction().isActive()) winner.getTransaction().rollback();
            if (stale.getTransaction().isActive()) stale.getTransaction().rollback();
            winner.close();
            stale.close();
            removeSeed(seed);
        }
    }

    private void change(Object entity, String value) {
        if (entity instanceof Patient patient) patient.setFullName(value);
        else if (entity instanceof TBCase tbCase) tbCase.setIcd10Code(value);
        else if (entity instanceof Treatment treatment) treatment.setNotes(value);
        else throw new IllegalArgumentException(entity.getClass().getName());
    }

    private String marker(Object entity) {
        if (entity instanceof Patient patient) return patient.getFullName();
        if (entity instanceof TBCase tbCase) return tbCase.getIcd10Code();
        return ((Treatment) entity).getNotes();
    }

    private Seed seed() {
        try (EntityManager seeding = emf.createEntityManager()) {
            seeding.getTransaction().begin();
            Facility facility = new Facility(); facility.setName("Fasyankes uji konkurensi"); seeding.persist(facility);
            Patient patient = new Patient(); patient.setFullName("Pasien uji konkurensi"); seeding.persist(patient);
            TBRegistration registration = new TBRegistration(); registration.setPatient(patient); registration.setFacility(facility);
            registration.setRegistrationDate(START); seeding.persist(registration);
            Diagnosis diagnosis = new Diagnosis(); diagnosis.setRegistration(registration); diagnosis.setDiagnosisDate(START); seeding.persist(diagnosis);
            TBCase tbCase = new TBCase(); tbCase.setRegistration(registration); tbCase.setConfirmingDiagnosis(diagnosis);
            tbCase.setCurrentFacility(facility); seeding.persist(tbCase);
            Treatment treatment = new Treatment(); treatment.setTbCase(tbCase); treatment.setFacility(facility);
            treatment.setStartDate(START); seeding.persist(treatment);
            seeding.getTransaction().commit();
            return new Seed(facility.getId(), patient.getId(), registration.getId(), diagnosis.getId(), tbCase.getId(), treatment.getId());
        }
    }

    private void removeSeed(Seed seed) {
        try (EntityManager cleanup = emf.createEntityManager()) {
            cleanup.getTransaction().begin();
            cleanup.remove(cleanup.find(Treatment.class, seed.treatment));
            cleanup.remove(cleanup.find(TBCase.class, seed.tbCase));
            cleanup.remove(cleanup.find(Diagnosis.class, seed.diagnosis));
            cleanup.remove(cleanup.find(TBRegistration.class, seed.registration));
            cleanup.remove(cleanup.find(Patient.class, seed.patient));
            cleanup.remove(cleanup.find(Facility.class, seed.facility));
            cleanup.getTransaction().commit();
        }
    }

    private record Seed(UUID facility, UUID patient, UUID registration, UUID diagnosis, UUID tbCase, UUID treatment) {}

    private Object property(Object entity, String field) {
        try {
            String getter = "get" + Character.toUpperCase(field.charAt(0)) + field.substring(1);
            return entity.getClass().getMethod(getter).invoke(entity);
        } catch (ReflectiveOperationException error) {
            throw new AssertionError(entity.getClass().getSimpleName() + "." + field, error);
        }
    }

    private Map<Class<?>, Map<String, Object>> defaults() {
        Map<Class<?>, Map<String, Object>> expected = new LinkedHashMap<>();
        for (Class<?> type : List.of(FacilityType.class, SexCode.class, TBSuspectType.class, AnatomicalSite.class,
                DiagnosisType.class, PreviousTreatmentCategory.class, HivStatus.class, DmStatus.class, PregnancyStatus.class,
                BcgStatus.class, TBCaseCategory.class, LabTestType.class, LabRequestReason.class, TreatmentOutcomeCode.class,
                Facility.class, Regimen.class, Drug.class, PatientSupporter.class, ExternalSystem.class,
                DrugResistancePattern.class, AdditionalConditionType.class)) expected.put(type, Map.of("active", true));
        expected.put(Role.class, Map.of("systemRole", false));
        expected.put(UserFacility.class, Map.of("isPrimary", false, "active", true));
        expected.put(Patient.class, Map.of("birthDateUnknown", false));
        expected.put(User.class, Map.of("status", "PENDING"));
        expected.put(PatientUserLink.class, Map.of("relationshipType", "SELF", "verificationStatus", "PENDING"));
        expected.put(TBRegistration.class, Map.of("status", "OPEN"));
        expected.put(TBCase.class, Map.of("status", "ACTIVE"));
        expected.put(LabRequest.class, Map.of("status", "REQUESTED"));
        expected.put(LabRequestTest.class, Map.of("status", "REQUESTED"));
        expected.put(LabResult.class, Map.of("sequenceNo", 1, "status", "FINAL"));
        expected.put(RegimenDrug.class, Map.of("sequenceNo", 1));
        expected.put(Treatment.class, Map.of("status", "ACTIVE"));
        expected.put(DoseEvent.class, Map.of("source", "TBCALL"));
        expected.put(FollowUp.class, Map.of("status", "SCHEDULED"));
        expected.put(Referral.class, Map.of("status", "SENT"));
        expected.put(ContactInvestigation.class, Map.of("status", "NEW"));
        expected.put(PreventiveTreatment.class, Map.of("status", "ACTIVE"));
        expected.put(AdverseEvent.class, Map.of("serious", false));
        expected.put(MonitoringPlan.class, Map.of("status", "ACTIVE"));
        expected.put(MonitoringEvent.class, Map.of("status", "SCHEDULED", "metadata", Map.of()));
        expected.put(Alert.class, Map.of("severity", "INFO", "status", "OPEN", "details", Map.of()));
        expected.put(Notification.class, Map.of("status", "PENDING", "payload", Map.of()));
        expected.put(AuditLog.class, Map.of("metadata", Map.of()));
        expected.put(SyncRun.class, Map.of("direction", "INBOUND", "status", "RUNNING", "recordsReceived", 0,
                "recordsCreated", 0, "recordsUpdated", 0, "recordsFailed", 0));
        return expected;
    }

    // One real JPA graph covers every specified default and every versioned entity.
    // Required business timestamps are explicit fixtures; generated audit timestamps are untouched.
    private Map<Class<?>, Object> fixtures() {
        Map<Class<?>, Object> rows = new LinkedHashMap<>();
        for (Class<?> type : List.of(FacilityType.class, SexCode.class, TBSuspectType.class, AnatomicalSite.class,
                DiagnosisType.class, PreviousTreatmentCategory.class, HivStatus.class, DmStatus.class, PregnancyStatus.class,
                BcgStatus.class, TBCaseCategory.class, LabTestType.class, LabRequestReason.class, TreatmentOutcomeCode.class,
                DrugResistancePattern.class, AdditionalConditionType.class)) {
            try {
                Object reference = type.getConstructor().newInstance();
                type.getMethod("setCode", String.class).invoke(reference, "TEST");
                type.getMethod("setName", String.class).invoke(reference, "Referensi uji");
                persist(rows, reference);
            } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
        }
        Facility facility = new Facility(); facility.setName("Fasyankes A"); persist(rows, facility);
        Facility destination = new Facility(); destination.setName("Fasyankes B"); em.persist(destination);
        User user = new User(); user.setPhone("080000000001"); user.setPasswordHash("test-hash"); persist(rows, user);
        Role role = new Role(); role.setCode("TEST"); role.setName("Peran uji"); persist(rows, role);
        UserFacility userFacility = new UserFacility(); userFacility.setUserId(user.getId()); userFacility.setFacilityId(facility.getId()); persist(rows, userFacility);
        Patient patient = new Patient(); patient.setFullName("Pasien uji"); persist(rows, patient);
        PatientUserLink link = new PatientUserLink(); link.setPatient(patient); link.setUser(user); persist(rows, link);
        TBRegistration registration = new TBRegistration(); registration.setPatient(patient); registration.setFacility(facility);
        registration.setRegistrationDate(START); persist(rows, registration);
        Diagnosis diagnosis = new Diagnosis(); diagnosis.setRegistration(registration); diagnosis.setDiagnosisDate(START); persist(rows, diagnosis);
        TBCase tbCase = new TBCase(); tbCase.setRegistration(registration); tbCase.setConfirmingDiagnosis(diagnosis);
        tbCase.setCurrentFacility(facility); persist(rows, tbCase);
        LabRequest request = new LabRequest(); request.setTbCase(tbCase); request.setRequestingFacility(facility);
        request.setTestingFacility(facility); request.setReferralType("INTERNAL"); request.setRequestedAt(SCHEDULED); persist(rows, request);
        LabRequestTest test = new LabRequestTest(); test.setLabRequest(request); test.setTestTypeCode("TCM"); persist(rows, test);
        LabSpecimen specimen = new LabSpecimen(); specimen.setLabRequest(request); persist(rows, specimen);
        LabResult result = new LabResult(); result.setLabRequestTest(test); result.setSpecimen(specimen); persist(rows, result);
        Regimen regimen = new Regimen(); regimen.setCode("TEST"); regimen.setName("Paduan uji"); regimen.setRegimenKind("TB_TREATMENT"); persist(rows, regimen);
        Drug drug = new Drug(); drug.setCode("TEST"); drug.setName("Obat uji"); persist(rows, drug);
        RegimenDrug regimenDrug = new RegimenDrug(); regimenDrug.setRegimenId(regimen.getId()); regimenDrug.setDrugId(drug.getId()); persist(rows, regimenDrug);
        Treatment treatment = new Treatment(); treatment.setTbCase(tbCase); treatment.setFacility(facility); treatment.setStartDate(START); persist(rows, treatment);
        TreatmentDrug treatmentDrug = new TreatmentDrug(); treatmentDrug.setTreatment(treatment); treatmentDrug.setDrug(drug); persist(rows, treatmentDrug);
        DoseEvent dose = new DoseEvent(); dose.setTreatment(treatment); dose.setScheduledDate(START); dose.setStatus("TAKEN_OBSERVED"); persist(rows, dose);
        FollowUp followUp = new FollowUp(); followUp.setTreatment(treatment); followUp.setFollowUpType("CLINICAL"); followUp.setScheduledAt(SCHEDULED); persist(rows, followUp);
        TreatmentOutcome outcome = new TreatmentOutcome(); outcome.setTreatment(treatment); outcome.setOutcomeCode("SEMBUH"); outcome.setOutcomeDate(START); persist(rows, outcome);
        PatientSupporter supporter = new PatientSupporter(); supporter.setTbCase(tbCase); supporter.setSupporterType("PMO"); supporter.setFullName("PMO uji"); persist(rows, supporter);
        Referral referral = new Referral(); referral.setTbCase(tbCase); referral.setTreatment(treatment); referral.setReferralType("TREATMENT_TRANSFER");
        referral.setSourceFacility(facility); referral.setDestinationFacility(destination); referral.setSentAt(SCHEDULED); persist(rows, referral);
        Contact contact = new Contact(); contact.setIndexCase(tbCase); contact.setFullName("Kontak uji"); persist(rows, contact);
        ContactInvestigation investigation = new ContactInvestigation(); investigation.setContact(contact); investigation.setWorkflowType("INTERNAL"); persist(rows, investigation);
        PreventiveTreatment tpt = new PreventiveTreatment(); tpt.setContact(contact); tpt.setIndexCase(tbCase); tpt.setFacility(facility); tpt.setStartDate(START); persist(rows, tpt);
        AdverseEvent adverseEvent = new AdverseEvent(); adverseEvent.setTreatment(treatment); adverseEvent.setEventType("Uji"); persist(rows, adverseEvent);
        MonitoringPlan plan = new MonitoringPlan(); plan.setTreatment(treatment); plan.setStartDate(START); persist(rows, plan);
        MonitoringEvent event = new MonitoringEvent(); event.setMonitoringPlan(plan); event.setEventType("TEST"); event.setScheduledAt(SCHEDULED); persist(rows, event);
        Alert alert = new Alert(); alert.setPatient(patient); alert.setTbCase(tbCase); alert.setTreatment(treatment); alert.setAlertType("TEST"); alert.setMessage("Uji"); persist(rows, alert);
        Notification notification = new Notification(); notification.setUser(user); notification.setAlert(alert); notification.setChannel("IN_APP"); persist(rows, notification);
        AuditLog audit = new AuditLog(); audit.setAction("TEST"); audit.setEntityType("PATIENT"); persist(rows, audit);
        ExternalSystem external = new ExternalSystem(); external.setCode("TEST"); external.setName("Sumber uji"); persist(rows, external);
        SyncRun sync = new SyncRun(); sync.setExternalSystem(external); persist(rows, sync);
        return rows;
    }

    private void persist(Map<Class<?>, Object> rows, Object entity) {
        rows.put(entity.getClass(), entity);
        em.persist(entity);
    }
}
