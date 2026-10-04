package id.tbcall.persistence;

import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class TreatmentSchemaIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");

    @BeforeAll static void publicExtensions() throws Exception {
        // Extensions belong to public so both independently migrated test schemas can resolve their types.
        try(Connection c=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()); var s=c.createStatement()) {
            s.execute("create extension if not exists pgcrypto with schema public");
            s.execute("create extension if not exists citext with schema public");
            s.execute("create extension if not exists pg_trgm with schema public");
        }
    }

    @Test void cleanV1ThroughV11GeneratedDoseConstraintsMatchApprovedReconciliation() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())
                .schemas("before_v12").defaultSchema("before_v12").target("11").load().migrate();
        try(Connection c=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());
            var statement=c.createStatement();
            var rs=statement.executeQuery("select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='before_v12.dose_events'::regclass order by conname")) {
            Map<String,String> constraints=new LinkedHashMap<>();
            while(rs.next()) constraints.put(rs.getString(1),rs.getString(2));
            assertThat(constraints).containsKey("dose_events_treatment_id_scheduled_date_key");
            assertThat(constraints.get("dose_events_treatment_id_scheduled_date_key")).isEqualTo("UNIQUE (treatment_id, scheduled_date)");
            assertThat(constraints.get("dose_events_source_check")).contains("SITB","PATIENT","HEALTH_WORKER","TBCALL","IMPORT");
            assertThat(constraints.get("dose_events_status_check")).contains("TAKEN_OBSERVED","TAKEN_SELF_REPORTED","DISPENSED_HOME","MISSED","UNKNOWN");
            System.out.println("Verified clean V1–V11 constraints: "+constraints);
        }
        try(Connection c=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());
            var statement=c.createStatement();
            var rs=statement.executeQuery("select indexdef from pg_indexes where schemaname='before_v12' and indexname='uq_treatments_one_open_per_case'")) {
            assertThat(rs.next()).isTrue();
            String definition=rs.getString(1);
            assertThat(definition).contains("UNIQUE INDEX","PLANNED","ACTIVE","PAUSED");
            System.out.println("Verified existing V1–V11 treatment index: "+definition);
        }
    }

    @Test void v12PreservesLegacyVocabularyReconcilesActorDaysAndStoresStructuredFollowUp() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())
                .schemas("after_v12").defaultSchema("after_v12").target("11").load().migrate();
        long openIndexOid;
        try(Connection c=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()); var s=c.createStatement();
            var rs=s.executeQuery("select 'after_v12.uq_treatments_one_open_per_case'::regclass::oid")) { rs.next(); openIndexOid=rs.getLong(1); }
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())
                .schemas("after_v12").defaultSchema("after_v12").load().migrate();
        try(Connection c=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()); var s=c.createStatement()) {
            s.execute("set search_path to after_v12,public");
            try(var rs=s.executeQuery("select 'uq_treatments_one_open_per_case'::regclass::oid")) { rs.next(); assertThat(rs.getLong(1)).as("V12 must retain the original index, without recreation").isEqualTo(openIndexOid); }
            UUID f=insert(s,"insert into facilities(name) values ('Schema facility') returning id");
            UUID p=insert(s,"insert into patients(full_name) values ('Schema patient') returning id");
            UUID r=insert(s,"insert into tb_registrations(patient_id,facility_id,registration_date) values ('"+p+"','"+f+"',current_date) returning id");
            UUID owner=insert(s,"insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values ('"+r+"','"+f+"','TB_SO','BARU') returning id");
            UUID t=insert(s,"insert into treatments(case_id,facility_id,start_date) values ('"+owner+"','"+f+"',current_date) returning id");
            for(String status:List.of("TAKEN_OBSERVED","TAKEN_SELF_REPORTED","DISPENSED_HOME","MISSED","UNKNOWN"))
                s.execute("insert into dose_events(treatment_id,scheduled_date,status,source) values ('"+t+"',current_date,'"+status+"','IMPORT')");
            for(String source:List.of("SITB","PATIENT","HEALTH_WORKER","TBCALL","IMPORT","TREATMENT_SUPPORTER"))
                s.execute("insert into dose_events(treatment_id,scheduled_date,status,source) values ('"+t+"',current_date,'UNKNOWN','"+source+"')");
            assertThatThrownBy(() -> s.execute("insert into dose_events(treatment_id,scheduled_date,status) values ('"+t+"',current_date,'TAKEN')")).isInstanceOf(SQLException.class);
            UUID a=insert(s,"insert into users(email,password_hash) values ('a@example.org','fixture') returning id"),b=insert(s,"insert into users(email,password_hash) values ('b@example.org','fixture') returning id");
            String daily="insert into dose_events(treatment_id,scheduled_date,status,source,recorded_by_user_id) values ('"+t+"',current_date,'UNKNOWN','TBCALL','";
            s.execute(daily+a+"')"); s.execute(daily+b+"')");
            assertThatThrownBy(() -> s.execute(daily+a+"')")).isInstanceOf(SQLException.class).satisfies(e -> assertThat(((SQLException)e).getSQLState()).isEqualTo("23505"));
            s.execute("insert into follow_ups(treatment_id,follow_up_type,scheduled_at,weight_kg,symptom_summary,adherence_assessment) values ('"+t+"','Kontrol',now(),52.25,'Summary','Assessment')");
            assertThatThrownBy(() -> s.execute("insert into follow_ups(treatment_id,follow_up_type,scheduled_at,weight_kg) values ('"+t+"','Kontrol',now(),0)")).isInstanceOf(SQLException.class);
            try(var rs=s.executeQuery("select weight_kg,symptom_summary,adherence_assessment from follow_ups")) { assertThat(rs.next()).isTrue(); assertThat(rs.getBigDecimal(1)).isEqualByComparingTo("52.25"); assertThat(rs.getString(2)).isEqualTo("Summary"); assertThat(rs.getString(3)).isEqualTo("Assessment"); }
            // All pairings of PLANNED/ACTIVE/PAUSED must retain the original V1 invariant.
            s.execute("delete from treatments where id='"+t+"'");
            for(String first:List.of("PLANNED","ACTIVE","PAUSED")) {
                s.execute("insert into treatments(case_id,facility_id,start_date,status) values ('"+owner+"','"+f+"',current_date,'"+first+"')");
                for(String second:List.of("PLANNED","ACTIVE","PAUSED"))
                    assertThatThrownBy(() -> s.execute("insert into treatments(case_id,facility_id,start_date,status) values ('"+owner+"','"+f+"',current_date,'"+second+"')")).isInstanceOf(SQLException.class).satisfies(e -> assertThat(((SQLException)e).getSQLState()).isEqualTo("23505"));
                s.execute("delete from treatments");
            }
            for(String terminal:List.of("TRANSFERRED","COMPLETED","STOPPED","CANCELLED"))
                s.execute("insert into treatments(case_id,facility_id,start_date,status) values ('"+owner+"','"+f+"',current_date,'"+terminal+"')");
            s.execute("insert into treatments(case_id,facility_id,start_date,status) values ('"+owner+"','"+f+"',current_date,'ACTIVE')");
        }
    }
    private UUID insert(Statement s,String sql) throws SQLException { try(var rs=s.executeQuery(sql)) { rs.next(); return rs.getObject(1,UUID.class); } }
}
