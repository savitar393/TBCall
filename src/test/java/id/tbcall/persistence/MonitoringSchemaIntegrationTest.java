package id.tbcall.persistence;

import java.sql.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class MonitoringSchemaIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @Test void v15AddsRelationalTargetsAndLineageWithoutReplacingTheTreatmentIndex() throws Exception {
        var config=Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());
        config.target("14").load().migrate();
        try(Connection c=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()); var s=c.createStatement()) {
            String original=index(s,"uq_monitoring_plan_active_treatment");
            UUID f=id(s,"insert into facilities(name) values ('Owner') returning id"),p=id(s,"insert into patients(full_name) values ('Patient') returning id");
            UUID r=id(s,"insert into tb_registrations(patient_id,facility_id,registration_date) values ('"+p+"','"+f+"',current_date) returning id");
            UUID k=id(s,"insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values ('"+r+"','"+f+"','TB_SO','BARU') returning id");
            UUID t=id(s,"insert into treatments(case_id,facility_id,start_date,status) values ('"+k+"','"+f+"',current_date,'ACTIVE') returning id");
            UUID plan=id(s,"insert into monitoring_plans(treatment_id,start_date) values ('"+t+"',current_date) returning id");
            Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).load().migrate();
            assertThat(index(s,"uq_monitoring_plan_active_treatment")).isEqualTo(original);
            assertThat(index(s,"uq_monitoring_plan_active_tpt")).contains("preventive_treatment_id");
            violation(s,"insert into monitoring_plans(start_date) values (current_date)","23514");
            UUID contact=id(s,"insert into contacts(index_case_id,full_name) values ('"+k+"','Contact') returning id");
            UUID tpt=id(s,"insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date) values ('"+contact+"','"+k+"','"+f+"',current_date) returning id");
            violation(s,"insert into monitoring_plans(treatment_id,preventive_treatment_id,start_date) values ('"+t+"','"+tpt+"',current_date)","23514");
            UUID tp=id(s,"insert into monitoring_plans(preventive_treatment_id,start_date) values ('"+tpt+"',current_date) returning id");
            violation(s,"insert into monitoring_plans(preventive_treatment_id,start_date) values ('"+tpt+"',current_date)","23505");
            violation(s,"insert into monitoring_plans(treatment_id,start_date) values ('"+t+"',current_date)","23505");
            UUID e=id(s,"insert into monitoring_events(monitoring_plan_id,event_type,scheduled_at) values ('"+tp+"','CLINICAL_REVIEW',now()) returning id");
            UUID te=id(s,"insert into monitoring_events(monitoring_plan_id,event_type,scheduled_at) values ('"+plan+"','WEIGHT_REVIEW',now()) returning id");
            String alert="insert into alerts(preventive_treatment_id,contact_id,monitoring_event_id,alert_type,message) values ('"+tpt+"','"+contact+"','"+e+"','MONITORING_OVERDUE','Safe')";
            s.execute(alert); violation(s,alert,"23505");
            violation(s,"insert into alerts(monitoring_event_id,alert_type,message) values ('"+te+"','X','Safe')","23514");
            violation(s,"insert into alerts(patient_id,preventive_treatment_id,contact_id,alert_type,message) values ('"+p+"','"+tpt+"','"+contact+"','X','Safe')","23514");
            violation(s,"update alerts set case_id='"+k+"' where monitoring_event_id='"+e+"'","23514");
            s.execute("insert into alerts(patient_id,case_id,treatment_id,monitoring_event_id,alert_type,message) values ('"+p+"','"+k+"','"+t+"','"+te+"','X','Safe')");
            violation(s,"update alerts set patient_id=null where monitoring_event_id='"+te+"'","23514");
            violation(s,"update alerts set preventive_treatment_id='"+tpt+"' where monitoring_event_id='"+te+"'","23514");
            violation(s,"insert into alerts(preventive_treatment_id,alert_type,message) values ('"+tpt+"','X','Safe')","23514");
            s.execute("insert into alerts(preventive_treatment_id,contact_id,alert_type,message) values ('"+tpt+"','"+contact+"','X','Safe')");
            s.execute("update contacts set linked_patient_id='"+p+"' where id='"+contact+"'");
            s.execute("insert into alerts(patient_id,preventive_treatment_id,contact_id,alert_type,message) values ('"+p+"','"+tpt+"','"+contact+"','X','Safe')");
            try(var triggers=s.executeQuery("select count(*) from pg_trigger where tgname='trg_alert_lineage'")) { triggers.next(); assertThat(triggers.getInt(1)).isEqualTo(1); }
            UUID a=id(s,"select id from alerts where monitoring_event_id='"+e+"'"),u=id(s,"insert into users(email,password_hash) values ('u@example.org','hash') returning id");
            String ack="insert into alert_acknowledgements(alert_id,user_id) values ('"+a+"','"+u+"')";
            s.execute(ack); violation(s,ack,"23505");
            String notification="insert into notifications(alert_id,user_id,channel) values ('"+a+"','"+u+"','IN_APP')";
            s.execute(notification); violation(s,notification,"23505");
        }
    }
    private String index(Statement s,String name) throws SQLException { try(var r=s.executeQuery("select indexdef from pg_indexes where indexname='"+name+"'")) { assertThat(r.next()).as(name).isTrue(); return r.getString(1); } }
    private UUID id(Statement s,String sql) throws SQLException { try(var r=s.executeQuery(sql)) { r.next(); return r.getObject(1,UUID.class); } }
    private void violation(Statement s,String sql,String state) { assertThatThrownBy(() -> s.execute(sql)).isInstanceOf(SQLException.class).satisfies(e -> assertThat(((SQLException)e).getSQLState()).isEqualTo(state)); }
}
