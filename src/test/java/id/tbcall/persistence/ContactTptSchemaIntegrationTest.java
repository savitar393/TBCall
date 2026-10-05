package id.tbcall.persistence;

import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class ContactTptSchemaIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @Test void v14EnforcesEligibilityOpenEpisodesCatalogAndExistingLineage() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).load().migrate();
        try(Connection c=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()); var s=c.createStatement()) {
            try(var r=s.executeQuery("select column_name from information_schema.columns where table_name='contact_investigations' and column_name in ('active_tb_excluded','tpt_eligible','eligibility_assessed_at')")) {
                var columns=new HashSet<String>(); while(r.next()) columns.add(r.getString(1)); assertThat(columns).hasSize(3);
            }
            try(var r=s.executeQuery("select column_name from information_schema.columns where table_name='preventive_treatments' and column_name in ('regimen_description','closure_reason') and data_type='text'")) {
                int count=0; while(r.next()) count++; assertThat(count).isEqualTo(2);
            }
            try(var r=s.executeQuery("select indexdef from pg_indexes where indexname='idx_contact_investigation_source_status'")) { assertThat(r.next()).isTrue(); assertThat(r.getString(1)).contains("source_facility_id, status, requested_at DESC"); }
            try(var r=s.executeQuery("select code,regimen_kind,tb_case_category_code,description from regimens where code like 'TPT_%' order by code")) {
                var codes=new HashSet<String>(); while(r.next()) { codes.add(r.getString(1)); assertThat(r.getString(2)).isEqualTo("PREVENTIVE"); assertThat(r.getString(3)).isEqualTo(r.getString(1).startsWith("TPT_RO") ? "TB_RO" : "TB_SO"); assertThat(r.getString(4)).contains("national guidance","clinician assessment"); }
                assertThat(codes).containsExactlyInAnyOrder("TPT_SO_6H","TPT_SO_3HP","TPT_SO_3HR","TPT_SO_4R","TPT_SO_1HP","TPT_RO_6LFX");
            }
            try(var r=s.executeQuery("select count(*) from regimen_drugs d join regimens r on r.id=d.regimen_id where r.code like 'TPT_%'")) { r.next(); assertThat(r.getInt(1)).isZero(); }
            UUID f=id(s,"insert into facilities(name) values ('Source') returning id"),p=id(s,"insert into patients(full_name) values ('Index') returning id");
            UUID reg=id(s,"insert into tb_registrations(patient_id,facility_id,registration_date) values ('"+p+"','"+f+"',current_date) returning id");
            UUID owner=id(s,"insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values ('"+reg+"','"+f+"','TB_SO','BARU') returning id");
            UUID contact=id(s,"insert into contacts(index_case_id,full_name) values ('"+owner+"','Contact') returning id");
            String ik="insert into contact_investigations(contact_id,workflow_type,status,active_tb_excluded,tpt_eligible) values ('"+contact+"','INTERNAL','";
            for(String excluded:List.of("true","false","null")) for(String eligible:List.of("true","false","null")) {
                String sql=ik+"COMPLETED',"+excluded+","+eligible+")";
                if(eligible.equals("true") && !excluded.equals("true")) violation(s,sql,"23514"); else s.execute(sql);
            }
            for(String a:List.of("NEW","SENT","RECEIVED","IN_PROGRESS")) { s.execute(ik+a+"',true,false)"); for(String b:List.of("NEW","SENT","RECEIVED","IN_PROGRESS")) violation(s,ik+b+"',true,false)","23505"); s.execute("delete from contact_investigations where status='"+a+"'"); }
            String tpt="insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date,status) values ('"+contact+"','"+owner+"','"+f+"',current_date,'";
            for(String a:List.of("PLANNED","ACTIVE")) { s.execute(tpt+a+"')"); for(String b:List.of("PLANNED","ACTIVE")) violation(s,tpt+b+"')","23505"); s.execute("delete from preventive_treatments"); }
            for(String terminal:List.of("COMPLETED","STOPPED","LOST_TO_FOLLOW_UP","CANCELLED")) s.execute(tpt+terminal+"')"); s.execute(tpt+"ACTIVE')");
            UUID reg2=id(s,"insert into tb_registrations(patient_id,facility_id,registration_date) values ('"+p+"','"+f+"',current_date) returning id");
            UUID other=id(s,"insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values ('"+reg2+"','"+f+"','TB_SO','BARU') returning id");
            violation(s,"update preventive_treatments set index_case_id='"+other+"' where contact_id='"+contact+"'","23514");
        }
    }
    private UUID id(Statement s,String sql) throws SQLException { try(var r=s.executeQuery(sql)) { r.next(); return r.getObject(1,UUID.class); } }
    private void violation(Statement s,String sql,String state) { assertThatThrownBy(() -> s.execute(sql)).isInstanceOf(SQLException.class).satisfies(e -> assertThat(((SQLException)e).getSQLState()).isEqualTo(state)); }
}
