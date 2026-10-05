package id.tbcall.application.integration;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.AdministrativePolicies;
import id.tbcall.authorization.CurrentActor;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.integration.IntegrationDtos.*;

@Service
@Transactional(readOnly = true, isolation = Isolation.READ_COMMITTED)
public class IntegrationQueryService {
    private static final String RUN_COLUMNS = """
            id,direction,status,started_at,finished_at,records_received,records_created,records_updated,
            records_failed,cursor_value,(error_message IS NOT NULL) AS has_error
            """;
    private static final String SYSTEM_COLUMNS = """
            s.id,s.code,s.name,s.active,s.description,
            (select count(*) from external_identifiers i where i.external_system_id=s.id) AS identifier_count,
            (select count(*) from external_source_authorities a where a.external_system_id=s.id and a.released_at is null) AS authority_count
            """;
    private final JdbcTemplate jdbc;
    private final AdministrativePolicies access;

    public IntegrationQueryService(JdbcTemplate jdbc, AdministrativePolicies access) { this.jdbc = jdbc; this.access = access; }

    public Page<IntegrationSummary> integrations(CurrentActor actor, int page, int size) {
        access.requireSystem(actor, "INTEGRATION_MANAGE");
        return page(SYSTEM_COLUMNS, "from external_systems s", "s.code,s.id", List.of(), this::integration, page, size);
    }

    public IntegrationSummary integration(CurrentActor actor, String code) {
        UUID system = system(actor, code);
        return jdbc.query("select " + SYSTEM_COLUMNS + " from external_systems s where s.id=?", this::integration, system).getFirst();
    }

    public Page<IdentifierSummary> identifiers(CurrentActor actor, String code, int page, int size) {
        UUID system = system(actor, code);
        return page("id,entity_type,entity_id,external_id,external_version,first_seen_at,last_seen_at",
                "from external_identifiers where external_system_id=?", "last_seen_at desc,id desc", List.of(system),
                (r, n) -> new IdentifierSummary(uuid(r, "id"), r.getString("entity_type"), uuid(r, "entity_id"),
                        r.getString("external_id"), r.getString("external_version"), time(r, "first_seen_at"), time(r, "last_seen_at")), page, size);
    }

    public Page<AuthoritySummary> authorities(CurrentActor actor, String code, int page, int size) {
        UUID system = system(actor, code);
        return page("entity_type,entity_id,authority_scope,external_id,source_version,effective_at,released_at",
                "from external_source_authorities where external_system_id=?", "effective_at desc,id desc", List.of(system),
                (r, n) -> new AuthoritySummary(r.getString("entity_type"), uuid(r, "entity_id"), r.getString("authority_scope"),
                        r.getString("external_id"), r.getString("source_version"), time(r, "effective_at"), time(r, "released_at")), page, size);
    }

    public Page<RunSummary> runs(CurrentActor actor, String code, int page, int size) {
        UUID system = system(actor, code);
        return page(RUN_COLUMNS, "from sync_runs where external_system_id=?", "started_at desc,id desc", List.of(system), this::run, page, size);
    }

    public RunDetail run(CurrentActor actor, String code, UUID runId, int page, int size) {
        UUID system = system(actor, code);
        validatePage(page, size);
        var runs = jdbc.query("select " + RUN_COLUMNS + " from sync_runs where external_system_id=? and id=?", this::run, system, runId);
        if (runs.isEmpty()) throw ApplicationFailure.missing();
        var items = page("""
                entity_type,external_id,resolved_entity_id,operation,status,source_updated_at,
                content_hash,local_content_hash,conflict_id,processed_at,(error_message IS NOT NULL) AS has_error
                """, "from sync_items where sync_run_id=?", "created_at,id", List.of(runId),
                (r, n) -> new ItemSummary(r.getString("entity_type"), r.getString("external_id"), uuid(r, "resolved_entity_id"),
                        r.getString("operation"), r.getString("status"), time(r, "source_updated_at"), r.getString("content_hash"),
                        r.getString("local_content_hash"), uuid(r, "conflict_id"), time(r, "processed_at"), errorSummary(r)), page, size);
        return new RunDetail(runs.getFirst(), items);
    }

    public Page<ConflictSummary> conflicts(CurrentActor actor, String code, int page, int size) {
        UUID system = system(actor, code);
        return page("id,entity_type,entity_id,external_id,authority_scope,source_version,status,first_seen_at,last_seen_at,resolved_at",
                "from integration_conflicts where external_system_id=?", "last_seen_at desc,id desc", List.of(system),
                (r, n) -> new ConflictSummary(uuid(r, "id"), r.getString("entity_type"), uuid(r, "entity_id"), r.getString("external_id"),
                        r.getString("authority_scope"), r.getString("source_version"), r.getString("status"), time(r, "first_seen_at"),
                        time(r, "last_seen_at"), time(r, "resolved_at")), page, size);
    }

    private UUID system(CurrentActor actor, String code) {
        access.requireSystem(actor, "INTEGRATION_MANAGE");
        var ids = jdbc.query("select id from external_systems where code=?", (r, n) -> uuid(r, "id"), code);
        if (ids.isEmpty()) throw ApplicationFailure.missing();
        return ids.getFirst();
    }

    private IntegrationSummary integration(ResultSet r, int row) throws SQLException {
        UUID system = uuid(r, "id");
        var latest = jdbc.query("select " + RUN_COLUMNS + " from sync_runs where external_system_id=? order by started_at desc,id desc limit 1", this::run, system);
        // No connector exists in Phase 5A; activation metadata cannot imply configuration.
        return new IntegrationSummary(r.getString("code"), r.getString("name"), r.getBoolean("active"), "UNCONFIGURED",
                r.getString("description"), r.getLong("identifier_count"), r.getLong("authority_count"), latest.isEmpty() ? null : latest.getFirst());
    }

    private RunSummary run(ResultSet r, int row) throws SQLException {
        return new RunSummary(uuid(r, "id"), r.getString("direction"), r.getString("status"), time(r, "started_at"), time(r, "finished_at"),
                r.getInt("records_received"), r.getInt("records_created"), r.getInt("records_updated"), r.getInt("records_failed"),
                r.getString("cursor_value"), errorSummary(r));
    }

    private <T> Page<T> page(String columns, String from, String order, List<?> parameters, RowMapper<T> mapper, int page, int size) {
        validatePage(page, size);
        long total = jdbc.queryForObject("select count(*) " + from, Long.class, parameters.toArray());
        var arguments = new ArrayList<Object>(parameters); arguments.add(size); arguments.add(page * size);
        var content = jdbc.query("select " + columns + " " + from + " order by " + order + " limit ? offset ?", mapper, arguments.toArray());
        return new Page<>(content, page, size, total);
    }

    private static void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > 50 || (long) page * size > Integer.MAX_VALUE)
            throw ApplicationFailure.invalid("Halaman dan ukuran daftar integrasi tidak valid; ukuran maksimal 50.");
    }
    private static UUID uuid(ResultSet r, String field) throws SQLException { return r.getObject(field, UUID.class); }
    private static OffsetDateTime time(ResultSet r, String field) throws SQLException { return r.getObject(field, OffsetDateTime.class); }
    private static String errorSummary(ResultSet r) throws SQLException {
        return r.getBoolean("has_error") ? "Terjadi kesalahan sinkronisasi. Detail memerlukan alur integrasi yang disetujui." : null;
    }
}
