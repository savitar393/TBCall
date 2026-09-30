package id.tbcall.application;

import id.tbcall.security.SecurityConfiguration;
import id.tbcall.security.SecurityProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class SecurityConfigurationTest {
    @Test void productionCannotExposeVerificationSecretsEvenWithTestProfile() {
        SecurityProperties config=new SecurityProperties(); config.setExposeVerificationTokens(true);
        MockEnvironment env=new MockEnvironment(); env.setActiveProfiles("test");
        assertThatThrownBy(() -> SecurityConfiguration.validate(config, env)).isInstanceOf(IllegalStateException.class);
    }
    @ParameterizedTest @ValueSource(strings={"prod", "production"})
    void productionProfilesOverrideNonProductionFlags(String profile) {
        SecurityProperties config=new SecurityProperties(); config.setProduction(false); config.setExposeVerificationTokens(true);
        MockEnvironment env=new MockEnvironment(); env.setActiveProfiles("test", profile);
        assertThatThrownBy(() -> SecurityConfiguration.validate(config, env)).isInstanceOf(IllegalStateException.class);
    }
    @Test void developmentExposureNeedsExplicitProfileAndFlag() {
        SecurityProperties config=new SecurityProperties(); config.setProduction(false); config.setExposeVerificationTokens(true);
        assertThatThrownBy(() -> SecurityConfiguration.validate(config, new MockEnvironment())).isInstanceOf(IllegalStateException.class);
        MockEnvironment env=new MockEnvironment(); env.setActiveProfiles("dev");
        assertThatCode(() -> SecurityConfiguration.validate(config, env)).doesNotThrowAnyException();
    }
    @Test void productionCannotDisableSecureCookies() {
        SecurityProperties config=new SecurityProperties(); config.setCookieSecure(false);
        assertThatThrownBy(() -> SecurityConfiguration.validate(config, new MockEnvironment())).isInstanceOf(IllegalStateException.class);
    }
    @ParameterizedTest @ValueSource(strings={"*", "https://*.example.org", "https://client.example/path", "null", "https://user@client.example"})
    void corsRejectsWildcardsAndNonOriginValues(String origin) {
        SecurityProperties config=new SecurityProperties(); config.setAllowedOrigins(List.of(origin));
        assertThatThrownBy(() -> SecurityConfiguration.validate(config, new MockEnvironment())).isInstanceOf(RuntimeException.class);
    }
    @ParameterizedTest @ValueSource(longs={0,-1,86401})
    void verificationExpiryIsBounded(long seconds) {
        SecurityProperties config=new SecurityProperties(); config.setVerificationLifetime(Duration.ofSeconds(seconds));
        assertThatThrownBy(() -> SecurityConfiguration.validate(config, new MockEnvironment())).isInstanceOf(IllegalStateException.class);
    }
}
