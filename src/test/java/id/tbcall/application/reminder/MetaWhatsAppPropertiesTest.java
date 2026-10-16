package id.tbcall.application.reminder;

import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class MetaWhatsAppPropertiesTest {
    static MetaWhatsAppProperties configured() {
        var p = new MetaWhatsAppProperties();
        p.setBusinessAccountId("123456789012345");
        p.setTestPhoneNumberId("987654321012345");
        p.setAccessToken("dummy-access-token-for-unit-tests");
        p.setAppSecret("dummy-app-secret-for-unit-tests");
        p.setVerifyToken("dummy-verify-token-for-unit-tests");
        p.setTemplateName("neutral_test_reminder");
        p.setTemplateLanguage("en_US");
        p.setTestSenderConfirmed(true);
        p.setTemplateApproved(true);
        p.setSyntheticEnvironment(true);
        p.setAllowedRecipients(Set.of("+15555550123"));
        return p;
    }

    @Test void defaultSettingsCannotAdmitCloudSending() {
        var p = new MetaWhatsAppProperties();
        assertThatIllegalStateException().isThrownBy(p::validateForTest);
        assertThat(p.allows("+15555550123")).isFalse();
    }

    @Test void completeSyntheticConfigurationAdmitsOnlyExactCanonicalRecipient() {
        var p = configured();
        assertThatCode(p::validateForTest).doesNotThrowAnyException();
        assertThat(p.allows("+15555550123")).isTrue();
        assertThat(p.allows("15555550123")).isFalse();
        assertThat(p.allows(" +15555550123")).isFalse();
        assertThat(p.allows("+15555550124")).isFalse();
    }

    static Stream<Consumer<MetaWhatsAppProperties>> invalidSettings() {
        return Stream.of(p->p.setBusinessAccountId(""), p->p.setTestPhoneNumberId("/messages"),
            p->p.setAccessToken(""), p->p.setAppSecret("short"), p->p.setVerifyToken("short"),
            p->p.setAccessToken("dummy-access-token\r\nInjected: true"),
            p->p.setVerifyToken("dummy-verify-token\nsecret"), p->p.setAppSecret("x".repeat(4097)),
            p->p.setTestSenderConfirmed(false), p->p.setTemplateApproved(false),
            p->p.setSyntheticEnvironment(false), p->p.setAllowedRecipients(Set.of()),
            p->p.setAllowedRecipients(Set.of("15555550123")), p->p.setAllowedRecipients(Set.of("+05555550123")),
            p->p.setAllowedRecipients(Set.of("+1234567")), p->p.setAllowedRecipients(Set.of("+1234567890123456")),
            p->p.setAllowedRecipients(Set.of("+15555550121","+15555550122","+15555550123","+15555550124","+15555550125","+15555550126")),
            p->p.setGraphVersion("v1.0"), p->p.setGraphVersion("v23.0/evil"),
            p->p.setTemplateName("Hello {{name}}"), p->p.setTemplateName(""),
            p->p.setTemplateLanguage("en_US\n"), p->p.setRequestTimeoutSeconds(0),
            p->p.setRequestTimeoutSeconds(9), p->p.setWebhookMaxAgeHours(0), p->p.setWebhookMaxAgeHours(169));
    }

    @ParameterizedTest @MethodSource("invalidSettings")
    void rejectsMissingUnsafeOrUngatedConfigurationWithoutLeakingValues(Consumer<MetaWhatsAppProperties> change) {
        var p = configured();
        change.accept(p);
        assertThatThrownBy(p::validateForTest).isInstanceOf(IllegalStateException.class)
            .hasMessageNotContaining("dummy-").hasMessageNotContaining("15555550123")
            .hasMessageNotContaining("Injected");
    }

    @Test void operationalRecipientDigestUsesSharedNamespacedDigest() {
        assertThat(MetaWhatsAppProperties.recipientDigest("15555550123"))
            .isEqualTo(ReminderIdentity.digest("whatsapp-recipient/15555550123"));
        assertThatIllegalArgumentException().isThrownBy(()->MetaWhatsAppProperties.recipientDigest("+15555550123"));
    }

    @ParameterizedTest @ValueSource(strings={"v23.0", "v24.0"})
    void acceptsOnlyExplicitSupportedGraphVersions(String version) {
        var p = configured(); p.setGraphVersion(version);
        assertThatCode(p::validateForTest).doesNotThrowAnyException();
    }
}
