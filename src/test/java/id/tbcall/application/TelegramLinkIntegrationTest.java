package id.tbcall.application;

import id.tbcall.application.reminder.*;
import id.tbcall.authorization.CurrentActor;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties={"tbcall.security.production=false","tbcall.monitoring.scheduler-enabled=false","tbcall.reminders.mode=CHANNEL_TEST","tbcall.reminders.scheduler-enabled=false"})
@ActiveProfiles("test") @Testcontainers @AutoConfigureMockMvc(print=MockMvcPrint.NONE)
class TelegramLinkIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine").withImagePullPolicy(image->false).withTmpFs(Map.of("/var/lib/postgresql/data","rw"));
    @DynamicPropertySource static void db(DynamicPropertyRegistry r){r.add("spring.datasource.url",POSTGRES::getJdbcUrl);r.add("spring.datasource.username",POSTGRES::getUsername);r.add("spring.datasource.password",POSTGRES::getPassword);}
    static final Instant START=Instant.parse("2026-10-16T01:00:00Z");static final AtomicReference<Instant> NOW=new AtomicReference<>(START);
    @TestConfiguration static class Time {@Bean @Primary Clock telegramClock(){return new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return Clock.fixed(NOW.get(),z);}public Instant instant(){return NOW.get();}};}}
    @Autowired MockMvc mvc;
    @Autowired TelegramPollService poll;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Autowired TelegramLinkService links;@Autowired TelegramPollWorker worker;@Autowired JdbcTemplate jdbc;@Autowired ReminderIdentity identities;
    @MockitoBean ChannelProviderProperties props;@MockitoBean ChannelProviderHttp http;
    UUID user,patient;CurrentActor actor;
    @BeforeEach void init(){
        NOW.set(START);jdbc.execute("truncate users,patients,facilities,reminder_telegram_consumers,reminder_telegram_updates cascade");
        when(props.isTelegramEnabled()).thenReturn(true);when(props.getTelegramBotUsername()).thenReturn("test_bot");when(props.botKey()).thenReturn("b".repeat(64));when(props.telegramAllowed(anyString())).thenReturn(true);
        user=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('synthetic@example.invalid','unused','ACTIVE',now()) returning id",UUID.class);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='PATIENT'",user);
        patient=jdbc.queryForObject("insert into patients(full_name) values ('Synthetic Telegram') returning id",UUID.class);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',?)",user,patient,START.atOffset(ZoneOffset.UTC));
        actor=new CurrentActor(user,UUID.randomUUID(),null,Set.of("PATIENT"),Set.of(),Set.of(),patient,Set.of());
    }
    private String nonce(TelegramLinkService.LinkIntent intent){return intent.deepLink().substring(intent.deepLink().indexOf("start=")+6);}
    private TelegramUpdateParser.Update start(long update,String nonce){return new TelegramUpdateParser.Update(update,TelegramUpdateParser.Command.START,"12345",ReminderIdentity.digest(nonce),NOW.get());}
    private org.springframework.test.web.servlet.request.RequestPostProcessor authenticated(){return authentication(org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(actor,null,List.of()));}
    @Test void unconfiguredTelegramReturnsNullBotUsernameWithoutProviderHttp() throws Exception {
        when(props.botKey()).thenThrow(new IllegalStateException("Telegram is unconfigured"));
        for(String username:List.of("", " ", "invalid name")){
            when(props.getTelegramBotUsername()).thenReturn(username);
            mvc.perform(get("/api/v1/me/medication-reminders/telegram").with(authenticated())).andExpect(status().isOk())
                .andExpect(jsonPath("$.botUsername").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.available").value(false));
        }
        verifyNoInteractions(http);
    }
    @Test void pollingSuspendsAnExistingTransactionDuringEveryProviderExchange() throws Exception {
        when(props.isTelegramExclusiveConsumerConfirmed()).thenReturn(true);when(props.getTelegramBotToken()).thenReturn("123:placeholder");
        jdbc.update("delete from user_roles where user_id=?",user);jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='SYSTEM_ADMIN'",user);
        var operator=new CurrentActor(user,UUID.randomUUID(),null,Set.of("SYSTEM_ADMIN"),Set.of("USER_ACCOUNT_MANAGE"),Set.of(),null,Set.of());
        when(http.telegram(any(),any())).thenAnswer(call->{
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            var operation=(ChannelProviderHttp.Operation)call.getArgument(0);
            String result=switch(operation){case GET_ME->"{\"id\":123,\"is_bot\":true,\"username\":\"test_bot\"}";case GET_WEBHOOK_INFO->"{\"url\":\"\"}";case GET_UPDATES->"[]";default->throw new AssertionError("Unexpected outbound operation");};
            return new ChannelProviderHttp.Response(200,("{\"ok\":true,\"result\":"+result+"}").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        });
        new org.springframework.transaction.support.TransactionTemplate(transactions).execute(status->{
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            assertThat(poll.poll(operator,true)).isZero();
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isTrue();return null;
        });
        verify(http,times(3)).telegram(any(),any());
    }
    @Test void restRequiresAuthenticationCsrfAndAuthoritativeEtagAndNeverCachesNonce() throws Exception {
        mvc.perform(get("/api/v1/me/medication-reminders/telegram")).andExpect(status().isUnauthorized());
        var result=mvc.perform(get("/api/v1/me/medication-reminders/telegram").with(authenticated())).andExpect(status().isOk()).andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store"))).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("etag","12345",user.toString());
        mvc.perform(post("/api/v1/me/medication-reminders/telegram/link").with(authenticated()).header("If-Match",result.getResponse().getHeader("ETag"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/me/medication-reminders/telegram/link").with(authenticated()).with(csrf())).andExpect(status().isPreconditionRequired());
        mvc.perform(post("/api/v1/me/medication-reminders/telegram/link").with(authenticated()).with(csrf()).header("If-Match",result.getResponse().getHeader("ETag"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store")));
        mvc.perform(delete("/api/v1/me/medication-reminders/telegram").with(authenticated()).with(csrf()).header("If-Match",result.getResponse().getHeader("ETag"))).andExpect(status().isConflict());
    }
    @Test void oneUseDigestOnlyNonceLinksPrivateChatWithoutConsent(){
        var state=links.read(actor);var intent=links.create(actor,state.etag());String nonce=nonce(intent);
        assertThat(nonce).matches("[A-Za-z0-9_-]{43}");assertThat(intent.expiresAt().toInstant()).isEqualTo(START.plusSeconds(300));
        assertThat(jdbc.queryForObject("select token_digest from reminder_telegram_link_tokens",String.class)).isEqualTo(ReminderIdentity.digest(nonce));
        var lease=worker.claim();assertThat(worker.apply(lease,start(1,nonce))).isTrue();
        assertThat(links.read(actor).linked()).isTrue();assertThat(links.read(actor).maskedChat()).doesNotContain("12345");
        assertThat(jdbc.queryForObject("select count(*) from reminder_consent_events",Integer.class)).isZero();
        assertThat(worker.apply(lease,start(2,nonce))).isTrue();assertThat(jdbc.queryForObject("select result from reminder_telegram_updates where update_id=2",String.class)).isEqualTo("IGNORED");
        assertThat(jdbc.queryForObject("select version from reminder_telegram_links",Long.class)).isEqualTo(2);
    }
    @Test void newIntentInvalidatesPriorTokenAndUnlinkInvalidatesAllTokens(){
        var first=links.create(actor,links.read(actor).etag());var second=links.create(actor,links.read(actor).etag());var lease=worker.claim();
        worker.apply(lease,start(1,nonce(first)));assertThat(links.read(actor).linked()).isFalse();
        links.unlink(actor,links.read(actor).etag());worker.apply(lease,start(2,nonce(second)));assertThat(links.read(actor).linked()).isFalse();
    }
    @Test void expiredTokenAndChangedSelfGenerationNeverBind(){
        var intent=links.create(actor,links.read(actor).etag());NOW.set(START.plusSeconds(301));var lease=worker.claim();worker.apply(lease,start(1,nonce(intent)));assertThat(links.read(actor).linked()).isFalse();
        NOW.set(START);intent=links.create(actor,links.read(actor).etag());jdbc.update("update patient_user_links set version=version+1 where user_id=?",user);worker.apply(lease,start(2,nonce(intent)));assertThat(links.read(actor).linked()).isFalse();
    }
    @Test void privateChatCanBelongToOnlyOneLinkedAccount(){
        var intent=links.create(actor,links.read(actor).etag());var lease=worker.claim();worker.apply(lease,start(1,nonce(intent)));
        UUID other=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values ('other-synthetic@example.invalid','unused','ACTIVE',now()) returning id",UUID.class);
        UUID otherPatient=jdbc.queryForObject("insert into patients(full_name) values ('Other Synthetic') returning id",UUID.class);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='PATIENT'",other);
        jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status,verified_at) values (?,?,'SELF','VERIFIED',?)",other,otherPatient,START.atOffset(ZoneOffset.UTC));
        var otherActor=new CurrentActor(other,UUID.randomUUID(),null,Set.of("PATIENT"),Set.of(),Set.of(),otherPatient,Set.of());
        var otherIntent=links.create(otherActor,links.read(otherActor).etag());worker.apply(lease,start(2,nonce(otherIntent)));
        assertThat(links.read(actor).linked()).isTrue();assertThat(links.read(otherActor).linked()).isFalse();
    }
    @Test void allowlistAndCurrentRoleAreRequiredForLinkCompletion(){
        var intent=links.create(actor,links.read(actor).etag());var lease=worker.claim();when(props.telegramAllowed("12345")).thenReturn(false);worker.apply(lease,start(1,nonce(intent)));assertThat(links.read(actor).linked()).isFalse();
        when(props.telegramAllowed("12345")).thenReturn(true);jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='SYSTEM_ADMIN'",user);worker.apply(lease,start(2,nonce(intent)));
        assertThat(jdbc.queryForObject("select chat_id from reminder_telegram_links where user_id=?",String.class,user)).isNull();
    }
    @Test void staleEtagsAndLinkedRelinkingAreRejected(){
        var old=links.read(actor);var intent=links.create(actor,old.etag());assertThatThrownBy(()->links.create(actor,old.etag())).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
        worker.apply(worker.claim(),start(1,nonce(intent)));assertThatThrownBy(()->links.create(actor,links.read(actor).etag())).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
    }
    @Test void stopWithdrawsOnlyTelegramAndStaleStopCannotRevokeLaterConsent(){
        var intent=links.create(actor,links.read(actor).etag());var lease=worker.claim();worker.apply(lease,start(1,nonce(intent)));
        var id=identities.self(actor,false);var binding=jdbc.queryForObject("select chat_id from reminder_telegram_links",String.class);
        jdbc.update("insert into reminder_preferences(user_id,patient_link_id,link_generation,version,telegram_consent,telegram_binding,time_zone,all_day,policy_version,updated_at) values (?,?,?,1,true,?,'Asia/Jakarta',true,'MEDICATION_REMINDERS_V1',?)",user,id.linkId(),id.generation(),new TelegramLinkStore(jdbc,props).current(id,false).binding(),START.atOffset(ZoneOffset.UTC));
        jdbc.update("insert into reminder_consent_events(id,user_id,patient_link_id,link_generation,destination_binding,channel,action,purpose,policy_version,method,actor_user_id,preferences_version,recorded_at) values (?,?,?,?,?,'TELEGRAM','GRANTED','MEDICATION_REMINDER','MEDICATION_REMINDERS_V1','SELF_PORTAL',?,1,?)",UUID.randomUUID(),user,id.linkId(),id.generation(),new TelegramLinkStore(jdbc,props).current(id,false).binding(),user,START.atOffset(ZoneOffset.UTC));
        jdbc.update("update reminder_preferences set email_consent=true,email_binding=?,whatsapp_consent=true,phone_binding=?,email_version=17,whatsapp_version=9", "e".repeat(64),"f".repeat(64));
        worker.apply(lease,new TelegramUpdateParser.Update(2,TelegramUpdateParser.Command.STOP,binding,null,START.minusSeconds(1)));
        assertThat(jdbc.queryForObject("select telegram_consent from reminder_preferences",Boolean.class)).isTrue();
        NOW.set(START.plusSeconds(1));worker.apply(lease,new TelegramUpdateParser.Update(3,TelegramUpdateParser.Command.STOP,binding,null,NOW.get()));
        assertThat(jdbc.queryForObject("select telegram_consent from reminder_preferences",Boolean.class)).isFalse();
        assertThat(jdbc.queryForObject("select method from reminder_consent_events where action='WITHDRAWN'",String.class)).isEqualTo("PROVIDER_OPT_OUT");
        assertThat(jdbc.queryForObject("select actor_user_id from reminder_consent_events where action='WITHDRAWN'",UUID.class)).isNull();
        assertThat(links.read(actor).linked()).isTrue();
        assertThat(jdbc.queryForObject("select email_consent and whatsapp_consent and email_version=17 and whatsapp_version=9 from reminder_preferences",Boolean.class)).isTrue();
    }
    private TelegramPollWorker.Lease linkAndGrantTelegram(){
        var intent=links.create(actor,links.read(actor).etag());var lease=worker.claim();worker.apply(lease,start(1,nonce(intent)));
        var id=identities.self(actor,false);String binding=new TelegramLinkStore(jdbc,props).current(id,false).binding();
        jdbc.update("insert into reminder_preferences(user_id,patient_link_id,link_generation,version,telegram_consent,telegram_binding,time_zone,all_day,policy_version,updated_at) values (?,?,?,1,true,?,'Asia/Jakarta',true,'MEDICATION_REMINDERS_V1',?)",user,id.linkId(),id.generation(),binding,NOW.get().atOffset(ZoneOffset.UTC));
        jdbc.update("insert into reminder_consent_events(id,user_id,patient_link_id,link_generation,destination_binding,channel,action,purpose,policy_version,method,actor_user_id,preferences_version,recorded_at) values (?,?,?,?,?,'TELEGRAM','GRANTED','MEDICATION_REMINDER','MEDICATION_REMINDERS_V1','SELF_PORTAL',?,1,?)",UUID.randomUUID(),user,id.linkId(),id.generation(),binding,user,NOW.get().atOffset(ZoneOffset.UTC));
        return lease;
    }
    @Test void removingRecipientFromTestAllowlistStillPermitsItsBoundPrivateStop(){
        var lease=linkAndGrantTelegram();when(props.telegramAllowed("12345")).thenReturn(false);NOW.set(START.plusSeconds(1));
        worker.apply(lease,new TelegramUpdateParser.Update(2,TelegramUpdateParser.Command.STOP,"12345",null,NOW.get()));
        assertThat(jdbc.queryForObject("select telegram_consent from reminder_preferences",Boolean.class)).isFalse();
    }
    @Test void queuedStopStillWithdrawsAfterAnOperatorPollDelay(){
        linkAndGrantTelegram();NOW.set(START.plusSeconds(600));
        worker.apply(worker.claim(),new TelegramUpdateParser.Update(2,TelegramUpdateParser.Command.STOP,"12345",null,START.plusSeconds(30)));
        assertThat(jdbc.queryForObject("select telegram_consent from reminder_preferences",Boolean.class)).isFalse();
    }
    @Test void stopWithinTheSameSecondAsFractionalLinkAndConsentFavorsWithdrawal(){
        NOW.set(START.plusMillis(900));var lease=linkAndGrantTelegram();NOW.set(START.plusSeconds(1));
        worker.apply(lease,new TelegramUpdateParser.Update(2,TelegramUpdateParser.Command.STOP,"12345",null,START));
        assertThat(jdbc.queryForObject("select telegram_consent from reminder_preferences",Boolean.class)).isFalse();
    }
    @org.junit.jupiter.params.ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings={"SUSPENDED","ROLE_REMOVED"})
    void currentPrivateChatStopWithdrawsEvenWhileAccountCannotReceiveReminders(String restriction){
        var lease=linkAndGrantTelegram();
        if(restriction.equals("SUSPENDED"))jdbc.update("update users set status='SUSPENDED' where id=?",user);else jdbc.update("delete from user_roles where user_id=?",user);
        NOW.set(START.plusSeconds(1));worker.apply(lease,new TelegramUpdateParser.Update(2,TelegramUpdateParser.Command.STOP,"12345",null,NOW.get()));
        assertThat(jdbc.queryForObject("select telegram_consent from reminder_preferences",Boolean.class)).isFalse();
    }
    @Test void providerRuntimeFailureReturnsSanitizedApiProblem() throws Exception {
        when(props.isTelegramExclusiveConsumerConfirmed()).thenReturn(true);
        var operator=new CurrentActor(user,UUID.randomUUID(),null,Set.of("SYSTEM_ADMIN"),Set.of("USER_ACCOUNT_MANAGE"),Set.of(),null,Set.of());
        when(http.telegram(any(),any())).thenThrow(new IllegalStateException("https://api.telegram.org/bot123:DUMMY_PRIVATE_TEST_VALUE/getMe"));
        var response=mvc.perform(post("/api/v1/admin/medication-reminders/channel-test-telegram-poll")
            .with(authentication(org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(operator,null,List.of())))
            .with(csrf()).contentType("application/json").content("{\"confirmTestOperation\":true}")).andExpect(status().isServiceUnavailable()).andReturn().getResponse();
        assertThat(response.getContentAsString()).doesNotContain("DUMMY_PRIVATE_TEST_VALUE","api.telegram.org","IllegalStateException","cause");
    }
    @Test void leaseExpiryAndDuplicateConsumerCannotAdvanceOffset(){
        var lease=worker.claim();assertThat(worker.claim()).isNull();NOW.set(START.plusSeconds(61));assertThat(worker.apply(lease,start(1,"x".repeat(43)))).isFalse();
        assertThat(jdbc.queryForObject("select last_update_id from reminder_telegram_consumers",Long.class)).isEqualTo(-1);
    }
}
