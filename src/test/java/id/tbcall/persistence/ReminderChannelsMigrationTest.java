package id.tbcall.persistence;

import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

/** Upgrades populated V21 history without Boot, application workers, or provider HTTP. */
@Testcontainers
class ReminderChannelsMigrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine")
        .withImagePullPolicy(image->false).withTmpFs(Map.of("/var/lib/postgresql/data","rw"));
    private static final OffsetDateTime BASE=OffsetDateTime.parse("2026-10-16T01:00:00Z");
    private static final String PHONE_BINDING="a".repeat(64),GENERATION="b".repeat(64);
    private static final Map<String,String> HISTORY=Map.of(
        "reminder_preferences","user_id","reminder_consent_events","id","reminder_jobs","id",
        "reminder_attempts","id","reminder_provider_handoffs","attempt_id","reminder_provider_events","event_key");
    private record Fixture(UUID user,UUID otherUser,UUID link,UUID acceptedJob){}

    private Flyway flyway(String target){return Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).target(target).load();}

    @Test @Timeout(60)
    void upgradingPopulatedV21PreservesHistoryAndAddsIndependentChannelsWithExistingSafetyGuards(){
        assertThat(flyway("21").migrate().migrationsExecuted).isEqualTo(21);
        var source=new DriverManagerDataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());
        JdbcTemplate jdbc=new JdbcTemplate(source);
        Fixture fixture=new TransactionTemplate(new DataSourceTransactionManager(source)).execute(status->seed(jdbc));
        Map<String,List<String>> oldColumns=new LinkedHashMap<>();Map<String,List<String>> before=new LinkedHashMap<>();
        HISTORY.forEach((table,key)->{
            var columns=jdbc.queryForList("select column_name from information_schema.columns where table_schema='public' and table_name=? order by ordinal_position",String.class,table);
            oldColumns.put(table,columns);before.put(table,snapshot(jdbc,table,key,columns));
        });
        assertThat(before.get("reminder_jobs")).hasSize(4);assertThat(before.get("reminder_attempts")).hasSize(3);
        assertThat(before.get("reminder_consent_events")).hasSize(3);assertThat(before.get("reminder_provider_handoffs")).hasSize(3);
        assertThat(before.get("reminder_provider_events")).hasSize(3);

        assertThat(flyway("22").migrate().migrationsExecuted).isEqualTo(1);
        HISTORY.forEach((table,key)->assertThat(snapshot(jdbc,table,key,oldColumns.get(table))).as("unchanged V21 columns in %s",table).containsExactlyElementsOf(before.get(table)));
        assertThat(jdbc.queryForObject("select whatsapp_version=version and whatsapp_version=7 and not email_consent and not telegram_consent and email_version=0 and telegram_version=0 and email_binding is null and telegram_binding is null from reminder_preferences where user_id=?",Boolean.class,fixture.user())).isTrue();
        assertThat(jdbc.queryForList("select state from reminder_jobs order by scheduled_at",String.class)).containsExactly("SCHEDULED","ACCEPTED","UNCERTAIN","DELIVERED");
        assertThat(jdbc.queryForList("select version from flyway_schema_history where success order by installed_rank",String.class)).endsWith("21","22");

        reject("P0001","append-only",()->jdbc.update("update reminder_consent_events set policy_version='REWRITTEN' where user_id=?",fixture.user()));
        reject("P0001","append-only",()->jdbc.update("delete from reminder_consent_events where user_id=?",fixture.user()));
        reject("23514","ck_reminder_consent_actor",()->consent(jdbc,fixture,"SELF_PORTAL","GRANTED",null));
        reject("23514","ck_reminder_consent_actor",()->consent(jdbc,fixture,"SELF_PORTAL","GRANTED",fixture.otherUser()));
        reject("23514","ck_reminder_consent_actor",()->consent(jdbc,fixture,"PROVIDER_OPT_OUT","WITHDRAWN",fixture.user()));
        reject("23514","ck_reminder_consent_actor",()->consent(jdbc,fixture,"PROVIDER_OPT_OUT","GRANTED",null));
        assertThat(snapshot(jdbc,"reminder_consent_events","id",oldColumns.get("reminder_consent_events"))).containsExactlyElementsOf(before.get("reminder_consent_events"));

        // Different enrollment versions must not bypass the existing WhatsApp handoff guard.
        reject("23505","uq_reminder_one_handoff",()->copyJob(jdbc,fixture.acceptedJob(),"WHATSAPP",8,"ACCEPTED"));
        reject("23505","uq_reminder_occurrence_channel",()->copyJob(jdbc,fixture.acceptedJob(),"WHATSAPP",7,"SCHEDULED"));
        UUID email=copyJob(jdbc,fixture.acceptedJob(),"EMAIL",8,"ACCEPTED");
        UUID telegram=copyJob(jdbc,fixture.acceptedJob(),"TELEGRAM",9,"ACCEPTED");
        assertThat(jdbc.queryForList("select channel||':'||preferences_version from reminder_jobs where scheduled_at=(select scheduled_at from reminder_jobs where id=?) and state='ACCEPTED' order by channel",String.class,fixture.acceptedJob()))
            .containsExactly("EMAIL:8","TELEGRAM:9","WHATSAPP:7");
        // A superseded scheduled enrollment is allowed; a second accepted handoff is not.
        copyJob(jdbc,fixture.acceptedJob(),"EMAIL",10,"SCHEDULED");
        reject("23505","uq_reminder_one_handoff",()->copyJob(jdbc,fixture.acceptedJob(),"EMAIL",11,"ACCEPTED"));
        reject("23505","uq_reminder_one_handoff",()->copyJob(jdbc,fixture.acceptedJob(),"TELEGRAM",11,"UNCERTAIN"));
        reject("23503","fk_reminder_attempt_channel",()->attempt(jdbc,email,"TELEGRAM"));
        attempt(jdbc,email,"EMAIL");attempt(jdbc,telegram,"TELEGRAM");
        assertThat(jdbc.queryForObject("select count(*) from reminder_attempts a join reminder_jobs j on j.id=a.job_id where a.channel<>j.channel",Integer.class)).isZero();
        reject("23514","ck_reminder_job_destination",()->jdbc.update("update reminder_jobs set phone_binding=null where id=?",fixture.acceptedJob()));
        reject("23514","ck_reminder_job_destination",()->jdbc.update("update reminder_jobs set phone_binding=? where id=?",PHONE_BINDING,email));
    }

    private Fixture seed(JdbcTemplate jdbc){
        UUID user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at,phone,phone_verified_at) values ('migration-synthetic@example.invalid','unused','ACTIVE',?,'+6281111111001',?) returning id",UUID.class,BASE,BASE);
        UUID other=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('migration-other@example.invalid','unused','ACTIVE',?) returning id",UUID.class,BASE);
        UUID facility=jdbc.queryForObject("insert into facilities(name) values ('Synthetic migration facility') returning id",UUID.class);
        UUID patient=jdbc.queryForObject("insert into patients(full_name) values ('Synthetic migration patient') returning id",UUID.class);
        UUID link=jdbc.queryForObject("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',?) returning id",UUID.class,user,patient,BASE);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-10-14','CONVERTED_TO_CASE') returning id",UUID.class,patient,facility);
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,'2026-10-15','SYNTHETIC','TREAT_HERE') returning id",UUID.class,registration);
        UUID caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,?,'TB_SO','BARU') returning id",UUID.class,registration,diagnosis,facility);
        UUID treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status) values (?,?,'2026-10-15','ACTIVE') returning id",UUID.class,caseId,facility);
        UUID schedule=UUID.randomUUID(),revision=UUID.randomUUID();
        jdbc.update("insert into medication_schedules(id,treatment_id,current_revision_id,status,created_by_user_id,created_at,updated_at) values (?,?,?,'ACTIVE',?,?,?)",schedule,treatment,revision,user,BASE,BASE);
        jdbc.update("insert into medication_schedule_revisions(id,schedule_id,revision_number,status,time_zone,start_date,weekday_mask,valid_from,created_by_user_id,created_at) values (?,?,1,'ACTIVE','Asia/Jakarta','2026-10-16',127,?,?,?)",revision,schedule,BASE,user,BASE);
        jdbc.update("insert into medication_schedule_times(revision_id,local_time) values (?,'08:00')",revision);
        jdbc.update("insert into reminder_preferences(user_id,patient_link_id,link_generation,phone_binding,version,whatsapp_consent,time_zone,all_day,policy_version,updated_at,last_planned_at) values (?,?,?,?,7,true,'Asia/Jakarta',true,'MEDICATION_REMINDERS_V1',?,?)",user,link,GENERATION,PHONE_BINDING,BASE,BASE);
        Fixture fixture=new Fixture(user,other,link,null);
        consent(jdbc,fixture,"SELF_PORTAL","GRANTED",user,1,BASE.minusHours(3));
        consent(jdbc,fixture,"PROVIDER_OPT_OUT","WITHDRAWN",null,2,BASE.minusHours(2));
        consent(jdbc,fixture,"SELF_PORTAL","GRANTED",user,7,BASE.minusHours(1));
        UUID accepted=null;String[] states={"SCHEDULED","ACCEPTED","UNCERTAIN","DELIVERED"};
        for(int index=0;index<states.length;index++){
            String state=states[index];UUID job=UUID.randomUUID();OffsetDateTime occurrence=BASE.plusMinutes(index);
            jdbc.update("""
                insert into reminder_jobs(id,user_id,patient_link_id,link_generation,phone_binding,preferences_version,treatment_id,schedule_id,revision_id,
                    occurrence_id,scheduled_at,logical_key,idempotency_key,channel,state,attempt_count,next_attempt_at,classification,provider_correlation,mode,created_at,updated_at)
                values (?,?,?,?,?,7,?,?,?,?,?,?,?,'WHATSAPP',?,?,?,'LEGACY_FIXTURE',?,'CLOUD_TEST',?,?)
                """,job,user,link,GENERATION,PHONE_BINDING,treatment,schedule,revision,"legacy-"+index,occurrence,"legacy-key-"+index,UUID.randomUUID(),state,index==0?0:1,occurrence,index==0?null:"meta-fixture-"+index,BASE,BASE);
            if(index==0)continue;if(state.equals("ACCEPTED"))accepted=job;
            UUID attempt=attempt(jdbc,job,"WHATSAPP");
            if(state.equals("UNCERTAIN"))jdbc.update("update reminder_attempts set outcome='UNCERTAIN' where id=?",attempt);
            jdbc.update("""
                insert into reminder_provider_handoffs(attempt_id,callback_token,business_account_id,phone_number_id,recipient_digest,message_digest,created_at,accepted_at,delivered_at)
                values (?,?,'123456','654321',?,?,?,?,?)
                """,attempt,UUID.randomUUID(),PHONE_BINDING,state.equals("UNCERTAIN")?null:hex(index),BASE,state.equals("UNCERTAIN")?null:occurrence,state.equals("DELIVERED")?occurrence.plusSeconds(1):null);
            jdbc.update("insert into reminder_provider_events(event_key,handoff_attempt_id,kind,occurred_at,received_at,result) values (?,?,?,?,?,?)",hex(index+100),attempt,state.equals("DELIVERED")?"AUTHORITATIVE_DELIVERY":"ACCEPTANCE",occurrence,occurrence.plusSeconds(1),state.equals("UNCERTAIN")?"IGNORED":"APPLIED");
        }
        return new Fixture(user,other,link,accepted);
    }
    private void consent(JdbcTemplate jdbc,Fixture fixture,String method,String action,UUID actor){consent(jdbc,fixture,method,action,actor,7,BASE.minusHours(1));}
    private void consent(JdbcTemplate jdbc,Fixture fixture,String method,String action,UUID actor,long version,OffsetDateTime recordedAt){
        jdbc.update("""
            insert into reminder_consent_events(id,user_id,patient_link_id,link_generation,phone_binding,channel,action,purpose,policy_version,method,actor_user_id,preferences_version,recorded_at,withdrawn_at)
            values (?,?,?,?,?,'WHATSAPP',?,'MEDICATION_REMINDER','MEDICATION_REMINDERS_V1',?,?,?,?,?)
            """,UUID.randomUUID(),fixture.user(),fixture.link(),GENERATION,PHONE_BINDING,action,method,actor,version,recordedAt,action.equals("WITHDRAWN")?recordedAt:null);
    }
    private UUID attempt(JdbcTemplate jdbc,UUID job,String channel){
        UUID id=UUID.randomUUID();jdbc.update("""
            insert into reminder_attempts(id,job_id,attempt_number,lease_token,channel,outcome,mode,started_at,finished_at,provider_correlation)
            values (?,?,1,?,?,'ACCEPTED',?,?,?,'migration-fixture')
            """,id,job,UUID.randomUUID(),channel,channel.equals("WHATSAPP")?"CLOUD_TEST":"CHANNEL_TEST",BASE,BASE.plusSeconds(1));return id;
    }
    private UUID copyJob(JdbcTemplate jdbc,UUID original,String channel,long version,String state){
        UUID id=UUID.randomUUID();jdbc.update("""
            insert into reminder_jobs(id,user_id,patient_link_id,link_generation,phone_binding,destination_binding,preferences_version,treatment_id,schedule_id,revision_id,
                occurrence_id,scheduled_at,logical_key,idempotency_key,channel,state,attempt_count,next_attempt_at,mode,created_at,updated_at)
            select ?,user_id,patient_link_id,link_generation,?,?,?,treatment_id,schedule_id,revision_id,occurrence_id,scheduled_at,logical_key,?,?,?,1,next_attempt_at,?,created_at,updated_at
            from reminder_jobs where id=?
            """,id,channel.equals("WHATSAPP")?PHONE_BINDING:null,channel.equals("WHATSAPP")?null:channel.equals("EMAIL")?"e".repeat(64):"f".repeat(64),version,UUID.randomUUID(),channel,state,channel.equals("WHATSAPP")?"CLOUD_TEST":"CHANNEL_TEST",original);return id;
    }
    private List<String> snapshot(JdbcTemplate jdbc,String table,String key,List<String> columns){
        return jdbc.queryForList("select row_to_json(projected)::text from (select "+String.join(",",columns)+" from "+table+" order by "+key+") projected",String.class);
    }
    private String hex(int value){return String.format("%064x",value);}
    private void reject(String state,String message,Runnable operation){
        Throwable failure=catchThrowable(operation::run);assertThat(failure).isInstanceOf(DataAccessException.class);
        while(failure.getCause()!=null)failure=failure.getCause();
        assertThat(failure).isInstanceOf(SQLException.class);assertThat(((SQLException)failure).getSQLState()).isEqualTo(state);
        assertThat(failure.getMessage()).contains(message);
    }
}
