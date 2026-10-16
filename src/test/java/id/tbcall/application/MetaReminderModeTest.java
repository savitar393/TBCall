package id.tbcall.application;

import id.tbcall.application.reminder.*;
import id.tbcall.security.SecurityProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.*;
import static org.assertj.core.api.Assertions.assertThat;

class MetaReminderModeTest {
    @Configuration(proxyBeanMethods=false)
    @EnableConfigurationProperties(SecurityProperties.class)
    @Import({ReminderProperties.class,MetaWhatsAppProperties.class,MetaReminderSafety.class})
    static class Config {}
    private final ApplicationContextRunner context=new ApplicationContextRunner().withUserConfiguration(Config.class);
    private ApplicationContextRunner approved(){return context.withPropertyValues(
            "spring.profiles.active=test","tbcall.security.production=false","tbcall.reminders.mode=CLOUD_TEST",
            "tbcall.reminders.meta.business-account-id=123456","tbcall.reminders.meta.test-phone-number-id=654321",
            "tbcall.reminders.meta.access-token=fictional-access-not-a-real-token","tbcall.reminders.meta.app-secret=fictional-app-secret-no-live-use",
            "tbcall.reminders.meta.verify-token=fictional-verification-no-live-use","tbcall.reminders.meta.template-name=neutral_test_reminder",
            "tbcall.reminders.meta.template-language=id","tbcall.reminders.meta.test-sender-confirmed=true",
            "tbcall.reminders.meta.template-approved=true","tbcall.reminders.meta.synthetic-environment=true",
            "tbcall.reminders.meta.allowed-recipients=+6281111111001");}
    @Test void defaultDoesNotRequireMetaCredentialsAndCannotEnableExternalSending(){
        context.run(app->{assertThat(app).hasNotFailed();assertThat(app.getBean(ReminderProperties.class).getMode()).isEqualTo(ReminderProperties.Mode.DISABLED);});
    }
    @Test void explicitNonproductionConfigurationAllowsOnlyManualTestMode(){
        approved().run(app->{assertThat(app).hasNotFailed();assertThat(app.getBean(ReminderProperties.class).isSchedulerEnabled()).isFalse();});
    }
    @Test void modeAloneIsInsufficientForExternalTraffic(){
        context.withPropertyValues("spring.profiles.active=test","tbcall.security.production=false","tbcall.reminders.mode=CLOUD_TEST")
                .run(app->assertThat(app).hasFailed());
    }
    @ParameterizedTest @ValueSource(strings={"tbcall.security.production=true","spring.profiles.active=prod",
            "spring.profiles.active=production","spring.profiles.active=default","tbcall.reminders.scheduler-enabled=true",
            "tbcall.reminders.claim-seconds=5","tbcall.reminders.meta.test-sender-confirmed=false",
            "tbcall.reminders.meta.template-approved=false","tbcall.reminders.meta.synthetic-environment=false"})
    void unsafeStartupConfigurationIsRefused(String change){approved().withPropertyValues(change).run(app->assertThat(app).hasFailed());}
}
