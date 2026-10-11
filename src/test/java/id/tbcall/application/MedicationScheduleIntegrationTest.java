package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class MedicationScheduleIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);r.add("spring.datasource.username",POSTGRES::getUsername);r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    static final AtomicReference<Instant> TIME=new AtomicReference<>(Instant.parse("2026-10-11T00:00:00Z"));
    @TestConfiguration static class Time {
        @Bean @Primary Clock scheduleClock(){return new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return Clock.fixed(TIME.get(),zone);}public Instant instant(){return TIME.get();}};}
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords;
    final JsonMapper json=JsonMapper.builder().build();
    static String hash;
    static final String PASSWORD="Fictional scheduling pass 123!";
    UUID facility,foreign,patient,caseId,treatment,staff,self,support;
    Cookie staffCookie,selfCookie,supportCookie,caller;
    @BeforeEach void setup()throws Exception{
        TIME.set(Instant.parse("2026-10-11T00:00:00Z"));
        if(hash==null)hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=facility();foreign=facility();staff=user("officer@example.invalid","TB_OFFICER",facility);self=user("patient@example.invalid","PATIENT",null);support=user("support@example.invalid","TREATMENT_SUPPORTER",null);
        patient=jdbc.queryForObject("insert into patients(full_name) values ('Fictional Schedule Patient') returning id",UUID.class);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-10-08','CONVERTED_TO_CASE') returning id",UUID.class,patient,facility);
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,'2026-10-09','PRIVATE','TREAT_HERE') returning id",UUID.class,registration);
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,?,'TB_SO','BARU') returning id",UUID.class,registration,diagnosis,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,'2026-10-10','ACTIVE','PRIVATE') returning id",UUID.class,caseId,facility);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",self,patient);
        jdbc.update("insert into patient_supporters(case_id,supporter_type,full_name,linked_user_id,active) values (?,'PMO','Fictional Supporter',?,true)",caseId,support);
        staffCookie=login("officer@example.invalid");selfCookie=login("patient@example.invalid");supportCookie=login("support@example.invalid");caller=staffCookie;
    }
    @Test void createReadAndBoundedCalendarKeepScheduleSeparateFromEvidence()throws Exception{
        assertThat(call(get(path()),null,200).path("status").asText()).isEqualTo("ABSENT");
        JsonNode schedule=create();assertThat(schedule.path("kind").asText()).isEqualTo("PRESCRIBED_SCHEDULE");
        assertThat(schedule.path("treatmentId").asText()).isEqualTo(treatment.toString());assertThat(schedule.path("version").asLong()).isZero();
        JsonNode occurrences=call(get(path()+"/occurrences").param("from","2026-10-12").param("to","2026-11-11"),null,200);
        assertThat(occurrences.path("content")).hasSize(62);assertThat(occurrences.path("content").get(0).path("kind").asText()).isEqualTo("EXPECTED_OCCURRENCE");
        assertThat(occurrences.path("content").get(0).path("scheduledAt").asText()).isEqualTo("2026-10-12T08:00:00+07:00");
        assertThat(jdbc.queryForObject("select count(*) from dose_events",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select version from treatments where id=?",Long.class,treatment)).isZero();
        audit("MEDICATION_SCHEDULE_CREATED",1);
    }
    @Test void revisionCancellationAndStalePreconditionsRetainHistory()throws Exception{
        create();var revised=input();revised.put("startDate","2026-10-20");revised.put("times",List.of("09:00"));
        call(patch(path()).header("If-Match","\"0\""),revised,200);
        call(patch(path()).header("If-Match","\"0\""),revised,409);
        JsonNode history=call(get(path()+"/revisions"),null,200);assertThat(history.path("totalElements").asLong()).isEqualTo(2);
        assertThat(history.toString()).contains("SUPERSEDED","08:00","09:00");
        JsonNode old=call(get(path()+"/occurrences").param("from","2026-10-12").param("to","2026-10-12"),null,200);assertThat(old.path("content")).hasSize(2);
        call(post(path()+"/cancel").header("If-Match","\"1\""),null,200);
        assertThat(call(get(path()),null,200).path("status").asText()).isEqualTo("CANCELLED");
        assertThat(call(get(path()+"/occurrences").param("from","2026-10-12").param("to","2026-10-31"),null,200).path("content")).isEmpty();
        audit("MEDICATION_SCHEDULE_REVISED",1);audit("MEDICATION_SCHEDULE_CANCELLED",1);
    }
    @Test void missingVersionAndDuplicatePrescriptionRefuseAtomicWrites()throws Exception{
        create();call(patch(path()),input(),428);call(post(path()),input(),409);
        assertThat(jdbc.queryForObject("select count(*) from medication_schedule_revisions",Integer.class)).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","LAB_STAFF","PATIENT","TREATMENT_SUPPORTER"})
    void wrongStaffRoleCannotReadOrWrite(String role)throws Exception{
        user("wrong@example.invalid",role,facility);caller=login("wrong@example.invalid");call(get(path()),null,403);call(post(path()),input(),403);
    }
    @Test void foreignFacilityAndIndependentPermissionsProtectAllReads()throws Exception{
        create();UUID stranger=user("foreign@example.invalid","TB_OFFICER",foreign);caller=login("foreign@example.invalid");call(get(path()),null,404);call(post(path()),input(),404);
        caller=staffCookie;jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code='TREATMENT_READ')");
        try {call(get(path()),null,403);} finally {jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='TB_OFFICER' and p.code='TREATMENT_READ'");}
    }
    @Test void linkedReadersAreReadOnlyAndRevocationIsImmediate()throws Exception{
        create();caller=selfCookie;assertThat(call(get(selfPath()),null,200).toString()).doesNotContain("PRIVATE","createdBy","patientId","notes");call(post(path()),input(),403);
        caller=supportCookie;call(get(supportPath()),null,200);call(get("/api/v1/me/supporting-cases/"+UUID.randomUUID()+"/medication-schedule"),null,404);
        jdbc.update("update patient_supporters set active=false where linked_user_id=?",support);call(get(supportPath()),null,404);
        caller=selfCookie;jdbc.update("update patient_user_links set verification_status='REVOKED' where user_id=?",self);call(get(selfPath()),null,403);
    }
    @ParameterizedTest @ValueSource(strings={"PLANNED","PAUSED","COMPLETED","STOPPED","CANCELLED","TRANSFERRED"})
    void ineligibleTreatmentRejectsChanges(String state)throws Exception{
        create();jdbc.update("update treatments set status=? where id=?",state,treatment);call(patch(path()).header("If-Match","\"0\""),input(),409);call(post(path()+"/cancel").header("If-Match","\"0\""),null,409);
    }
    @Test void parentAuthorityIsNotInheritedAndTransferInvalidatesScope()throws Exception{
        jdbc.update("insert into external_source_authorities(external_system_id,entity_type,entity_id,authority_scope) select id,'TREATMENT',?,'CLINICAL' from external_systems where code='SITB'",treatment);
        // Parent ownership is not inherited under the existing exact-target authority contract.
        create();jdbc.update("update tb_cases set current_facility_id=? where id=?",foreign,caseId);call(patch(path()).header("If-Match","\"0\""),input(),404);
    }
    @ParameterizedTest @ValueSource(strings={"zone","time","duplicateTime","days","duplicateDay","dates","backdate","unknown","range","page"})
    void invalidDefinitionsAndUnboundedQueriesReject(String problem)throws Exception{
        var value=input();switch(problem){
            case "zone"->value.put("timeZone","GMT+7");case "time"->value.put("times",List.of("25:00"));case "duplicateTime"->value.put("times",List.of("08:00","08:00"));
            case "days"->value.put("weekdays",List.of(0,8));case "duplicateDay"->value.put("weekdays",List.of(1,1));case "dates"->value.put("endDate","2026-10-01");case "backdate"->value.put("startDate","2026-10-09");case "unknown"->value.put("doseValue",123);
            case "range"->{call(get(path()+"/occurrences").param("from","2026-10-01").param("to","2026-12-01"),null,400);return;}
            case "page"->{call(get(path()+"/revisions").param("size","101"),null,400);return;}
        }call(post(path()),value,400);assertThat(jdbc.queryForObject("select count(*) from medication_schedules",Integer.class)).isZero();
    }
    @ParameterizedTest @CsvSource({"Asia/Jakarta,+07:00","Asia/Makassar,+08:00","Asia/Jayapura,+09:00"})
    void selectedWeekdaysAndIndonesianOffsetsAreExplicit(String zone,String offset)throws Exception{
        var value=input();value.put("timeZone",zone);value.put("weekdays",List.of(1));create(value);
        JsonNode page=call(get(path()+"/occurrences").param("from","2026-10-12").param("to","2026-10-18"),null,200);assertThat(page.path("content")).hasSize(2);
        assertThat(page.path("content").get(0).path("scheduledAt").asText()).endsWith(offset);
    }
    @Test void dstGapIsExplicitAndOverlapHasOneDeterministicOffset()throws Exception{
        var value=input();value.put("timeZone","America/New_York");value.put("startDate","2026-10-12");value.put("endDate","2027-04-01");value.put("times",List.of("01:30","02:30"));create(value);
        JsonNode overlap=call(get(path()+"/occurrences").param("from","2026-11-01").param("to","2026-11-01"),null,200);assertThat(overlap.path("content")).hasSize(2);assertThat(overlap.toString()).contains("EARLIER_OFFSET");
        JsonNode gap=call(get(path()+"/occurrences").param("from","2027-03-14").param("to","2027-03-14"),null,200);assertThat(gap.path("content")).hasSize(1);assertThat(gap.path("exceptions")).hasSize(1);assertThat(gap.toString()).contains("LOCAL_TIME_GAP");
    }
    @Test void sameDayRevisionsAndCancellationKeepElapsedOccurrencesAndIdentifiers()throws Exception{
        var value=input();value.put("startDate","2026-10-11");create(value);
        JsonNode before=call(get(path()+"/occurrences").param("from","2026-10-11").param("to","2026-10-11"),null,200);
        String elapsedId=before.path("content").get(0).path("id").asText();
        TIME.set(Instant.parse("2026-10-11T02:00:00Z"));value.put("times",List.of("10:00"));
        call(patch(path()).header("If-Match","\"0\""),value,200);
        JsonNode revised=call(get(path()+"/occurrences").param("from","2026-10-11").param("to","2026-10-11"),null,200);
        assertThat(revised.path("content")).hasSize(2);assertThat(revised.path("content").get(0).path("id").asText()).isEqualTo(elapsedId);
        TIME.set(Instant.parse("2026-10-11T02:30:00Z"));call(post(path()+"/cancel").header("If-Match","\"1\""),null,200);
        JsonNode cancelled=call(get(path()+"/occurrences").param("from","2026-10-11").param("to","2026-10-11"),null,200);
        assertThat(cancelled.path("content")).hasSize(1);assertThat(cancelled.path("content").get(0).path("id").asText()).isEqualTo(elapsedId);
    }
    @Test void simultaneousCreationHasOnePrescriptionAndOneAudit()throws Exception{
        List<Integer> statuses=race(false);assertThat(statuses).containsExactlyInAnyOrder(201,409);
        assertThat(jdbc.queryForObject("select count(*) from medication_schedules",Integer.class)).isEqualTo(1);audit("MEDICATION_SCHEDULE_CREATED",1);
    }
    @Test void simultaneousRevisionsWithEqualEtagHaveExactlyOneWinner()throws Exception{
        create();List<Integer> statuses=race(true);assertThat(statuses).containsExactlyInAnyOrder(200,409);
        assertThat(jdbc.queryForObject("select count(*) from medication_schedule_revisions",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select version from medication_schedules",Long.class)).isEqualTo(1);audit("MEDICATION_SCHEDULE_REVISED",1);
    }
    private List<Integer> race(boolean revision)throws Exception{
        Cookie separate=login("officer@example.invalid");String body=json.writeValueAsString(input());String uri=path();var gate=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)){
            List<Future<Integer>> tasks=new ArrayList<>();for(Cookie cookie:List.of(staffCookie,separate))tasks.add(executor.submit(()->{
                if(!gate.await(5,TimeUnit.SECONDS))throw new AssertionError("Concurrent start timeout");
                var request=revision?patch(uri).header("If-Match","\"0\""):post(uri);
                return mvc.perform(request.cookie(cookie).with(csrf()).contentType("application/json").content(body)).andReturn().getResponse().getStatus();
            }));gate.countDown();return List.of(tasks.get(0).get(10,TimeUnit.SECONDS),tasks.get(1).get(10,TimeUnit.SECONDS));
        }
    }
    @Test void schedulingNeverChangesActorDayDoseEvidence()throws Exception{
        caller=selfCookie;var body=Map.of("scheduledDate","2026-10-11","status","TAKEN_SELF_REPORTED");
        call(post("/api/v1/me/treatment/dose-events"),body,201);var original=jdbc.queryForMap("select * from dose_events");
        caller=staffCookie;create();var revised=input();revised.put("times",List.of("09:00"));call(patch(path()).header("If-Match","\"0\""),revised,200);call(post(path()+"/cancel").header("If-Match","\"1\""),null,200);
        assertThat(jdbc.queryForMap("select * from dose_events")).isEqualTo(original);
        caller=selfCookie;call(post("/api/v1/me/treatment/dose-events"),body,409);audit("DOSE_EVENT_RECORDED",1);
    }
    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","PATIENT","TREATMENT_SUPPORTER"})
    void treatmentReadIsRequiredForEveryCalendarRoute(String role)throws Exception{
        create();String uri=role.equals("TB_OFFICER")?path():role.equals("PATIENT")?selfPath():supportPath();caller=role.equals("TB_OFFICER")?staffCookie:role.equals("PATIENT")?selfCookie:supportCookie;
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id=(select id from permissions where code='TREATMENT_READ')",role);
        try{call(get(uri),null,403);call(get(uri+"/occurrences").param("from","2026-10-12").param("to","2026-10-12"),null,403);}
        finally{jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code=? and p.code='TREATMENT_READ'",role);}
    }
    @Test void writePermissionAndCsrfCannotBeBypassed()throws Exception{
        mvc.perform(post(path()).cookie(staffCookie).contentType("application/json").content(json.writeValueAsString(input()))).andExpect(status().isForbidden());
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id=(select id from permissions where code='TREATMENT_WRITE')");
        try{call(post(path()),input(),403);assertThat(call(get(path()),null,200).path("status").asText()).isEqualTo("ABSENT");}
        finally{jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='TB_OFFICER' and p.code='TREATMENT_WRITE'");}
    }
    @ParameterizedTest @ValueSource(strings={"rootRevision","rootCancel","revisionRevision","revisionCancel"})
    void exactEditedScheduleAuthorityBlocksAtomically(String command)throws Exception{
        JsonNode created=create();boolean root=command.startsWith("root");UUID id=UUID.fromString((root?created.path("id"):created.path("currentRevision").path("id")).asText());
        jdbc.update("insert into external_source_authorities(external_system_id,entity_type,entity_id,authority_scope) select id,?,?,'CLINICAL' from external_systems where code='SITB'",root?"MEDICATION_SCHEDULE":"MEDICATION_SCHEDULE_REVISION",id);
        if(command.endsWith("Cancel"))call(post(path()+"/cancel").header("If-Match","\"0\""),null,409);else call(patch(path()).header("If-Match","\"0\""),input(),409);
        assertThat(jdbc.queryForObject("select version from medication_schedules",Long.class)).isZero();assertThat(jdbc.queryForObject("select count(*) from medication_schedule_revisions",Integer.class)).isEqualTo(1);
        audit("MEDICATION_SCHEDULE_REVISED",0);audit("MEDICATION_SCHEDULE_CANCELLED",0);
    }
    @Test void aShortFutureRangeExcludesManyRetiredOpenEndedDefinitions()throws Exception{
        JsonNode created=create();UUID schedule=UUID.fromString(created.path("id").asText());UUID current=UUID.fromString(created.path("currentRevision").path("id").asText());
        jdbc.update("update medication_schedule_revisions set end_date=null where id=?",current);
        for(int i=2;i<=131;i++){
            OffsetDateTime boundary=OffsetDateTime.parse("2026-10-12T00:00:00Z").plusMinutes(i);
            jdbc.update("update medication_schedule_revisions set status='SUPERSEDED',valid_until=?,retired_by_user_id=?,retired_at=? where id=?",boundary,staff,boundary,current);
            current=jdbc.queryForObject("insert into medication_schedule_revisions(id,schedule_id,revision_number,status,time_zone,start_date,weekday_mask,valid_from,created_by_user_id,created_at) values (gen_random_uuid(),?,?,'ACTIVE','Asia/Jakarta','2026-10-12',127,?,?,?) returning id",UUID.class,schedule,i,boundary,staff,boundary);
            jdbc.update("insert into medication_schedule_times(revision_id,local_time) values (?,'08:00')",current);jdbc.update("update medication_schedules set current_revision_id=? where id=?",current,schedule);
        }
        JsonNode future=call(get(path()+"/occurrences").param("from","2026-11-01").param("to","2026-11-01"),null,200);assertThat(future.path("content")).hasSize(1);
    }
    @ParameterizedTest @ValueSource(strings={"afterActivation","beforeCancellation"})
    void dstGapOutsideEffectiveWindowIsNotReported(String scenario)throws Exception{
        TIME.set(Instant.parse(scenario.equals("afterActivation")?"2027-03-14T08:00:00Z":"2027-03-14T05:00:00Z"));caller=login("officer@example.invalid");
        var value=input();value.put("startDate","2027-03-14");value.put("endDate","2027-03-15");value.put("timeZone","America/New_York");value.put("times",List.of("02:30"));create(value);
        if(scenario.equals("beforeCancellation")){TIME.set(Instant.parse("2027-03-14T06:30:00Z"));call(post(path()+"/cancel").header("If-Match","\"0\""),null,200);}
        JsonNode calendar=call(get(path()+"/occurrences").param("from","2027-03-14").param("to","2027-03-14"),null,200);assertThat(calendar.path("content")).isEmpty();assertThat(calendar.path("exceptions")).isEmpty();
    }
    @Test void aMidnightDstGapAtActivationIsExplicit()throws Exception{
        var value=input();value.put("timeZone","Africa/Cairo");value.put("startDate","2027-04-30");value.put("endDate","2027-04-30");value.put("times",List.of("00:30"));
        create(value);
        JsonNode page=call(get(path()+"/occurrences").param("from","2027-04-30").param("to","2027-04-30"),null,200);
        assertThat(page.path("content")).isEmpty();assertThat(page.path("exceptions")).hasSize(1);
        assertThat(page.path("exceptions").get(0).path("code").asText()).isEqualTo("LOCAL_TIME_GAP");
    }
    @Test void v18UpgradesPopulatedV17WithoutChangingTreatmentOrDoseEvidence()throws Exception{
        var migration=Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())
                .schemas("scheduling_upgrade").defaultSchema("scheduling_upgrade");
        migration.target("17").load().migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());var statement=connection.createStatement()){
            statement.execute("set search_path to scheduling_upgrade,public");
            statement.execute("insert into facilities(name) values ('Fictional upgrade facility')");
            statement.execute("insert into patients(full_name) values ('Fictional upgrade patient')");
            statement.execute("insert into tb_registrations(patient_id,facility_id,registration_date) select p.id,f.id,'2026-10-01' from patients p cross join facilities f");
            statement.execute("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) select r.id,r.facility_id,'TB_SO','BARU' from tb_registrations r");
            statement.execute("insert into treatments(case_id,facility_id,start_date,status) select c.id,c.current_facility_id,'2026-10-02','ACTIVE' from tb_cases c");
            statement.execute("insert into dose_events(treatment_id,scheduled_date,status,source) select t.id,'2026-10-03','UNKNOWN','IMPORT' from treatments t");
            String before;
            try(var rows=statement.executeQuery("select to_jsonb(t)::text || to_jsonb(d)::text from treatments t join dose_events d on d.treatment_id=t.id")){assertThat(rows.next()).isTrue();before=rows.getString(1);}
            migration.target("18").load().migrate();
            try(var rows=statement.executeQuery("select to_jsonb(t)::text || to_jsonb(d)::text from treatments t join dose_events d on d.treatment_id=t.id")){assertThat(rows.next()).isTrue();assertThat(rows.getString(1)).isEqualTo(before);assertThat(rows.next()).isFalse();}
            try(var rows=statement.executeQuery("select count(*) from medication_schedules")){assertThat(rows.next()).isTrue();assertThat(rows.getLong(1)).isZero();}
            try(var rows=statement.executeQuery("select version from flyway_schema_history where success order by installed_rank desc limit 1")){assertThat(rows.next()).isTrue();assertThat(rows.getString(1)).isEqualTo("18");}
        }
    }
    @ParameterizedTest @ValueSource(strings={"COMPLETED","STOPPED","CANCELLED","TRANSFERRED","PAUSED","PLANNED"})
    void inactiveTreatmentKeepsPastOccurrencesButSuppressesAtAndAfterQueryTimeForAllReaders(String state)throws Exception{
        var value=input();value.put("startDate","2026-10-11");JsonNode prescribed=create(value);
        TIME.set(Instant.parse("2026-10-12T01:00:00Z"));
        jdbc.update("update treatments set status=? where id=?",state,treatment);
        for(String role:List.of("TB_OFFICER","PATIENT","TREATMENT_SUPPORTER")){
            String uri=lifecycleReader(role);
            JsonNode calendar=call(get(uri+"/occurrences").param("from","2026-10-11").param("to","2026-10-13"),null,200);
            assertThat(calendar.path("content")).hasSize(2);
            assertThat(calendar.path("content").get(0).path("scheduledAt").asText()).isEqualTo("2026-10-11T08:00:00+07:00");
            assertThat(calendar.path("content").get(1).path("scheduledAt").asText()).isEqualTo("2026-10-11T20:00:00+07:00");
            assertLifecycle(calendar,state,false,null,false);
            JsonNode read=call(get(uri),null,200);assertLifecycle(read,state,false,null,false);
            assertThat(read.path("status").asText()).isEqualTo("ACTIVE");
            assertThat(read.path("currentRevision")).isEqualTo(prescribed.path("currentRevision"));
            JsonNode historical=call(get(uri+"/occurrences").param("from","2026-10-11").param("to","2026-10-11"),null,200);
            assertThat(historical.path("content")).isEqualTo(calendar.path("content"));
        }
        caller=login("officer@example.invalid");
        assertThat(call(get(path()+"/revisions"),null,200).path("content").get(0)).isEqualTo(prescribed.path("currentRevision"));
    }
    @ParameterizedTest @ValueSource(strings={"COMPLETED","STOPPED","CANCELLED","TRANSFERRED","PAUSED","PLANNED"})
    void actualEndDateBoundsHistoricalLocalDatesForEveryReader(String state)throws Exception{
        var value=input();value.put("startDate","2026-10-11");create(value);
        TIME.set(Instant.parse("2026-10-13T00:00:00Z"));
        jdbc.update("update treatments set status=?,actual_end_date='2026-10-11' where id=?",state,treatment);
        for(String role:List.of("TB_OFFICER","PATIENT","TREATMENT_SUPPORTER")){
            String uri=lifecycleReader(role);
            JsonNode calendar=call(get(uri+"/occurrences").param("from","2026-10-11").param("to","2026-10-13"),null,200);
            assertThat(calendar.path("content")).hasSize(2);
            assertThat(calendar.path("content").get(1).path("localDate").asText()).isEqualTo("2026-10-11");
            assertLifecycle(calendar,state,false,"2026-10-11",true);
            assertLifecycle(call(get(uri),null,200),state,false,"2026-10-11",true);
        }
    }
    @ParameterizedTest @CsvSource({"2027-03-14T06:59:59Z,0","2027-03-14T07:00:00Z,0","2027-03-14T07:00:01Z,1"})
    void pausedTreatmentSuppressesDstExceptionsAtAndAfterQueryTime(String instant,int expectedExceptions)throws Exception{
        var value=input();value.put("timeZone","America/New_York");value.put("startDate","2027-03-14");value.put("endDate","2027-03-15");value.put("times",List.of("02:30"));create(value);
        TIME.set(Instant.parse(instant));caller=login("officer@example.invalid");jdbc.update("update treatments set status='PAUSED' where id=?",treatment);
        JsonNode calendar=call(get(path()+"/occurrences").param("from","2027-03-14").param("to","2027-03-15"),null,200);
        assertThat(calendar.path("content")).isEmpty();assertThat(calendar.path("exceptions")).hasSize(expectedExceptions);
        jdbc.update("update treatments set actual_end_date='2027-03-13' where id=?",treatment);
        assertThat(call(get(path()+"/occurrences").param("from","2027-03-14").param("to","2027-03-15"),null,200).path("exceptions")).isEmpty();
    }
    @ParameterizedTest @ValueSource(strings={"ACTIVE","PAUSED","COMPLETED"})
    void absentScheduleStillExposesTreatmentLifecycleForAllReaders(String state)throws Exception{
        jdbc.update("update treatments set status=? where id=?",state,treatment);
        for(String role:List.of("TB_OFFICER","PATIENT","TREATMENT_SUPPORTER")){
            String uri=lifecycleReader(role);JsonNode read=call(get(uri),null,200);
            assertThat(read.path("status").asText()).isEqualTo("ABSENT");assertLifecycle(read,state,state.equals("ACTIVE"),null,false);
            JsonNode calendar=call(get(uri+"/occurrences").param("from","2026-10-11").param("to","2026-10-12"),null,200);
            assertThat(calendar.path("content")).isEmpty();assertLifecycle(calendar,state,state.equals("ACTIVE"),null,false);
        }
    }
    @Test void inactiveScheduleReadsPreserveDoseEvidenceAndExistingCancellationCutoff()throws Exception{
        caller=selfCookie;call(post("/api/v1/me/treatment/dose-events"),Map.of("scheduledDate","2026-10-11","status","TAKEN_SELF_REPORTED"),201);
        Map<String,Object> evidence=jdbc.queryForMap("select * from dose_events");caller=staffCookie;
        var value=input();value.put("startDate","2026-10-11");create(value);
        TIME.set(Instant.parse("2026-10-11T02:00:00Z"));call(post(path()+"/cancel").header("If-Match","\"0\""),null,200);
        Map<String,Object> prescription=jdbc.queryForMap("select * from medication_schedules");
        Map<String,Object> revision=jdbc.queryForMap("select * from medication_schedule_revisions");
        jdbc.update("update treatments set status='COMPLETED',actual_end_date='2026-10-11' where id=?",treatment);
        TIME.set(Instant.parse("2026-10-12T00:00:00Z"));
        for(String role:List.of("TB_OFFICER","PATIENT","TREATMENT_SUPPORTER")){
            String uri=lifecycleReader(role);assertThat(call(get(uri),null,200).path("status").asText()).isEqualTo("CANCELLED");
            JsonNode calendar=call(get(uri+"/occurrences").param("from","2026-10-11").param("to","2026-10-12"),null,200);
            assertThat(calendar.path("content")).hasSize(1);assertThat(calendar.path("content").get(0).path("localTime").asText()).isEqualTo("08:00");
        }
        assertThat(jdbc.queryForMap("select * from dose_events")).isEqualTo(evidence);
        assertThat(jdbc.queryForMap("select * from medication_schedules")).isEqualTo(prescription);
        assertThat(jdbc.queryForMap("select * from medication_schedule_revisions")).isEqualTo(revision);
    }
    private String lifecycleReader(String role)throws Exception{
        caller=login(role.equals("TB_OFFICER")?"officer@example.invalid":role.equals("PATIENT")?"patient@example.invalid":"support@example.invalid");
        return role.equals("TB_OFFICER")?path():role.equals("PATIENT")?selfPath():supportPath();
    }
    private void assertLifecycle(JsonNode response,String state,boolean futureAllowed,String endDate,boolean boundaryKnown){
        JsonNode lifecycle=response.path("lifecycle");assertThat(lifecycle.path("treatmentStatus").asText()).isEqualTo(state);
        assertThat(lifecycle.path("futureExpectationsAllowed").asBoolean()).isEqualTo(futureAllowed);
        if(endDate==null)assertThat(lifecycle.path("actualEndDate").isNull()).isTrue();else assertThat(lifecycle.path("actualEndDate").asText()).isEqualTo(endDate);
        assertThat(lifecycle.path("historyBoundaryKnown").asBoolean()).isEqualTo(boundaryKnown);
    }
    private Map<String,Object> input(){return new HashMap<>(Map.of("timeZone","Asia/Jakarta","startDate","2026-10-12","endDate","2026-11-12","times",List.of("08:00","20:00"),"weekdays",List.of(1,2,3,4,5,6,7)));}
    private String path(){return "/api/v1/treatments/"+treatment+"/medication-schedule";}
    private String selfPath(){return "/api/v1/me/treatment/medication-schedule";}
    private String supportPath(){return "/api/v1/me/supporting-cases/"+caseId+"/medication-schedule";}
    private JsonNode create()throws Exception{return create(input());}
    private JsonNode create(Map<String,Object> v)throws Exception{return call(post(path()),v,201);}
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int status)throws Exception{
        if(body!=null)request.contentType("application/json").content(json.writeValueAsString(body));
        String result=mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(status)).andReturn().getResponse().getContentAsString();return result.isEmpty()?json.nullNode():json.readTree(result);
    }
    private UUID facility(){return jdbc.queryForObject("insert into facilities(name) values ('Fictional Facility') returning id",UUID.class);}
    private UUID user(String email,String role,UUID f){UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash);jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role);if(f!=null)jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,f);return id;}
    private Cookie login(String email)throws Exception{return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");}
    private void audit(String action,int count){assertThat(jdbc.queryForObject("select count(*) from audit_logs where action=?",Integer.class,action)).isEqualTo(count);}
}
