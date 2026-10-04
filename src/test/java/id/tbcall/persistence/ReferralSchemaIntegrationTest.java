package id.tbcall.persistence;

import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class ReferralSchemaIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @Test void v13AddsOnlyReferralContinuityAndEnforcesOneInflightEpisode() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).load().migrate();
        try(Connection c=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()); var s=c.createStatement()) {
            try(var rs=s.executeQuery("select column_name,data_type from information_schema.columns where table_name='referrals' and column_name='return_reason'")) {
                assertThat(rs.next()).isTrue(); assertThat(rs.getString(2)).isEqualTo("text");
            }
            try(var rs=s.executeQuery("select indexdef from pg_indexes where indexname='idx_referrals_source_status'")) {
                assertThat(rs.next()).isTrue(); assertThat(rs.getString(1)).contains("source_facility_id, status, sent_at DESC");
            }
            UUID a=insert(s,"insert into facilities(name) values ('Source') returning id"),b=insert(s,"insert into facilities(name) values ('Destination') returning id");
            UUID p=insert(s,"insert into patients(full_name) values ('Patient') returning id");
            UUID r=insert(s,"insert into tb_registrations(patient_id,facility_id,registration_date) values ('"+p+"','"+a+"',current_date) returning id");
            UUID owner=insert(s,"insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values ('"+r+"','"+a+"','TB_SO','BARU') returning id");
            String base="insert into referrals(case_id,referral_type,source_facility_id,destination_facility_id,sent_at,status,return_reason) values ('"+owner+"','PRE_TREATMENT_REFERRAL','"+a+"','"+b+"',now(),'";
            for(String first:List.of("SENT","RECEIVED")) {
                s.execute(base+first+"','Reason')");
                for(String second:List.of("SENT","RECEIVED")) assertThatThrownBy(() -> s.execute(base+second+"',null)"))
                        .isInstanceOf(SQLException.class).satisfies(e -> assertThat(((SQLException)e).getSQLState()).isEqualTo("23505"));
                s.execute("delete from referrals");
            }
            for(String terminal:List.of("DRAFT","RETURNED","CANCELLED","REPORTED")) s.execute(base+terminal+"','Reason')");
            s.execute(base+"SENT',null)");
        }
    }
    private UUID insert(Statement s,String sql) throws SQLException { try(var rs=s.executeQuery(sql)) { rs.next(); return rs.getObject(1,UUID.class); } }
}
