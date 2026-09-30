package id.tbcall.persistence;

import java.sql.Savepoint;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers
@Transactional
class SchemaHardeningIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired JdbcTemplate jdbc;

    @Test
    void currentReferenceCatalogRetainsInactiveLegacyRows() {
        assertThat(codes("treatment_outcome_codes", "active"))
                .containsExactlyInAnyOrder("GAGAL", "MENINGGAL", "PUTUS_BEROBAT", "SEMBUH",
                        "PENGOBATAN_LENGKAP", "TIDAK_DAPAT_DIEVALUASI");
        assertThat(jdbc.queryForObject("select name from treatment_outcome_codes where code='GAGAL'", String.class))
                .isEqualTo("Gagal Pengobatan");
        assertThat(codes("previous_treatment_categories", "not active"))
                .containsExactlyInAnyOrder("SETELAH_GAGAL_KAT_1", "SETELAH_GAGAL_KAT_2",
                        "SETELAH_PUTUS_BEROBAT", "HASIL_SEBELUMNYA_TIDAK_DIKETAHUI",
                        "SETELAH_GAGAL_LINI_2", "LAIN_LAIN");
        assertThat(codes("previous_treatment_categories", "active"))
                .containsExactlyInAnyOrder("BARU", "KAMBUH", "RIWAYAT_PENGOBATAN_SEBELUMNYA", "TIDAK_DIKETAHUI");
        assertThat(codes("lab_test_types", "active"))
                .containsExactlyInAnyOrder("MIKROSKOPIS_BTA", "TCM", "BIAKAN", "UJI_KEPEKAAN",
                        "LPA_LINI_DUA", "LPA_LINI_SATU", "TCM_XDR", "RONTGEN_TORAKS", "HIV");
        assertThat(jdbc.queryForObject("select name from facility_types where code='PRAKTEK_DOKTER_MANDIRI'", String.class))
                .isEqualTo("Praktik dokter mandiri");
    }

    @Test
    void approvedClinicalCatalogsAreCompleteWithoutInventedCompositions() {
        assertThat(codes("drug_resistance_patterns", "active"))
                .containsExactlyInAnyOrder("TB_SO", "TB_HR", "TB_RR", "TB_MDR", "TB_PRE_XDR", "TB_XDR");
        assertThat(codes("additional_condition_types", "active"))
                .containsExactlyInAnyOrder("KURANG_GIZI", "MEROKOK", "TERPAPAR_ASAP_ROKOK",
                        "GANGGUAN_KESEHATAN_MENTAL", "HEPATITIS", "PENYAKIT_PERNAPASAN_KRONIS",
                        "GANGGUAN_GINJAL", "GANGGUAN_IMUNITAS_LAIN", "COVID_19");
        assertThat(codes("drugs", "active"))
                .containsExactlyInAnyOrder("H", "R", "Z", "E", "P", "MFX", "LFX", "BDQ", "PA",
                        "LZD", "CFZ", "CS", "TRD", "DLM", "ETO", "PTO", "PAS", "IPM_CLN", "MPM", "AMK", "S");
        assertThat(codes("regimens", "active"))
                .containsExactlyInAnyOrder("SO_6M_2HRZE_4HR", "SO_4M_2HPMZ_2HPM", "SO_CHILD_6M_2RHZ_4RH",
                        "SO_CHILD_6M_2RHZE_4RH", "SO_CHILD_12M_2RHZE_10RH", "SO_CHILD_4M_2RHZ_2RH",
                        "RO_HR_6RZE_LFX", "RO_BPALM", "RO_BPAL", "RO_9M_ETO", "RO_9M_LZD", "RO_LONG_INDIVIDUAL");
        assertThat(jdbc.queryForObject("select count(*) from regimen_drugs", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from drugs where strength is not null or dosage_form is not null", Integer.class))
                .isZero();
    }

    @Test
    void rbacGrantsExactlyTheApprovedResponsibilities() {
        Map<String, Set<String>> expected = Map.of(
                "PATIENT", Set.of("PATIENT_READ", "REGISTRATION_READ", "DIAGNOSIS_READ", "CASE_READ",
                        "LAB_REQUEST_READ", "LAB_RESULT_READ", "TREATMENT_READ", "ADHERENCE_READ", "ADHERENCE_RECORD",
                        "FOLLOW_UP_READ", "OUTCOME_READ", "TPT_READ", "ADVERSE_EVENT_READ", "REFERRAL_READ",
                        "MONITORING_READ", "ALERT_READ", "ALERT_ACKNOWLEDGE", "NOTIFICATION_READ_SELF", "REPORT_READ"),
                "TREATMENT_SUPPORTER", Set.of("PATIENT_READ", "CASE_READ", "TREATMENT_READ", "ADHERENCE_READ",
                        "ADHERENCE_RECORD", "MONITORING_READ", "ALERT_READ", "ALERT_ACKNOWLEDGE", "NOTIFICATION_READ_SELF"),
                "TB_OFFICER", Set.of("PATIENT_READ", "PATIENT_CREATE", "PATIENT_UPDATE", "REGISTRATION_READ",
                        "REGISTRATION_WRITE", "DIAGNOSIS_READ", "DIAGNOSIS_WRITE", "CASE_READ", "CASE_WRITE",
                        "LAB_REQUEST_READ", "LAB_REQUEST_WRITE", "LAB_RESULT_READ", "TREATMENT_READ", "TREATMENT_WRITE",
                        "ADHERENCE_READ", "ADHERENCE_RECORD", "FOLLOW_UP_READ", "FOLLOW_UP_WRITE", "OUTCOME_READ",
                        "OUTCOME_WRITE", "CONTACT_READ", "CONTACT_WRITE", "TPT_READ", "TPT_WRITE", "ADVERSE_EVENT_READ",
                        "ADVERSE_EVENT_WRITE", "REFERRAL_READ", "REFERRAL_WRITE", "MONITORING_READ", "MONITORING_MANAGE",
                        "ALERT_READ", "ALERT_ACKNOWLEDGE", "ALERT_RESOLVE", "NOTIFICATION_READ_SELF", "REPORT_READ",
                        "PATIENT_LINK_VERIFY", "SUPPORTER_LINK_MANAGE"),
                "LAB_STAFF", Set.of("PATIENT_READ", "CASE_READ", "LAB_REQUEST_READ", "LAB_RESULT_READ",
                        "LAB_RESULT_WRITE", "MONITORING_READ", "NOTIFICATION_READ_SELF", "REPORT_READ"),
                "FACILITY_ADMIN", Set.of("USER_MANAGE_FACILITY", "FACILITY_MANAGE", "AUDIT_READ", "REPORT_READ", "NOTIFICATION_READ_SELF"),
                "PROGRAM_MONITOR", Set.of("AUDIT_READ", "REPORT_READ", "NOTIFICATION_READ_SELF"),
                "SYSTEM_ADMIN", Set.of("USER_MANAGE_FACILITY", "FACILITY_MANAGE", "ROLE_MANAGE", "AUDIT_READ",
                        "REPORT_READ", "INTEGRATION_MANAGE", "NOTIFICATION_READ_SELF"));
        assertThat(codes("roles", "true")).containsExactlyInAnyOrderElementsOf(expected.keySet());
        expected.forEach((role, permissions) -> assertThat(jdbc.queryForList("""
                select p.code from role_permissions rp join roles r on r.id=rp.role_id
                join permissions p on p.id=rp.permission_id where r.code=?
                """, String.class, role)).containsExactlyInAnyOrderElementsOf(permissions));
        assertThat(codes("permissions", "true"))
                .containsExactlyInAnyOrderElementsOf(expected.values().stream().flatMap(Set::stream).collect(java.util.stream.Collectors.toSet()));
        assertThat(jdbc.queryForObject("select count(*) from roles where system_role", Integer.class)).isEqualTo(7);
    }

    @Test
    void historicalCategoryStillReferencesTheRetainedInactiveRow() {
        Fixture f = fixture();
        jdbc.update("update tb_cases set previous_treatment_category_code='SETELAH_GAGAL_KAT_1' where id=?", f.caseA);
        assertThat(jdbc.queryForObject("""
                select p.active from tb_cases c join previous_treatment_categories p
                on p.code=c.previous_treatment_category_code where c.id=?
                """, Boolean.class, f.caseA)).isFalse();
    }

    @Test
    void observationDefaultsAndTimestampOwnershipRemainInTheDatabase() {
        Fixture f = fixture();
        UUID id = insert("""
                insert into case_condition_observations(case_id,condition_type_code,status_code,observed_at)
                values (?,'MEROKOK','UNKNOWN',now()) returning id
                """, f.caseA);
        jdbc.update("update case_condition_observations set updated_at='2000-01-01',notes='Catatan baru' where id=?", id);
        assertThat(jdbc.queryForObject("select updated_at=now() from case_condition_observations where id=?", Boolean.class, id)).isTrue();
        assertThat(jdbc.queryForObject("select created_at=now() from case_condition_observations where id=?", Boolean.class, id)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"status", "condition", "hiv", "resistance"})
    void observationAndResistanceCodesAreEnforcedByTheDatabase(String field) {
        Fixture f = fixture();
        switch (field) {
            case "status" -> reject("23514", "insert into case_condition_observations(case_id,condition_type_code,status_code,observed_at) values (?,'MEROKOK','INVALID',now())", f.caseA);
            case "condition" -> reject("23503", "insert into case_condition_observations(case_id,condition_type_code,status_code,observed_at) values (?,'INVALID','PRESENT',now())", f.caseA);
            case "hiv" -> reject("23503", "insert into case_condition_observations(case_id,condition_type_code,status_code,observed_at) values (?,'HIV','PRESENT',now())", f.caseA);
            case "resistance" -> reject("23503", "update tb_cases set drug_resistance_pattern_code='INVALID' where id=?", f.caseA);
            default -> throw new IllegalArgumentException(field);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"diagnosis", "specimen", "referral", "tpt", "alert", "outcome"})
    void validLineageIsAccepted(String invariant) {
        Fixture f = fixture();
        assertThat(jdbc.update(childInsert(invariant), childArguments(invariant, false, f))).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"diagnosis", "specimen", "referral", "tpt", "alert", "outcome"})
    void invalidLineageIsRejectedAtTheDatabase(String invariant) {
        Fixture f = fixture();
        reject(invariant.equals("diagnosis") ? "23503" : "23514",
                childInsert(invariant), childArguments(invariant, true, f));
    }

    @ParameterizedTest
    @ValueSource(strings = {"diagnosis", "specimen", "referral", "tpt", "alert", "outcome"})
    void updatingAnAcceptedChildCannotBreakLineage(String invariant) {
        Fixture f = fixture();
        UUID child = insert(childInsert(invariant) + " returning id", childArguments(invariant, false, f));
        switch (invariant) {
            case "diagnosis" -> reject("23503", "update tb_cases set registration_id=? where id=?", f.registrationB, child);
            case "specimen" -> reject("23514", "update lab_results set specimen_id=? where id=?", f.specimenB, child);
            case "referral" -> reject("23514", "update referrals set case_id=? where id=?", f.caseB, child);
            case "tpt" -> reject("23514", "update preventive_treatments set index_case_id=? where id=?", f.caseB, child);
            case "alert" -> reject("23514", "update alerts set patient_id=? where id=?", f.patientB, child);
            case "outcome" -> reject("23514", "update treatment_outcomes set outcome_date='2025-12-31' where id=?", child);
            default -> throw new IllegalArgumentException(invariant);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"diagnosis", "specimen", "test", "referral", "tpt", "alertCase", "alertRegistration", "alertTreatment", "outcome"})
    void updatingAParentCannotInvalidateExistingChildren(String invariant) {
        Fixture f = fixture();
        String child = switch (invariant) {
            case "test" -> "specimen";
            case "alertCase", "alertRegistration", "alertTreatment" -> "alert";
            default -> invariant;
        };
        jdbc.update(childInsert(child), childArguments(child, false, f));
        switch (invariant) {
            case "diagnosis" -> reject("23503", "update diagnoses set registration_id=? where id=?", f.registrationB, f.diagnosisA);
            case "specimen" -> reject("23514", "update lab_specimens set lab_request_id=? where id=?", f.requestB, f.specimenA);
            case "test" -> reject("23514", "update lab_request_tests set lab_request_id=? where id=?", f.requestB, f.testA);
            case "referral", "alertTreatment" -> reject("23514", "update treatments set case_id=? where id=?", f.caseB, f.treatmentA);
            case "tpt" -> reject("23514", "update contacts set index_case_id=? where id=?", f.caseB, f.contactA);
            case "alertCase" -> {
                UUID otherRegistration = registration(f.patientB, f.facilityA);
                reject("23514", "update tb_cases set registration_id=?, confirming_diagnosis_id=null where id=?", otherRegistration, f.caseA);
            }
            case "alertRegistration" -> reject("23514", "update tb_registrations set patient_id=? where id=?", f.patientB, f.caseRegistrationA);
            case "outcome" -> reject("23514", "update treatments set start_date='2026-02-01' where id=?", f.treatmentA);
            default -> throw new IllegalArgumentException(invariant);
        }
    }

    @Test
    void nullableLineageLinksRemainOptionalAndAlertTreatmentStillChecksPatient() {
        Fixture f = fixture();
        jdbc.update("insert into alerts(patient_id,treatment_id,alert_type,message) values (?,?,'TEST','Uji')", f.patientA, f.treatmentA);
        reject("23514", "insert into alerts(patient_id,treatment_id,alert_type,message) values (?,?,'TEST','Uji')", f.patientB, f.treatmentA);
        reject("23514", "insert into alerts(patient_id,case_id,alert_type,message) values (?,?,'TEST','Uji')", f.patientB, f.caseA);
        // Same patient, different case is also invalid when both case and treatment are supplied.
        UUID samePatientRegistration = registration(f.patientA, f.facilityA);
        UUID samePatientCase = tbCase(samePatientRegistration, f.facilityA);
        reject("23514", "insert into alerts(patient_id,case_id,treatment_id,alert_type,message) values (?,?,?,'TEST','Uji')",
                f.patientA, samePatientCase, f.treatmentA);
        jdbc.update("insert into alerts(patient_id,alert_type,message) values (?,'TEST','Uji')", f.patientA);
        jdbc.update("insert into lab_results(lab_request_test_id) values (?)", f.testA);
        jdbc.update("insert into preventive_treatments(contact_id,facility_id,start_date) values (?,?,'2026-01-01')", f.contactA, f.facilityA);
        jdbc.update("insert into preventive_treatments(patient_id,index_case_id,facility_id,start_date) values (?,?,?,'2026-01-01')",
                f.patientB, f.caseA, f.facilityA);
        jdbc.update("insert into referrals(case_id,referral_type,source_facility_id,destination_facility_id,sent_at) values (?,'PRE_TREATMENT_REFERRAL',?,?,now())",
                f.caseA, f.facilityA, f.facilityB);
    }

    private List<String> codes(String table, String predicate) {
        return jdbc.queryForList("select code from " + table + " where " + predicate, String.class);
    }

    // Savepoints let each rejected SQL statement be tested without leaving the test transaction aborted.
    private void reject(String sqlState, String sql, Object... args) {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            Savepoint savepoint = connection.setSavepoint();
            try (var statement = connection.prepareStatement(sql)) {
                for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]);
                assertThatThrownBy(statement::executeUpdate).isInstanceOf(java.sql.SQLException.class)
                        .satisfies(error -> assertThat(((java.sql.SQLException) error).getSQLState()).isEqualTo(sqlState));
            } finally {
                connection.rollback(savepoint);
                connection.releaseSavepoint(savepoint);
            }
            return null;
        });
    }

    private String childInsert(String invariant) {
        return switch (invariant) {
            case "diagnosis" -> "insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id) values (?,?,?)";
            case "specimen" -> "insert into lab_results(lab_request_test_id,specimen_id) values (?,?)";
            case "referral" -> "insert into referrals(case_id,treatment_id,referral_type,source_facility_id,destination_facility_id,sent_at) values (?,?,'TREATMENT_TRANSFER',?,?,now())";
            case "tpt" -> "insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date) values (?,?,?,'2026-01-01')";
            case "alert" -> "insert into alerts(patient_id,case_id,treatment_id,alert_type,message) values (?,?,?,'TEST','Uji')";
            case "outcome" -> "insert into treatment_outcomes(treatment_id,outcome_code,outcome_date) values (?,'SEMBUH',?)";
            default -> throw new IllegalArgumentException(invariant);
        };
    }

    private Object[] childArguments(String invariant, boolean invalid, Fixture f) {
        return switch (invariant) {
            case "diagnosis" -> new Object[]{invalid ? f.registrationB : f.registrationA, f.diagnosisA, f.facilityA};
            case "specimen" -> new Object[]{f.testA, invalid ? f.specimenB : f.specimenA};
            case "referral" -> new Object[]{invalid ? f.caseB : f.caseA, f.treatmentA, f.facilityA, f.facilityB};
            case "tpt" -> new Object[]{f.contactA, invalid ? f.caseB : f.caseA, f.facilityA};
            case "alert" -> new Object[]{invalid ? f.patientB : f.patientA, f.caseA, f.treatmentA};
            case "outcome" -> new Object[]{f.treatmentA, java.time.LocalDate.parse(invalid ? "2025-12-31" : "2026-01-01")};
            default -> throw new IllegalArgumentException(invariant);
        };
    }

    private UUID insert(String sql, Object... args) {
        return jdbc.queryForObject(sql, UUID.class, args);
    }

    private UUID registration(UUID patient, UUID facility) {
        return insert("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,'2026-01-01') returning id", patient, facility);
    }

    private UUID tbCase(UUID registration, UUID facility) {
        return insert("insert into tb_cases(registration_id,current_facility_id) values (?,?) returning id", registration, facility);
    }

    private Fixture fixture() {
        UUID fa = insert("insert into facilities(name) values ('Fasyankes A') returning id");
        UUID fb = insert("insert into facilities(name) values ('Fasyankes B') returning id");
        UUID pa = insert("insert into patients(full_name) values ('Pasien A') returning id");
        UUID pb = insert("insert into patients(full_name) values ('Pasien B') returning id");
        UUID ra = registration(pa, fa);
        UUID rb = registration(pb, fb);
        UUID da = insert("insert into diagnoses(registration_id,diagnosis_date) values (?,'2026-01-01') returning id", ra);
        UUID caseRa = registration(pa, fa);
        UUID ca = tbCase(caseRa, fa);
        UUID cb = tbCase(registration(pb, fb), fb);
        UUID ta = insert("insert into treatments(case_id,facility_id,start_date) values (?,?,'2026-01-01') returning id", ca, fa);
        UUID qa = insert("insert into lab_requests(registration_id,requesting_facility_id,testing_facility_id,referral_type,requested_at) values (?,?,?,'INTERNAL',now()) returning id", ra, fa, fa);
        UUID qb = insert("insert into lab_requests(registration_id,requesting_facility_id,testing_facility_id,referral_type,requested_at) values (?,?,?,'INTERNAL',now()) returning id", rb, fb, fb);
        UUID test = insert("insert into lab_request_tests(lab_request_id,test_type_code) values (?,'TCM') returning id", qa);
        UUID sa = insert("insert into lab_specimens(lab_request_id) values (?) returning id", qa);
        UUID sb = insert("insert into lab_specimens(lab_request_id) values (?) returning id", qb);
        UUID contact = insert("insert into contacts(index_case_id,full_name) values (?,'Kontak A') returning id", ca);
        return new Fixture(fa, fb, pa, pb, ra, rb, da, caseRa, ca, cb, ta, qa, qb, test, sa, sb, contact);
    }

    private record Fixture(UUID facilityA, UUID facilityB, UUID patientA, UUID patientB,
                           UUID registrationA, UUID registrationB, UUID diagnosisA, UUID caseRegistrationA,
                           UUID caseA, UUID caseB, UUID treatmentA, UUID requestA, UUID requestB,
                           UUID testA, UUID specimenA, UUID specimenB, UUID contactA) {}
}
