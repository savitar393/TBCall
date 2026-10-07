package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.mock.web.MockHttpServletResponse;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false","tbcall.security.expose-verification-tokens=true"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class MonitoringEtagReadIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username",POSTGRES::getUsername);
        registry.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordHasher passwords;
    @Autowired Clock clock;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PASSWORD="Monitoring ETag password 123!";
    private static String hash;
    private UUID facility,otherFacility,patient,caseId,treatment,tpt,event,alert,officerRole,extraRole;
    private List<UUID> originalGrants;
    private Cookie caller;
    private OffsetDateTime scheduled,due;

    @BeforeEach void setup() {
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        officerRole=jdbc.queryForObject("select id from roles where code='TB_OFFICER'",UUID.class);
        originalGrants=jdbc.queryForList("select permission_id from role_permissions where role_id=?",UUID.class,officerRole);
        facility=jdbc.queryForObject("insert into facilities(name) values ('PRIVATE TARGET FACILITY') returning id",UUID.class);
        otherFacility=jdbc.queryForObject("insert into facilities(name) values ('Other facility') returning id",UUID.class);
        patient=jdbc.queryForObject("insert into patients(full_name,nik) values ('PRIVATE PATIENT','1234567890123456') returning id",UUID.class);
        LocalDate start=LocalDate.now(clock).minusDays(5);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,?) returning id",UUID.class,patient,facility,start.minusDays(1));
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code,status) values (?,?,'TB_SO','BARU','ACTIVE') returning id",UUID.class,registration,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,?,'ACTIVE','PRIVATE TREATMENT') returning id",UUID.class,caseId,facility,start);
        UUID contact=jdbc.queryForObject("insert into contacts(index_case_id,full_name) values (?,'PRIVATE CONTACT') returning id",UUID.class,caseId);
        tpt=jdbc.queryForObject("insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date,status,regimen_description) values (?,?,?,?,'ACTIVE','PRIVATE REGIMEN') returning id",UUID.class,contact,caseId,facility,start);
        scheduled=OffsetDateTime.now(clock).minusHours(1).truncatedTo(ChronoUnit.MICROS);
        due=scheduled.plusHours(2);
        alert=jdbc.queryForObject("insert into alerts(patient_id,case_id,treatment_id,alert_type,severity,status,message,details) values (?,?,?,'MONITORING_OVERDUE','WARNING','OPEN','PRIVATE ALERT MESSAGE','{\"secret\":\"PRIVATE ALERT DETAILS\"}') returning id",UUID.class,patient,caseId,treatment);
    }

    @AfterEach void restore() {
        if(originalGrants!=null) {
            jdbc.update("delete from role_permissions where role_id=?",officerRole);
            for(UUID grant:originalGrants) jdbc.update("insert into role_permissions(role_id,permission_id) values (?,?)",officerRole,grant);
        }
        if(extraRole!=null) { jdbc.update("delete from roles where id=?",extraRole); extraRole=null; }
    }

    @ParameterizedTest @ValueSource(booleans={false,true})
    void officerReadsExactEventProjectionAndActualQuotedEtag(boolean preventive) throws Exception {
        signIn("TB_OFFICER","MONITORING_READ"); seedEvent(preventive);
        // Historical episode facility, rather than the case's current facility, scopes this read.
        jdbc.update("update tb_cases set current_facility_id=? where id=?",otherFacility,caseId);
        var response=call(get(eventPath()),null,200); var body=body(response);
        assertThat(response.getHeader("ETag")).isEqualTo("\"7\"");
        assertThat(body.propertyNames()).containsExactlyInAnyOrder("id","version","eventType","scheduledAt","dueAt","completedAt","status");
        assertThat(body.path("id").asText()).isEqualTo(event.toString());
        assertThat(body.path("version").asLong()).isEqualTo(7);
        assertThat(body.path("eventType").asText()).isEqualTo("CLINICAL_REVIEW");
        assertThat(body.path("status").asText()).isEqualTo("DUE");
        assertThat(OffsetDateTime.parse(body.path("scheduledAt").asText()).toInstant()).isEqualTo(scheduled.toInstant());
        assertThat(OffsetDateTime.parse(body.path("dueAt").asText()).toInstant()).isEqualTo(due.toInstant());
        assertThat(body.path("completedAt").isNull()).isTrue();
        assertThat(body.toString()).doesNotContain("PRIVATE","1234567890123456",patient.toString(),caseId.toString(),treatment.toString(),tpt.toString(),"metadata","sourceEntity","notes","regimen","details");
    }

    @Test void manageGrantDoesNotImplyReadGrant() throws Exception {
        signIn("TB_OFFICER","MONITORING_MANAGE"); seedEvent(false);
        assertThat(body(call(get("/api/v1/me"),null,200)).path("permissions").toString()).isEqualTo("[\"MONITORING_MANAGE\"]");
        call(get(eventPath()),null,403);
    }

    @Test void officerWithNoMonitoringGrantCannotReadEvent() throws Exception {
        signIn("TB_OFFICER"); seedEvent(false); call(get(eventPath()),null,403);
    }

    @ParameterizedTest @ValueSource(strings={"LAB_STAFF","SYSTEM_ADMIN","FACILITY_ADMIN","PROGRAM_MONITOR","PATIENT","TREATMENT_SUPPORTER"})
    void artificialReadGrantDoesNotBypassEventOfficerGate(String role) throws Exception {
        signIn(role,"MONITORING_READ"); seedEvent(false); call(get(eventPath()),null,403);
    }

    @ParameterizedTest @CsvSource({"false,foreign","true,foreign","false,inactive","true,inactive"})
    void foreignOrInactiveTargetIsNonEnumerating404(boolean preventive,String scope) throws Exception {
        signIn("TB_OFFICER","MONITORING_READ"); seedEvent(preventive);
        if(scope.equals("foreign")) jdbc.update("update "+(preventive ? "preventive_treatments" : "treatments")+" set facility_id=? where id=?",otherFacility,preventive ? tpt : treatment);
        else {
            jdbc.update("insert into user_facilities(user_id,facility_id) select user_id,? from user_facilities where facility_id=?",otherFacility,facility);
            jdbc.update("update facilities set active=false where id=?",facility);
        }
        missing(call(get(eventPath()),null,404));
    }

    @Test void missingEventIsNonEnumerating404() throws Exception {
        signIn("TB_OFFICER","MONITORING_READ"); missing(call(get("/api/v1/monitoring-events/"+UUID.randomUUID()),null,404));
    }

    @ParameterizedTest @ValueSource(strings={"none","inactiveAssignment","inactiveFacility"})
    void eventRequiresAnActiveAssignedFacility(String state) throws Exception {
        UUID user=signIn("TB_OFFICER","MONITORING_READ"); seedEvent(false);
        if(state.equals("none")) jdbc.update("delete from user_facilities where user_id=?",user);
        else if(state.equals("inactiveAssignment")) jdbc.update("update user_facilities set active=false where user_id=?",user);
        else jdbc.update("update facilities set active=false where id=?",facility);
        call(get(eventPath()),null,403);
    }

    @ParameterizedTest @ValueSource(booleans={false,true})
    void repeatedEventGetsLeaveDataVersionsAndAuditUnchanged(boolean preventive) throws Exception {
        signIn("TB_OFFICER","MONITORING_READ"); seedEvent(preventive); var before=snapshot();
        call(get(eventPath()),null,200); call(get(eventPath()),null,200);
        assertThat(snapshot()).isEqualTo(before);
    }

    @ParameterizedTest @ValueSource(strings={"reschedule","complete","cancel"})
    void eventGetDoesNotGrantManage(String command) throws Exception {
        signIn("TB_OFFICER","MONITORING_READ"); seedEvent(false);
        String tag=call(get(eventPath()),null,200).getHeader("ETag"); var before=snapshot(false);
        mutateEvent(command,tag,403);
        assertThat(snapshot(false)).isEqualTo(before);
        assertThat(body(call(get("/api/v1/me"),null,200)).path("permissions").toString()).isEqualTo("[\"MONITORING_READ\"]");
    }

    @ParameterizedTest @ValueSource(strings={"reschedule","complete","cancel"})
    void legitimateEventMutationAdvancesGetEtagAndRejectsOldHeader(String command) throws Exception {
        signIn("TB_OFFICER","MONITORING_READ","MONITORING_MANAGE"); seedEvent(false);
        String old=call(get(eventPath()),null,200).getHeader("ETag");
        var mutation=mutateEvent(command,old,200);
        var current=call(get(eventPath()),null,200);
        assertThat(current.getHeader("ETag")).isEqualTo("\"8\"").isEqualTo(mutation.getHeader("ETag")).isNotEqualTo(old);
        assertThat(body(current)).isEqualTo(body(mutation));
        assertThat(body(current).path("status").asText()).isEqualTo(switch(command) { case "reschedule" -> "SCHEDULED"; case "complete" -> "COMPLETED"; default -> "CANCELLED"; });
        var stale=mutateEvent(command,old,409);
        assertThat(body(stale).path("code").asText()).isEqualTo("OPTIMISTIC_LOCK_CONFLICT");
    }

    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","PATIENT","TREATMENT_SUPPORTER"})
    void selfNotificationDetailNeedsNoOfficerOrFacilityGate(String role) throws Exception {
        UUID user=signIn(role,"NOTIFICATION_READ_SELF");
        jdbc.update("delete from user_facilities where user_id=?",user);
        UUID notification=notification(user,"DELIVERED",true);
        var response=call(get(notificationPath(notification)),null,200);
        assertNotification(response,notification,"DELIVERED",true);
    }

    @ParameterizedTest @ValueSource(strings={"SENT","DELIVERED","PENDING","FAILED","CANCELLED","READ"})
    void notificationGetPreservesStatusAndSafeProjection(String status) throws Exception {
        UUID user=signIn("TB_OFFICER","NOTIFICATION_READ_SELF"); UUID notification=notification(user,status,true);
        var before=snapshot(); var response=call(get(notificationPath(notification)),null,200);
        assertNotification(response,notification,status,true);
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test void otherUsersNotificationIsNonEnumerating404() throws Exception {
        UUID owner=signIn("TB_OFFICER","NOTIFICATION_READ_SELF"); UUID notification=notification(owner,"DELIVERED",true);
        signIn("PATIENT","NOTIFICATION_READ_SELF"); missing(call(get(notificationPath(notification)),null,404));
    }

    @Test void missingNotificationIsNonEnumerating404() throws Exception {
        signIn("TB_OFFICER","NOTIFICATION_READ_SELF"); missing(call(get(notificationPath(UUID.randomUUID())),null,404));
    }

    @Test void notificationOwnerStillRequiresSelfPermission() throws Exception {
        UUID user=signIn("TB_OFFICER","MONITORING_READ"); UUID notification=notification(user,"DELIVERED",true);
        call(get(notificationPath(notification)),null,403);
    }

    @Test void repeatedNotificationGetsDoNotMarkReadOrAudit() throws Exception {
        UUID user=signIn("PATIENT","NOTIFICATION_READ_SELF"); UUID notification=notification(user,"DELIVERED",true); var before=snapshot();
        call(get(notificationPath(notification)),null,200); call(get(notificationPath(notification)),null,200);
        assertThat(snapshot()).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='NOTIFICATION_READ'",Long.class)).isZero();
    }

    @ParameterizedTest @ValueSource(strings={"SENT","DELIVERED"})
    void legitimateReadTransitionAdvancesGetEtagAndRejectsOldHeader(String status) throws Exception {
        UUID user=signIn("PATIENT","NOTIFICATION_READ_SELF"); UUID notification=notification(user,status,true);
        String path=notificationPath(notification); String old=call(get(path),null,200).getHeader("ETag");
        var mutation=call(post(path+"/read").header("If-Match",old),Map.of(),200);
        var current=call(get(path),null,200);
        assertThat(current.getHeader("ETag")).isEqualTo("\"5\"").isEqualTo(mutation.getHeader("ETag")).isNotEqualTo(old);
        assertThat(body(current)).isEqualTo(body(mutation));
        assertThat(body(current).path("status").asText()).isEqualTo("READ");
        assertThat(body(current).path("readAt").isNull()).isFalse();
        var stale=call(post(path+"/read").header("If-Match",old),Map.of(),409);
        assertThat(body(stale).path("code").asText()).isEqualTo("OPTIMISTIC_LOCK_CONFLICT");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='NOTIFICATION_READ'",Long.class)).isEqualTo(1);
    }

    @Test void notificationWithoutAlertRetainsNullableSafeFields() throws Exception {
        UUID user=signIn("PATIENT","NOTIFICATION_READ_SELF"); UUID notification=notification(user,"DELIVERED",false);
        assertNotification(call(get(notificationPath(notification)),null,200),notification,"DELIVERED",false);
    }

    @ParameterizedTest @ValueSource(strings={"/api/v1/monitoring-events/","/api/v1/me/notifications/"})
    void anonymousDetailRequiresAuthentication(String path) throws Exception {
        mvc.perform(get(path+UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    private void seedEvent(boolean preventive) {
        UUID plan=jdbc.queryForObject("insert into monitoring_plans("+(preventive ? "preventive_treatment_id" : "treatment_id")+",status,start_date,rules_version,notes) values (?,'ACTIVE',?,'MANUAL_V1','PRIVATE PLAN NOTES') returning id",UUID.class,preventive ? tpt : treatment,LocalDate.now(clock).minusDays(5));
        event=jdbc.queryForObject("insert into monitoring_events(monitoring_plan_id,event_type,scheduled_at,due_at,status,version,source_entity_type,source_entity_id,metadata) values (?,'CLINICAL_REVIEW',?,?,'DUE',7,'PRIVATE SOURCE',?,'{\"secret\":\"PRIVATE EVENT METADATA\"}') returning id",UUID.class,plan,scheduled,due,UUID.randomUUID());
    }
    private UUID notification(UUID user,String status,boolean withAlert) {
        return jdbc.queryForObject("insert into notifications(user_id,alert_id,channel,status,version,scheduled_at,sent_at,delivered_at,read_at,payload,failure_reason) values (?,?,'IN_APP',?,4,?,?,?,?,'{\"secret\":\"PRIVATE PAYLOAD\"}','PRIVATE FAILURE REASON') returning id",UUID.class,user,withAlert ? alert : null,status,scheduled,scheduled.plusMinutes(10),scheduled.plusMinutes(20),status.equals("READ") ? scheduled.plusMinutes(30) : null);
    }
    private UUID signIn(String role,String... permissions) throws Exception {
        String email="etag-"+UUID.randomUUID()+"@example.org";
        UUID user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash);
        assertThat(jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",user,role)).isEqualTo(1);
        if(role.equals("TB_OFFICER")) {
            jdbc.update("delete from role_permissions where role_id=?",officerRole);
            for(String permission:permissions) assertThat(jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code=?",officerRole,permission)).isEqualTo(1);
        } else if(Arrays.asList(permissions).contains("MONITORING_READ")) {
            extraRole=jdbc.queryForObject("insert into roles(code,name) values (?,'Artificial ETag read grants') returning id",UUID.class,"ETAG_"+UUID.randomUUID());
            jdbc.update("insert into user_roles(user_id,role_id) values (?,?)",user,extraRole);
            jdbc.update("insert into role_permissions(role_id,permission_id) select ?,id from permissions where code='MONITORING_READ'",extraRole);
        }
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,facility);
        caller=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
        return user;
    }
    private MockHttpServletResponse call(MockHttpServletRequestBuilder request,Object input,int expected) throws Exception {
        if(input!=null) request.contentType("application/json").content(json.writeValueAsString(input));
        return mvc.perform(request.cookie(caller).with(csrf())).andExpect(status().is(expected)).andReturn().getResponse();
    }
    private JsonNode body(MockHttpServletResponse response) throws Exception { return json.readTree(response.getContentAsString()); }
    private String eventPath() { return "/api/v1/monitoring-events/"+event; }
    private String notificationPath(UUID id) { return "/api/v1/me/notifications/"+id; }
    private MockHttpServletResponse mutateEvent(String command,String tag,int expected) throws Exception {
        if(command.equals("reschedule")) return call(patch(eventPath()).header("If-Match",tag),Map.of("scheduledAt",OffsetDateTime.now(clock).plusDays(1).toString(),"dueAt",OffsetDateTime.now(clock).plusDays(2).toString()),expected);
        return call(post(eventPath()+"/"+command).header("If-Match",tag),Map.of(),expected);
    }
    private void missing(MockHttpServletResponse response) throws Exception {
        assertThat(response.getHeader("ETag")).isNull();
        assertThat(body(response).path("code").asText()).isEqualTo("RESOURCE_NOT_FOUND");
    }
    private void assertNotification(MockHttpServletResponse response,UUID id,String status,boolean withAlert) throws Exception {
        JsonNode body=body(response);
        assertThat(response.getHeader("ETag")).isEqualTo("\"4\"");
        assertThat(body.propertyNames()).containsExactlyInAnyOrder("id","version","alertId","channel","status","scheduledAt","deliveredAt","readAt","alertType","severity");
        assertThat(body.path("id").asText()).isEqualTo(id.toString());
        assertThat(body.path("version").asLong()).isEqualTo(4);
        assertThat(body.path("channel").asText()).isEqualTo("IN_APP");
        assertThat(body.path("status").asText()).isEqualTo(status);
        assertThat(OffsetDateTime.parse(body.path("scheduledAt").asText()).toInstant()).isEqualTo(scheduled.toInstant());
        assertThat(OffsetDateTime.parse(body.path("deliveredAt").asText()).toInstant()).isEqualTo(scheduled.plusMinutes(20).toInstant());
        if(status.equals("READ")) assertThat(OffsetDateTime.parse(body.path("readAt").asText()).toInstant()).isEqualTo(scheduled.plusMinutes(30).toInstant());
        else assertThat(body.path("readAt").isNull()).isTrue();
        if(withAlert) {
            assertThat(body.path("alertId").asText()).isEqualTo(alert.toString());
            assertThat(body.path("alertType").asText()).isEqualTo("MONITORING_OVERDUE");
            assertThat(body.path("severity").asText()).isEqualTo("WARNING");
        } else {
            assertThat(body.path("alertId").isNull()).isTrue(); assertThat(body.path("alertType").isNull()).isTrue(); assertThat(body.path("severity").isNull()).isTrue();
        }
        assertThat(body.toString()).doesNotContain("PRIVATE","1234567890123456",patient.toString(),caseId.toString(),treatment.toString(),"payload","failureReason","failure_reason","message","details","regimen");
    }
    private Map<String,List<Map<String,Object>>> snapshot() { return snapshot(true); }
    private Map<String,List<Map<String,Object>>> snapshot(boolean audit) {
        var state=new LinkedHashMap<String,List<Map<String,Object>>>();
        for(String table:List.of("users","user_sessions","user_facilities","role_permissions","user_roles","patients","facilities","tb_cases","treatments","contacts","preventive_treatments","monitoring_plans","monitoring_events","alerts","alert_acknowledgements","notifications")) state.put(table,jdbc.queryForList("select * from "+table+" order by 1"));
        if(audit) state.put("audit_logs",jdbc.queryForList("select * from audit_logs order by id"));
        return state;
    }
}
