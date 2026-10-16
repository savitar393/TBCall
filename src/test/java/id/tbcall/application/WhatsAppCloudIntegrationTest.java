package id.tbcall.application;

import id.tbcall.application.reminder.*;
import id.tbcall.application.common.AuditService;
import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Synthetic recipients, mocked Meta HTTP, and a disposable PostgreSQL database only. */
@SpringBootTest(properties={"tbcall.security.production=false", "tbcall.monitoring.scheduler-enabled=false",
        "tbcall.reminders.mode=CLOUD_TEST", "tbcall.reminders.scheduler-enabled=false",
        "tbcall.reminders.meta.business-account-id=123456", "tbcall.reminders.meta.test-phone-number-id=654321",
        "tbcall.reminders.meta.test-sender-confirmed=true", "tbcall.reminders.meta.template-approved=true",
        "tbcall.reminders.meta.synthetic-environment=true", "tbcall.reminders.meta.allowed-recipients=+6281111111001",
        "tbcall.reminders.meta.template-name=tbcall_neutral_reminder", "tbcall.reminders.meta.template-language=id",
        "tbcall.reminders.meta.access-token=fictional-test-access-token", "tbcall.reminders.meta.app-secret=fictional-test-app-secret",
        "tbcall.reminders.meta.verify-token=fictional-test-verify-token"})
