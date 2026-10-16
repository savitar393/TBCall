package id.tbcall.application;

import id.tbcall.application.reminder.ChannelProviderProperties;
import id.tbcall.application.reminder.ChannelProviderSafety;
import id.tbcall.application.reminder.ReminderProperties;
import id.tbcall.security.SecurityProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import static org.assertj.core.api.Assertions.assertThat;

/** Startup admission uses fictional configuration and creates no HTTP or database beans. */
class ChannelReminderModeTest {
    @Configuration(proxyBeanMethods=false)
    @EnableConfigurationProperties(SecurityProperties.class)
    @Import({ReminderProperties.class,ChannelProviderProperties.class,ChannelProviderSafety.class})
    static class Config {}
    private final ApplicationContextRunner context=new ApplicationContextRunner().withUserConfiguration(Config.class);

    private ApplicationContextRunner approvedEmail(){return context.withPropertyValues(
        "spring.profiles.active=test","tbcall.security.production=false","tbcall.reminders.mode=CHANNEL_TEST",
        "tbcall.reminders.channels.synthetic-environment=true","tbcall.reminders.channels.email-enabled=true",
        "tbcall.reminders.channels.resend-api-key=re_fictional_only_not_a_live_key",
        "tbcall.reminders.channels.email-recipients=synthetic@example.invalid");}
    private ApplicationContextRunner approvedTelegram(){return approvedEmail().withPropertyValues(
        "tbcall.reminders.channels.telegram-enabled=true","tbcall.reminders.channels.telegram-exclusive-consumer-confirmed=true",
        "tbcall.reminders.channels.telegram-bot-token=123456:fictional_telegram_secret_placeholder",
        "tbcall.reminders.channels.telegram-bot-username=tbcall_fictional_bot",
        "tbcall.reminders.channels.telegram-recipients=12345");}

    @Test void defaultsDisableProvidersAndSchedulerWithoutRequiringAnyCredentials(){
        context.run(app->{
            assertThat(app).hasNotFailed();
            var reminders=app.getBean(ReminderProperties.class);var providers=app.getBean(ChannelProviderProperties.class);
            assertThat(reminders.getMode()).isEqualTo(ReminderProperties.Mode.DISABLED);
            assertThat(reminders.isSchedulerEnabled()).isFalse();
            assertThat(providers.isEmailEnabled()).isFalse();assertThat(providers.isTelegramEnabled()).isFalse();
            assertThat(providers.isSyntheticEnvironment()).isFalse();assertThat(providers.isTelegramExclusiveConsumerConfirmed()).isFalse();
            assertThat(providers.getResendApiKey()).isEmpty();assertThat(providers.getTelegramBotToken()).isEmpty();
            assertThat(providers.getEmailRecipients()).isEmpty();assertThat(providers.getTelegramRecipients()).isEmpty();
        });
    }
    @ParameterizedTest @ValueSource(strings={"dev","test"})
    void explicitSyntheticEmailOnlyConfigurationStartsWithoutTelegramCredentials(String profile){
        approvedEmail().withPropertyValues("spring.profiles.active="+profile).run(app->{
            assertThat(app).hasNotFailed();
            assertThat(app.getBean(ReminderProperties.class).getMode()).isEqualTo(ReminderProperties.Mode.CHANNEL_TEST);
            assertThat(app.getBean(ReminderProperties.class).isSchedulerEnabled()).isFalse();
            var providers=app.getBean(ChannelProviderProperties.class);
            assertThat(providers.isEmailEnabled()).isTrue();assertThat(providers.isTelegramEnabled()).isFalse();
            assertThat(providers.getTelegramBotToken()).isEmpty();assertThat(providers.getTelegramBotUsername()).isEmpty();
        });
    }
    @Test void channelModeAloneCannotStartProviderTraffic(){
        context.withPropertyValues("spring.profiles.active=test","tbcall.security.production=false","tbcall.reminders.mode=CHANNEL_TEST")
            .run(app->assertThat(app).hasFailed());
    }
    @ParameterizedTest @ValueSource(strings={
        "tbcall.security.production=true","spring.profiles.active=prod","spring.profiles.active=production",
        "spring.profiles.active=default","spring.profiles.active=test,prod","tbcall.reminders.scheduler-enabled=true",
        "tbcall.reminders.claim-seconds=7","tbcall.reminders.channels.synthetic-environment=false",
        "tbcall.reminders.channels.email-enabled=false","tbcall.reminders.channels.resend-api-key=",
        "tbcall.reminders.channels.email-recipients=","tbcall.reminders.channels.email-from=invalid-sender",
        "tbcall.reminders.channels.timeout-seconds=0","tbcall.reminders.channels.timeout-seconds=9"})
    void unsafeOrIncompleteEmailConfigurationIsRefusedAtStartup(String change){
        approvedEmail().withPropertyValues(change).run(app->assertThat(app).hasFailed());
    }
    @Test void handoffLeaseMustExceedTheCompleteHttpTimeoutAndSafetyMargin(){
        approvedEmail().withPropertyValues("tbcall.reminders.claim-seconds=8").run(app->assertThat(app).hasNotFailed());
    }
    @Test void configuredTelegramRequiresExplicitExternalConsumerConfirmation(){
        approvedTelegram().withPropertyValues("tbcall.reminders.channels.telegram-exclusive-consumer-confirmed=false")
            .run(app->assertThat(app).hasFailed());
    }
    @Test void configuredTelegramWithConsumerConfirmationPassesStartupAdmission(){
        approvedTelegram().run(app->{
            assertThat(app).hasNotFailed();assertThat(app.getBean(ChannelProviderProperties.class).isTelegramEnabled()).isTrue();
            assertThat(app.getBean(ReminderProperties.class).isSchedulerEnabled()).isFalse();
        });
    }
}
