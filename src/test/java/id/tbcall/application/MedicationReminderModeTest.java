package id.tbcall.application;

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

/** Startup gates are checked without a database or a messaging network. */
class MedicationReminderModeTest {
    @Configuration(proxyBeanMethods=false)
    @EnableConfigurationProperties(SecurityProperties.class)
    @Import(ReminderProperties.class)
    static class Config {}
    private final ApplicationContextRunner context=new ApplicationContextRunner().withUserConfiguration(Config.class);

    @Test void defaultProductionConfigurationHasNoEnabledReminderWorker() {
        context.run(app->{
            assertThat(app).hasNotFailed();
            var settings=app.getBean(ReminderProperties.class);
            assertThat(settings.getMode()).isEqualTo(ReminderProperties.Mode.DISABLED);
            assertThat(settings.isSchedulerEnabled()).isFalse();
        });
    }

    @ParameterizedTest @ValueSource(strings={"prod","production","default"})
    void simulationCannotStartOutsideAnExplicitDevelopmentOrTestProfile(String profile) {
        context.withPropertyValues("spring.profiles.active="+profile,"tbcall.security.production=false",
                "tbcall.reminders.mode=SIMULATED").run(app->assertThat(app).hasFailed());
    }

    @Test void productionSecurityFlagBlocksSimulationEvenWithTestProfile() {
        context.withPropertyValues("spring.profiles.active=test","tbcall.security.production=true",
                "tbcall.reminders.mode=SIMULATED").run(app->assertThat(app).hasFailed());
    }

    @ParameterizedTest @ValueSource(strings={"dev","test"})
    void simulationRequiresExplicitNonproductionSecurityAndProfile(String profile) {
        context.withPropertyValues("spring.profiles.active="+profile,"tbcall.security.production=false",
                "tbcall.reminders.mode=SIMULATED").run(app->{
                    assertThat(app).hasNotFailed();
                    assertThat(app.getBean(ReminderProperties.class).getMode()).isEqualTo(ReminderProperties.Mode.SIMULATED);
                });
    }

    @ParameterizedTest @ValueSource(strings={"tbcall.reminders.planning-hours=25","tbcall.reminders.batch-size=101",
            "tbcall.reminders.max-attempts=4","tbcall.reminders.max-lateness-minutes=11"})
    void configurationCannotExpandTheApprovedPlanningOrDispatchBudget(String property) {
        context.withPropertyValues(property).run(app->assertThat(app).hasFailed());
    }
}
