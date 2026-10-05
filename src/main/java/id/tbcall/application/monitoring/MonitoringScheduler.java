package id.tbcall.application.monitoring;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="tbcall.monitoring.scheduler-enabled",havingValue="true",matchIfMissing=true)
public class MonitoringScheduler {
    private final MonitoringSweepService sweep;
    public MonitoringScheduler(MonitoringSweepService sweep) { this.sweep=sweep; }
    @Scheduled(fixedDelayString="${tbcall.monitoring.sweep-interval-ms:60000}")
    public void runBatch() { sweep.sweep(); }
}
