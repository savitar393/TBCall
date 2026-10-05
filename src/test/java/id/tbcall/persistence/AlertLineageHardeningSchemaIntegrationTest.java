package id.tbcall.persistence;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.postgresql.util.PSQLException;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
class AlertLineageHardeningSchemaIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    private static String alertsBeforeUpgrade;
    private static Map<String, String> lineageBeforeUpgrade;
    private static int migrationsExecuted;
    private Connection connection;
    private Statement sql;
    private Fixture fixture;

    @BeforeAll
    static void upgradeExistingValidV15Alerts() throws SQLException {
        flyway("15").migrate();
        try (var connection = connect(); var sql = connection.createStatement()) {
            var f = seed(sql);
            alert(sql, "patient_id,case_id,treatment_id,monitoring_event_id",
                    values(f.patient, f.tbCase, f.treatment, f.treatmentEvent));
            alert(sql, "patient_id,treatment_id", values(f.patient, f.treatment));
            alert(sql, "patient_id,case_id", values(f.patient, f.tbCase));
            alert(sql, "patient_id", values(f.patient));
            alert(sql, "preventive_treatment_id,contact_id,monitoring_event_id",
                    values(f.tpt, f.contact, f.tptEvent));
            alert(sql, "patient_id,preventive_treatment_id,contact_id",
                    values(f.otherPatient, f.linkedTpt, f.linkedContact));
            alert(sql, "patient_id,preventive_treatment_id", values(f.otherPatient, f.directTpt));
            alertsBeforeUpgrade = alerts(sql);
            lineageBeforeUpgrade = lineage(sql);
        }
        migrationsExecuted = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load().migrate().migrationsExecuted;
    }

    @BeforeEach
    void isolatedFixture() throws SQLException {
        connection = connect();
        connection.setAutoCommit(false);
        sql = connection.createStatement();
        fixture = seed(sql);
    }

    @AfterEach
    void rollbackFixture() throws SQLException {
        try (var closingConnection = connection; var closingSql = sql) {
            connection.rollback();
        }
    }

    @Test
    void v15ToV16PreservesValidAlertRowsAndBothLineageTriggers() throws SQLException {
        assertThat(migrationsExecuted).isEqualTo(1);
        assertThat(value(sql, "select version from flyway_schema_history order by installed_rank desc limit 1"))
                .isEqualTo("16");
        assertThat(alerts(sql)).isEqualTo(alertsBeforeUpgrade);
        assertThat(lineage(sql)).isEqualTo(lineageBeforeUpgrade);
    }

    @ParameterizedTest
    @CsvSource({"TREATMENT,false", "CASE,false", "BOTH,false", "TREATMENT,true", "CASE,true", "BOTH,true"})
    void directTreatmentOrCaseAlertCannotLoseItsPatient(String target, boolean update) throws SQLException {
        String columns = columns(target);
        String command = update
                ? "update alerts set patient_id=null where id=" + quote(alert(sql, columns, targetValues(target, fixture.patient)))
                : insert(columns, targetValues(target, null));
        reject(command, "chk_alert_patient_required_except_tpt");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void genericNonTptAlertRequiresPatient(boolean update) throws SQLException {
        String command = update
                ? "update alerts set patient_id=null where id=" + quote(alert(sql, "patient_id", values(fixture.patient)))
                : "insert into alerts(alert_type,message) values ('TEST','Safe')";
        reject(command, "chk_alert_patient_required_except_tpt");
    }

    @ParameterizedTest
    @CsvSource({"GENERIC,false", "CASE,false", "TREATMENT,false", "GENERIC,true", "CASE,true", "TREATMENT,true"})
    void contactCannotFloatWithoutPreventiveTreatment(String target, boolean update) throws SQLException {
        String command = update
                ? "update alerts set contact_id=" + quote(fixture.contact) + " where id="
                    + quote(alert(sql, columns(target), targetValues(target, fixture.patient)))
                : insert(columns(target) + ",contact_id", targetValues(target, fixture.patient) + "," + quote(fixture.contact));
        reject(command, "chk_alert_contact_requires_tpt");
    }

    @Test
    void validTreatmentMonitoringAlertRemainsValid() throws SQLException {
        UUID id = alert(sql, "patient_id,case_id,treatment_id,monitoring_event_id",
                values(fixture.patient, fixture.tbCase, fixture.treatment, fixture.treatmentEvent));
        sql.execute("update alerts set status='ACKNOWLEDGED' where id=" + quote(id));
        assertThat(value(sql, "select status from alerts where id=" + quote(id))).isEqualTo("ACKNOWLEDGED");
    }

    @Test
    void unlinkedContactTptMonitoringAlertMayHaveNullPatient() throws SQLException {
        UUID id = alert(sql, "preventive_treatment_id,contact_id,monitoring_event_id",
                values(fixture.tpt, fixture.contact, fixture.tptEvent));
        assertThat(value(sql, "select patient_id from alerts where id=" + quote(id))).isNull();
        sql.execute("update alerts set status='RESOLVED' where id=" + quote(id));
    }

    @Test
    void contactTptAlertMayUseItsMatchingLinkedPatient() throws SQLException {
        UUID id = alert(sql, "patient_id,preventive_treatment_id,contact_id",
                values(fixture.otherPatient, fixture.linkedTpt, fixture.linkedContact));
        assertThat(value(sql, "select patient_id from alerts where id=" + quote(id)))
                .isEqualTo(fixture.otherPatient.toString());
    }

    @Test
    void directPatientTptAlertRemainsValidWithoutContact() throws SQLException {
        UUID id = alert(sql, "patient_id,preventive_treatment_id", values(fixture.otherPatient, fixture.directTpt));
        assertThat(value(sql, "select contact_id from alerts where id=" + quote(id))).isNull();
    }

    @Test
    void genericPatientOnlyAlertPreservesV1Behavior() throws SQLException {
        UUID id = alert(sql, "patient_id", values(fixture.patient));
        assertThat(value(sql, "select num_nonnulls(case_id,treatment_id,preventive_treatment_id,contact_id) from alerts where id=" + quote(id)))
                .isEqualTo("0");
    }

    @ParameterizedTest
    @ValueSource(strings = {"CASE", "TREATMENT"})
    void v6StillRejectsMismatchingPatient(String target) throws SQLException {
        reject(insert(columns(target), targetValues(target, fixture.otherPatient)), "chk_alert_lineage");
    }

    @ParameterizedTest
    @ValueSource(strings = {"CONTACT", "PATIENT", "MONITORING_EVENT"})
    void v15StillRejectsMismatchingTptLineage(String mismatch) throws SQLException {
        String command = switch (mismatch) {
            case "CONTACT" -> insert("preventive_treatment_id,contact_id", values(fixture.tpt, fixture.linkedContact));
            case "PATIENT" -> insert("patient_id,preventive_treatment_id,contact_id",
                    values(fixture.patient, fixture.linkedTpt, fixture.linkedContact));
            case "MONITORING_EVENT" -> insert("preventive_treatment_id,contact_id,monitoring_event_id",
                    values(fixture.linkedTpt, fixture.linkedContact, fixture.tptEvent));
            default -> throw new IllegalArgumentException(mismatch);
        };
        reject(command, "chk_monitoring_alert_lineage");
    }

    private void reject(String command, String constraint) throws SQLException {
        var savepoint = connection.setSavepoint();
        try {
            assertThatThrownBy(() -> sql.execute(command)).isInstanceOf(PSQLException.class).satisfies(error -> {
                var pg = (PSQLException) error;
                assertThat(pg.getSQLState()).isEqualTo("23514");
                assertThat(pg.getServerErrorMessage().getConstraint()).isEqualTo(constraint);
            });
        } finally {
            connection.rollback(savepoint);
            connection.releaseSavepoint(savepoint);
        }
    }

    private String targetValues(String target, UUID patient) {
        return switch (target) {
            case "GENERIC" -> values(patient);
            case "CASE" -> values(patient, fixture.tbCase);
            case "TREATMENT" -> values(patient, fixture.treatment);
            case "BOTH" -> values(patient, fixture.tbCase, fixture.treatment);
            default -> throw new IllegalArgumentException(target);
        };
    }

    private static String columns(String target) {
        return switch (target) {
            case "GENERIC" -> "patient_id";
            case "CASE" -> "patient_id,case_id";
            case "TREATMENT" -> "patient_id,treatment_id";
            case "BOTH" -> "patient_id,case_id,treatment_id";
            default -> throw new IllegalArgumentException(target);
        };
    }

    private static Fixture seed(Statement sql) throws SQLException {
        UUID facility = id(sql, "insert into facilities(name) values ('Owner') returning id");
        UUID patient = id(sql, "insert into patients(full_name) values ('Index patient') returning id");
        UUID otherPatient = id(sql, "insert into patients(full_name) values ('TPT patient') returning id");
        UUID registration = id(sql, "insert into tb_registrations(patient_id,facility_id,registration_date) values ("
                + values(patient, facility) + ",current_date) returning id");
        UUID tbCase = id(sql, "insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values ("
                + values(registration, facility) + ",'TB_SO','BARU') returning id");
        UUID treatment = id(sql, "insert into treatments(case_id,facility_id,start_date,status) values ("
                + values(tbCase, facility) + ",current_date,'ACTIVE') returning id");
        UUID contact = id(sql, "insert into contacts(index_case_id,full_name) values (" + quote(tbCase) + ",'Unlinked contact') returning id");
        UUID linkedContact = id(sql, "insert into contacts(index_case_id,linked_patient_id,full_name) values ("
                + values(tbCase, otherPatient) + ",'Linked contact') returning id");
        UUID tpt = id(sql, "insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date) values ("
                + values(contact, tbCase, facility) + ",current_date) returning id");
        UUID linkedTpt = id(sql, "insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date) values ("
                + values(linkedContact, tbCase, facility) + ",current_date) returning id");
        UUID directTpt = id(sql, "insert into preventive_treatments(patient_id,facility_id,start_date) values ("
                + values(otherPatient, facility) + ",current_date) returning id");
        UUID plan = id(sql, "insert into monitoring_plans(treatment_id,start_date) values (" + quote(treatment) + ",current_date) returning id");
        UUID tptPlan = id(sql, "insert into monitoring_plans(preventive_treatment_id,start_date) values (" + quote(tpt) + ",current_date) returning id");
        UUID event = id(sql, "insert into monitoring_events(monitoring_plan_id,event_type,scheduled_at) values ("
                + quote(plan) + ",'CLINICAL_REVIEW',now()) returning id");
        UUID tptEvent = id(sql, "insert into monitoring_events(monitoring_plan_id,event_type,scheduled_at) values ("
                + quote(tptPlan) + ",'CLINICAL_REVIEW',now()) returning id");
        return new Fixture(patient, otherPatient, tbCase, treatment, contact, tpt, linkedContact, linkedTpt, directTpt, event, tptEvent);
    }

    private static Map<String, String> lineage(Statement sql) throws SQLException {
        return Map.of(
                "v6Function", value(sql, "select pg_get_functiondef('validate_alert_lineage()'::regprocedure)"),
                "v15Function", value(sql, "select pg_get_functiondef('validate_monitoring_alert_lineage()'::regprocedure)"),
                "v6Trigger", value(sql, "select pg_get_triggerdef(oid) from pg_trigger where tgrelid='alerts'::regclass and tgname='trg_alert_lineage'"),
                "v15Trigger", value(sql, "select pg_get_triggerdef(oid) from pg_trigger where tgrelid='alerts'::regclass and tgname='trg_monitoring_alert_lineage'"));
    }

    private static String alerts(Statement sql) throws SQLException {
        return value(sql, "select string_agg(to_jsonb(a)::text,'|' order by id) from alerts a");
    }

    private static Flyway flyway(String target) {
        return Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(target).load();
    }

    private static Connection connect() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static UUID alert(Statement sql, String columns, String values) throws SQLException {
        return id(sql, insert(columns, values) + " returning id");
    }

    private static String insert(String columns, String values) {
        return "insert into alerts(" + columns + ",alert_type,message) values (" + values + ",'TEST','Safe')";
    }

    private static UUID id(Statement sql, String command) throws SQLException {
        try (var result = sql.executeQuery(command)) {
            assertThat(result.next()).isTrue();
            return result.getObject(1, UUID.class);
        }
    }

    private static String value(Statement sql, String query) throws SQLException {
        try (var result = sql.executeQuery(query)) {
            assertThat(result.next()).isTrue();
            return result.getString(1);
        }
    }

    private static String values(UUID... ids) {
        return java.util.Arrays.stream(ids).map(AlertLineageHardeningSchemaIntegrationTest::quote)
                .collect(java.util.stream.Collectors.joining(","));
    }

    private static String quote(UUID id) {
        return id == null ? "null" : "'" + id + "'";
    }

    private record Fixture(UUID patient, UUID otherPatient, UUID tbCase, UUID treatment, UUID contact, UUID tpt,
                           UUID linkedContact, UUID linkedTpt, UUID directTpt, UUID treatmentEvent, UUID tptEvent) {}
}
