package id.tbcall.application.vot;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class VotRetentionScheduler {
    private final VotRetentionService service;private final boolean enabled;
    public VotRetentionScheduler(VotRetentionService service,@Value("${tbcall.vot.cleanup-enabled:false}") boolean enabled){this.service=service;this.enabled=enabled;}
    @Scheduled(fixedDelayString="${tbcall.vot.cleanup-interval-ms:3600000}")
    public void sweep(){if(enabled){service.cleanup();service.cleanupOrphans();}}
}
