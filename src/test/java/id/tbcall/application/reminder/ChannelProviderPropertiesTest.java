package id.tbcall.application.reminder;

import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class ChannelProviderPropertiesTest {
    static ChannelProviderProperties email() {
        var p=new ChannelProviderProperties();p.setSyntheticEnvironment(true);p.setEmailEnabled(true);
        p.setResendApiKey("re_dummy_credential_for_unit_test");p.setEmailRecipients(Set.of("synthetic@example.invalid"));return p;
    }
    static ChannelProviderProperties telegram() {
        var p=new ChannelProviderProperties();p.setSyntheticEnvironment(true);p.setTelegramEnabled(true);
        p.setTelegramExclusiveConsumerConfirmed(true);p.setTelegramBotUsername("synthetic_test_bot");
        p.setTelegramBotToken("123456789:dummy_unit_test_secret_123456789012345");p.setTelegramRecipients(Set.of("123456789"));return p;
    }
    @Test void defaultsDenyExternalMessaging(){assertThatIllegalStateException().isThrownBy(()->new ChannelProviderProperties().validateForTest());}
    @Test void validatesOnlyEnabledProvider(){assertThatCode(()->email().validateForTest()).doesNotThrowAnyException();assertThatCode(()->telegram().validateForTest()).doesNotThrowAnyException();}
    @Test void requiresSyntheticEnvironment(){var p=email();p.setSyntheticEnvironment(false);assertThatIllegalStateException().isThrownBy(p::validateForTest);}
    @Test void telegramRequiresExclusiveConsumer(){var p=telegram();p.setTelegramExclusiveConsumerConfirmed(false);assertThatIllegalStateException().isThrownBy(p::validateForTest);}
    @ParameterizedTest @ValueSource(strings={"Synthetic@example.invalid"," synthetic@example.invalid","a@example.invalid\r\nBcc:x@y.invalid","a..b@example.invalid","a@localhost",""})
    void emailAllowlistMustBeCanonicalAndSafe(String value){var p=email();p.setEmailRecipients(Set.of(value));assertThatIllegalStateException().isThrownBy(p::validateForTest);}
    @Test void emailCanonicalizationAndExactHandoff(){assertThat(ChannelProviderProperties.canonicalEmail(" Synthetic@Example.Invalid ")).isEqualTo("synthetic@example.invalid");assertThat(email().emailAllowed("synthetic@example.invalid")).isTrue();assertThat(email().emailAllowed("Synthetic@example.invalid")).isFalse();}
    @ParameterizedTest @ValueSource(strings={"0","-123","00123","4503599627370496","123\n","@username",""})
    void telegramRejectsNonPrivateOrNonCanonicalIds(String id){var p=telegram();p.setTelegramRecipients(Set.of(id));assertThatIllegalStateException().isThrownBy(p::validateForTest);assertThat(p.telegramAllowed(id)).isFalse();}
    @Test void telegramAllowsLargestExactPrivateInteger(){var p=telegram();p.setTelegramRecipients(Set.of("4503599627370495"));assertThatCode(p::validateForTest).doesNotThrowAnyException();assertThat(p.telegramAllowed("4503599627370495")).isTrue();}
    @Test void botKeyChangesWithIdentityButSurvivesSecretRotation(){var p=telegram();String key=p.botKey();p.setTelegramBotToken("123456789:another_dummy_secret_123456789012345");assertThat(p.botKey()).isEqualTo(key);p.setTelegramBotToken("123456788:another_dummy_secret_123456789012345");assertThat(p.botKey()).isNotEqualTo(key);assertThat(key).matches("[a-f0-9]{64}");}
    @ParameterizedTest @ValueSource(ints={0,9}) void boundsTimeout(int value){var p=email();p.setTimeoutSeconds(value);assertThatIllegalStateException().isThrownBy(p::validateForTest);}
    @Test void rejectsOversizedAndEmptyAllowlists(){var p=email();p.setEmailRecipients(Set.of());assertThatIllegalStateException().isThrownBy(p::validateForTest);p.setEmailRecipients(Set.of("a@x.invalid","b@x.invalid","c@x.invalid","d@x.invalid","e@x.invalid","f@x.invalid"));assertThatIllegalStateException().isThrownBy(p::validateForTest);}
    @ParameterizedTest @ValueSource(strings={"1234:bad/path","01234:dummy_unit_test_secret_123456789012345","1234:bad\nsecret",""}) void rejectsUnsafeBotTokens(String value){var p=telegram();p.setTelegramBotToken(value);assertThatIllegalStateException().isThrownBy(p::validateForTest);}
    @ParameterizedTest @ValueSource(strings={"user","name_bot?","name_bot/path","bad bot",""}) void rejectsUnsafeBotUsernames(String value){var p=telegram();p.setTelegramBotUsername(value);assertThatIllegalStateException().isThrownBy(p::validateForTest);}
    @Test void rejectsEmailHeaderInjection(){var p=email();p.setEmailFrom("Test <a@b.invalid>\r\nBcc: other@b.invalid");assertThatIllegalStateException().isThrownBy(p::validateForTest);}
}
