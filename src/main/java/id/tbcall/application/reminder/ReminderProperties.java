package id.tbcall.application.reminder;

import id.tbcall.security.SecurityProperties;
import jakarta.annotation.PostConstruct;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

@Component @ConfigurationProperties("tbcall.reminders") @Validated @Getter @Setter
public class ReminderProperties {
    public enum Mode { DISABLED, SIMULATED, CLOUD_TEST, CHANNEL_TEST }
    @NotNull private Mode mode=Mode.DISABLED;
    private boolean schedulerEnabled=false;
    @Min(1) @Max(24) private int planningHours=24;
    @Min(1) @Max(100) private int batchSize=100;
    @Min(1) @Max(3) private int maxAttempts=3;
    @Min(1) @Max(10) private int maxLatenessMinutes=10;
    @Min(5) @Max(120) private int claimSeconds=30;
    @Min(1) @Max(60) private int retrySeconds=15;
    @Min(1000) @Max(60000) private long intervalMs=15000;
    private final SecurityProperties security;
    private final Environment environment;
    public ReminderProperties(SecurityProperties security,Environment environment){this.security=security;this.environment=environment;}
    @PostConstruct void safety(){
        if(mode!=Mode.DISABLED && (security.isProduction() || environment.acceptsProfiles(Profiles.of("prod","production"))
                || !environment.acceptsProfiles(Profiles.of("dev","test"))))
            throw new IllegalStateException("Reminder testing requires explicit nonproduction dev/test configuration");
        if((mode==Mode.CLOUD_TEST || mode==Mode.CHANNEL_TEST) && schedulerEnabled)
            throw new IllegalStateException("Meta test sending requires an explicit operator action, never scheduled dispatch");
    }
}
