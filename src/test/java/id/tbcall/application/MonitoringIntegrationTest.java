package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import id.tbcall.authorization.*;
import id.tbcall.application.common.ApplicationFailure;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false","tbcall.security.expose-verification-tokens=true","tbcall.monitoring.scheduler-enabled=false"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class MonitoringIntegrationTest {
    @TestConfiguration static class TimeConfig { @Bean @Primary Clock monitoringClock() { return Clock.fixed(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS),ZoneOffset.UTC); } }
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) { r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername); r.add("spring.datasource.password",POSTGRES::getPassword); }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords; @Autowired Clock clock; @Autowired ApplicationContext context;
    @MockitoSpyBean MonitoringSourceAuthorityPolicy monitoringSource;
    @MockitoSpyBean ReferralSourceAuthorityPolicy referralSource;
    final JsonMapper json=JsonMapper.builder().build(); static String hash; static final String PASSWORD="Monitoring password 123!";
    UUID source,destination,patient,linked,caseId,treatment,contact,tpt,officer,self,supporter,destinationOfficer; Cookie staffCookie,selfCookie,supportCookie,destinationCookie,caller;
    @BeforeEach void setup() throws Exception {
        reset(monitoringSource,referralSource);
        if(hash==null) hash=passwords.encode(PASSWORD); jdbc.execute("truncate users,patients,facilities restart identity cascade");
        source=facility("Source"); destination=facility("Destination");
        officer=user("officer@example.org","TB_OFFICER",source); destinationOfficer=user("dest@example.org","TB_OFFICER",destination);
        self=user("self@example.org","PATIENT",null); supporter=user("support@example.org","TREATMENT_SUPPORTER",null);
        patient=patient("PRIVATE PATIENT"); linked=patient("PRIVATE LINKED");
        UUID r=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,?) returning id",UUID.class,patient,source,today().minusDays(10));
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code,status) values (?,?,'TB_SO','BARU','ACTIVE') returning id",UUID.class,r,source);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,planned_end_date) values (?,?,?,'ACTIVE',?) returning id",UUID.class,caseId,source,today().minusDays(5),today().plusDays(30));
        contact=jdbc.queryForObject("insert into contacts(index_case_id,full_name,linked_patient_id) values (?,'PRIVATE CONTACT',?) returning id",UUID.class,caseId,linked);
        tpt=jdbc.queryForObject("insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date,status) values (?,?,?,?,'ACTIVE') returning id",UUID.class,contact,caseId,source,today().minusDays(5));
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status) values (?,?,'SELF','VERIFIED')",self,patient);
        jdbc.update("insert into patient_supporters(case_id,supporter_type,full_name,linked_user_id,active) values (?,'PMO','PRIVATE SUPPORTER',?,true)",caseId,supporter);
        staffCookie=login("officer@example.org"); destinationCookie=login("dest@example.org"); selfCookie=login("self@example.org"); supportCookie=login("support@example.org"); caller=staffCookie;
    }
    @ParameterizedTest @ValueSource(booleans={false,true}) void explicitPlanCreatesOnlyEnteredEvents(boolean preventive) throws Exception {
        var p=create(preventive,"future"); assertThat(p.path("targetType").asText()).isEqualTo(preventive ? "TPT" : "TREATMENT");
        assertThat(p.path("rulesVersion").asText()).isEqualTo("MANUAL_V1"); assertThat(count("monitoring_events")).isEqualTo(1); assertThat(count("alerts")).isZero();
        assertThat(events(p).path("content").get(0).path("status").asText()).isEqualTo("SCHEDULED");
        assertThat(count("follow_ups")).isZero(); assertThat(count("lab_requests")).isZero(); assertThat(count("dose_events")).isZero();
    }
    @ParameterizedTest @CsvSource({"future,SCHEDULED,0","due,DUE,0","overdue,OVERDUE,1","equal,DUE,0"}) void initialStateUsesOnlyExplicitTimes(String time,String state,int alerts) throws Exception {
        var p=create(false,time); assertThat(events(p).path("content").get(0).path("status").asText()).isEqualTo(state); assertThat(count("alerts")).isEqualTo(alerts);
        if(alerts==1) { assertThat(jdbc.queryForObject("select severity from alerts",String.class)).isEqualTo("WARNING"); assertThat(count("notifications")).isEqualTo(3); }
    }
    @ParameterizedTest @ValueSource(strings={"empty","tooMany","badCode","beforeStart","dueBefore","endBefore","futureStart","beforeTreatment","endBeyond","afterEnd","metadata","target","rulesVersion"})
    void invalidPlanIsAtomic(String invalid) throws Exception {
        var input=planInput("future"); var event=new HashMap<>(eventInput("future"));
        switch(invalid) {
            case "empty" -> input.put("events",List.of()); case "tooMany" -> input.put("events",Collections.nCopies(101,event));
            case "badCode" -> event.put("eventType","ARBITRARY"); case "beforeStart" -> event.put("scheduledAt",now().minusDays(6).toString());
            case "dueBefore" -> event.put("dueAt",now().toString()); case "endBefore" -> input.put("endDate",today().minusDays(6).toString());
            case "futureStart" -> input.put("startDate",today().plusDays(1).toString()); case "beforeTreatment" -> input.put("startDate",today().minusDays(6).toString());
            case "endBeyond" -> input.put("endDate",today().plusDays(31).toString()); case "afterEnd" -> input.put("endDate",today().toString());
            default -> input.put(invalid,"spoof");
        }
        if(!Set.of("empty","tooMany").contains(invalid)) input.put("events",List.of(event));
        call(post(createPath(false)),input,400); assertThat(count("monitoring_plans")).isZero(); assertThat(count("monitoring_events")).isZero(); assertThat(count("alerts")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"BACTERIOLOGY_FOLLOW_UP","SAFETY_MONITORING"}) void tptRejectsTreatmentOnlyEventCodes(String code) throws Exception {
        var input=planInput("future"); var event=new HashMap<>(eventInput("future")); event.put("eventType",code); input.put("events",List.of(event)); call(post(createPath(true)),input,400);
    }
    @ParameterizedTest @ValueSource(strings={"CLINICAL_REVIEW","WEIGHT_REVIEW","ADHERENCE_REVIEW","ADVERSE_EVENT_REVIEW","BACTERIOLOGY_FOLLOW_UP","SAFETY_MONITORING","MEDICATION_PICKUP"}) void allCanonicalTreatmentCodesWork(String code) throws Exception {
        var input=planInput("future"); var e=new HashMap<>(eventInput("future")); e.put("eventType",code); input.put("events",List.of(e)); call(post(createPath(false)),input,201);
    }
    @ParameterizedTest @ValueSource(booleans={false,true}) void planRequiresActiveTargetAndOneActivePlan(boolean preventive) throws Exception {
        var p=create(preventive,"future"); call(post(createPath(preventive)),planInput("future"),409);
        call(post(planPath(p)+"/cancel").header("If-Match",version(p)),Map.of(),200); create(preventive,"future");
        jdbc.update("update "+(preventive ? "preventive_treatments" : "treatments")+" set status='COMPLETED' where id=?",preventive ? tpt : treatment);
        call(post(createPath(preventive)),planInput("future"),409);
    }
    @Test void versionedPlanPatchAndEventCommands() throws Exception {
        var p=create(false,"due"); var e=events(p).path("content").get(0);
        call(patch(planPath(p)),Map.of("notes","changed"),428); call(patch(planPath(p)).header("If-Match","bad"),Map.of("notes","changed"),400);
        call(patch(planPath(p)).header("If-Match","\"99\""),Map.of("notes","changed"),409);
        p=call(patch(planPath(p)).header("If-Match",version(p)),Map.of("notes","PRIVATE NOTES","endDate",today().plusDays(3).toString()),200);
        assertThat(p.path("version").asLong()).isEqualTo(1);
        call(post(planPath(p)+"/events"),eventInput("future"),428);
        call(post(planPath(p)+"/events").header("If-Match",version(p)),eventInput("future"),201);
        var reschedule=Map.of("scheduledAt",now().minusHours(2).toString(),"dueAt",now().minusHours(1).toString());
        e=call(patch(eventPath(e)).header("If-Match",version(e)),reschedule,200); assertThat(e.path("status").asText()).isEqualTo("OVERDUE");
        call(patch(eventPath(e)).header("If-Match",version(e)),reschedule,409);
        e=call(post(eventPath(e)+"/complete").header("If-Match",version(e)),Map.of(),200); assertThat(e.path("status").asText()).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("select status from alerts",String.class)).isEqualTo("RESOLVED");
        call(post(eventPath(e)+"/cancel").header("If-Match",version(e)),Map.of(),409);
    }
    @ParameterizedTest @ValueSource(strings={"startDate","targetId","rulesVersion","createdBy","status","metadata"}) void planPatchRejectsImmutableAndGenericFields(String field) throws Exception {
        var p=create(false,"future"); call(patch(planPath(p)).header("If-Match",version(p)),Map.of(field,"spoof"),400);
    }
    @ParameterizedTest @ValueSource(strings={"eventType","sourceEntityType","sourceEntityId","metadata","status","monitoringPlanId"}) void eventPatchRejectsImmutableAndGenericFields(String field) throws Exception {
        var e=events(create(false,"due")).path("content").get(0); call(patch(eventPath(e)).header("If-Match",version(e)),Map.of(field,"spoof"),400);
    }
    @ParameterizedTest @ValueSource(strings={"before","future"}) void completionValidatesTimestamp(String invalid) throws Exception {
        var e=events(create(false,"due")).path("content").get(0); call(post(eventPath(e)+"/complete").header("If-Match",version(e)),Map.of("completedAt",(invalid.equals("before") ? now().minusDays(1) : now().plusHours(1)).toString()),400);
    }
    @Test void cancelPlanCancelsOpenEventsAndResolvesAlerts() throws Exception {
        var p=create(false,"overdue"); call(post(planPath(p)+"/cancel").header("If-Match",version(p)),Map.of(),200);
        assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isEqualTo("CANCELLED"); assertThat(jdbc.queryForObject("select status from alerts",String.class)).isEqualTo("RESOLVED");
        sweep(); assertThat(count("alerts")).isEqualTo(1);
    }
    @Test void sweepTransitionsDueThenOverdueExactlyOnce() throws Exception {
        var p=create(false,"future"); UUID e=uuid(events(p).path("content").get(0));
        jdbc.update("update monitoring_events set scheduled_at=?,due_at=? where id=?",now().minusHours(1),now(),e); sweep();
        assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isEqualTo("DUE"); assertThat(count("alerts")).isZero();
        jdbc.update("update monitoring_events set due_at=? where id=?",now().minusMinutes(1),e); sweep(); sweep();
        assertThat(count("alerts")).isEqualTo(1); assertThat(count("notifications")).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action in ('MONITORING_EVENT_DUE','MONITORING_EVENT_OVERDUE','ALERT_OPENED') and actor_user_id is null",Integer.class)).isEqualTo(3);
        assertThat(context.containsBean("monitoringScheduler")).isFalse();
    }
    @ParameterizedTest @CsvSource({"false,COMPLETED,COMPLETED,overdue","true,COMPLETED,COMPLETED,overdue","true,STOPPED,CANCELLED,overdue","true,LOST_TO_FOLLOW_UP,CANCELLED,overdue","false,COMPLETED,COMPLETED,future","true,COMPLETED,COMPLETED,future","true,STOPPED,CANCELLED,future","true,LOST_TO_FOLLOW_UP,CANCELLED,future"})
    void sweepAutoClosesEvenPlansWithOnlyFutureOrOverdueEvents(boolean preventive,String terminal,String expected,String time) throws Exception {
        var p=create(preventive,time); jdbc.update("update "+(preventive ? "preventive_treatments" : "treatments")+" set status=? where id=?",terminal,preventive ? tpt : treatment); sweep();
        assertThat(jdbc.queryForObject("select status from monitoring_plans",String.class)).isEqualTo(expected); assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isEqualTo("CANCELLED");
        if(time.equals("overdue")) assertThat(jdbc.queryForObject("select status from alerts",String.class)).isEqualTo("RESOLVED"); else assertThat(count("alerts")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"LAB_STAFF","FACILITY_ADMIN","PROGRAM_MONITOR","SYSTEM_ADMIN"}) void legacyPermissionsNeverBypassOfficerRole(String role) throws Exception {
        var p=create(false,"overdue"); user("other@example.org",role,source); caller=login("other@example.org");
        call(get(planPath(p)),null,403); call(get("/api/v1/alerts"),null,403); call(post(createPath(false)),planInput("future"),403);
    }
    @Test void safeSelfAndSupporterViewsAndReceipts() throws Exception {
        create(false,"overdue"); create(true,"overdue"); caller=selfCookie;
        var events=call(get("/api/v1/me/monitoring"),null,200); assertThat(events.path("content")).hasSize(1);
        var alerts=call(get("/api/v1/me/alerts"),null,200); assertThat(alerts.path("content")).hasSize(1); var a=alerts.path("content").get(0);
        call(post("/api/v1/me/alerts/"+uuid(a)+"/acknowledge"),Map.of(),200); call(post("/api/v1/me/alerts/"+uuid(a)+"/acknowledge"),Map.of(),200);
        caller=supportCookie; assertThat(call(get("/api/v1/me/supporting-cases/"+caseId+"/monitoring"),null,200).path("content")).hasSize(1);
        assertThat(call(get("/api/v1/me/supporting-cases/"+caseId+"/alerts"),null,200).path("content")).hasSize(1);
        call(post("/api/v1/me/supporting-cases/"+caseId+"/alerts/"+uuid(a)+"/acknowledge"),Map.of(),200);
        assertThat(jdbc.queryForObject("select count(*) from alerts where status='OPEN' and version=0",Integer.class)).isEqualTo(2); assertThat(count("alert_acknowledgements")).isEqualTo(2);
        String body=events.toString()+alerts; assertThat(body).doesNotContain("PRIVATE","notes","rulesVersion","metadata","sourceEntity","targetId","patient","contact","details");
        jdbc.update("update patient_user_links set patient_id=? where user_id=?",linked,self); caller=selfCookie;
        assertThat(call(get("/api/v1/me/monitoring"),null,200).path("content").get(0).path("targetType").asText()).isEqualTo("TPT");
    }
    @Test void unrelatedAndUnverifiedSelfAndSupporterCannotReadAlerts() throws Exception {
        create(true,"overdue"); UUID a=jdbc.queryForObject("select id from alerts",UUID.class); caller=selfCookie;
        call(post("/api/v1/me/alerts/"+a+"/acknowledge"),Map.of(),404); caller=supportCookie;
        call(post("/api/v1/me/supporting-cases/"+caseId+"/alerts/"+a+"/acknowledge"),Map.of(),404);
        call(get("/api/v1/me/supporting-cases/"+UUID.randomUUID()+"/monitoring"),null,404);
        jdbc.update("update patient_user_links set verification_status='PENDING' where user_id=?",self); caller=selfCookie; call(get("/api/v1/me/monitoring"),null,403);
    }
    @Test void staffAlertActionsAreVersionedAndDoNotReopen() throws Exception {
        create(false,"overdue"); var a=call(get("/api/v1/alerts"),null,200).path("content").get(0); String path="/api/v1/alerts/"+uuid(a);
        call(post(path+"/acknowledge"),Map.of(),428); a=call(post(path+"/acknowledge").header("If-Match",version(a)),Map.of(),200); assertThat(a.path("status").asText()).isEqualTo("ACKNOWLEDGED");
        call(post(path+"/resolve").header("If-Match","\"0\""),Map.of(),409); a=call(post(path+"/resolve").header("If-Match",version(a)),Map.of(),200); sweep();
        assertThat(count("alerts")).isEqualTo(1); assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isEqualTo("OVERDUE");
        assertThat(a.toString()).doesNotContain("notes","details","metadata","hiv","regimenDescription");
    }
    @Test void notificationsAreOwnPrivateAndReadIdempotently() throws Exception {
        create(false,"overdue"); caller=selfCookie; var n=call(get("/api/v1/me/notifications"),null,200).path("content").get(0); String path="/api/v1/me/notifications/"+uuid(n)+"/read";
        assertThat(n.path("channel").asText()).isEqualTo("IN_APP"); assertThat(n.toString()).doesNotContain("payload","PRIVATE","message","patient");
        call(post(path),Map.of(),428); n=call(post(path).header("If-Match",version(n)),Map.of(),200); assertThat(n.path("status").asText()).isEqualTo("READ");
        call(post(path).header("If-Match",version(n)),Map.of(),200); caller=staffCookie; call(post(path).header("If-Match",version(n)),Map.of(),404);
        for(var row:jdbc.queryForList("select payload::text as value from notifications")) assertThat(json.readTree((String)row.get("value")).properties()).extracting(Map.Entry::getKey).containsExactlyInAnyOrder("alertId","alertType","severity");
    }
    @ParameterizedTest @ValueSource(booleans={false,true}) void concurrentPlanCreationSerializesAtTarget(boolean preventive) throws Exception {
        var statuses=race(() -> raw(staffCookie,post(createPath(preventive)),planInput("future")),() -> raw(staffCookie,post(createPath(preventive)),planInput("future")));
        assertThat(statuses).containsExactlyInAnyOrder(201,409); assertThat(count("monitoring_plans")).isEqualTo(1);
    }
    @Test void concurrentSweepsOpenOneAlertAndOneNotificationPerRecipient() throws Exception {
        var p=create(false,"future"); jdbc.update("update monitoring_events set scheduled_at=?,due_at=?",now().minusHours(2),now().minusHours(1));
        race(() -> { sweep(); return 0; },() -> { sweep(); return 0; }); assertThat(count("alerts")).isEqualTo(1); assertThat(count("notifications")).isEqualTo(3);
    }
    @Test void eventCompletionRacesOverdueSweepWithoutLeavingOpenAlert() throws Exception {
        var e=events(create(false,"due")).path("content").get(0); jdbc.update("update monitoring_events set due_at=?",now().minusMinutes(1));
        var r=race(() -> raw(staffCookie,post(eventPath(e)+"/complete").header("If-Match",version(e)),Map.of()),() -> { sweep(); return 0; });
        assertThat(r.getFirst()).isIn(200,409);
        if(r.getFirst()==200) { assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isEqualTo("COMPLETED"); assertThat(jdbc.queryForObject("select count(*) from alerts where status in ('OPEN','ACKNOWLEDGED')",Integer.class)).isZero(); }
        else { assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isEqualTo("OVERDUE"); assertThat(count("alerts")).isEqualTo(1); }
    }
    @Test void planCancelAndEventCompleteRaceCoherently() throws Exception {
        var p=create(false,"due"); var e=events(p).path("content").get(0);
        var r=race(() -> raw(staffCookie,post(planPath(p)+"/cancel").header("If-Match",version(p)),Map.of()),() -> raw(staffCookie,post(eventPath(e)+"/complete").header("If-Match",version(e)),Map.of()));
        assertThat(r.getFirst()).isEqualTo(200); assertThat(r.get(1)).isIn(200,409); assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isIn("CANCELLED","COMPLETED");
    }
    @ParameterizedTest @ValueSource(booleans={false,true}) void receiptRacesAreIdempotentAndLeaveGlobalAlertUntouched(boolean supporting) throws Exception {
        create(false,"overdue"); UUID a=jdbc.queryForObject("select id from alerts",UUID.class);
        Cookie recipient=supporting ? supportCookie : selfCookie; String path=supporting ? "/api/v1/me/supporting-cases/"+caseId+"/alerts/"+a+"/acknowledge" : "/api/v1/me/alerts/"+a+"/acknowledge";
        var r=race(() -> raw(recipient,post(path),Map.of()),() -> raw(recipient,post(path),Map.of()));
        assertThat(r).containsOnly(200); assertThat(count("alert_acknowledgements")).isEqualTo(1); assertThat(jdbc.queryForObject("select version from alerts",Long.class)).isZero();
    }
    @Test void auditMetadataContainsOnlyCorrelation() throws Exception {
        var p=create(false,"overdue"); call(post(planPath(p)+"/cancel").header("If-Match",version(p)),Map.of(),200);
        for(String value:jdbc.queryForList("select metadata::text from audit_logs",String.class)) assertThat(json.readTree(value).properties()).extracting(Map.Entry::getKey).containsExactly("traceId");
    }
    @ParameterizedTest @ValueSource(strings={"create","planPatch","planCancel","eventAdd","eventPatch","eventComplete","eventCancel"})
    void monitoringSourceDenialRollsBackOperationalAndClinicalRows(String command) throws Exception {
        JsonNode p=null,e=null; if(!command.equals("create")) { p=create(false,"due"); e=events(p).path("content").get(0); }
        var before=snapshot(); int audits=jdbc.queryForObject("select count(*) from audit_logs",Integer.class);
        doThrow(ApplicationFailure.forbidden()).when(monitoringSource).requireLocalManage(any(),anyString(),any(),nullable(UUID.class));
        switch(command) {
            case "create" -> call(post(createPath(false)),planInput("future"),403);
            case "planPatch" -> call(patch(planPath(p)).header("If-Match",version(p)),Map.of("notes","denied"),403);
            case "planCancel" -> call(post(planPath(p)+"/cancel").header("If-Match",version(p)),Map.of(),403);
            case "eventAdd" -> call(post(planPath(p)+"/events").header("If-Match",version(p)),eventInput("future"),403);
            case "eventPatch" -> call(patch(eventPath(e)).header("If-Match",version(e)),Map.of("dueAt",now().toString()),403);
            case "eventComplete" -> call(post(eventPath(e)+"/complete").header("If-Match",version(e)),Map.of(),403);
            default -> call(post(eventPath(e)+"/cancel").header("If-Match",version(e)),Map.of(),403);
        }
        assertThat(snapshot()).isEqualTo(before); assertThat(jdbc.queryForObject("select count(*) from audit_logs",Integer.class)).isEqualTo(audits);
    }
    @ParameterizedTest @ValueSource(strings={"inactive","unassigned","missing"}) void staffScopeIsRecheckedForBothTargets(String scope) throws Exception {
        var p=create(false,"overdue"); var tp=create(true,"overdue");
        if(scope.equals("inactive")) jdbc.update("update facilities set active=false where id=?",source);
        else if(scope.equals("unassigned")) jdbc.update("update treatments set facility_id=? where id=?",destination,treatment);
        else { user("foreign@example.org","TB_OFFICER",destination); caller=login("foreign@example.org"); }
        call(get(planPath(p)),null,scope.equals("inactive") ? 403 : 404);
        if(!scope.equals("unassigned")) call(get(planPath(tp)),null,scope.equals("inactive") ? 403 : 404);
    }
    @ParameterizedTest @ValueSource(strings={"size","page","overflow","status","targetType"}) void pageAndFilterBoundsAreEnforced(String invalid) throws Exception {
        var request=get("/api/v1/alerts"); switch(invalid) { case "size" -> request.param("size","51"); case "page" -> request.param("page","-1"); case "overflow" -> request.param("page","2147483647"); case "status" -> request.param("status","UNKNOWN"); default -> request.param("targetType","CONTACT"); } call(request,null,400);
    }
    @Test void planHistoryAndEventCountAreScopedAndBounded() throws Exception {
        var p=create(true,"due"); assertThat(call(get(createPath(true)),null,200).path("totalElements").asLong()).isEqualTo(1);
        assertThat(p.path("eventCounts").path("DUE").asLong()).isEqualTo(1); call(get(planPath(p)+"/events").param("size","51"),null,400);
        call(patch(planPath(p)).header("If-Match",version(p)),Map.of("endDate",today().minusDays(1).toString()),400);
    }
    @Test void eventRescheduleRacesSweepUsingFreshState() throws Exception {
        var e=events(create(false,"due")).path("content").get(0); jdbc.update("update monitoring_events set due_at=?",now().minusMinutes(1));
        var r=race(() -> raw(staffCookie,patch(eventPath(e)).header("If-Match",version(e)),Map.of("scheduledAt",now().plusHours(1).toString(),"dueAt",now().plusHours(2).toString())),() -> { sweep(); return 0; });
        if(r.getFirst()==200) { assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isEqualTo("SCHEDULED"); assertThat(count("alerts")).isZero(); }
        else { assertThat(r.getFirst()).isEqualTo(409); assertThat(jdbc.queryForObject("select status from monitoring_events",String.class)).isEqualTo("OVERDUE"); assertThat(count("alerts")).isEqualTo(1); }
    }
    @Test void staffAcknowledgeRacesAutoResolve() throws Exception {
        create(true,"overdue"); UUID a=jdbc.queryForObject("select id from alerts",UUID.class); jdbc.update("update preventive_treatments set status='COMPLETED' where id=?",tpt);
        var r=race(() -> raw(staffCookie,post("/api/v1/alerts/"+a+"/acknowledge").header("If-Match","\"0\""),Map.of()),() -> { sweep(); return 0; });
        assertThat(r.getFirst()).isIn(200,409); assertThat(jdbc.queryForObject("select status from alerts",String.class)).isEqualTo("RESOLVED");
    }
    @Test void tptCloseRacesSweepThenClosesAllOperationalRows() throws Exception {
        create(true,"due"); jdbc.update("update monitoring_events set due_at=?",now().minusMinutes(1));
        var r=race(() -> raw(staffCookie,post("/api/v1/preventive-treatments/"+tpt+"/complete").header("If-Match","\"0\""),Map.of()),() -> { sweep(); return 0; });
        assertThat(r.getFirst()).isEqualTo(200); sweep(); assertThat(jdbc.queryForObject("select status from monitoring_plans",String.class)).isEqualTo("COMPLETED"); assertThat(jdbc.queryForObject("select count(*) from alerts where status='OPEN'",Integer.class)).isZero();
    }
    @Test void transferKeepsPlansAndHistoricalNotificationsAndMovesFutureFanout() throws Exception {
        var p=create(false,"overdue"); var tp=create(true,"future"); var old=jdbc.queryForList("select * from notifications order by id");
        var second=call(post(planPath(p)+"/events").header("If-Match",version(p)),eventInput("future"),201); reportTransfer();
        caller=staffCookie; call(get(planPath(p)),null,404); call(get(planPath(tp)),null,200); caller=destinationCookie; call(get(planPath(p)),null,200); call(get(planPath(tp)),null,404);
        jdbc.update("update monitoring_events set scheduled_at=?,due_at=? where id=?",now().minusHours(2),now().minusHours(1),uuid(second)); sweep();
        assertThat(jdbc.queryForList("select * from notifications where alert_id<> (select id from alerts where monitoring_event_id=?) order by id",uuid(second))).isEqualTo(old);
        var recipients=jdbc.queryForList("select user_id from notifications where alert_id=(select id from alerts where monitoring_event_id=?)",UUID.class,uuid(second)); assertThat(recipients).containsExactlyInAnyOrder(destinationOfficer,self,supporter);
        assertThat(jdbc.queryForObject("select count(*) from monitoring_plans where id in (?,?)",Integer.class,uuid(p),uuid(tp))).isEqualTo(2); assertThat(jdbc.queryForObject("select facility_id from preventive_treatments where id=?",UUID.class,tpt)).isEqualTo(source);
        caller=staffCookie; assertThat(call(get("/api/v1/me/notifications"),null,200).path("content")).hasSize(1);
    }
    @Test void transferLockWinnerDeterminesSweepFacilityFromFreshTarget() throws Exception {
        create(false,"due"); jdbc.update("update monitoring_events set due_at=?",now().minusMinutes(1));
        var received=receiveTransfer(); var locked=new CountDownLatch(1); var release=new CountDownLatch(1);
        doAnswer(inv -> { locked.countDown(); if(!release.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Transfer gate timeout"); return inv.callRealMethod(); }).when(referralSource).requireLocalTransition(any(),eq("REFERRAL_WRITE"),eq(destination),eq(uuid(received)));
        try(var pool=Executors.newFixedThreadPool(2)) {
            var transfer=pool.submit(() -> raw(destinationCookie,post("/api/v1/referrals/"+uuid(received)+"/report").header("If-Match",version(received)),Map.of()));
            Future<Integer> sweeping=null; try { assertThat(locked.await(30,TimeUnit.SECONDS)).isTrue(); sweeping=pool.submit(() -> { sweep(); return 0; }); assertLockWait("tb_cases"); } finally { release.countDown(); }
            assertThat(transfer.get(30,TimeUnit.SECONDS)).isEqualTo(200); sweeping.get(30,TimeUnit.SECONDS);
        }
        assertThat(jdbc.queryForList("select user_id from notifications",UUID.class)).containsExactlyInAnyOrder(destinationOfficer,self,supporter);
        assertThat(jdbc.queryForObject("select facility_id from treatments where id=?",UUID.class,treatment)).isEqualTo(destination); assertThat(count("treatments")).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"inactiveOfficer","unassignedOfficer","inactiveSelf","unverifiedSelf","inactiveSupporter","unlinkedSupporter","noPermission"})
    void notificationRecipientsMustBeActiveLinkedAndPermitted(String exclusion) throws Exception {
        switch(exclusion) {
            case "inactiveOfficer" -> jdbc.update("update users set status='DISABLED' where id=?",officer);
            case "unassignedOfficer" -> jdbc.update("update user_facilities set active=false where user_id=?",officer);
            case "inactiveSelf" -> jdbc.update("update users set status='DISABLED' where id=?",self);
            case "unverifiedSelf" -> jdbc.update("update patient_user_links set verification_status='PENDING' where user_id=?",self);
            case "inactiveSupporter" -> jdbc.update("update patient_supporters set active=false where linked_user_id=?",supporter);
            case "unlinkedSupporter" -> jdbc.update("update patient_supporters set linked_user_id=null where linked_user_id=?",supporter);
            default -> jdbc.update("delete from user_roles where user_id=?",supporter);
        }
        // Use the still-authorized destination officer at the source facility for command execution.
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",destinationOfficer,source); caller=destinationCookie; create(false,"overdue");
        UUID excluded=exclusion.endsWith("Officer") ? officer : exclusion.endsWith("Self") ? self : supporter;
        assertThat(jdbc.queryForList("select user_id from notifications",UUID.class)).doesNotContain(excluded).hasSize(3);
    }
    @Test void contactTptFanoutUsesLinkedSelfWithoutIndexSupporters() throws Exception {
        jdbc.update("update patient_user_links set patient_id=? where user_id=?",linked,self); create(true,"overdue");
        assertThat(jdbc.queryForList("select user_id from notifications",UUID.class)).containsExactlyInAnyOrder(officer,self);
        assertThat(jdbc.queryForObject("select patient_id from alerts",UUID.class)).isEqualTo(linked); assertThat(jdbc.queryForObject("select case_id from alerts",UUID.class)).isNull();
    }
    @Test void unlinkedContactTptAlertHasNoPatientAndStillNotifiesOfficer() throws Exception {
        jdbc.update("update contacts set linked_patient_id=null where id=?",contact); create(true,"overdue"); assertThat(jdbc.queryForObject("select patient_id from alerts",UUID.class)).isNull(); assertThat(count("notifications")).isEqualTo(1);
    }
    @Test void patientOwnedTptWorksWithoutContactInnerJoin() throws Exception {
        tpt=jdbc.queryForObject("insert into preventive_treatments(patient_id,facility_id,start_date,status) values (?,?,?,'ACTIVE') returning id",UUID.class,patient,source,today().minusDays(5));
        create(true,"overdue"); caller=selfCookie; assertThat(call(get("/api/v1/me/monitoring"),null,200).path("content")).hasSize(1); assertThat(call(get("/api/v1/me/alerts"),null,200).path("content")).hasSize(1);
    }
    @Test void rawJsonAndSourceInternalsNeverReachAnyProjection() throws Exception {
        var p=create(false,"overdue"); jdbc.update("update monitoring_events set metadata='{"+"\"private\":\"PRIVATE METADATA\"}',source_entity_type='PRIVATE SOURCE',source_entity_id=?",UUID.randomUUID());
        jdbc.update("update alerts set details='{"+"\"private\":\"PRIVATE ALERT\"}',message='PRIVATE MESSAGE'"); jdbc.update("update notifications set payload='{"+"\"private\":\"PRIVATE PAYLOAD\"}'");
        assertThat(events(p).toString()+call(get("/api/v1/alerts"),null,200)).doesNotContain("PRIVATE","metadata","sourceEntity","details");
        caller=selfCookie; assertThat(call(get("/api/v1/me/monitoring"),null,200).toString()+call(get("/api/v1/me/alerts"),null,200)+call(get("/api/v1/me/notifications"),null,200)).doesNotContain("PRIVATE","metadata","sourceEntity","details","payload");
    }
    @Test void everyRequiredAuditActionIsRecordedWithoutClinicalSideEffects() throws Exception {
        var p=create(false,"due"); p=call(patch(planPath(p)).header("If-Match",version(p)),Map.of("notes","PRIVATE UPDATED"),200);
        var e=events(p).path("content").get(0); e=call(patch(eventPath(e)).header("If-Match",version(e)),Map.of("dueAt",now().minusMinutes(1).toString()),200);
        var a=call(get("/api/v1/alerts"),null,200).path("content").get(0); a=call(post("/api/v1/alerts/"+uuid(a)+"/acknowledge").header("If-Match",version(a)),Map.of(),200);
        call(post("/api/v1/alerts/"+uuid(a)+"/resolve").header("If-Match",version(a)),Map.of(),200); call(post(eventPath(e)+"/complete").header("If-Match",version(e)),Map.of(),200);
        var added=call(post(planPath(p)+"/events").header("If-Match",version(p)),eventInput("due"),201); call(post(eventPath(added)+"/cancel").header("If-Match",version(added)),Map.of(),200);
        p=call(get(planPath(p)),null,200); call(post(planPath(p)+"/cancel").header("If-Match",version(p)),Map.of(),200);
        caller=selfCookie; call(post("/api/v1/me/alerts/"+uuid(a)+"/acknowledge"),Map.of(),200); var n=call(get("/api/v1/me/notifications"),null,200).path("content").get(0); call(post("/api/v1/me/notifications/"+uuid(n)+"/read").header("If-Match",version(n)),Map.of(),200);
        assertThat(jdbc.queryForList("select distinct action from audit_logs",String.class)).contains("MONITORING_PLAN_CREATED","MONITORING_PLAN_UPDATED","MONITORING_PLAN_CANCELLED","MONITORING_EVENT_CREATED","MONITORING_EVENT_RESCHEDULED","MONITORING_EVENT_COMPLETED","MONITORING_EVENT_CANCELLED","ALERT_OPENED","ALERT_ACKNOWLEDGED","ALERT_RESOLVED","ALERT_ACKNOWLEDGEMENT_RECORDED","NOTIFICATION_READ");
        assertThat(count("follow_ups")).isZero(); assertThat(count("dose_events")).isZero(); assertThat(count("lab_requests")).isZero();
    }
    private JsonNode receiveTransfer() throws Exception {
        caller=staffCookie; var sent=call(post("/api/v1/cases/"+caseId+"/referrals"),Map.of("referralType","TREATMENT_TRANSFER","destinationFacilityId",destination,"treatmentId",treatment),201);
        caller=destinationCookie; return call(post("/api/v1/referrals/"+uuid(sent)+"/receive").header("If-Match",version(sent)),Map.of(),200);
    }
    private void reportTransfer() throws Exception { var r=receiveTransfer(); call(post("/api/v1/referrals/"+uuid(r)+"/report").header("If-Match",version(r)),Map.of(),200); }
    private Map<String,List<Map<String,Object>>> snapshot() { var out=new LinkedHashMap<String,List<Map<String,Object>>>(); for(String table:List.of("monitoring_plans","monitoring_events","alerts","notifications","treatments","preventive_treatments","patients","contacts","tb_cases")) out.put(table,jdbc.queryForList("select * from "+table+" order by id")); return out; }
    private void assertLockWait(String table) throws Exception { long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(15); boolean waiting=false; while(System.nanoTime()<end) { waiting=Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like ? and cardinality(pg_blocking_pids(pid))>0)",Boolean.class,"%"+table+"%")); if(waiting) break; Thread.sleep(25); } assertThat(waiting).as("Competing command must wait on a real PostgreSQL target lock").isTrue(); }
    private JsonNode create(boolean preventive,String time) throws Exception { return call(post(createPath(preventive)),planInput(time),201); }
    private String createPath(boolean preventive) { return "/api/v1/"+(preventive ? "preventive-treatments/"+tpt : "treatments/"+treatment)+"/monitoring-plans"; }
    private Map<String,Object> planInput(String time) { return new HashMap<>(Map.of("startDate",today().minusDays(5).toString(),"notes","PRIVATE PLAN","events",List.of(eventInput(time)))); }
    private Map<String,Object> eventInput(String time) { var e=new HashMap<String,Object>(); e.put("eventType","CLINICAL_REVIEW"); e.put("scheduledAt",(time.equals("future") ? now().plusDays(1) : now().minusHours(2)).toString()); if(time.equals("overdue")) e.put("dueAt",now().minusHours(1).toString()); if(time.equals("equal")) e.put("dueAt",now().toString()); return e; }
    private JsonNode events(JsonNode p) throws Exception { return call(get(planPath(p)+"/events"),null,200); }
    private String planPath(JsonNode p) { return "/api/v1/monitoring-plans/"+uuid(p); }
    private String eventPath(JsonNode e) { return "/api/v1/monitoring-events/"+uuid(e); }
    private UUID uuid(JsonNode n) { return UUID.fromString(n.path("id").asText()); }
    private String version(JsonNode n) { return "\""+n.path("version").asLong()+"\""; }
    private void sweep() throws Exception { context.getBean("monitoringSweepService").getClass().getMethod("sweep").invoke(context.getBean("monitoringSweepService")); }
    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception { request.cookie(caller).with(csrf()); if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body)); var response=mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse(); return json.readTree(response.getContentAsString()); }
    private int raw(Cookie cookie,MockHttpServletRequestBuilder request,Object body) throws Exception { return mvc.perform(request.cookie(cookie).with(csrf()).contentType("application/json").content(json.writeValueAsString(body))).andReturn().getResponse().getStatus(); }
    private List<Integer> race(Callable<Integer> a,Callable<Integer> b) throws Exception { try(var pool=Executors.newFixedThreadPool(2)) { var ready=new CountDownLatch(2); var go=new CountDownLatch(1); var x=pool.submit(() -> { ready.countDown(); go.await(30,TimeUnit.SECONDS); return a.call(); }); var y=pool.submit(() -> { ready.countDown(); go.await(30,TimeUnit.SECONDS); return b.call(); }); assertThat(ready.await(30,TimeUnit.SECONDS)).isTrue(); go.countDown(); return List.of(x.get(40,TimeUnit.SECONDS),y.get(40,TimeUnit.SECONDS)); } }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private UUID patient(String name) { return jdbc.queryForObject("insert into patients(full_name) values (?) returning id",UUID.class,name); }
    private UUID user(String email,String role,UUID facility) { UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash); assertThat(jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role)).as("Test fixture role must exist: %s",role).isEqualTo(1); if(facility!=null) jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",id,facility); return id; }
    private Cookie login(String email) throws Exception { return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION"); }
    private int count(String table) { return jdbc.queryForObject("select count(*) from "+table,Integer.class); }
    private LocalDate today() { return LocalDate.now(clock); } private OffsetDateTime now() { return OffsetDateTime.now(clock); }
}
