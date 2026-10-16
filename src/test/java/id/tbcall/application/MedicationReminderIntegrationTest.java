package id.tbcall.application;

import id.tbcall.application.reminder.ReminderDispatcher;
import id.tbcall.application.reminder.ReminderDispatchWorker;
import id.tbcall.application.reminder.ReminderPlanner;
import id.tbcall.application.reminder.ReminderTransport;
import id.tbcall.application.reminder.SimulatedWhatsAppTransport;
import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Exercises reminder consent and the durable send boundary against a disposable database. */
@SpringBootTest(properties={"tbcall.security.production=false", "tbcall.monitoring.scheduler-enabled=false",
        "tbcall.reminders.mode=SIMULATED", "tbcall.reminders.scheduler-enabled=false",
        "tbcall.reminders.planning-hours=24", "tbcall.reminders.batch-size=100",
        "tbcall.reminders.max-attempts=3", "tbcall.reminders.max-lateness-minutes=10",
        "tbcall.reminders.claim-seconds=30", "tbcall.reminders.retry-seconds=15"})
@ActiveProfiles("test") @AutoConfigureMockMvc(print=MockMvcPrint.NONE) @Testcontainers
@Timeout(value=30,unit=TimeUnit.SECONDS,threadMode=Timeout.ThreadMode.SEPARATE_THREAD)
class MedicationReminderIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine")
            .withImagePullPolicy(image -> false).withTmpFs(Map.of("/var/lib/postgresql/data", "rw"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
    }
    static final Instant START=Instant.parse("2026-10-11T00:00:00Z");
    static final Instant DUE=Instant.parse("2026-10-11T01:00:00Z");
    static final AtomicReference<Instant> TIME=new AtomicReference<>(START);
    @TestConfiguration static class Time {
        @Bean @Primary Clock reminderClock() {
            return new Clock() {
                public ZoneId getZone() { return ZoneOffset.UTC; }
                public Clock withZone(ZoneId zone) { return Clock.fixed(TIME.get(), zone); }
                public Instant instant() { return TIME.get(); }
            };
        }
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordHasher passwords;
    @Autowired ReminderPlanner planner;
    @Autowired ReminderDispatcher dispatcher;
    @Autowired ReminderDispatchWorker worker;
    @MockitoSpyBean SimulatedWhatsAppTransport whatsapp;
    final JsonMapper json=JsonMapper.builder().build();
    static final String PASSWORD="Fictional reminder regression password 2026!";
    static final String PHONE="+6281111111001";
    static String hash;
    static final String PREFERENCES="/api/v1/me/medication-reminders/preferences";
    UUID facility, patient, caseId, treatment, self, staff;
    Cookie patientCookie, staffCookie;

    @BeforeEach void setup() throws Exception {
        TIME.set(START);
        reset(whatsapp);
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        facility=jdbc.queryForObject("insert into facilities(name) values ('Fictional reminder facility') returning id",UUID.class);
        staff=user("officer@example.invalid","TB_OFFICER");
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",staff,facility);
        self=user("patient@example.invalid","PATIENT");
        jdbc.update("update users set phone=?,phone_verified_at=now() where id=?",PHONE,self);
        // Clinical contact information is deliberately different from the verified account recipient.
        patient=jdbc.queryForObject("insert into patients(full_name,phone,address) values ('Fictional reminder patient','+6281111111999','PRIVATE-CLINICAL-ADDRESS') returning id",UUID.class);
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,'2026-10-08','CONVERTED_TO_CASE') returning id",UUID.class,patient,facility);
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date,diagnosis_result,treatment_disposition) values (?,'2026-10-09','PRIVATE','TREAT_HERE') returning id",UUID.class,registration);
        caseId=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,?,'TB_SO','BARU') returning id",UUID.class,registration,diagnosis,facility);
        treatment=jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,'2026-10-10','ACTIVE','PRIVATE-CLINICAL-NOTE') returning id",UUID.class,caseId,facility);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",self,patient);
        patientCookie=login("patient@example.invalid");
        staffCookie=login("officer@example.invalid");
    }

    @Test void defaultPreferencesRequireExplicitConsentAndExposeOnlyMaskedAccountBinding() throws Exception {
        var response=mvc.perform(get(PREFERENCES).cookie(patientCookie)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store"))).andReturn().getResponse();
        assertThat(response.getHeader("ETag")).startsWith("\"").endsWith("\"");
        JsonNode value=json.readTree(response.getContentAsString());
        assertThat(value.path("whatsappConsent").asBoolean()).isFalse();
        assertThat(value.has("smsConsent")).isFalse();
        assertThat(value.has("smsFallback")).isFalse();
        assertThat(value.has("preferredChannel")).isFalse();
        assertThat(value.path("verifiedPhone").asBoolean()).isTrue();
        assertThat(value.path("mode").asText()).isEqualTo("SIMULATED");
        assertThat(response.getContentAsString()).doesNotContain(PHONE,"+6281111111999",patient.toString(),"PRIVATE-CLINICAL");
        createSchedule(); planner.plan(); dispatcher.dispatch();
        assertThat(count("reminder_jobs")).isZero();
        verifyNoInteractions(whatsapp);
    }

    @Test void consentWriteRequiresCsrfFreshVersionAndRiskAcknowledgement() throws Exception {
        var change=preferences(true);
        String original=etag("0");
        mvc.perform(patch(PREFERENCES).cookie(patientCookie).header("If-Match",original)
                .contentType("application/json").content(json.writeValueAsString(change))).andExpect(status().isForbidden());
        call(patientCookie,patch(PREFERENCES),change,428);
        change.put("riskAcknowledged",false);
        call(patientCookie,patch(PREFERENCES).header("If-Match",original),change,400);
        change.put("riskAcknowledged",true);
        JsonNode enrolled=change(change,"0");
        assertThat(enrolled.path("whatsappConsent").asBoolean()).isTrue();
        assertThat(enrolled.has("smsConsent")).isFalse();
        assertThat(enrolled.path("bindingCurrent").asBoolean()).isTrue();
        call(patientCookie,patch(PREFERENCES).header("If-Match",original),change,409);
        assertThat(count("reminder_consent_events")).isEqualTo(1);
        assertThat(count("reminder_jobs")).isZero();
    }

    @ParameterizedTest @ValueSource(strings={"policy","unknownRecipient","invalidZone","halfWindow"})
    void invalidConsentCannotCreateRecipientAuthority(String invalid) throws Exception {
        var value=preferences(true);
        switch(invalid) {
            case "policy" -> value.put("policyVersion","OUTDATED_POLICY");
            case "unknownRecipient" -> value.put("phone","+6281111111777");
            case "invalidZone" -> value.put("timeZone","GMT+7");
            case "halfWindow" -> {value.put("allDay",false);value.put("permittedFrom","08:00");}
        }
        call(patientCookie,patch(PREFERENCES).header("If-Match",etag("0")),value,400);
        assertThat(count("reminder_consent_events")).isZero();
    }

    @ParameterizedTest @CsvSource({"smsConsent,true","smsConsent,false","smsFallback,true","smsFallback,false",
            "preferredChannel,WHATSAPP","preferredChannel,SMS"})
    void obsoleteChannelInputsAreRejectedRatherThanSilentlyIgnored(String field,String legacyValue) throws Exception {
        var value=preferences(true);
        // Even formerly valid or disabled legacy values are unsupported request fields.
        value.put(field,field.equals("preferredChannel")?legacyValue:Boolean.valueOf(legacyValue));
        call(patientCookie,patch(PREFERENCES).header("If-Match",etag("0")),value,400);
        assertThat(count("reminder_preferences")).isZero();
        assertThat(count("reminder_consent_events")).isZero();
        assertThat(count("reminder_jobs")).isZero();
        verifyNoInteractions(whatsapp);
    }

    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","TB_OFFICER","LAB_STAFF","PROGRAM_MONITOR","TREATMENT_SUPPORTER"})
    void otherRolesCannotEnrollForAPatientOrReadPreferences(String role) throws Exception {
        UUID other=user("other@example.invalid",role);
        jdbc.update("update users set phone='+6281111111002',phone_verified_at=now() where id=?",other);
        UUID unrelated=jdbc.queryForObject("insert into patients(full_name) values ('Fictional role regression patient') returning id",UUID.class);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",other,unrelated);
        Cookie cookie=login("other@example.invalid");
        call(cookie,get(PREFERENCES),null,403);
        call(cookie,patch(PREFERENCES).header("If-Match","\"0\""),preferences(true),403);
        assertThat(count("reminder_consent_events")).isZero();
    }

    @Test void unverifiedAccountPhoneCannotBeReplacedByClinicalContactPhone() throws Exception {
        jdbc.update("update users set phone_verified_at=null where id=?",self);
        JsonNode read=call(patientCookie,get(PREFERENCES),null,200);
        assertThat(read.path("verifiedPhone").asBoolean()).isFalse();
        call(patientCookie,patch(PREFERENCES).header("If-Match",etag("0")),preferences(true),400);
        createSchedule(); planner.plan(); TIME.set(DUE); dispatcher.dispatch();
        assertThat(count("reminder_jobs")).isZero();
        verifyNoInteractions(whatsapp);
    }

    @Test void duplicatePlanningAndDispatchSendOnlyOneGenericMessageAndNeverCreateDoseEvidence() throws Exception {
        enroll(true); createSchedule();
        assertThat(planner.plan()).isEqualTo(1);
        assertThat(planner.plan()).isZero();
        assertThat(count("reminder_jobs")).isEqualTo(1);
        TIME.set(DUE); dispatcher.dispatch(); dispatcher.dispatch(); planner.plan(); dispatcher.dispatch();
        var sent=org.mockito.ArgumentCaptor.forClass(ReminderTransport.Message.class);
        verify(whatsapp,times(1)).send(sent.capture());
        assertThat(sent.getValue().destination()).isEqualTo(PHONE);
        assertThat(sent.getValue().channel()).isEqualTo("WHATSAPP");
        assertThat(sent.getValue().text()).doesNotContain("TBC","TBCall","tuberkulosis","PRIVATE",patient.toString(),caseId.toString(),treatment.toString());
        assertThat(dueState()).isEqualTo("ACCEPTED");
        assertThat(count("reminder_attempts")).isEqualTo(1);
        assertThat(count("dose_events")).isZero();
        assertThat(jdbc.queryForObject("select version from treatments where id=?",Long.class,treatment)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from reminder_jobs where state='DELIVERED'",Integer.class)).isZero();
    }

    @ParameterizedTest @ValueSource(strings={"phoneChanged","phoneUnverified","linkRevoked","roleRevoked","suspended","caseCompleted","caseReferred","treatmentPaused","treatmentStopped","treatmentCompleted"})
    void authorityAndClinicalEligibilityAreRecheckedBeforeHandoff(String invalidation) throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE);
        var claim=onlyClaim();
        switch(invalidation) {
            case "phoneChanged" -> jdbc.update("update users set phone='+6281111111003' where id=?",self);
            case "phoneUnverified" -> jdbc.update("update users set phone_verified_at=null where id=?",self);
            case "linkRevoked" -> jdbc.update("update patient_user_links set verification_status='REVOKED' where user_id=?",self);
            case "roleRevoked" -> jdbc.update("delete from user_roles where user_id=?",self);
            case "suspended" -> jdbc.update("update users set status='SUSPENDED' where id=?",self);
            case "caseCompleted" -> jdbc.update("update tb_cases set status='COMPLETED' where id=?",caseId);
            case "caseReferred" -> jdbc.update("update tb_cases set status='REFERRED' where id=?",caseId);
            case "treatmentPaused" -> jdbc.update("update treatments set status='PAUSED' where id=?",treatment);
            case "treatmentStopped" -> jdbc.update("update treatments set status='STOPPED' where id=?",treatment);
            case "treatmentCompleted" -> jdbc.update("update treatments set status='COMPLETED' where id=?",treatment);
        }
        assertThat(worker.admit(claim)).isNull(); dispatcher.dispatch();
        assertThat(count("reminder_attempts")).isZero();
        assertThat(jdbc.queryForObject("select count(*) from reminder_jobs where state in ('DISPATCHED','ACCEPTED')",Integer.class)).isZero();
        verifyNoInteractions(whatsapp);
    }

    @Test void withdrawingConsentAfterClaimPreventsHandoff() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE);
        var claim=onlyClaim();
        change(preferences(false),"1");
        assertThat(worker.admit(claim)).isNull(); dispatcher.dispatch();
        assertThat(count("reminder_attempts")).isZero();
        verifyNoInteractions(whatsapp);
    }

    @Test void changedVerifiedPhoneRequiresNewExplicitConsentBinding() throws Exception {
        enroll(true); createSchedule(); planner.plan();
        jdbc.update("update users set phone='+6281111111003',phone_verified_at=now() where id=?",self);
        JsonNode read=call(patientCookie,get(PREFERENCES),null,200);
        assertThat(read.path("bindingCurrent").asBoolean()).isFalse();
        TIME.set(DUE); dispatcher.dispatch(); verifyNoInteractions(whatsapp);
        change(preferences(true),"1"); planner.plan(); dispatcher.dispatch();
        var sent=org.mockito.ArgumentCaptor.forClass(ReminderTransport.Message.class);
        verify(whatsapp,times(1)).send(sent.capture());
        assertThat(sent.getValue().destination()).isEqualTo("+6281111111003");
    }

    @Test void reverifyingTheSamePhoneDoesNotRestoreTheOldConsentBinding() throws Exception {
        enroll(true); createSchedule(); planner.plan();
        jdbc.update("update users set phone_verified_at=null where id=?",self);
        TIME.set(DUE); dispatcher.dispatch();
        jdbc.update("update users set phone_verified_at=now()+interval '1 second' where id=?",self);
        JsonNode old=call(patientCookie,get(PREFERENCES),null,200);
        assertThat(old.path("bindingCurrent").asBoolean()).isFalse();
        assertThat(old.path("whatsappConsent").asBoolean()).isFalse();
        planner.plan(); dispatcher.dispatch(); verifyNoInteractions(whatsapp);
        change(preferences(true),"1"); planner.plan(); dispatcher.dispatch();
        verify(whatsapp,times(1)).send(any());
    }

    @ParameterizedTest @ValueSource(strings={"phoneChanged","phoneReverified","selfGenerationChanged"})
    void stalePreferenceFormCannotConsentToANewRecipientOrSelfBinding(String change) throws Exception {
        enroll(true);
        String stale=etag("1");
        switch(change) {
            case "phoneChanged" -> jdbc.update("update users set phone='+6281111111003',phone_verified_at=now()+interval '1 second' where id=?",self);
            case "phoneReverified" -> jdbc.update("update users set phone_verified_at=now()+interval '1 second' where id=?",self);
            default -> jdbc.update("update patient_user_links set version=version+1,verified_at=now()+interval '1 second' where user_id=?",self);
        }
        call(patientCookie,patch(PREFERENCES).header("If-Match",stale),preferences(true),409);
        JsonNode current=call(patientCookie,get(PREFERENCES),null,200);
        assertThat(current.path("bindingCurrent").asBoolean()).isFalse();
        assertThat(current.path("whatsappConsent").asBoolean()).isFalse();
        assertThat(current.has("smsConsent")).isFalse();
        assertThat(count("reminder_consent_events")).isEqualTo(1);
    }

    @Test void crashBeforeAdmissionReleasesLeaseWithoutLosingTheReminder() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE);
        var stale=onlyClaim(); TIME.set(DUE.plusSeconds(31));
        worker.recover();
        assertThat(worker.admit(stale)).isNull();
        dispatcher.dispatch();
        assertThat(dueState()).isEqualTo("ACCEPTED");
        verify(whatsapp,times(1)).send(any());
        assertThat(count("reminder_attempts")).isEqualTo(1);
    }

    @Test void crashAfterDurableHandoffBecomesUncertainAndNeverRetries() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE);
        var handoff=worker.admit(onlyClaim()); assertThat(handoff).isNotNull();
        TIME.set(DUE.plusSeconds(31)); worker.recover(); dispatcher.dispatch();
        assertThat(dueState()).isEqualTo("UNCERTAIN");
        assertThat(count("reminder_attempts")).isEqualTo(1);
        verifyNoInteractions(whatsapp);
        // A late result from the expired owner cannot turn the uncertain attempt into a retry.
        worker.complete(handoff,new ReminderTransport.Result(ReminderTransport.Outcome.SAFE_RETRY,"late-result"));
        planner.plan(); dispatcher.dispatch();
        verifyNoInteractions(whatsapp);
        assertThat(dueState()).isEqualTo("UNCERTAIN");
        assertThat(count("reminder_attempts")).isEqualTo(1);
        assertWhatsAppOnlyMetadata();
    }

    @Test void concurrentWorkersCannotHandoffTheSameOccurrenceTwice() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE);
        var start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var first=executor.submit(()->{start.await();return dispatcher.dispatch();});
            var second=executor.submit(()->{start.await();return dispatcher.dispatch();});
            start.countDown(); first.get(15,TimeUnit.SECONDS); second.get(15,TimeUnit.SECONDS);
        }
        verify(whatsapp,times(1)).send(any());
        assertThat(count("reminder_attempts")).isEqualTo(1);
        assertThat(dueState()).isEqualTo("ACCEPTED");
    }

    @Test void safePreacceptFailuresRetryAtMostThreeTimesWithinTheTimeBudget() throws Exception {
        doReturn(new ReminderTransport.Result(ReminderTransport.Outcome.SAFE_RETRY,"safe-retry")).when(whatsapp).send(any());
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE);
        dispatcher.dispatch(); dispatcher.dispatch();
        assertThat(count("reminder_attempts")).isEqualTo(1);
        TIME.set(DUE.plusSeconds(15)); dispatcher.dispatch();
        TIME.set(DUE.plusSeconds(30)); dispatcher.dispatch();
        TIME.set(DUE.plusSeconds(45)); dispatcher.dispatch(); worker.recover(); planner.plan(); dispatcher.dispatch();
        verify(whatsapp,times(3)).send(any());
        assertThat(count("reminder_attempts")).isEqualTo(3);
        assertThat(dueState()).isEqualTo("FAILED");
        assertThat(jdbc.queryForList("select scheduled_at from reminder_jobs order by scheduled_at",OffsetDateTime.class)
                .stream().map(OffsetDateTime::toInstant).toList()).containsExactly(DUE,DUE.plus(Duration.ofDays(1)));
        assertWhatsAppOnlyMetadata();
    }

    @Test void preferenceReenrollmentCannotResetTheThreeAttemptBudgetForOneOccurrence() throws Exception {
        doReturn(new ReminderTransport.Result(ReminderTransport.Outcome.SAFE_RETRY,"safe-retry")).when(whatsapp).send(any());
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE); dispatcher.dispatch();
        for(int version=1;version<=3;version++) {
            change(preferences(true),Integer.toString(version));
            planner.plan(); dispatcher.dispatch();
        }
        verify(whatsapp,times(3)).send(any());
        assertThat(count("reminder_attempts")).isEqualTo(3);
    }

    @ParameterizedTest @ValueSource(strings={"ACCEPTED","UNCERTAIN","FAILED","THROWN"})
    void terminalOutcomeNeverTriggersRetryOrAnotherChannel(String result) throws Exception {
        if(result.equals("THROWN")) doThrow(new IllegalStateException("Synthetic ambiguous transport failure")).when(whatsapp).send(any());
        else doReturn(new ReminderTransport.Result(ReminderTransport.Outcome.valueOf(result),"synthetic-result")).when(whatsapp).send(any());
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE); dispatcher.dispatch();
        TIME.set(DUE.plusSeconds(60)); worker.recover(); dispatcher.dispatch(); planner.plan(); dispatcher.dispatch();
        verify(whatsapp,times(1)).send(any());
        assertThat(count("reminder_attempts")).isEqualTo(1);
        assertThat(dueState()).isEqualTo(switch(result) {
            case "ACCEPTED" -> "ACCEPTED";
            case "FAILED" -> "FAILED";
            default -> "UNCERTAIN";
        });
        assertThat(jdbc.queryForList("select scheduled_at from reminder_jobs order by scheduled_at",OffsetDateTime.class)
                .stream().map(OffsetDateTime::toInstant).toList()).containsExactly(DUE,DUE.plus(Duration.ofDays(1)));
        assertWhatsAppOnlyMetadata();
    }

    @ParameterizedTest @ValueSource(strings={"nullResponse","nullOutcome","invalidCorrelation"})
    void malformedProviderResponseIsUncertainAndCannotAuthorizeRetryOrAnotherChannel(String invalid) throws Exception {
        ReminderTransport.Result result=switch(invalid) {
            case "nullResponse" -> null;
            case "nullOutcome" -> new ReminderTransport.Result(null,"synthetic-result");
            default -> new ReminderTransport.Result(ReminderTransport.Outcome.SAFE_RETRY,"provider text with spaces");
        };
        doReturn(result).when(whatsapp).send(any());
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE); dispatcher.dispatch();
        TIME.set(DUE.plusSeconds(60)); worker.recover(); planner.plan(); dispatcher.dispatch();
        verify(whatsapp,times(1)).send(any());
        assertThat(count("reminder_attempts")).isEqualTo(1);
        assertThat(dueState()).isEqualTo("UNCERTAIN");
        if(invalid.equals("invalidCorrelation")) {
            assertThat(jdbc.queryForObject("select provider_correlation from reminder_jobs where scheduled_at=?",String.class,DUE.atOffset(ZoneOffset.UTC))).isNull();
            assertThat(jdbc.queryForObject("select provider_correlation from reminder_attempts",String.class)).isNull();
        }
        assertThat(jdbc.queryForList("select scheduled_at from reminder_jobs order by scheduled_at",OffsetDateTime.class)
                .stream().map(OffsetDateTime::toInstant).toList()).containsExactly(DUE,DUE.plus(Duration.ofDays(1)));
        assertWhatsAppOnlyMetadata();
    }

    @Test void lateQueuedReminderExpiresWithoutSending() throws Exception {
        enroll(true); createSchedule(); planner.plan();
        TIME.set(DUE.plusSeconds(601)); dispatcher.dispatch(); worker.recover(); dispatcher.dispatch();
        verifyNoInteractions(whatsapp);
        assertThat(count("reminder_attempts")).isZero();
        assertThat(dueState()).isEqualTo("SUPPRESSED");
    }

    @Test void safeRetryCannotContinueBeyondTheTenMinuteDeadline() throws Exception {
        doReturn(new ReminderTransport.Result(ReminderTransport.Outcome.SAFE_RETRY,"safe-retry")).when(whatsapp).send(any());
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE.plusSeconds(590)); dispatcher.dispatch();
        TIME.set(DUE.plusSeconds(605)); dispatcher.dispatch();
        verify(whatsapp,times(1)).send(any()); assertThat(count("reminder_attempts")).isEqualTo(1);
    }

    @Test void consentHistoryRecordsSeparateGrantsAndWithdrawalsWithoutCopyingThePhone() throws Exception {
        enroll(true);
        change(preferences(false),"1");
        assertThat(jdbc.queryForList("select channel||':'||action from reminder_consent_events order by preferences_version,channel",String.class))
                .containsExactly("WHATSAPP:GRANTED","WHATSAPP:WITHDRAWN");
        assertThat(jdbc.queryForList("select row_to_json(e)::text from reminder_consent_events e",String.class))
                .allSatisfy(row->assertThat(row).doesNotContain(PHONE,"+6281111111999"));
        assertThatThrownBy(()->jdbc.update("update reminder_consent_events set policy_version='REWRITTEN'"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("delete from reminder_consent_events"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(count("reminder_consent_events")).isEqualTo(2);
    }

    @ParameterizedTest @ValueSource(strings={"SMS","EMAIL"})
    void databaseRejectsUnsupportedChannelsInConsentJobsAndAttempts(String channel) throws Exception {
        enroll(true); createSchedule(); planner.plan();
        assertThatThrownBy(()->jdbc.update("""
                insert into reminder_consent_events(id,user_id,patient_link_id,link_generation,phone_binding,
                    channel,action,purpose,policy_version,method,actor_user_id,preferences_version,recorded_at,withdrawn_at)
                select gen_random_uuid(),user_id,patient_link_id,link_generation,phone_binding,?,action,purpose,
                    policy_version,method,actor_user_id,preferences_version,recorded_at,withdrawn_at
                from reminder_consent_events
                """,channel)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("update reminder_jobs set channel=?",channel))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        TIME.set(DUE); dispatcher.dispatch();
        assertThatThrownBy(()->jdbc.update("update reminder_attempts set channel=?",channel))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(count("reminder_consent_events")).isEqualTo(1);
        assertThat(count("reminder_jobs")).isEqualTo(1);
        assertThat(count("reminder_attempts")).isEqualTo(1);
        assertWhatsAppOnlyMetadata();
    }

    @Test void databaseRejectsTheObsoleteFallbackOutcome() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE); dispatcher.dispatch();
        assertThatThrownBy(()->jdbc.update("update reminder_attempts set outcome='SAFE_FALLBACK'"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertWhatsAppOnlyMetadata();
        assertThat(dueState()).isEqualTo("ACCEPTED");
    }

    @Test void consentWithdrawalAfterHandoffPreservesUncertainHistoryAndDoesNotAuthorizeAnotherAttempt() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE);
        var handoff=worker.admit(onlyClaim()); assertThat(handoff).isNotNull();
        change(preferences(false),"1");
        worker.complete(handoff,new ReminderTransport.Result(ReminderTransport.Outcome.UNCERTAIN,"ambiguous-send"));
        TIME.set(DUE.plusSeconds(60)); worker.recover(); planner.plan(); dispatcher.dispatch();
        assertThat(dueState()).isEqualTo("UNCERTAIN");
        assertThat(count("reminder_attempts")).isEqualTo(1);
        verifyNoInteractions(whatsapp);
    }

    @Test void anAcceptedOccurrenceCannotBeResentAfterPreferenceVersionOrScheduleRevisionChanges() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE); dispatcher.dispatch();
        change(preferences(true),"1");
        call(staffCookie,patch(schedulePath()).header("If-Match","\"0\""),schedule("Asia/Jakarta","2026-10-11",List.of("08:00")),200);
        planner.plan(); dispatcher.dispatch();
        verify(whatsapp,times(1)).send(any());
        assertThat(count("reminder_attempts")).isEqualTo(1);
    }

    @Test void cancellingTheScheduleAfterClaimPreventsHandoff() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE);
        var claim=onlyClaim();
        call(staffCookie,post(schedulePath()+"/cancel").header("If-Match","\"0\""),null,200);
        assertThat(worker.admit(claim)).isNull(); dispatcher.dispatch();
        verifyNoInteractions(whatsapp); assertThat(count("reminder_attempts")).isZero();
    }

    @Test void revisedFutureOccurrenceInvalidatesOldJobAndPlansTheNewTime() throws Exception {
        enroll(true); createSchedule(); planner.plan();
        call(staffCookie,patch(schedulePath()).header("If-Match","\"0\""),schedule("Asia/Jakarta","2026-10-11",List.of("09:00")),200);
        planner.plan(); TIME.set(DUE); dispatcher.dispatch(); verifyNoInteractions(whatsapp);
        TIME.set(Instant.parse("2026-10-11T02:00:00Z")); dispatcher.dispatch();
        verify(whatsapp,times(1)).send(any()); assertThat(count("reminder_attempts")).isEqualTo(1);
    }

    @ParameterizedTest @ValueSource(strings={"outside","overnightInside","overnightOutside"})
    void permissionWindowsUseThePatientsLocalTimeAndHandleMidnight(String scenario) throws Exception {
        var settings=preferences(true); settings.put("allDay",false);
        boolean inside=scenario.equals("overnightInside");
        settings.put("permittedFrom",scenario.equals("outside")?"09:00":"20:00");
        settings.put("permittedUntil",scenario.equals("outside")?"20:00":"06:00");
        change(settings,"0");
        createSchedule(schedule("Asia/Jakarta","2026-10-11",List.of(inside?"22:00":"08:00")));
        planner.plan(); TIME.set(Instant.parse(inside?"2026-10-11T15:00:00Z":"2026-10-11T01:00:00Z")); dispatcher.dispatch();
        if(inside) verify(whatsapp,times(1)).send(any()); else verifyNoInteractions(whatsapp);
        assertThat(count("reminder_attempts")).isEqualTo(inside?1:0);
    }

    @Test void plannerUsesTwentyFourHoursRatherThanCalendarDayAndNeverEnqueuesFarFutureOccurrences() throws Exception {
        enroll(true);
        createSchedule(schedule("Asia/Jakarta","2026-10-11",List.of("06:59","07:01","08:00")));
        planner.plan();
        var instants=jdbc.queryForList("select scheduled_at from reminder_jobs order by scheduled_at",OffsetDateTime.class)
                .stream().map(OffsetDateTime::toInstant).toList();
        assertThat(instants).contains(Instant.parse("2026-10-11T00:01:00Z"),DUE);
        assertThat(instants).allMatch(value->!value.isAfter(START.plus(Duration.ofHours(24))));
        assertThat(instants).doesNotContain(Instant.parse("2026-10-12T00:01:00Z"));
    }

    @Test void dstGapHasNoJobAndOverlapHasOneDeterministicInstant() throws Exception {
        enroll(true);
        createSchedule(schedule("America/New_York","2026-10-11",List.of("01:30","02:30")));
        TIME.set(Instant.parse("2026-11-01T00:00:00Z")); planner.plan();
        var overlap=jdbc.queryForList("select scheduled_at from reminder_jobs order by scheduled_at",OffsetDateTime.class)
                .stream().map(OffsetDateTime::toInstant).toList();
        assertThat(overlap).containsExactly(Instant.parse("2026-11-01T05:30:00Z"),Instant.parse("2026-11-01T07:30:00Z"));
        jdbc.execute("truncate reminder_jobs cascade");
        TIME.set(Instant.parse("2027-03-14T00:00:00Z")); planner.plan();
        var gap=jdbc.queryForList("select scheduled_at from reminder_jobs order by scheduled_at",OffsetDateTime.class)
                .stream().map(OffsetDateTime::toInstant).toList();
        assertThat(gap).containsExactly(Instant.parse("2027-03-14T06:30:00Z"));
    }

    @Test void historyIsBoundedContainsOnlyCurrentUsersMetadataAndNeverClaimsDelivery() throws Exception {
        enroll(true); createSchedule(); planner.plan(); TIME.set(DUE); dispatcher.dispatch();
        var response=mvc.perform(get("/api/v1/me/medication-reminders/history").cookie(patientCookie)
                .param("page","0").param("size","10")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store"))).andReturn().getResponse();
        JsonNode history=json.readTree(response.getContentAsString());
        assertThat(history.path("content")).hasSize(1);
        assertThat(history.path("content").get(0).path("state").asText()).isEqualTo("ACCEPTED");
        assertThat(history.path("content").get(0).path("mode").asText()).isEqualTo("SIMULATED");
        assertThat(history.path("content").get(0).path("channel").asText()).isEqualTo("WHATSAPP");
        assertThat(response.getContentAsString()).doesNotContain(PHONE,"PRIVATE",self.toString(),patient.toString(),
                caseId.toString(),treatment.toString(),"idempotencyKey","leaseToken","DELIVERED");
        call(patientCookie,get("/api/v1/me/medication-reminders/history").param("size","101"),null,400);
        call(patientCookie,get("/api/v1/me/medication-reminders/history").param("page","-1"),null,400);
        user("other-patient@example.invalid","PATIENT");
        UUID other=jdbc.queryForObject("select id from users where email='other-patient@example.invalid'",UUID.class);
        UUID unrelated=jdbc.queryForObject("insert into patients(full_name) values ('Fictional unrelated patient') returning id",UUID.class);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',now())",other,unrelated);
        Cookie otherCookie=login("other-patient@example.invalid");
        JsonNode otherHistory=call(otherCookie,get("/api/v1/me/medication-reminders/history"),null,200);
        assertThat(otherHistory.path("content")).isEmpty();
        assertThat(call(otherCookie,get(PREFERENCES),null,200).path("whatsappConsent").asBoolean()).isFalse();
    }

    @ParameterizedTest @ValueSource(strings={"revoked","pending","supporterRelationship"})
    void missingVerifiedSelfLinkDeniesPreferencesAndHistory(String status) throws Exception {
        if(status.equals("supporterRelationship")) jdbc.update("update patient_user_links set relationship_type='SUPPORTER' where user_id=?",self);
        else jdbc.update("update patient_user_links set verification_status=? where user_id=?",status.toUpperCase(Locale.ROOT),self);
        call(patientCookie,get(PREFERENCES),null,403);
        call(patientCookie,get("/api/v1/me/medication-reminders/history"),null,403);
        call(patientCookie,patch(PREFERENCES).header("If-Match","\"0\""),preferences(true),403);
    }

    @Test void claimIsBoundedToOneHundredJobsAndLeavesTheRemainderAvailable() throws Exception {
        enroll(true); createSchedule(); planner.plan();
        // Supply 101 due jobs to exercise the worker batch boundary independently of planner ordering.
        jdbc.update("""
                insert into reminder_jobs(id,user_id,patient_link_id,link_generation,phone_binding,preferences_version,
                    treatment_id,schedule_id,revision_id,occurrence_id,scheduled_at,logical_key,idempotency_key,
                    channel,state,attempt_count,next_attempt_at,mode,created_at,updated_at)
                select gen_random_uuid(),j.user_id,j.patient_link_id,j.link_generation,j.phone_binding,j.preferences_version,
                    j.treatment_id,j.schedule_id,j.revision_id,'batch-fixture-'||n,
                    j.scheduled_at-n*interval '1 second',md5('batch-fixture-'||n),gen_random_uuid(),
                    j.channel,'SCHEDULED',0,j.next_attempt_at,j.mode,j.created_at,j.updated_at
                from reminder_jobs j cross join generate_series(1,100) n
                """);
        TIME.set(DUE);
        var first=worker.claim(); var next=worker.claim();
        assertThat(first).hasSize(100); assertThat(next).hasSize(1);
        assertThat(first.stream().map(ReminderDispatchWorker.Claim::jobId).toList())
                .doesNotContain(next.getFirst().jobId());
        assertThat(count("reminder_attempts")).isZero(); verifyNoInteractions(whatsapp);
    }

    @ParameterizedTest @ValueSource(strings={"TB_OFFICER","TREATMENT_SUPPORTER","SYSTEM_ADMIN"})
    void patientRoleCombinedWithStaffOrSupporterDoesNotAuthorizeReminderMessaging(String otherRole) throws Exception {
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",self,otherRole);
        patientCookie=login("patient@example.invalid");
        call(patientCookie,get(PREFERENCES),null,403);
        call(patientCookie,get("/api/v1/me/medication-reminders/history"),null,403);
        call(patientCookie,patch(PREFERENCES).header("If-Match","\"0\""),preferences(true),403);
        assertThat(count("reminder_consent_events")).isZero();
    }

    private ReminderDispatchWorker.Claim onlyClaim() {
        var claims=worker.claim(); assertThat(claims).hasSize(1); return claims.getFirst();
    }
    private void assertWhatsAppOnlyMetadata() {
        for(String table:List.of("reminder_consent_events","reminder_jobs","reminder_attempts"))
            assertThat(jdbc.queryForList("select distinct channel from "+table,String.class))
                    .as("channel attribution in %s",table).containsExactly("WHATSAPP");
    }
    private int count(String table) { return jdbc.queryForObject("select count(*) from "+table,Integer.class); }
    private String dueState() { return jdbc.queryForObject("select state from reminder_jobs where scheduled_at=?",String.class,DUE.atOffset(ZoneOffset.UTC)); }
    private void enroll(boolean wa) throws Exception { change(preferences(wa),"0"); }
    private JsonNode change(Map<String,Object> value,String version) throws Exception {
        return call(patientCookie,patch(PREFERENCES).header("If-Match",etag(version)),value,200);
    }
    private String etag(String version) throws Exception {
        var result=mvc.perform(get(PREFERENCES).cookie(patientCookie)).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(json.readTree(result.getContentAsString()).path("version").asText()).isEqualTo(version);
        assertThat(result.getHeader("ETag")).isNotBlank();
        return result.getHeader("ETag");
    }
    private Map<String,Object> preferences(boolean wa) {
        Map<String,Object> value=new HashMap<>();
        value.put("whatsappConsent",wa);
        value.put("timeZone","Asia/Jakarta");
        value.put("permittedFrom",null); value.put("permittedUntil",null); value.put("allDay",true);
        value.put("policyVersion","MEDICATION_REMINDERS_V1"); value.put("riskAcknowledged",true);
        return value;
    }
    private Map<String,Object> schedule(String zone,String date,List<String> times) {
        return new HashMap<>(Map.of("timeZone",zone,"startDate",date,"endDate","2027-04-01",
                "times",times,"weekdays",List.of(1,2,3,4,5,6,7)));
    }
    private String schedulePath() { return "/api/v1/treatments/"+treatment+"/medication-schedule"; }
    private void createSchedule() throws Exception { createSchedule(schedule("Asia/Jakarta","2026-10-11",List.of("08:00"))); }
    private void createSchedule(Map<String,Object> value) throws Exception { call(staffCookie,post(schedulePath()),value,201); }
    private JsonNode call(Cookie cookie,MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        var outcome=mvc.perform(request.cookie(cookie).with(csrf())).andReturn();
        if(outcome.getResponse().getStatus()!=expected && outcome.getResolvedException()!=null)
            throw new AssertionError("Unexpected HTTP status "+outcome.getResponse().getStatus()+", expected "+expected,outcome.getResolvedException());
        assertThat(outcome.getResponse().getStatus()).isEqualTo(expected);
        String result=outcome.getResponse().getContentAsString();
        return result.isEmpty()?json.nullNode():json.readTree(result);
    }
    private UUID user(String email,String role) {
        UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role);
        return id;
    }
    private Cookie login(String email) throws Exception {
        // Preserve the session expiry constraint while using the controlled application clock.
        jdbc.execute("alter table user_sessions alter column created_at set default timestamptz '"+TIME.get()+"'");
        return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
    }
}
