package id.tbcall.persistence;

import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class IntegrationBoundarySchemaIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");
    private static String oldRows, oldIndexes;
    private static int migrated;
    private static UUID legacySystem, oldItem;
    private Connection connection;
    private Statement sql;

    @BeforeAll static void upgrade() throws SQLException {
        flyway("16").migrate();
        try (var c = connect(); var s = c.createStatement()) {
            legacySystem = id(s, "insert into external_systems(code,name) values ('LEGACY','Existing') returning id");
            UUID run = id(s, "insert into sync_runs(external_system_id) values ('" + legacySystem + "') returning id");
            oldItem = id(s, "insert into sync_items(sync_run_id,entity_type,external_id,operation,status,content_hash) values ('"
                    + run + "','PATIENT','legacy-record','IGNORE','SKIPPED','old-hash') returning id");
            s.execute("insert into external_identifiers(external_system_id,entity_type,entity_id,external_id) values ('"
                    + legacySystem + "','PATIENT','" + UUID.randomUUID() + "','legacy-record')");
            oldRows = existingRows(s);
            oldIndexes = value(s, "select string_agg(indexdef,'|' order by indexname) from pg_indexes where tablename in ('external_systems','external_identifiers','sync_runs','sync_items')");
        }
        migrated = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()).load().migrate().migrationsExecuted;
    }

    @BeforeEach void transaction() throws SQLException {
        connection = connect(); connection.setAutoCommit(false); sql = connection.createStatement();
    }
    @AfterEach void cleanup() throws SQLException {
        try (var c = connection; var s = sql) { c.rollback(); }
    }

    @Test void v16UpgradePreservesExistingIntegrationRows() throws SQLException {
        assertThat(migrated).isEqualTo(1);
        assertThat(existingRows(sql)).isEqualTo(oldRows);
        assertThat(value(sql, "select string_agg(indexdef,'|' order by indexname) from pg_indexes where tablename in ('external_systems','external_identifiers','sync_runs','sync_items')"))
                .isEqualTo(oldIndexes);
        assertThat(value(sql, "select version from flyway_schema_history order by installed_rank desc limit 1")).isEqualTo("17");
    }

    @Test void sitbMarkerIsInactiveAndOnlyMetadata() throws SQLException {
        assertThat(value(sql, "select count(*) from external_systems where code='SITB' and active=false")).isEqualTo("1");
        assertThat(value(sql, "select description from external_systems where code='SITB'"))
                .isEqualTo("TBCall integration boundary. Network/API contract and credentials are not configured.");
        assertThat(value(sql, "select count(*) from external_source_authorities")).isEqualTo("0");
        assertThat(value(sql, "select count(*) from integration_conflicts")).isEqualTo("0");
    }

    @Test void authorityHasOneActiveOwnerAcrossSystemsAndRetainsHistory() throws SQLException {
        UUID target = UUID.randomUUID();
        String active = authority(target, "CLINICAL", legacySystem);
        UUID first = id(sql, active + " returning id");
        reject(active, "23505");
        UUID sitb = id(sql, "select id from external_systems where code='SITB'");
        reject(authority(target, "CLINICAL", sitb), "23505");
        sql.execute(authority(target, "LABORATORY", legacySystem));
        sql.execute("update external_source_authorities set released_at=effective_at where id='" + first + "'");
        sql.execute(authority(target, "CLINICAL", sitb));
        assertThat(value(sql, "select count(*) from external_source_authorities where entity_id='" + target + "'")).isEqualTo("3");
    }

    @Test void authorityReleaseCannotPrecedeEffectiveTime() throws SQLException {
        UUID authority = id(sql, authority(UUID.randomUUID(), "CLINICAL", legacySystem) + " returning id");
        reject("update external_source_authorities set released_at=effective_at-interval '1 second' where id='" + authority + "'", "23514");
    }

    @Test void authorityScopeColumnDoesNotInventAnHistoricalSqlAllowlist() throws SQLException {
        sql.execute(authority(UUID.randomUUID(), "FUTURE_SCOPE", legacySystem));
        assertThat(value(sql, "select count(*) from external_source_authorities where authority_scope='FUTURE_SCOPE'")).isEqualTo("1");
    }

    @ParameterizedTest @ValueSource(strings = {"RESOLVED_LOCAL", "RESOLVED_EXTERNAL", "IGNORED"})
    void closedConflictPermitsAnotherOpenConflict(String status) throws SQLException {
        String external = UUID.randomUUID().toString();
        String open = conflict(external, "CLINICAL", legacySystem);
        UUID first = id(sql, open + " returning id");
        reject(open, "23505");
        sql.execute(conflict(external, "LABORATORY", legacySystem));
        sql.execute("update integration_conflicts set status='" + status + "',resolved_at=first_seen_at where id='" + first + "'");
        sql.execute(open);
        assertThat(value(sql, "select count(*) from integration_conflicts where external_id='" + external + "'")).isEqualTo("3");
    }

    @ParameterizedTest @ValueSource(strings = {"last_seen_at", "resolved_at"})
    void conflictTimesCannotPrecedeFirstSeen(String field) throws SQLException {
        UUID conflict = id(sql, conflict(UUID.randomUUID().toString(), "CLINICAL", legacySystem) + " returning id");
        reject("update integration_conflicts set " + field + "=first_seen_at-interval '1 second' where id='" + conflict + "'", "23514");
    }

    @Test void conflictAllowsUnresolvedLocalIdentityButRetainsStatusCheck() throws SQLException {
        UUID conflict = id(sql, conflict(UUID.randomUUID().toString(), "CLINICAL", legacySystem) + " returning id");
        assertThat(value(sql, "select entity_id from integration_conflicts where id='" + conflict + "'")).isNull();
        reject("update integration_conflicts set status='INVENTED' where id='" + conflict + "'", "23514");
    }

    @Test void syncItemLinksConflictAndLocalHashWithoutChangingOldCodes() throws SQLException {
        UUID conflict = id(sql, conflict("legacy-record", "CLINICAL", legacySystem) + " returning id");
        sql.execute("update sync_items set local_content_hash='local-hash',conflict_id='" + conflict + "' where id='" + oldItem + "'");
        assertThat(value(sql, "select local_content_hash from sync_items where id='" + oldItem + "'")).isEqualTo("local-hash");
        assertThat(id(sql, "select conflict_id from sync_items where id='" + oldItem + "'")).isEqualTo(conflict);
        reject("update sync_items set conflict_id='" + UUID.randomUUID() + "' where id='" + oldItem + "'", "23503");
        reject("delete from integration_conflicts where id='" + conflict + "'", "23503");
        reject("update sync_items set operation='PUSH' where id='" + oldItem + "'", "23514");
        reject("update sync_items set status='CONFLICT' where id='" + oldItem + "'", "23514");
    }

    @Test void externalIdentifierUniquenessIsUnchanged() throws SQLException {
        UUID target = id(sql, "select entity_id from external_identifiers where external_system_id='" + legacySystem + "'");
        reject("insert into external_identifiers(external_system_id,entity_type,entity_id,external_id) values ('" + legacySystem
                + "','PATIENT','" + UUID.randomUUID() + "','legacy-record')", "23505");
        reject("insert into external_identifiers(external_system_id,entity_type,entity_id,external_id) values ('" + legacySystem
                + "','PATIENT','" + target + "','another-record')", "23505");
    }

    @ParameterizedTest @ValueSource(strings = {"AUTHORITY", "CONFLICT"})
    void concurrentActiveRegistrationHasExactlyOneWinner(String kind) throws Exception {
        UUID target = UUID.randomUUID();
        String command = kind.equals("AUTHORITY") ? authority(target, "CLINICAL", legacySystem)
                : conflict(target.toString(), "CLINICAL", legacySystem);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<String> insert = () -> {
                start.await();
                try (var c = connect(); var s = c.createStatement()) { s.execute(command); return "SUCCESS"; }
                catch (SQLException error) { return error.getSQLState(); }
            };
            var first = executor.submit(insert); var second = executor.submit(insert); start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("SUCCESS", "23505");
        } finally {
            try (var c = connect(); var s = c.createStatement()) {
                s.execute(kind.equals("AUTHORITY") ? "delete from external_source_authorities where entity_id='" + target + "'"
                        : "delete from integration_conflicts where external_id='" + target + "'");
            }
        }
    }

    private void reject(String command, String state) throws SQLException {
        var savepoint = connection.setSavepoint();
        try { assertThatThrownBy(() -> sql.execute(command)).isInstanceOf(SQLException.class)
                .satisfies(error -> assertThat(((SQLException) error).getSQLState()).isEqualTo(state)); }
        finally { connection.rollback(savepoint); connection.releaseSavepoint(savepoint); }
    }
    private static String authority(UUID target, String scope, UUID system) {
        return "insert into external_source_authorities(external_system_id,entity_type,entity_id,authority_scope) values ('"
                + system + "','PATIENT','" + target + "','" + scope + "')";
    }
    private static String conflict(String external, String scope, UUID system) {
        return "insert into integration_conflicts(external_system_id,entity_type,external_id,authority_scope) values ('"
                + system + "','PATIENT','" + external + "','" + scope + "')";
    }
    private static String existingRows(Statement s) throws SQLException {
        return value(s, "select to_jsonb(s)::text from external_systems s where id='" + legacySystem + "'")
                + value(s, "select to_jsonb(i)::text from external_identifiers i where external_system_id='" + legacySystem + "'")
                + value(s, "select to_jsonb(r)::text from sync_runs r where external_system_id='" + legacySystem + "'")
                + value(s, "select (to_jsonb(i)-'local_content_hash'-'conflict_id')::text from sync_items i where id='" + oldItem + "'");
    }
    private static Flyway flyway(String target) { return Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()).target(target).load(); }
    private static Connection connect() throws SQLException { return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()); }
    private static UUID id(Statement s, String query) throws SQLException { return UUID.fromString(value(s, query)); }
    private static String value(Statement s, String query) throws SQLException {
        try (var r = s.executeQuery(query)) { assertThat(r.next()).isTrue(); return r.getString(1); }
    }
}
