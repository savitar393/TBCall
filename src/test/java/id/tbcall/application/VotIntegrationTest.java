package id.tbcall.application;

import id.tbcall.application.vot.VotRetentionService;
import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
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

/** Every SQL mutation is confined to this class's disposable Testcontainers database. */
@SpringBootTest(properties={"tbcall.security.production=false","tbcall.vot.enabled=true","tbcall.vot.synthetic-only=true","tbcall.vot.cleanup-enabled=false"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class VotIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    static final Path MEDIA=temp();
    static Path temp(){try{return Files.createTempDirectory("tbcall-vot-test-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);r.add("spring.datasource.username",POSTGRES::getUsername);r.add("spring.datasource.password",POSTGRES::getPassword);
        r.add("tbcall.vot.storage-path",MEDIA::toString);
    }
    static final AtomicReference<Instant> TIME=new AtomicReference<>(Instant.parse("2026-10-16T00:00:00Z"));
    @TestConfiguration static class Time {
        @Bean @Primary Clock votClock(){return new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return Clock.fixed(TIME.get(),z);}public Instant instant(){return TIME.get();}};}
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords; @Autowired VotRetentionService retention; @Autowired Flyway flyway;
    final JsonMapper json=JsonMapper.builder().build();
    static String hash; static final String PASSWORD="Fictional video test pass 123!";
    UUID facility,foreign,patient,caseId,treatment,staff,self; String occurrence; Cookie staffCookie,selfCookie,caller;
    @BeforeEach void setup()throws Exception{
        TIME.set(Instant.parse("2026-10-16T00:00:00Z"));if(hash==null)hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=facility();foreign=facility();staff=user("officer@example.invalid","TB_OFFICER",facility);self=user("patient@example.invalid","PATIENT",null);
        patient=jdbc.queryForObject("insert into patients(full_name) values ('Fictional VOT Patient') returning id",UUID.class);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-10-15','CONVERTED_TO_CASE') returning id",UUID.class,patient,facility);
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,'2026-10-15','PRIVATE','TREAT_HERE') returning id",UUID.class,registration);
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,?,'TB_SO','BARU') returning id",UUID.class,registration,diagnosis,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status) values (?,?,'2026-10-15','ACTIVE') returning id",UUID.class,caseId,facility);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",self,patient);
        staffCookie=login("officer@example.invalid");selfCookie=login("patient@example.invalid");caller=staffCookie;
        call(post(schedulePath()),Map.of("timeZone","Asia/Jakarta","startDate","2026-10-16","endDate","2026-10-20","times",List.of("08:00","20:00"),"weekdays",List.of(1,2,3,4,5,6,7)),201);
        occurrence=call(get(schedulePath()+"/occurrences").param("from","2026-10-16").param("to","2026-10-16"),null,200).path("content").get(0).path("id").asText();
        TIME.set(Instant.parse("2026-10-16T02:00:00Z"));caller=selfCookie;
    }
    @Test void uploadReviewAndStreamingKeepDoseEvidenceAndPrescriptionUnchanged()throws Exception{
        var before=jdbc.queryForMap("select * from medication_schedules");JsonNode v=upload(201);String id=v.path("id").asText();
        assertThat(v.path("status").asText()).isEqualTo("PENDING_REVIEW");assertThat(v.toString()).doesNotContain("mediaKey","storagePath","Fictional VOT Patient");
        assertThat(call(get("/api/v1/me/vot-submissions"),null,200).path("content")).hasSize(1);
        mvc.perform(get("/api/v1/me/vot-submissions/"+id+"/media").cookie(selfCookie)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store, private")).andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(content().bytes(video()));
        caller=staffCookie;call(get("/api/v1/vot-submissions").param("status","PENDING_REVIEW"),null,200);
        mvc.perform(get("/api/v1/vot-submissions/"+id+"/media").cookie(staffCookie)).andExpect(status().isOk());
        JsonNode reviewed=review(id,"OBSERVED","0",200);assertThat(reviewed.path("reviewedByUserId").asText()).isEqualTo(staff.toString());assertThat(reviewed.path("version").asLong()).isEqualTo(1);
        caller=selfCookie;assertThat(call(get("/api/v1/me/vot-submissions/"+id),null,200).path("status").asText()).isEqualTo("OBSERVED");
        assertThat(jdbc.queryForObject("select count(*) from dose_events",Integer.class)).isZero();assertThat(jdbc.queryForMap("select * from medication_schedules")).isEqualTo(before);
        assertThat(jdbc.queryForObject("select version from treatments where id=?",Long.class,treatment)).isZero();
        for(String action:List.of("VOT_SUBMISSION_CREATED","VOT_VIDEO_STORED","VOT_REVIEW_COMPLETED"))assertThat(jdbc.queryForObject("select count(*) from audit_logs where action=?",Integer.class,action)).isEqualTo(1);
        flyway.validate();
    }
    @Test void consentIsSeparateAndRequired()throws Exception{
        call(uploadRequest().with(r->{r.setParameter("consentAcknowledged","false");return r;}),null,400);
        call(uploadRequest().with(r->{r.setParameter("consentPolicyVersion","old-policy");return r;}),null,400);assertThat(count()).isZero();
    }
    @Test void duplicateNeverReplacesOriginalOrCreatesAnotherFile()throws Exception{
        JsonNode original=upload(201);upload(409);assertThat(count()).isEqualTo(1);assertThat(call(get("/api/v1/me/vot-submissions/"+original.path("id").asText()),null,200).path("version").asLong()).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"REVOKED","PENDING"}) void revokedOrMissingSelfLinkDeniesEveryPatientReadAndWrite(String state)throws Exception{
        String id=upload(201).path("id").asText();jdbc.update("update patient_user_links set verification_status=? where user_id=?",state,self);
        call(get("/api/v1/me/vot-submissions"),null,403);call(get("/api/v1/me/vot-submissions/"+id+"/media"),null,403);upload(403);
    }
    @Test void anotherPatientCannotReadCancelOrStream()throws Exception{
        String id=upload(201).path("id").asText();UUID other=user("other@example.invalid","PATIENT",null);UUID p=jdbc.queryForObject("insert into patients(full_name) values ('Fictional Other') returning id",UUID.class);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",other,p);caller=login("other@example.invalid");
        call(get("/api/v1/me/vot-submissions/"+id),null,404);call(get("/api/v1/me/vot-submissions/"+id+"/media"),null,404);call(post("/api/v1/me/vot-submissions/"+id+"/cancel").header("If-Match","\"0\""),null,404);upload(404);
        assertThat(call(get("/api/v1/me/vot-submissions"),null,200).path("content")).isEmpty();
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","LAB_STAFF","TREATMENT_SUPPORTER","PATIENT"}) void wrongRoleIncludingAdminHasNoVideoAccess(String role)throws Exception{
        String id=upload(201).path("id").asText();user("restricted@example.invalid",role,facility);caller=login("restricted@example.invalid");
        call(get("/api/v1/vot-submissions"),null,403);call(get("/api/v1/vot-submissions/"+id+"/media"),null,403);review(id,"OBSERVED","0",403);
    }
    @Test void foreignInactiveReassignedAndMissingPermissionOfficerDenied()throws Exception{
        String id=upload(201).path("id").asText();user("foreign@example.invalid","TB_OFFICER",foreign);caller=login("foreign@example.invalid");
        assertThat(call(get("/api/v1/vot-submissions"),null,200).path("content")).isEmpty();call(get("/api/v1/vot-submissions/"+id+"/media"),null,404);review(id,"OBSERVED","0",404);
        caller=staffCookie;jdbc.update("update tb_cases set current_facility_id=? where id=?",foreign,caseId);call(get("/api/v1/vot-submissions/"+id),null,404);
        jdbc.update("update tb_cases set current_facility_id=? where id=?",facility,caseId);jdbc.update("update user_facilities set active=false where user_id=?",staff);call(get("/api/v1/vot-submissions/"+id+"/media"),null,403);
        jdbc.update("update user_facilities set active=true where user_id=?",staff);jdbc.update("delete from role_permissions where permission_id=(select id from permissions where code='VOT_REVIEW_WRITE') and role_id=(select id from roles where code='TB_OFFICER')");review(id,"OBSERVED","0",403);
        // Restore reference grant for unrelated regression contexts in this same isolated database.
        jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code='TB_OFFICER' and p.code='VOT_REVIEW_WRITE'");
    }
    @Test void cancelledAndStaleReviewsNeverOverwrite()throws Exception{
        String id=upload(201).path("id").asText();call(post("/api/v1/me/vot-submissions/"+id+"/cancel").header("If-Match","\"0\""),null,200);
        caller=staffCookie;review(id,"OBSERVED","1",409);assertThat(call(get("/api/v1/vot-submissions/"+id),null,200).path("status").asText()).isEqualTo("CANCELLED");
        call(get("/api/v1/vot-submissions/"+id+"/media"),null,410);
        mvc.perform(get("/api/v1/me/vot-submissions/"+id+"/media").cookie(selfCookie)).andExpect(status().isOk());
    }
    @Test void onlyReviewClassificationsAreAllowedAndReviewedDecisionIsFinal()throws Exception{
        String id=upload(201).path("id").asText();caller=staffCookie;review(id,"TAKEN","0",400);review(id,"NOT_VERIFIABLE",null,428);review(id,"NOT_VERIFIABLE","0",200);review(id,"OBSERVED","0",409);review(id,"OBSERVED","1",409);
        caller=selfCookie;call(post("/api/v1/me/vot-submissions/"+id+"/cancel").header("If-Match","\"1\""),null,409);
    }
    @Test void concurrentReviewHasExactlyOneWinner()throws Exception{
        String id=upload(201).path("id").asText();var executor=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{
            Callable<Integer> task=()->{start.await();return mvc.perform(post("/api/v1/vot-submissions/"+id+"/review").cookie(staffCookie).with(csrf()).header("If-Match","\"0\"").contentType("application/json").content("{\"decision\":\"OBSERVED\"}")).andReturn().getResponse().getStatus();};
            var a=executor.submit(task);var b=executor.submit(task);start.countDown();assertThat(List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
        }finally{executor.shutdownNow();}
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='VOT_REVIEW_COMPLETED'",Integer.class)).isEqualTo(1);
    }
    @Test void concurrentDuplicateUploadsKeepExactlyOneOriginal()throws Exception{
        var executor=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{
            Callable<Integer> task=()->{start.await();return mvc.perform(uploadRequest().cookie(selfCookie).with(csrf())).andReturn().getResponse().getStatus();};
            var first=executor.submit(task);var second=executor.submit(task);start.countDown();
            assertThat(List.of(first.get(30,TimeUnit.SECONDS),second.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        }finally{executor.shutdownNow();}
        assertThat(count()).isEqualTo(1);assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='VOT_VIDEO_STORED'",Integer.class)).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"CANCELLED","SUPERSEDED","EXPIRED","PAUSED","FUTURE","INVALID","WRONG_TREATMENT"}) void invalidPrescriptionOrOccurrenceCannotBeSubmitted(String mode)throws Exception{
        if(mode.equals("CANCELLED")){caller=staffCookie;call(post(schedulePath()+"/cancel").header("If-Match","\"0\""),null,200);caller=selfCookie;}
        if(mode.equals("SUPERSEDED"))jdbc.update("update medication_schedule_revisions set status='SUPERSEDED',retired_at=now(),retired_by_user_id=?,valid_until=now()",staff);
        if(mode.equals("EXPIRED"))TIME.set(Instant.parse("2026-10-24T02:00:00Z"));
        if(mode.equals("PAUSED"))jdbc.update("update treatments set status='PAUSED' where id=?",treatment);
        if(mode.equals("FUTURE"))occurrence=occurrence.replace("08:00","20:00");
        if(mode.equals("INVALID"))occurrence=occurrence.replace("08:00","09:00");
        if(mode.equals("WRONG_TREATMENT"))treatment=UUID.randomUUID();
        if(mode.equals("EXPIRED"))caller=login("patient@example.invalid");
        upload(mode.equals("WRONG_TREATMENT")?404:409);assertThat(count()).isZero();
    }
    @Test void malformedOccurrenceAndUnsupportedEmptyTruncatedVideoRejected()throws Exception{
        String old=occurrence;occurrence="malformed";upload(400);occurrence=old;
        call(uploadRequest().contentType("image/png").content(new byte[]{1,2,3}),null,415);
        call(uploadRequest().content(new byte[0]),null,400);call(uploadRequest().content(new byte[]{0,0,0,20,'f','t','y','p'}),null,400);assertThat(count()).isZero();
    }
    @Test void retentionBlocksPlaybackAndReviewsThenDeletesMediaAudibly()throws Exception{
        String id=upload(201).path("id").asText();TIME.set(TIME.get().plus(Duration.ofDays(8)));caller=login("patient@example.invalid");
        call(get("/api/v1/me/vot-submissions/"+id+"/media"),null,410);caller=login("officer@example.invalid");review(id,"OBSERVED","0",410);
        retention.cleanup();retention.cleanup();caller=login("patient@example.invalid");JsonNode v=call(get("/api/v1/me/vot-submissions/"+id),null,200);assertThat(v.path("mediaDeletedAt").isNull()).isFalse();
        assertThat(count()).isEqualTo(1);assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='VOT_MEDIA_DELETED'",Integer.class)).isEqualTo(1);
    }
    @Test void csrfIsEnforcedForUploadAndReview()throws Exception{
        mvc.perform(uploadRequest().cookie(selfCookie)).andExpect(status().isForbidden());String id=upload(201).path("id").asText();
        mvc.perform(post("/api/v1/vot-submissions/"+id+"/review").cookie(staffCookie).contentType("application/json").content("{\"decision\":\"OBSERVED\"}")).andExpect(status().isForbidden());
    }
    @Test void absentSelfTreatmentHistoryIsEmptyAndPaginationBounded()throws Exception{
        assertThat(call(get("/api/v1/me/vot-submissions"),null,200).path("content")).isEmpty();call(get("/api/v1/me/vot-submissions").param("size","101"),null,400);
        jdbc.execute("truncate treatments cascade");assertThat(call(get("/api/v1/me/vot-submissions"),null,200).path("content")).isEmpty();upload(404);
    }
    private int count(){return jdbc.queryForObject("select count(*) from vot_submissions",Integer.class);}
    private JsonNode upload(int expected)throws Exception{return call(uploadRequest(),null,expected);}
    private MockHttpServletRequestBuilder uploadRequest(){return post("/api/v1/me/vot-submissions").queryParam("treatmentId",treatment.toString()).queryParam("occurrenceId",occurrence).queryParam("consentAcknowledged","true").queryParam("consentPolicyVersion","vot-synthetic-v1").contentType("video/mp4").content(video());}
    private JsonNode review(String id,String decision,String version,int expected)throws Exception{var request=post("/api/v1/vot-submissions/"+id+"/review");if(version!=null)request.header("If-Match","\""+version+"\"");return call(request,Map.of("decision",decision,"notes","Synthetic observation only"),expected);}
    @Test void actualServerLimitRejectsOversizedUpload()throws Exception{
        call(uploadRequest().content(new byte[20_971_521]),null,413);assertThat(count()).isZero();
    }
    @Test void missingLinkOrUnverifiedAccountCannotReadOrUpload()throws Exception{
        jdbc.update("update users set email_verified_at=null where id=?",self);call(get("/api/v1/me/vot-submissions"),null,403);upload(403);
        jdbc.update("update users set email_verified_at=now() where id=?",self);jdbc.update("delete from patient_user_links where user_id=?",self);
        call(get("/api/v1/me/vot-submissions"),null,403);upload(403);
    }
    @Test void databaseRollbackDeletesStoredFileAndLeavesNoDraft()throws Exception{
        long filesBefore;try(var files=Files.list(MEDIA)){filesBefore=files.count();}
        jdbc.execute("create function synthetic_vot_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action='VOT_VIDEO_STORED' then raise check_violation using message='Synthetic rollback test'; end if; return NEW; end $$");
        jdbc.execute("create trigger synthetic_vot_audit_failure before insert on audit_logs for each row execute function synthetic_vot_audit_failure()");
        try{upload(409);assertThat(count()).isZero();try(var files=Files.list(MEDIA)){assertThat(files.count()).isEqualTo(filesBefore);}}
        finally{jdbc.execute("drop trigger synthetic_vot_audit_failure on audit_logs");jdbc.execute("drop function synthetic_vot_audit_failure()");}
    }
    @Test void endedPrescriptionCannotAcceptNewVideoEvenWithinHistoryWindow()throws Exception{
        TIME.set(Instant.parse("2026-10-21T02:00:00Z"));caller=login("patient@example.invalid");
        occurrence=occurrence.replace("2026-10-16","2026-10-20");upload(409);assertThat(count()).isZero();
    }
    @Test void failedDeletionDoesNotStarveLaterExpiredMedia()throws Exception{
        String first=upload(201).path("id").asText();TIME.set(Instant.parse("2026-10-16T14:00:00Z"));caller=login("patient@example.invalid");occurrence=occurrence.replace("08:00","20:00");
        String second=upload(201).path("id").asText();String key=jdbc.queryForObject("select media_key from vot_submissions where id=?",String.class,UUID.fromString(first));
        Path blocked=MEDIA.resolve(key);Files.delete(blocked);Files.createDirectory(blocked);
        try{
            TIME.set(TIME.get().plus(Duration.ofDays(8)));assertThat(retention.cleanup(1)).isZero();assertThat(retention.cleanup(1)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select media_deleted_at is not null from vot_submissions where id=?",Boolean.class,UUID.fromString(second))).isTrue();
            assertThat(jdbc.queryForObject("select media_deleted_at is null from vot_submissions where id=?",Boolean.class,UUID.fromString(first))).isTrue();
        }finally{Files.delete(blocked);}
    }
    static byte[] video(){return id.tbcall.application.vot.LocalVotStorageTest.mp4();}
    private String schedulePath(){return "/api/v1/treatments/"+treatment+"/medication-schedule";}
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected)throws Exception{
        if(body!=null)request.contentType("application/json").content(json.writeValueAsString(body));
        var response=mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn().getResponse();String result=response.getContentAsString();return result.isEmpty()?json.nullNode():json.readTree(result);
    }
    private UUID facility(){return jdbc.queryForObject("insert into facilities(name) values ('Fictional VOT Facility') returning id",UUID.class);}
    private UUID user(String email,String role,UUID f){UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash);jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role);if(f!=null)jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,f);return id;}
    private Cookie login(String email)throws Exception{
        jdbc.execute("alter table user_sessions alter column created_at set default timestamptz '"+TIME.get()+"'");
        return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
    }
}
