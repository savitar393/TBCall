package id.tbcall.application;

import id.tbcall.application.reminder.*;
import id.tbcall.security.PasswordHasher;
import java.io.IOException;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
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

/** Only synthetic identities, disposable PostgreSQL, and mocked provider HTTP. */
@SpringBootTest(properties={"tbcall.security.production=false","tbcall.monitoring.scheduler-enabled=false",
        "tbcall.reminders.mode=CHANNEL_TEST","tbcall.reminders.scheduler-enabled=false",
        "tbcall.reminders.channels.email-enabled=true","tbcall.reminders.channels.telegram-enabled=true",
        "tbcall.reminders.channels.synthetic-environment=true","tbcall.reminders.channels.telegram-exclusive-consumer-confirmed=true",
        "tbcall.reminders.channels.resend-api-key=re_fictional_nonfunctional_test_credential",
        "tbcall.reminders.channels.telegram-bot-token=123456789:fictional_nonfunctional_test_secret_12345",
        "tbcall.reminders.channels.telegram-bot-username=fictional_tbcall_test_bot",
        "tbcall.reminders.channels.email-recipients=synthetic@example.invalid",
        "tbcall.reminders.channels.telegram-recipients=123456789999"})
@ActiveProfiles("test") @AutoConfigureMockMvc(print=MockMvcPrint.NONE) @Testcontainers
@Timeout(value=30,unit=TimeUnit.SECONDS,threadMode=Timeout.ThreadMode.SEPARATE_THREAD)
class MultiChannelReminderIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine")
            .withImagePullPolicy(image->false).withTmpFs(Map.of("/var/lib/postgresql/data","rw"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",POSTGRES::getJdbcUrl);r.add("spring.datasource.username",POSTGRES::getUsername);r.add("spring.datasource.password",POSTGRES::getPassword);}
    static final Instant START=Instant.parse("2026-10-11T00:00:00Z"),DUE=Instant.parse("2026-10-11T01:00:00Z");
    static final AtomicReference<Instant> TIME=new AtomicReference<>(START);
    @TestConfiguration static class Time {
        @Bean @Primary Clock channelClock(){return new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return Clock.fixed(TIME.get(),z);}public Instant instant(){return TIME.get();}};}
    }
    static final String PASSWORD="Synthetic channel regression password 2026!", EMAIL="synthetic@example.invalid";
    static final String PREFS="/api/v1/me/medication-reminders/preferences",ADMIN="/api/v1/admin/medication-reminders";
    static final String TELEGRAM="/api/v1/me/medication-reminders/telegram",CHAT="123456789999",BOT="fictional_tbcall_test_bot";
    static String hash;
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords;
    @Autowired ReminderPlanner planner; @Autowired ReminderDispatcher dispatcher; @Autowired ReminderDispatchWorker worker;
    @Autowired ChannelProviderProperties providers;
    @MockitoBean ChannelProviderHttp http;
    final JsonMapper json=new JsonMapper();
    UUID user,patient,facility,treatment,staff; Cookie selfCookie,staffCookie,adminCookie;
    long updateId;
    @BeforeEach void setup() throws Exception {
        TIME.set(START);reset(http);updateId=0;providers.setEmailEnabled(true);providers.setTelegramEnabled(true);
        if(hash==null)hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        jdbc.execute("truncate reminder_telegram_consumers,reminder_telegram_updates");
        facility=jdbc.queryForObject("insert into facilities(name) values ('Synthetic channel facility') returning id",UUID.class);
        user=user(EMAIL,"PATIENT");staff=user("officer@example.invalid","TB_OFFICER");user("operator@example.invalid","SYSTEM_ADMIN");
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",staff,facility);
        patient=jdbc.queryForObject("insert into patients(full_name) values ('Synthetic channel patient') returning id",UUID.class);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",user,patient);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-10-08','CONVERTED_TO_CASE') returning id",UUID.class,patient,facility);
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,'2026-10-09','SYNTHETIC','TREAT_HERE') returning id",UUID.class,registration);
        UUID caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,?,'TB_SO','BARU') returning id",UUID.class,registration,diagnosis,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status) values (?,?,'2026-10-10','ACTIVE') returning id",UUID.class,caseId,facility);
        selfCookie=login(EMAIL);staffCookie=login("officer@example.invalid");adminCookie=login("operator@example.invalid");
    }
    @Test void verifiedAccountEmailCanConsentWithoutAVerifiedPhone() throws Exception {
        var initial=read();assertThat(initial.path("verifiedPhone").asBoolean()).isFalse();
        var changed=change(true,false);
        assertThat(changed.path("emailConsent").asBoolean()).isTrue();
        assertThat(changed.path("verifiedEmail").asBoolean()).isTrue();
        assertThat(changed.path("whatsappConsent").asBoolean()).isFalse();
        assertThat(jdbc.queryForList("select channel||':'||action from reminder_consent_events",String.class)).containsExactly("EMAIL:GRANTED");
        verifyNoInteractions(http);
    }
    @Test void preferencesProjectIndependentAvailabilityAndMaskCurrentAccountIdentity()throws Exception{
        var view=read();assertThat(view.path("mode").asString()).isEqualTo("CHANNEL_TEST");
        assertThat(view.path("emailAvailable").asBoolean()).isTrue();assertThat(view.path("telegramAvailable").asBoolean()).isTrue();
        assertThat(view.path("maskedEmail").asString()).isEqualTo("s••••@example.invalid");
        assertThat(view.toString()).doesNotContain(EMAIL,CHAT,"fictional_nonfunctional","telegramBotToken");
        assertThat(view.path("emailConsent").asBoolean()).isFalse();assertThat(view.path("telegramConsent").asBoolean()).isFalse();
    }
    @ParameterizedTest @ValueSource(strings={"emailRiskAcknowledged","telegramRiskAcknowledged"})
    void everySelectedChannelRequiresItsOwnRiskAcknowledgment(String missing)throws Exception{
        linkTelegram();var body=input(true,true);body.put(missing,false);
        call(selfCookie,patch(PREFS).header("If-Match",etag(PREFS)),body,400);
        assertThat(count("reminder_consent_events")).isZero();assertThat(audit("MEDICATION_REMINDER_PREFERENCES_CHANGED")).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"email","destination","telegramChatId"})
    void patientCannotSupplyADestinationInPreferences(String field)throws Exception{
        var body=input(true,false);body.put(field,"other@example.invalid");call(selfCookie,patch(PREFS).header("If-Match",etag(PREFS)),body,400);
        assertThat(count("reminder_consent_events")).isZero();verifyNoInteractions(http);
    }
    @Test void accountEmailVerificationIsRequiredForConsent()throws Exception{
        jdbc.update("update users set email_verified_at=null where id=?",user);
        assertThat(read().path("verifiedEmail").asBoolean()).isFalse();
        call(selfCookie,patch(PREFS).header("If-Match",etag(PREFS)),input(true,false),400);
        assertThat(count("reminder_consent_events")).isZero();verifyNoInteractions(http);
    }
    @Test void telegramLinkRequiresNoncePollAndStillRequiresSeparateConsent()throws Exception{
        linkTelegram();var status=call(selfCookie,get(TELEGRAM),null,200);
        assertThat(status.path("linked").asBoolean()).isTrue();assertThat(status.toString()).doesNotContain(CHAT);
        assertThat(read().path("telegramConsent").asBoolean()).isFalse();assertThat(count("reminder_consent_events")).isZero();
        assertThat(jdbc.queryForObject("select count(*) from reminder_telegram_link_tokens where consumed_at is not null",Integer.class)).isEqualTo(1);
        assertThat(audit("MEDICATION_REMINDER_TELEGRAM_LINK_REQUESTED")).isEqualTo(1);assertThat(audit("MEDICATION_REMINDER_TELEGRAM_LINKED")).isEqualTo(1);
    }
    @Test void oneOccurrencePlansIndependentJobsAndKeepsOnlyDestinationBindings()throws Exception{
        enrollBoth();createSchedule();assertThat(plan()).isEqualTo(2);assertThat(plan()).isZero();
        assertThat(jdbc.queryForList("select channel from reminder_jobs order by channel",String.class)).containsExactly("EMAIL","TELEGRAM");
        assertThat(jdbc.queryForObject("select count(distinct logical_key) from reminder_jobs",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from reminder_jobs where phone_binding is null and destination_binding ~ '^[a-f0-9]{64}$'",Integer.class)).isEqualTo(2);
        assertPrivateMetadata();assertThat(audit("MEDICATION_REMINDER_PLANNED")).isEqualTo(2);
    }
    @Test void onlyExplicitOperatorDispatchCanReachEitherProvider()throws Exception{
        enrollBoth();createSchedule();plan();clearInvocations(http);TIME.set(DUE);
        assertThat(dispatcher.dispatch()).isZero();assertThat(count("reminder_attempts")).isZero();verifyNoInteractions(http);
        acceptedProviders();assertThat(dispatch("EMAIL")).isTrue();assertThat(dispatch("TELEGRAM")).isTrue();
        assertThat(count("reminder_attempts")).isEqualTo(2);assertThat(states()).containsExactly("EMAIL:ACCEPTED","TELEGRAM:ACCEPTED");
        assertThat(audit("MEDICATION_REMINDER_HANDOFF_ADMITTED")).isEqualTo(2);assertThat(audit("MEDICATION_REMINDER_ACCEPTED")).isEqualTo(2);
        assertThat(count("dose_events")).isZero();assertThat(jdbc.queryForObject("select version from treatments where id=?",Long.class,treatment)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from reminder_jobs where state='DELIVERED'",Integer.class)).isZero();
    }
    @Test void operatorConfirmationAndRoleAndCsrfAreMandatory()throws Exception{
        change(true,false);createSchedule();
        call(selfCookie,post(ADMIN+"/channel-test-plan"),Map.of("confirmTestOperation",true),403);
        call(staffCookie,post(ADMIN+"/channel-test-plan"),Map.of("confirmTestOperation",true),403);
        call(adminCookie,post(ADMIN+"/channel-test-plan"),Map.of("confirmTestOperation",false),400);
        mvc.perform(post(ADMIN+"/channel-test-plan").cookie(adminCookie).contentType("application/json").content("{\"confirmTestOperation\":true}")).andExpect(status().isForbidden());
        assertThat(count("reminder_jobs")).isZero();assertThat(audit("REMINDER_CHANNEL_TEST_OPERATION")).isZero();verifyNoInteractions(http);
    }
    @Test void dispatchEndpointRefusesArbitraryRecipientAndUnconfirmedHandoff()throws Exception{
        change(true,false);createSchedule();plan();TIME.set(DUE);UUID job=job("EMAIL");clearInvocations(http);
        call(adminCookie,post(ADMIN+"/channel-test-dispatch"),Map.of("jobId",job,"confirmTestOperation",false),400);
        call(adminCookie,post(ADMIN+"/channel-test-dispatch"),Map.of("jobId",job,"confirmTestOperation",true,"destination","other@example.invalid"),400);
        call(selfCookie,post(ADMIN+"/channel-test-dispatch"),Map.of("jobId",job,"confirmTestOperation",true),403);
        assertThat(count("reminder_attempts")).isZero();verifyNoInteractions(http);
    }
    @Test void preferencesRequireCsrfFreshEtagAndRejectStaleIdentityForms()throws Exception{
        String initial=etag(PREFS);call(selfCookie,patch(PREFS),input(true,false),428);
        mvc.perform(patch(PREFS).cookie(selfCookie).header("If-Match",initial).contentType("application/json").content(json.writeValueAsBytes(input(true,false)))).andExpect(status().isForbidden());
        change(true,false);call(selfCookie,patch(PREFS).header("If-Match",initial),input(false,false),409);
        String current=etag(PREFS);jdbc.update("update users set email='changed@example.invalid',email_verified_at=now()+interval '1 second' where id=?",user);
        call(selfCookie,patch(PREFS).header("If-Match",current),input(true,false),409);
        assertThat(count("reminder_consent_events")).isEqualTo(1);
    }
    @Test void concurrentOperatorDispatchAdmitsEachChannelExactlyOnce()throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);acceptedProviders();clearInvocations(http);
        UUID email=job("EMAIL"),telegram=job("TELEGRAM");var pool=Executors.newFixedThreadPool(4);var start=new CountDownLatch(1);
        try{List<Future<Boolean>> calls=new ArrayList<>();for(UUID id:List.of(email,email,telegram,telegram))calls.add(pool.submit(()->{start.await();return dispatcher.dispatchChannelTest(id);}));start.countDown();int admitted=0;for(var future:calls)if(future.get(15,TimeUnit.SECONDS))admitted++;assertThat(admitted).isEqualTo(2);}finally{pool.shutdownNow();}
        verify(http,times(1)).email(any(),anyString());verify(http,times(1)).telegram(eq(ChannelProviderHttp.Operation.SEND_MESSAGE),any());
        assertThat(count("reminder_attempts")).isEqualTo(2);assertThat(states()).containsExactly("EMAIL:ACCEPTED","TELEGRAM:ACCEPTED");
    }
    @Test void databaseEnforcesOneHandoffPerLogicalChannelAndAttemptChannelForeignKey()throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);acceptedProviders();dispatch("EMAIL");dispatch("TELEGRAM");
        assertThatThrownBy(()->jdbc.update("update reminder_attempts set channel='TELEGRAM' where channel='EMAIL'")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("""
            insert into reminder_jobs(id,user_id,patient_link_id,link_generation,phone_binding,destination_binding,preferences_version,
                treatment_id,schedule_id,revision_id,occurrence_id,scheduled_at,logical_key,idempotency_key,channel,state,attempt_count,next_attempt_at,mode,created_at,updated_at)
            select gen_random_uuid(),user_id,patient_link_id,link_generation,phone_binding,destination_binding,preferences_version+100,
                treatment_id,schedule_id,revision_id,occurrence_id,scheduled_at,logical_key,gen_random_uuid(),channel,'UNCERTAIN',0,next_attempt_at,mode,created_at,updated_at
            from reminder_jobs where channel='EMAIL'
            """)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(count("reminder_jobs")).isEqualTo(2);assertThat(count("reminder_attempts")).isEqualTo(2);
    }
    @Test void eachChannelHasAnIndependentThreeAttemptBudget()throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);clearInvocations(http);
        when(http.email(any(),anyString())).thenReturn(response(429,"{\"name\":\"rate_limit_exceeded\",\"message\":\"Too many requests\"}"));
        when(http.telegram(eq(ChannelProviderHttp.Operation.SEND_MESSAGE),any())).thenReturn(response(429,"{\"ok\":false,\"error_code\":429,\"description\":\"Too Many Requests\",\"parameters\":{\"retry_after\":15}}"));
        for(int seconds:List.of(0,15,45)){TIME.set(DUE.plusSeconds(seconds));assertThat(dispatch("EMAIL")).isTrue();assertThat(dispatch("TELEGRAM")).isTrue();}
        TIME.set(DUE.plusSeconds(120));assertThat(dispatch("EMAIL")).isFalse();assertThat(dispatch("TELEGRAM")).isFalse();
        assertThat(states()).containsExactly("EMAIL:FAILED","TELEGRAM:FAILED");assertThat(count("reminder_attempts")).isEqualTo(6);
        assertThat(jdbc.queryForList("select channel||':'||attempt_count from reminder_jobs order by channel",String.class)).containsExactly("EMAIL:3","TELEGRAM:3");
        verify(http,times(3)).email(any(),anyString());verify(http,times(3)).telegram(eq(ChannelProviderHttp.Operation.SEND_MESSAGE),any());
    }
    @ParameterizedTest @ValueSource(ints={590,601}) void lateOrTooLateRetryCannotCrossTenMinuteDeadline(int seconds)throws Exception{
        change(true,false);createSchedule();plan();TIME.set(DUE.plusSeconds(seconds));
        when(http.email(any(),anyString())).thenReturn(response(429,"{\"name\":\"rate_limit_exceeded\",\"message\":\"Too many requests\"}"));
        dispatch("EMAIL");TIME.set(DUE.plusSeconds(620));assertThat(dispatch("EMAIL")).isFalse();
        assertThat(count("reminder_attempts")).isEqualTo(seconds==590?1:0);assertThat(state("EMAIL")).isEqualTo(seconds==590?"FAILED":"SUPPRESSED");
        verify(http,times(seconds==590?1:0)).email(any(),anyString());
    }
    @Test void ambiguousNetworkHandoffIsNeverRetriedOrCalledDelivered()throws Exception{
        change(true,false);createSchedule();plan();TIME.set(DUE);
        when(http.email(any(),anyString())).thenThrow(new IOException("fictional secret provider detail"));dispatch("EMAIL");
        TIME.set(DUE.plusSeconds(60));worker.recover();plan();assertThat(dispatch("EMAIL")).isFalse();
        verify(http,times(1)).email(any(),anyString());assertThat(state("EMAIL")).isEqualTo("UNCERTAIN");assertThat(count("reminder_attempts")).isEqualTo(1);assertPrivateMetadata();
    }
    @Test void crashAfterDurableAdmissionRecoversEachChannelAsUncertainWithoutSending()throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);clearInvocations(http);
        for(String channel:List.of("EMAIL","TELEGRAM")){var claim=worker.claimOne(job(channel));assertThat(worker.admit(claim)).isNotNull();}
        TIME.set(DUE.plusSeconds(31));assertThat(worker.recover()).isEqualTo(2);assertThat(dispatch("EMAIL")).isFalse();assertThat(dispatch("TELEGRAM")).isFalse();
        assertThat(states()).containsExactly("EMAIL:UNCERTAIN","TELEGRAM:UNCERTAIN");assertThat(jdbc.queryForList("select outcome from reminder_attempts",String.class)).containsOnly("UNCERTAIN");verifyNoInteractions(http);
    }
    @Test void consentWithdrawalAfterClaimPreventsBothHandoffs()throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);var claims=worker.claim();assertThat(claims).hasSize(2);change(false,false);clearInvocations(http);
        for(var claim:claims)assertThat(worker.admit(claim)).isNull();assertThat(states()).containsExactly("EMAIL:CANCELLED","TELEGRAM:CANCELLED");assertThat(count("reminder_attempts")).isZero();verifyNoInteractions(http);
        assertThat(jdbc.queryForObject("select count(*) from reminder_consent_events where action='WITHDRAWN'",Integer.class)).isEqualTo(2);
    }
    @Test void disablingOneProviderImmediatelyBeforeHandoffDoesNotDisableTheOther()throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);acceptedProviders();clearInvocations(http);providers.setEmailEnabled(false);
        try{assertThat(dispatch("EMAIL")).isFalse();assertThat(dispatch("TELEGRAM")).isTrue();}finally{providers.setEmailEnabled(true);}
        assertThat(states()).containsExactly("EMAIL:SUPPRESSED","TELEGRAM:ACCEPTED");verify(http,never()).email(any(),anyString());
    }
    @ParameterizedTest @ValueSource(strings={"emailChanged","emailUnverified","emailReverified","selfRevoked","roleRevoked","suspended"})
    void currentIdentityAndDestinationAreRevalidatedAtDurableHandoff(String change)throws Exception{
        change(true,false);createSchedule();plan();TIME.set(DUE);var claim=worker.claimOne(job("EMAIL"));
        switch(change){case "emailChanged"->jdbc.update("update users set email='other@example.invalid' where id=?",user);case "emailUnverified"->jdbc.update("update users set email_verified_at=null where id=?",user);case "emailReverified"->jdbc.update("update users set email_verified_at=now()+interval '1 second' where id=?",user);case "selfRevoked"->jdbc.update("update patient_user_links set verification_status='REVOKED' where user_id=?",user);case "roleRevoked"->jdbc.update("delete from user_roles where user_id=?",user);default->jdbc.update("update users set status='SUSPENDED' where id=?",user);}
        assertThat(worker.admit(claim)).isNull();assertThat(state("EMAIL")).isEqualTo("SUPPRESSED");assertThat(count("reminder_attempts")).isZero();verifyNoInteractions(http);
    }
    @ParameterizedTest @ValueSource(strings={"scheduleCancelled","treatmentClosed"})
    void changedClinicalEligibilityPreventsBothChannels(String change)throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);var claims=worker.claim();
        if(change.equals("scheduleCancelled"))call(staffCookie,post(schedulePath()+"/cancel").header("If-Match","\"0\""),null,200);else jdbc.update("update treatments set status='COMPLETED' where id=?",treatment);
        clearInvocations(http);for(var claim:claims)assertThat(worker.admit(claim)).isNull();assertThat(count("reminder_attempts")).isZero();verifyNoInteractions(http);
    }
    @Test void scheduleRevisionMovesBothChannelsToTheNewPrescribedTime()throws Exception{
        enrollBoth();createSchedule();plan();call(staffCookie,patch(schedulePath()).header("If-Match","\"0\""),schedule("09:00"),200);plan();TIME.set(DUE);clearInvocations(http);
        assertThat(dispatch("EMAIL")).isFalse();assertThat(dispatch("TELEGRAM")).isFalse();verifyNoInteractions(http);
        TIME.set(DUE.plusSeconds(3600));acceptedProviders();for(UUID id:jdbc.queryForList("select id from reminder_jobs where scheduled_at=? order by channel",UUID.class,TIME.get().atOffset(ZoneOffset.UTC)))assertThat(dispatcher.dispatchChannelTest(id)).isTrue();
        assertThat(count("reminder_attempts")).isEqualTo(2);assertThat(jdbc.queryForObject("select count(*) from reminder_jobs where state='ACCEPTED'",Integer.class)).isEqualTo(2);
    }
    @Test void telegramUnlinkPreservesEmailEnrollmentAndItsAlreadyPlannedJob()throws Exception{
        enrollBoth();createSchedule();plan();long version=channelVersion("email");clearInvocations(http);
        call(selfCookie,delete(TELEGRAM).header("If-Match",etag(TELEGRAM)),null,200);
        assertThat(channelVersion("email")).isEqualTo(version);assertThat(read().path("emailConsent").asBoolean()).isTrue();assertThat(read().path("telegramConsent").asBoolean()).isFalse();
        assertThat(states()).containsExactly("EMAIL:SCHEDULED","TELEGRAM:CANCELLED");TIME.set(DUE);acceptedProviders();assertThat(dispatch("EMAIL")).isTrue();assertThat(dispatch("TELEGRAM")).isFalse();
        assertThat(audit("MEDICATION_REMINDER_TELEGRAM_UNLINKED")).isEqualTo(1);
    }
    @Test void authenticatedTelegramStopWithdrawsOnlyTelegramAndPreservesEmailJob()throws Exception{
        enrollBoth();createSchedule();plan();long version=channelVersion("email");pollCommand("/stop",CHAT,"private");
        assertThat(channelVersion("email")).isEqualTo(version);assertThat(read().path("emailConsent").asBoolean()).isTrue();assertThat(read().path("telegramConsent").asBoolean()).isFalse();
        assertThat(states()).containsExactly("EMAIL:SCHEDULED","TELEGRAM:CANCELLED");assertThat(jdbc.queryForObject("select count(*) from reminder_consent_events where channel='TELEGRAM' and action='WITHDRAWN' and method='PROVIDER_OPT_OUT' and actor_user_id is null",Integer.class)).isEqualTo(1);
        TIME.set(DUE);acceptedProviders();assertThat(dispatch("EMAIL")).isTrue();assertThat(audit("MEDICATION_REMINDER_TELEGRAM_OPT_OUT")).isEqualTo(1);
    }
    @Test void changingOnlyEmailConsentPreservesTelegramEnrollmentVersionAndJob()throws Exception{
        enrollBoth();createSchedule();plan();long version=channelVersion("telegram");var body=input(false,true);body.remove("telegramConsent");body.remove("telegramRiskAcknowledged");
        call(selfCookie,patch(PREFS).header("If-Match",etag(PREFS)),body,200);
        assertThat(channelVersion("telegram")).isEqualTo(version);assertThat(states()).containsExactly("EMAIL:CANCELLED","TELEGRAM:SCHEDULED");assertThat(read().path("telegramConsent").asBoolean()).isTrue();
        TIME.set(DUE);acceptedProviders();assertThat(dispatch("TELEGRAM")).isTrue();
    }
    @Test void fullUiBodyWithdrawingEmailPreservesUnchangedTelegramEnrollmentAndJob()throws Exception{
        enrollBoth();createSchedule();plan();long version=channelVersion("telegram");
        change(false,true);
        assertThat(channelVersion("telegram")).isEqualTo(version);assertThat(read().path("telegramConsent").asBoolean()).isTrue();
        assertThat(states()).containsExactly("EMAIL:CANCELLED","TELEGRAM:SCHEDULED");TIME.set(DUE);acceptedProviders();assertThat(dispatch("TELEGRAM")).isTrue();
    }
    @Test void fullUiBodyWithdrawingTelegramPreservesUnchangedEmailEnrollmentAndJob()throws Exception{
        enrollBoth();createSchedule();plan();long version=channelVersion("email");
        change(true,false);
        assertThat(channelVersion("email")).isEqualTo(version);assertThat(read().path("emailConsent").asBoolean()).isTrue();
        assertThat(states()).containsExactly("EMAIL:SCHEDULED","TELEGRAM:CANCELLED");TIME.set(DUE);acceptedProviders();assertThat(dispatch("EMAIL")).isTrue();
    }
    @Test void fullUiBodyWithdrawingEmailPreservesUnchangedLegacyWhatsAppEnrollmentAndJob()throws Exception{
        jdbc.update("update users set phone='+6281111111001',phone_verified_at=now() where id=?",user);
        var enabled=input(true,false);enabled.put("whatsappConsent",true);enabled.put("riskAcknowledged",true);
        call(selfCookie,patch(PREFS).header("If-Match",etag(PREFS)),enabled,200);createSchedule();plan();long version=channelVersion("whatsapp");
        var withdrawal=input(false,false);withdrawal.put("whatsappConsent",true);withdrawal.put("riskAcknowledged",true);
        call(selfCookie,patch(PREFS).header("If-Match",etag(PREFS)),withdrawal,200);
        assertThat(channelVersion("whatsapp")).isEqualTo(version);assertThat(states()).containsExactly("EMAIL:CANCELLED","WHATSAPP:SCHEDULED");verifyNoInteractions(http);
    }
    @Test void verifiedAccountDestinationStillRequiresTheExplicitTestAllowlist()throws Exception{
        change(true,false);createSchedule();plan();TIME.set(DUE);
        providers.setEmailRecipients(Set.of("other-synthetic@example.invalid"));
        try{assertThat(dispatch("EMAIL")).isFalse();}finally{providers.setEmailRecipients(Set.of(EMAIL));}
        assertThat(state("EMAIL")).isEqualTo("SUPPRESSED");assertThat(jdbc.queryForObject("select classification from reminder_jobs",String.class)).isEqualTo("TEST_RECIPIENT_NOT_ALLOWED");assertThat(count("reminder_attempts")).isZero();verifyNoInteractions(http);
    }
    @Test void telegramMutationsRequireCsrfFreshEtagAndAuthenticatedOperatorPolling()throws Exception{
        String initial=etag(TELEGRAM);call(selfCookie,post(TELEGRAM+"/link"),null,428);
        mvc.perform(post(TELEGRAM+"/link").cookie(selfCookie).header("If-Match",initial)).andExpect(status().isForbidden());
        requestTelegram();call(selfCookie,post(TELEGRAM+"/link").header("If-Match",initial),null,409);
        call(selfCookie,post(ADMIN+"/channel-test-telegram-poll"),Map.of("confirmTestOperation",true),403);
        call(adminCookie,post(ADMIN+"/channel-test-telegram-poll"),Map.of("confirmTestOperation",false),400);
        assertThat(count("reminder_telegram_updates")).isZero();assertThat(count("reminder_telegram_link_tokens")).isEqualTo(1);verifyNoInteractions(http);
    }
    @Test void consentWithdrawalAfterAdmissionCannotAuthorizeAnUncertainRetry()throws Exception{
        change(true,false);createSchedule();plan();TIME.set(DUE);var handoff=worker.admit(worker.claimOne(job("EMAIL")));assertThat(handoff).isNotNull();change(false,false);
        worker.complete(handoff,new ReminderTransport.Result(ReminderTransport.Outcome.UNCERTAIN,"resend-uncertain"));TIME.set(DUE.plusSeconds(60));worker.recover();assertThat(dispatch("EMAIL")).isFalse();
        assertThat(state("EMAIL")).isEqualTo("UNCERTAIN");assertThat(count("reminder_attempts")).isEqualTo(1);verifyNoInteractions(http);
    }
    @Test void acceptedOccurrenceCannotResendAfterConsentOrScheduleVersionChanges()throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);acceptedProviders();dispatch("EMAIL");dispatch("TELEGRAM");clearInvocations(http);
        change(true,true);call(staffCookie,patch(schedulePath()).header("If-Match","\"0\""),schedule("08:00"),200);plan();
        for(UUID id:jdbc.queryForList("select id from reminder_jobs where state='SCHEDULED' and scheduled_at=?",UUID.class,DUE.atOffset(ZoneOffset.UTC)))assertThat(dispatcher.dispatchChannelTest(id)).isFalse();
        assertThat(count("reminder_attempts")).isEqualTo(2);verifyNoInteractions(http);assertPrivateMetadata();
    }
    @Test void historyContainsOnlyOwnChannelMetadataAndAcceptanceNeverDelivery()throws Exception{
        enrollBoth();createSchedule();plan();TIME.set(DUE);acceptedProviders();dispatch("EMAIL");dispatch("TELEGRAM");
        var response=mvc.perform(get("/api/v1/me/medication-reminders/history").cookie(selfCookie)).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getHeader("Cache-Control")).contains("no-store");var history=json.readTree(response.getContentAsString());assertThat(history.path("content")).hasSize(2);
        for(var item:history.path("content")){assertThat(item.path("state").asString()).isEqualTo("ACCEPTED");assertThat(item.path("mode").asString()).isEqualTo("CHANNEL_TEST");}
        assertThat(response.getContentAsString()).doesNotContain(EMAIL,CHAT,"DELIVERED","idempotencyKey","leaseToken",user.toString(),patient.toString());
        UUID other=user("other-patient@example.invalid","PATIENT"),otherPatient=jdbc.queryForObject("insert into patients(full_name) values ('Synthetic unrelated identity') returning id",UUID.class);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",other,otherPatient);
        assertThat(call(login("other-patient@example.invalid"),get("/api/v1/me/medication-reminders/history"),null,200).path("content")).isEmpty();
    }
    @Test void consentEvidenceRemainsAppendOnlyAndContainsNoRawDestinations()throws Exception{
        enrollBoth();change(false,false);assertThat(count("reminder_consent_events")).isEqualTo(4);assertPrivateMetadata();
        assertThatThrownBy(()->jdbc.update("update reminder_consent_events set policy_version='rewritten'" )).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("delete from reminder_consent_events")).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThat(count("reminder_consent_events")).isEqualTo(4);
    }
    @Test void expiredGroupAndReplayedTelegramStartCannotCreateNewBinding()throws Exception{
        String nonce=requestTelegram();pollCommand("/start "+nonce,CHAT,"group");assertThat(read().path("telegramLinked").asBoolean()).isFalse();
        TIME.set(START.plusSeconds(301));pollCommand("/start "+nonce,CHAT,"private");assertThat(read().path("telegramLinked").asBoolean()).isFalse();
        String fresh=requestTelegram();pollCommand("/start "+fresh,CHAT,"private");assertThat(read().path("telegramLinked").asBoolean()).isTrue();
        call(selfCookie,delete(TELEGRAM).header("If-Match",etag(TELEGRAM)),null,200);pollCommand("/start "+fresh,CHAT,"private");assertThat(read().path("telegramLinked").asBoolean()).isFalse();
        assertThat(audit("MEDICATION_REMINDER_TELEGRAM_LINKED")).isEqualTo(1);
    }
    @Test void legacyWhatsAppConsentCannotRouteThroughEmailOrTelegramInChannelMode()throws Exception{
        jdbc.update("update users set phone='+6281111111001',phone_verified_at=now() where id=?",user);var body=input(false,false);body.put("whatsappConsent",true);body.put("riskAcknowledged",true);
        call(selfCookie,patch(PREFS).header("If-Match",etag(PREFS)),body,200);createSchedule();plan();TIME.set(DUE);clearInvocations(http);
        assertThat(dispatch("WHATSAPP")).isFalse();assertThat(state("WHATSAPP")).isEqualTo("SUPPRESSED");assertThat(count("reminder_attempts")).isZero();verifyNoInteractions(http);
    }
    @ParameterizedTest @ValueSource(strings={"REVOKED","PENDING","SUPPORTER"})
    void onlyVerifiedSelfPatientsCanReadOrMutateChannelSettings(String invalid)throws Exception{
        if(invalid.equals("SUPPORTER"))jdbc.update("update patient_user_links set relationship_type='SUPPORTER' where user_id=?",user);else jdbc.update("update patient_user_links set verification_status=? where user_id=?",invalid,user);
        call(selfCookie,get(PREFS),null,403);call(selfCookie,get(TELEGRAM),null,403);call(selfCookie,patch(PREFS).header("If-Match","\"0\""),input(true,false),403);
        assertThat(count("reminder_consent_events")).isZero();assertThat(audit("AUTHORIZATION_DENIED")).isGreaterThanOrEqualTo(1);verifyNoInteractions(http);
    }
    private int count(String table){return jdbc.queryForObject("select count(*) from "+table,Integer.class);}
    private int audit(String action){return jdbc.queryForObject("select count(*) from audit_logs where action=?",Integer.class,action);}
    private long channelVersion(String channel){return jdbc.queryForObject("select "+channel+"_version from reminder_preferences where user_id=?",Long.class,user);}
    private List<String> states(){return jdbc.queryForList("select channel||':'||state from reminder_jobs where scheduled_at=? order by channel",String.class,DUE.atOffset(ZoneOffset.UTC));}
    private String state(String channel){return jdbc.queryForObject("select state from reminder_jobs where scheduled_at=? and channel=? order by created_at desc limit 1",String.class,DUE.atOffset(ZoneOffset.UTC),channel);}
    private UUID job(String channel){return jdbc.queryForObject("select id from reminder_jobs where scheduled_at=? and channel=? order by created_at limit 1",UUID.class,DUE.atOffset(ZoneOffset.UTC),channel);}
    private String etag(String path)throws Exception{return mvc.perform(get(path).cookie(selfCookie)).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");}
    private int plan()throws Exception{return call(adminCookie,post(ADMIN+"/channel-test-plan"),Map.of("confirmTestOperation",true),200).path("planned").asInt();}
    private boolean dispatch(String channel)throws Exception{return call(adminCookie,post(ADMIN+"/channel-test-dispatch"),Map.of("jobId",job(channel),"confirmTestOperation",true),200).path("admitted").asBoolean();}
    private void enrollBoth()throws Exception{linkTelegram();change(true,true);}
    private void linkTelegram()throws Exception{pollCommand("/start "+requestTelegram(),CHAT,"private");assertThat(read().path("telegramLinked").asBoolean()).isTrue();}
    private String requestTelegram()throws Exception{String url=call(selfCookie,post(TELEGRAM+"/link").header("If-Match",etag(TELEGRAM)),null,200).path("deepLink").asString();assertThat(url).startsWith("https://t.me/"+BOT+"?start=");return url.substring(url.indexOf("?start=")+7);}
    private void pollCommand(String text,String chat,String type)throws Exception{
        when(http.telegram(eq(ChannelProviderHttp.Operation.GET_ME),any())).thenReturn(response(200,"{\"ok\":true,\"result\":{\"id\":123456789,\"is_bot\":true,\"first_name\":\"Synthetic\",\"username\":\""+BOT+"\"}}"));
        when(http.telegram(eq(ChannelProviderHttp.Operation.GET_WEBHOOK_INFO),any())).thenReturn(response(200,"{\"ok\":true,\"result\":{\"url\":\"\",\"has_custom_certificate\":false,\"pending_update_count\":0}}"));
        var update=Map.of("update_id",++updateId,"message",Map.of("message_id",updateId,"date",TIME.get().getEpochSecond(),"chat",Map.of("id",Long.parseLong(chat),"type",type),"from",Map.of("id",Long.parseLong(chat),"is_bot",false,"first_name","Synthetic"),"text",text));
        when(http.telegram(eq(ChannelProviderHttp.Operation.GET_UPDATES),any())).thenReturn(new ChannelProviderHttp.Response(200,json.writeValueAsBytes(Map.of("ok",true,"result",List.of(update)))));
        call(adminCookie,post(ADMIN+"/channel-test-telegram-poll"),Map.of("confirmTestOperation",true),200);
    }
    private void acceptedProviders()throws Exception{
        when(http.email(any(),anyString())).thenAnswer(invocation->{var body=json.readTree((byte[])invocation.getArgument(0));assertThat(body.path("to").get(0).asString()).isEqualTo(EMAIL);assertThat(body.path("text").asString()).isEqualTo("Pengingat jadwal Anda. Silakan buka aplikasi TBCall untuk melihat informasi.");assertThat(body.size()).isEqualTo(4);return response(200,"{\"id\":\"4a5123e6-423e-42a1-99d4-123456789abc\"}");});
        when(http.telegram(eq(ChannelProviderHttp.Operation.SEND_MESSAGE),any())).thenAnswer(invocation->{var body=json.readTree((byte[])invocation.getArgument(1));assertThat(body.path("chat_id").asString()).isEqualTo(CHAT);assertThat(body.path("text").asString()).isEqualTo("Pengingat jadwal Anda. Silakan buka aplikasi TBCall untuk melihat informasi.");assertThat(body.size()).isEqualTo(2);return response(200,"{\"ok\":true,\"result\":{\"message_id\":77,\"date\":1791680400,\"chat\":{\"id\":"+CHAT+",\"type\":\"private\"},\"text\":\"neutral\"}}");});
    }
    private ChannelProviderHttp.Response response(int status,String value){return new ChannelProviderHttp.Response(status,value.getBytes(StandardCharsets.UTF_8));}
    private Map<String,Object> schedule(String time){return new HashMap<>(Map.of("timeZone","Asia/Jakarta","startDate","2026-10-11","endDate","2026-10-11","times",List.of(time),"weekdays",List.of(1,2,3,4,5,6,7)));}
    private String schedulePath(){return "/api/v1/treatments/"+treatment+"/medication-schedule";}
    private void createSchedule()throws Exception{call(staffCookie,post(schedulePath()),schedule("08:00"),201);}
    private void assertPrivateMetadata(){for(String table:List.of("reminder_consent_events","reminder_jobs","reminder_attempts","audit_logs"))assertThat(jdbc.queryForList("select row_to_json(t)::text from "+table+" t",String.class)).allSatisfy(row->assertThat(row).doesNotContain(EMAIL,CHAT,"fictional_nonfunctional","fictional secret provider detail","Pengingat jadwal Anda"));}
    private JsonNode read()throws Exception{return call(selfCookie,get(PREFS),null,200);}
    private JsonNode change(boolean email,boolean telegram)throws Exception{
        String etag=mvc.perform(get(PREFS).cookie(selfCookie)).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
        return call(selfCookie,patch(PREFS).header("If-Match",etag),input(email,telegram),200);
    }
    private Map<String,Object> input(boolean email,boolean telegram){var b=new HashMap<String,Object>();b.put("whatsappConsent",false);b.put("emailConsent",email);b.put("telegramConsent",telegram);b.put("riskAcknowledged",false);b.put("emailRiskAcknowledged",email);b.put("telegramRiskAcknowledged",telegram);b.put("timeZone","Asia/Jakarta");b.put("allDay",true);b.put("permittedFrom",null);b.put("permittedUntil",null);b.put("policyVersion","MEDICATION_REMINDERS_V1");return b;}
    private JsonNode call(Cookie cookie,MockHttpServletRequestBuilder request,Object body,int expected)throws Exception{
        if(body!=null)request.contentType("application/json").content(json.writeValueAsBytes(body));
        var response=mvc.perform(request.cookie(cookie).with(csrf())).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(expected);return response.getContentAsString().isEmpty()?json.nullNode():json.readTree(response.getContentAsString());
    }
    private UUID user(String email,String role){var id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash);jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role);return id;}
    private Cookie login(String email)throws Exception{jdbc.execute("alter table user_sessions alter column created_at set default timestamptz '"+TIME.get()+"'");return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsBytes(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");}
}