@ActiveProfiles("test") @AutoConfigureMockMvc(print=MockMvcPrint.NONE) @Testcontainers
@Timeout(value=30,unit=TimeUnit.SECONDS,threadMode=Timeout.ThreadMode.SEPARATE_THREAD)
class WhatsAppCloudIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine")
            .withImagePullPolicy(image -> false).withTmpFs(Map.of("/var/lib/postgresql/data","rw"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    static final Instant START=Instant.parse("2026-10-11T00:00:00Z"), DUE=Instant.parse("2026-10-11T01:00:00Z");
    static final AtomicReference<Instant> TIME=new AtomicReference<>(START);
    @TestConfiguration static class Time {
        @Bean @Primary Clock reminderClock() {
            return new Clock() {
                public ZoneId getZone(){return ZoneOffset.UTC;}
                public Clock withZone(ZoneId zone){return Clock.fixed(TIME.get(),zone);}
                public Instant instant(){return TIME.get();}
            };
        }
    }
    static final String PASSWORD="Fictional cloud regression password 2026!", PHONE="+6281111111001";
    static final String APP_SECRET="fictional-test-app-secret", MESSAGE="wamid.synthetic_message_001";
    static final String PREFERENCES="/api/v1/me/medication-reminders/preferences";
    static final String ADMIN="/api/v1/admin/medication-reminders", WEBHOOK="/api/v1/webhooks/whatsapp";
    static String hash;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordHasher passwords;
    @Autowired ReminderDispatcher dispatcher;
    @Autowired ReminderDispatchWorker worker;
    @MockitoBean MetaHttpClient http;
    @MockitoSpyBean AuditService audit;
    final JsonMapper json=JsonMapper.builder().build();
    UUID facility, patient, treatment, self, staff;
    Cookie patientCookie, staffCookie, adminCookie;

    @BeforeEach void setup() throws Exception {
        TIME.set(START);
        reset(http,audit);
        when(http.post(any(),anyString(),any(byte[].class),anyInt())).thenReturn(accepted());
        if(hash==null)hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        jdbc.update("""
                insert into role_permissions(role_id,permission_id)
                select r.id,p.id from roles r,permissions p where r.code='SYSTEM_ADMIN' and p.code='USER_ACCOUNT_MANAGE'
                on conflict do nothing
                """);
        facility=jdbc.queryForObject("insert into facilities(name) values ('Fictional cloud facility') returning id",UUID.class);
        staff=user("officer@example.invalid","TB_OFFICER");
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",staff,facility);
        self=user("patient@example.invalid","PATIENT");
        user("operator@example.invalid","SYSTEM_ADMIN");
        jdbc.update("update users set phone=?,phone_verified_at=now() where id=?",PHONE,self);
        patient=jdbc.queryForObject("insert into patients(full_name,phone,address) values ('Fictional cloud patient','+6281111111999','PRIVATE-CLINICAL-ADDRESS') returning id",UUID.class);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-10-08','CONVERTED_TO_CASE') returning id",UUID.class,patient,facility);
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,'2026-10-09','PRIVATE','TREAT_HERE') returning id",UUID.class,registration);
        UUID caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,?,'TB_SO','BARU') returning id",UUID.class,registration,diagnosis,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,'2026-10-10','ACTIVE','PRIVATE-CLINICAL-NOTE') returning id",UUID.class,caseId,facility);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",self,patient);
        patientCookie=login("patient@example.invalid"); staffCookie=login("officer@example.invalid"); adminCookie=login("operator@example.invalid");
    }

    @Test void defaultConsentIsOffAndManualPlanningDoesNotCreateWork() throws Exception {
        JsonNode preferences=call(patientCookie,get(PREFERENCES),null,200);
        assertThat(preferences.path("mode").asText()).isEqualTo("CLOUD_TEST");
        assertThat(preferences.path("whatsappConsent").asBoolean()).isFalse();
        assertThat(preferences.has("smsConsent")).isFalse();
        createSchedule();
        assertThat(plan()).isZero();
        assertThat(count("reminder_jobs")).isZero();
        verifyNoInteractions(http);
    }

    @Test void manualAcceptanceAndAuthenticatedDeliveryNeverCreateMedicationEvidence() throws Exception {
        UUID job=ready();
        assertThat(dispatch(job)).isTrue();
        assertThat(state(job)).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("select provider_correlation from reminder_jobs where id=?",String.class,job))
                .matches("meta-[a-f0-9]{64}").doesNotContain(MESSAGE);
        var payload=org.mockito.ArgumentCaptor.forClass(byte[].class);
        verify(http).post(eq(java.net.URI.create("https://graph.facebook.com/v23.0/654321/messages")),anyString(),payload.capture(),anyInt());
        JsonNode sent=json.readTree(payload.getValue());
        assertThat(sent.path("to").asText()).isEqualTo(PHONE.substring(1));
        assertThat(sent.path("type").asText()).isEqualTo("template");
        assertThat(sent.path("template").path("name").asText()).isEqualTo("tbcall_neutral_reminder");
        assertThat(sent.path("template").path("language").path("code").asText()).isEqualTo("id");
        assertThat(new String(payload.getValue(),StandardCharsets.UTF_8)).doesNotContain("PRIVATE",patient.toString(),treatment.toString(),"components");
        callback(statusBody("delivered",token(),MESSAGE,PHONE.substring(1),DUE),200);
        assertThat(state(job)).isEqualTo("DELIVERED");
        assertNoAdherence();
        String history=call(patientCookie,get("/api/v1/me/medication-reminders/history"),null,200).toString();
        assertThat(history).contains("CLOUD_TEST","DELIVERED").doesNotContain(MESSAGE,PHONE,token().toString(),APP_SECRET);
        assertThat(jdbc.queryForList("select row_to_json(h)::text from reminder_provider_handoffs h",String.class))
                .allSatisfy(row->assertThat(row).doesNotContain(MESSAGE,PHONE,APP_SECRET));
    }

    @Test void genericDispatcherCannotSendCloudJobsAutomatically() throws Exception {
        UUID job=ready();
        assertThat(dispatcher.dispatch()).isZero();
        assertThat(state(job)).isEqualTo("SCHEDULED");
        assertThat(count("reminder_attempts")).isZero();
        verifyNoInteractions(http);
    }

    @ParameterizedTest @ValueSource(strings={"patient","officer","permission"})
    void manualEndpointsRequireSystemRoleAndPermission(String denied) throws Exception {
        Cookie cookie=denied.equals("patient")?patientCookie:denied.equals("officer")?staffCookie:adminCookie;
        if(denied.equals("permission"))jdbc.update("delete from role_permissions where role_id=(select id from roles where code='SYSTEM_ADMIN') and permission_id=(select id from permissions where code='USER_ACCOUNT_MANAGE')");
        call(cookie,post(ADMIN+"/test-plan"),Map.of("confirmTestOperation",true),403);
        call(cookie,post(ADMIN+"/test-dispatch"),dispatchInput(UUID.randomUUID(),true),403);
        verifyNoInteractions(http);
    }

    @Test void manualEndpointsRequireSessionAndCsrf() throws Exception {
        for(String endpoint:List.of("test-plan","test-dispatch")) {
            Object body=endpoint.equals("test-plan")?Map.of("confirmTestOperation",true):dispatchInput(UUID.randomUUID(),true);
            mvc.perform(post(ADMIN+"/"+endpoint).cookie(adminCookie).contentType("application/json").content(json.writeValueAsBytes(body)))
                    .andExpect(status().isForbidden());
            mvc.perform(post(ADMIN+"/"+endpoint).with(csrf()).contentType("application/json").content(json.writeValueAsBytes(body)))
                    .andExpect(status().isUnauthorized());
        }
        verifyNoInteractions(http);
    }

    @ParameterizedTest @ValueSource(strings={"planFalse","dispatchFalse","planUnknown","dispatchUnknown"})
    void explicitConfirmationAndBoundedInputAreRequired(String invalid) throws Exception {
        boolean plan=invalid.startsWith("plan"),unknown=invalid.endsWith("Unknown");
        Map<String,Object> body=new HashMap<>(plan?Map.of("confirmTestOperation",unknown):dispatchInput(UUID.randomUUID(),unknown));
        if(unknown)body.put("recipient",PHONE);
        call(adminCookie,post(ADMIN+(plan?"/test-plan":"/test-dispatch")),body,400);
        assertThat(count("reminder_jobs")).isZero();
        verifyNoInteractions(http);
    }

    @ParameterizedTest @ValueSource(strings={"missingSelfLink","revokedLink","withdrawn","forbiddenRecipient"})
    void admissionRechecksBindingConsentAndSyntheticRecipientAllowlist(String invalid) throws Exception {
        if(invalid.equals("forbiddenRecipient"))jdbc.update("update users set phone='+6281111111002' where id=?",self);
        UUID job=ready();
        if(invalid.equals("missingSelfLink"))jdbc.update("update patient_user_links set relationship_type='SUPPORTER' where user_id=?",self);
        if(invalid.equals("revokedLink"))jdbc.update("update patient_user_links set verification_status='REVOKED' where user_id=?",self);
        if(invalid.equals("withdrawn"))change(false);
        assertThat(dispatch(job)).isFalse();
        assertThat(count("reminder_attempts")).isZero();
        verifyNoInteractions(http);
    }

    @Test void concurrentManualRequestsAdmitOneHandoff() throws Exception {
        UUID job=ready();
        try(var pool=Executors.newFixedThreadPool(2)) {
            var start=new CountDownLatch(1);
            Callable<Boolean> send=()->{start.await();return dispatch(job);};
            var first=pool.submit(send);var second=pool.submit(send);start.countDown();
            assertThat(List.of(first.get(10,TimeUnit.SECONDS),second.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        verify(http,times(1)).post(any(),anyString(),any(byte[].class),anyInt());
        assertThat(count("reminder_attempts")).isEqualTo(1);
    }

    @Test void uncertainHandoffCannotBeRetriedButAuthenticatedCallbackResolvesIt() throws Exception {
        when(http.post(any(),anyString(),any(byte[].class),anyInt())).thenThrow(new IOException("Synthetic unavailable response"));
        UUID job=ready();assertThat(dispatch(job)).isTrue();
        assertThat(state(job)).isEqualTo("UNCERTAIN");
        TIME.set(DUE.plusSeconds(60));worker.recover();
        assertThat(dispatcher.dispatch()).isZero();assertThat(dispatch(job)).isFalse();
        verify(http,times(1)).post(any(),anyString(),any(byte[].class),anyInt());
        callback(statusBody("delivered",token(),MESSAGE,PHONE.substring(1),DUE),200);
        assertThat(state(job)).isEqualTo("DELIVERED");assertNoAdherence();
    }

    @Test void cloudThrottlingPermitsOnlyThreeExplicitSafeAttempts() throws Exception {
        when(http.post(any(),anyString(),any(byte[].class),anyInt())).thenReturn(new MetaHttpClient.Response(429,
                json.writeValueAsBytes(Map.of("error",Map.of("code",130429,"type","OAuthException","message","Synthetic rate limit")))));
        UUID job=ready();assertThat(dispatch(job)).isTrue();
        assertThat(state(job)).isEqualTo("SCHEDULED");
        assertThat(dispatch(job)).isFalse();
        for(int seconds:List.of(15,45)) {
            TIME.set(DUE.plusSeconds(seconds));
            assertThat(dispatcher.dispatch()).isZero();
            assertThat(dispatch(job)).isTrue();
        }
        TIME.set(DUE.plusSeconds(60));
        assertThat(state(job)).isEqualTo("FAILED");
        assertThat(dispatch(job)).isFalse();
        verify(http,times(3)).post(any(),anyString(),any(byte[].class),anyInt());
        assertThat(jdbc.queryForList("select channel||':'||mode||':'||outcome from reminder_attempts order by attempt_number",String.class))
                .containsExactly("WHATSAPP:CLOUD_TEST:SAFE_RETRY","WHATSAPP:CLOUD_TEST:SAFE_RETRY","WHATSAPP:CLOUD_TEST:SAFE_RETRY");
        assertNoAdherence();
    }

    @Test void concurrentDuplicateCallbacksCommitOneLedgerEntryAndDeliveryAudit() throws Exception {
        UUID job=ready();dispatch(job);
        byte[] body=statusBody("delivered",token(),MESSAGE,PHONE.substring(1),DUE);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var start=new CountDownLatch(1);
            Callable<Void> deliver=()->{start.await();callback(body,200);return null;};
            var first=pool.submit(deliver);var second=pool.submit(deliver);start.countDown();
            first.get(10,TimeUnit.SECONDS);second.get(10,TimeUnit.SECONDS);
        }
        assertThat(state(job)).isEqualTo("DELIVERED");
        assertThat(count("reminder_provider_events")).isEqualTo(1);
        assertThat(auditCount("MEDICATION_REMINDER_PROVIDER_DELIVERY")).isEqualTo(1);
        assertNoAdherence();
    }

    @Test void callbackAuditFailureRollsBackStateAndReplayLedgerAtomically() throws Exception {
        UUID job=ready();dispatch(job);
        byte[] body=statusBody("delivered",token(),MESSAGE,PHONE.substring(1),DUE);
        AuditService target=AopTestUtils.getUltimateTargetObject(audit);
        doThrow(new IllegalStateException("Synthetic audit failure")).when(target)
                .record(isNull(),eq("MEDICATION_REMINDER_PROVIDER_DELIVERY"),eq("REMINDER_JOB"),eq(job));
        callback(body,500);
        assertThat(state(job)).isEqualTo("ACCEPTED");
        assertThat(count("reminder_provider_events")).isZero();
        assertThat(jdbc.queryForObject("select delivered_at from reminder_provider_handoffs",OffsetDateTime.class)).isNull();
        assertThat(auditCount("MEDICATION_REMINDER_PROVIDER_DELIVERY")).isZero();
        reset(target);
        callback(body,200);callback(body,200);
        assertThat(state(job)).isEqualTo("DELIVERED");
        assertThat(count("reminder_provider_events")).isEqualTo(1);
        assertThat(auditCount("MEDICATION_REMINDER_PROVIDER_DELIVERY")).isEqualTo(1);
        assertNoAdherence();
    }

    @ParameterizedTest @ValueSource(strings={"delivered","read"})
    void duplicateAndOutOfOrderCallbacksCannotDowngradeAuthoritativeDelivery(String delivered) throws Exception {
        UUID job=ready();dispatch(job);
        byte[] body=statusBody(delivered,token(),MESSAGE,PHONE.substring(1),DUE);
        callback(body,200);callback(body,200);
        assertThat(count("reminder_provider_events")).isEqualTo(1);
        callback(statusBody("sent",token(),MESSAGE,PHONE.substring(1),DUE),200);
        callback(statusBody("failed",token(),MESSAGE,PHONE.substring(1),DUE),200);
        assertThat(state(job)).isEqualTo("DELIVERED");
        assertThat(count("reminder_provider_events")).isEqualTo(3);
        assertNoAdherence();
    }

    @Test void authoritativeCallbackBeforeHttpResponseSurvivesCompletion() throws Exception {
        when(http.post(any(),anyString(),any(byte[].class),anyInt())).thenAnswer(invocation->{
            UUID callback=UUID.fromString(json.readTree((byte[])invocation.getArgument(2)).path("biz_opaque_callback_data").asText());
            callback(statusBody("delivered",callback,MESSAGE,PHONE.substring(1),DUE),200);
            return accepted();
        });
        UUID job=ready();dispatch(job);
        assertThat(state(job)).isEqualTo("DELIVERED");
        assertThat(count("reminder_attempts")).isEqualTo(1);assertNoAdherence();
    }

    @ParameterizedTest @ValueSource(booleans={false,true})
    void callbackWithoutOpaqueTokenRequiresPreviouslyKnownMessageCorrelation(boolean beforeResponse) throws Exception {
        if(beforeResponse)when(http.post(any(),anyString(),any(byte[].class),anyInt())).thenAnswer(invocation->{
            callback(statusBody("delivered",null,MESSAGE,PHONE.substring(1),DUE),200);
            assertThat(jdbc.queryForObject("select state from reminder_jobs",String.class)).isEqualTo("DISPATCHED");
            return accepted();
        });
        UUID job=ready();dispatch(job);
        if(!beforeResponse)callback(statusBody("delivered",null,MESSAGE,PHONE.substring(1),DUE),200);
        assertThat(state(job)).isEqualTo(beforeResponse?"ACCEPTED":"DELIVERED");
        assertThat(jdbc.queryForObject("select result from reminder_provider_events",String.class)).isEqualTo(beforeResponse?"IGNORED":"APPLIED");
        assertNoAdherence();
    }

    @ParameterizedTest @ValueSource(strings={"message","token","recipient"})
    void unknownCallbackCorrelationHasNoEffectOnAcceptedJob(String unknown) throws Exception {
        UUID job=ready();dispatch(job);
        callback(statusBody("delivered",unknown.equals("token")?UUID.randomUUID():token(),
                unknown.equals("message")?"wamid.unknown_synthetic_message":MESSAGE,
                unknown.equals("recipient")?"6281111111777":PHONE.substring(1),DUE),200);
        assertThat(state(job)).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("select result from reminder_provider_events",String.class)).isEqualTo("IGNORED");
        assertNoAdherence();
    }

    @ParameterizedTest @ValueSource(strings={"unsigned","tampered","rawWhitespace","wrongAccount","wrongSender","malformed","stale","oversize"})
    void unauthenticatedMalformedOrStaleWebhooksCannotChangeState(String invalid) throws Exception {
        UUID job=ready();dispatch(job);
        byte[] body=statusBody("delivered",token(),MESSAGE,PHONE.substring(1),DUE);
        String signature=signature(body);int expected=403;
        switch(invalid) {
            case "unsigned" -> signature=null;
            case "tampered" -> body=new String(body,StandardCharsets.UTF_8).replace("delivered","failed").getBytes(StandardCharsets.UTF_8);
            case "rawWhitespace" -> body=(new String(body,StandardCharsets.UTF_8)+" ").getBytes(StandardCharsets.UTF_8);
            case "wrongAccount" -> {body=new String(body,StandardCharsets.UTF_8).replace("123456","123457").getBytes(StandardCharsets.UTF_8);signature=signature(body);}
            case "wrongSender" -> {body=new String(body,StandardCharsets.UTF_8).replace("654321","654322").getBytes(StandardCharsets.UTF_8);signature=signature(body);}
            case "malformed" -> {body="{\"object\":123}".getBytes(StandardCharsets.UTF_8);signature=signature(body);expected=400;}
            case "stale" -> {body=statusBody("delivered",token(),MESSAGE,PHONE.substring(1),DUE.minus(Duration.ofDays(8)));signature=signature(body);expected=400;}
            case "oversize" -> {body=new byte[262145];signature=signature(body);expected=413;}
        }
        var request=post(WEBHOOK).contentType("application/json").content(body);
        if(signature!=null)request.header("X-Hub-Signature-256",signature);
        mvc.perform(request).andExpect(status().is(expected));
        assertThat(state(job)).isEqualTo("ACCEPTED");
        assertThat(count("reminder_provider_events")).isZero();assertNoAdherence();
    }

    @Test void validSignatureAuthenticatesOriginalWhitespaceBytes() throws Exception {
        UUID job=ready();dispatch(job);
        byte[] body=(" \n"+new String(statusBody("delivered",token(),MESSAGE,PHONE.substring(1),DUE),StandardCharsets.UTF_8)+"\n ").getBytes(StandardCharsets.UTF_8);
        callback(body,200);assertThat(state(job)).isEqualTo("DELIVERED");
    }

    @Test void publicVerificationChallengeRequiresExactSecretAndParameters() throws Exception {
        mvc.perform(get(WEBHOOK).param("hub.mode","subscribe").param("hub.verify_token","fictional-test-verify-token").param("hub.challenge","12345"))
                .andExpect(status().isOk()).andExpect(content().string("12345"));
        mvc.perform(get(WEBHOOK).param("hub.mode","subscribe").param("hub.verify_token","fictional-test-verify-token").param("hub.challenge","opaque-Challenge_123"))
                .andExpect(status().isOk()).andExpect(content().string("opaque-Challenge_123"));
        for(String challenge:List.of("unsafe\r\nchallenge","x".repeat(513))) {
            mvc.perform(get(WEBHOOK).param("hub.mode","subscribe").param("hub.verify_token","fictional-test-verify-token").param("hub.challenge",challenge))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(get(WEBHOOK).param("hub.mode","subscribe").param("hub.verify_token","wrong-fictional-token").param("hub.challenge","12345"))
                .andExpect(status().isForbidden());
        mvc.perform(get(WEBHOOK).param("hub.mode","subscribe").param("hub.verify_token","fictional-test-verify-token","fictional-test-verify-token").param("hub.challenge","12345"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(http);
    }

    @Test void stopWithdrawsConsentOnceAndCancelsFutureWorkWithoutClinicalEvidence() throws Exception {
        UUID job=ready();
        TIME.set(DUE.plusSeconds(1));assertThat(plan()).isEqualTo(1);
        byte[] body=stopBody(TIME.get(),"wamid.synthetic_stop_001");callback(body,200);callback(body,200);
        JsonNode preferences=call(patientCookie,get(PREFERENCES),null,200);
        assertThat(preferences.path("whatsappConsent").asBoolean()).isFalse();
        assertThat(preferences.path("version").asLong()).isEqualTo(2);
        assertThat(state(job)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForList("select state from reminder_jobs",String.class)).containsExactly("CANCELLED","CANCELLED");
        assertThat(count("reminder_consent_events")).isEqualTo(2);
        assertThat(jdbc.queryForObject("select actor_user_id from reminder_consent_events where method='PROVIDER_OPT_OUT'",UUID.class)).isNull();
        assertThat(jdbc.queryForObject("select action from reminder_consent_events where method='PROVIDER_OPT_OUT'",String.class)).isEqualTo("WITHDRAWN");
        assertThat(auditCount("MEDICATION_REMINDER_PROVIDER_OPT_OUT")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select actor_user_id from audit_logs where action='MEDICATION_REMINDER_PROVIDER_OPT_OUT'",UUID.class)).isNull();
        assertThat(jdbc.queryForList("select row_to_json(a)::text from audit_logs a where action='MEDICATION_REMINDER_PROVIDER_OPT_OUT'",String.class))
                .allSatisfy(row->assertThat(row).doesNotContain(PHONE,"wamid.synthetic_stop_001","STOP",APP_SECRET,"PRIVATE"));
        assertThat(jdbc.queryForObject("select before_data is null and after_data is null and metadata=jsonb_build_object('traceId',request_id) from audit_logs where action='MEDICATION_REMINDER_PROVIDER_OPT_OUT'",Boolean.class)).isTrue();
        assertThatThrownBy(()->jdbc.update("update reminder_consent_events set policy_version='REWRITTEN' where method='PROVIDER_OPT_OUT'"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("delete from reminder_consent_events where method='PROVIDER_OPT_OUT'"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(dispatch(job)).isFalse();verifyNoInteractions(http);assertNoAdherence();
    }

    @Test void staleStopCannotWithdrawANewerExplicitGrant() throws Exception {
        ready();change(false);TIME.set(DUE.plusSeconds(60));change(true);
        callback(stopBody(DUE,"wamid.synthetic_old_stop"),200);
        JsonNode preferences=call(patientCookie,get(PREFERENCES),null,200);
        assertThat(preferences.path("whatsappConsent").asBoolean()).isTrue();
        assertThat(preferences.path("version").asLong()).isEqualTo(3);
        assertThat(jdbc.queryForObject("select result from reminder_provider_events",String.class)).isEqualTo("STALE");
        assertThat(count("reminder_consent_events")).isEqualTo(3);
    }

    @Test void laterProviderFailureCannotAuthorizeResendingAnAcceptedLogicalOccurrence() throws Exception {
        UUID job=ready();dispatch(job);
        callback(statusBody("failed",token(),MESSAGE,PHONE.substring(1),DUE),200);
        assertThat(state(job)).isEqualTo("FAILED");
        change(true);
        call(staffCookie,patch(schedulePath()).header("If-Match","\"0\""),schedule(),200);
        plan();
        for(UUID candidate:jdbc.queryForList("select id from reminder_jobs",UUID.class))dispatch(candidate);
        verify(http,times(1)).post(any(),anyString(),any(byte[].class),anyInt());
        assertThat(count("reminder_attempts")).isEqualTo(1);assertNoAdherence();
    }

    private MetaHttpClient.Response accepted(){return new MetaHttpClient.Response(200,json.writeValueAsBytes(Map.of("messaging_product","whatsapp","messages",List.of(Map.of("id",MESSAGE)))));}
    private UUID ready() throws Exception {change(true);createSchedule();assertThat(plan()).isEqualTo(1);TIME.set(DUE);return jdbc.queryForObject("select id from reminder_jobs",UUID.class);}
    private int plan() throws Exception {return call(adminCookie,post(ADMIN+"/test-plan"),Map.of("confirmTestOperation",true),200).path("planned").asInt();}
    private boolean dispatch(UUID job) throws Exception {return call(adminCookie,post(ADMIN+"/test-dispatch"),dispatchInput(job,true),200).path("admitted").asBoolean();}
    private Map<String,Object> dispatchInput(UUID job,boolean confirm){return Map.of("jobId",job,"confirmTestOperation",confirm);}
    private UUID token(){return jdbc.queryForObject("select callback_token from reminder_provider_handoffs",UUID.class);}
    private String state(UUID job){return jdbc.queryForObject("select state from reminder_jobs where id=?",String.class,job);}
    private int count(String table){return jdbc.queryForObject("select count(*) from "+table,Integer.class);}
    private int auditCount(String action){return jdbc.queryForObject("select count(*) from audit_logs where action=?",Integer.class,action);}
    private void assertNoAdherence(){assertThat(count("dose_events")).isZero();assertThat(jdbc.queryForObject("select version from treatments where id=?",Long.class,treatment)).isZero();}
    private void change(boolean consent) throws Exception {
        String etag=mvc.perform(get(PREFERENCES).cookie(patientCookie)).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
        Map<String,Object> body=new HashMap<>(Map.of("whatsappConsent",consent,"timeZone","Asia/Jakarta","allDay",true,"policyVersion","MEDICATION_REMINDERS_V1","riskAcknowledged",consent));
        body.put("permittedFrom",null);body.put("permittedUntil",null);
        call(patientCookie,patch(PREFERENCES).header("If-Match",etag),body,200);
    }
    private Map<String,Object> schedule(){return Map.of("timeZone","Asia/Jakarta","startDate","2026-10-11","endDate","2027-04-01","times",List.of("08:00"),"weekdays",List.of(1,2,3,4,5,6,7));}
    private String schedulePath(){return "/api/v1/treatments/"+treatment+"/medication-schedule";}
    private void createSchedule() throws Exception {call(staffCookie,post(schedulePath()),schedule(),201);}
    private byte[] statusBody(String status,UUID token,String message,String recipient,Instant at) {
        Map<String,Object> event=new HashMap<>(Map.of("id",message,"status",status,"timestamp",Long.toString(at.getEpochSecond()),"recipient_id",recipient));
        if(token!=null)event.put("biz_opaque_callback_data",token.toString());
        return envelope("statuses",event);
    }
    private byte[] stopBody(Instant at,String message){return envelope("messages",Map.of("id",message,"type","text","from",PHONE.substring(1),"timestamp",Long.toString(at.getEpochSecond()),"text",Map.of("body","STOP")));}
    private byte[] envelope(String kind,Object event) {
        return json.writeValueAsBytes(Map.of("object","whatsapp_business_account","entry",List.of(Map.of("id","123456","changes",List.of(Map.of("field","messages","value",Map.of("messaging_product","whatsapp","metadata",Map.of("phone_number_id","654321"),kind,List.of(event))))))));
    }
    private void callback(byte[] body,int expected) throws Exception {mvc.perform(post(WEBHOOK).contentType("application/json").header("X-Hub-Signature-256",signature(body)).content(body)).andExpect(status().is(expected));}
    private String signature(byte[] body) throws Exception {Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(APP_SECRET.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return "sha256="+HexFormat.of().formatHex(mac.doFinal(body));}
    private JsonNode call(Cookie cookie,MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null)request.contentType("application/json").content(json.writeValueAsBytes(body));
        var result=mvc.perform(request.cookie(cookie).with(csrf())).andReturn();
        if(result.getResponse().getStatus()!=expected && result.getResolvedException()!=null)throw new AssertionError("Unexpected HTTP status "+result.getResponse().getStatus()+", expected "+expected,result.getResolvedException());
        assertThat(result.getResponse().getStatus()).isEqualTo(expected);
        String content=result.getResponse().getContentAsString();return content.isEmpty()?json.nullNode():json.readTree(content);
    }
    private UUID user(String email,String role){UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash);jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role);return id;}
    private Cookie login(String email) throws Exception {
        jdbc.execute("alter table user_sessions alter column created_at set default timestamptz '"+TIME.get()+"'");
        return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsBytes(Map.of("identity",email,"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
    }
}
