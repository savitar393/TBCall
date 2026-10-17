package id.tbcall.application.vot;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "tbcall.vot")
public class VotProperties {
    public static final long MAX_FILE_BYTES = 20_971_520;
    public static final String CONSENT_POLICY_VERSION = "vot-synthetic-v1";
    private boolean enabled;
    private boolean syntheticOnly = true;
    private String storagePath = "";
    private long maxFileBytes = MAX_FILE_BYTES;
    private int retentionDays = 7;

    void validate(Environment environment) {
        if (!enabled) return;
        if (environment.getProperty("tbcall.security.production", Boolean.class, true)
                || environment.getProperty("security.production", Boolean.class, false)
                || environment.acceptsProfiles(Profiles.of("prod", "production"))
                || !environment.acceptsProfiles(Profiles.of("dev", "test"))
                || !syntheticOnly || maxFileBytes < 1 || maxFileBytes > MAX_FILE_BYTES
                || retentionDays < 1 || retentionDays > 365 || storagePath == null || storagePath.isBlank()) {
            throw new IllegalStateException("VOT requires valid private synthetic development configuration");
        }
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public boolean isSyntheticOnly() { return syntheticOnly; }
    public void setSyntheticOnly(boolean syntheticOnly) { this.syntheticOnly = syntheticOnly; }
    public String getStoragePath() { return storagePath; }
    public void setStoragePath(String storagePath) { this.storagePath = storagePath; }
    public long getMaxFileBytes() { return maxFileBytes; }
    public void setMaxFileBytes(long maxFileBytes) { this.maxFileBytes = maxFileBytes; }
    public int getRetentionDays() { return retentionDays; }
    public void setRetentionDays(int retentionDays) { this.retentionDays = retentionDays; }
    public String getConsentPolicyVersion() { return CONSENT_POLICY_VERSION; }
}
