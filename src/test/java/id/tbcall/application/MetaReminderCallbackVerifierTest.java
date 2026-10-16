package id.tbcall.application;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.reminder.MetaReminderCallbackVerifier;
import id.tbcall.application.reminder.MetaWhatsAppProperties;
import id.tbcall.application.reminder.ReminderCallbackVerifier.Kind;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.*;

/** Pure raw-byte verification: no HTTP client, application context, database or patient data. */
class MetaReminderCallbackVerifierTest {
    private static final Instant NOW = Instant.parse("2026-10-16T00:00:00Z");
    private static final String TIME = Long.toString(NOW.getEpochSecond());
    private static final String SECRET = "synthetic-app-secret-for-hmac-tests";
    private static final String TOKEN = "c071655e-c03e-464b-8c92-7cb40a821390";
    private static final String ID = "wamid.synthetic-01=";
    private final MetaReminderCallbackVerifier verifier = verifier();

    private static MetaReminderCallbackVerifier verifier() {
        MetaWhatsAppProperties properties = new MetaWhatsAppProperties();
        properties.setAppSecret(SECRET);
        properties.setBusinessAccountId("12345");
        properties.setTestPhoneNumberId("67890");
        properties.setWebhookMaxAgeHours(168);
        return new MetaReminderCallbackVerifier(properties);
    }

    @Test void authenticatesOriginalBytesAndReturnsBatchedStatusMeanings() {
        var events = verify(envelope("\"statuses\":[" + status("sent") + "," + status("delivered")
                + "," + status("read") + "," + status("failed") + "]"));
        assertThat(events).extracting(e -> e.kind()).containsExactly(Kind.ACCEPTANCE,
                Kind.AUTHORITATIVE_DELIVERY, Kind.AUTHORITATIVE_DELIVERY, Kind.TERMINAL_FAILURE);
        assertThat(events.getFirst().callbackToken()).isEqualTo(UUID.fromString(TOKEN));
        assertThat(events.getFirst().occurredAt()).isEqualTo(NOW);
        assertThat(events.getFirst().messageDigest()).isEqualTo("eb3a49d1802c0d834c7692ce8cf17fd8ffa35d4e03d2a249751bb1cc1a1aeec5");
        assertThat(events.getFirst().recipientDigest()).isEqualTo("0408eecb30998176fb41e996647119643aeb12405567e1631880a68f81dafcb6");
        assertThat(events.get(1).providerEventId()).isNotEqualTo(events.get(2).providerEventId());
    }

    @Test void stableEventIdentitySurvivesWhitespaceAndDifferentBatching() {
        String one = envelope("\"statuses\":[" + status("delivered") + "]");
        String batched = envelope("\"statuses\":[" + status("sent") + "," + status("delivered") + "]");
        assertThat(verify(one).getFirst().providerEventId())
                .isEqualTo(verify(one.replace("{", "{ ")).getFirst().providerEventId())
                .isEqualTo(verify(batched).get(1).providerEventId());
    }

    @Test void signatureMustAuthenticateTheExactUnmodifiedBodyBeforeParsing() throws Exception {
        byte[] bytes = envelope("\"statuses\":[" + status("sent") + "]").getBytes(StandardCharsets.UTF_8);
        String signature = signature(bytes);
        bytes[bytes.length - 1] = '!';
        assertFailure(403, () -> verifier.verify(bytes, Map.of("X-Hub-Signature-256", signature), NOW));
        assertFailure(403, () -> verifier.verify("not-json".getBytes(StandardCharsets.UTF_8), Map.of(), NOW));
    }

    @ParameterizedTest @ValueSource(strings={"", "sha256=123", "sha1=012345", "sha256=gggg", " sha256=abc", "sha256="})
    void rejectsMissingOrMalformedSignatureWithoutEcho(String signature) {
        assertFailure(403, () -> verifier.verify(new byte[]{'{','}'}, Map.of("x-hub-signature-256", signature), NOW));
    }

    @Test void rejectsAmbiguousSignatureHeaderCasing() throws Exception {
        byte[] body = envelope("\"statuses\":[" + status("sent") + "]").getBytes(StandardCharsets.UTF_8);
        assertFailure(403, () -> verifier.verify(body, Map.of("X-Hub-Signature-256", signature(body),
                "x-hub-signature-256", signature(body)), NOW));
    }

    @Test void foreignAccountOrSenderRejectsEntireBatch() {
        String body = envelope("\"statuses\":[" + status("sent") + "]");
        assertFailure(403, () -> verify(body.replace("12345", "99999")));
        assertFailure(403, () -> verify(body.replace("67890", "99999")));
        assertFailure(403, () -> verify(body.replace("\"entry\":[", "\"entry\":[{\"id\":\"99999\",\"changes\":[]},")));
    }

    @ParameterizedTest @ValueSource(strings={"0", "99999999999999999999", "-1", "1.1", "", " 1792108800"})
    void rejectsInvalidOrStaleTimestamp(String timestamp) {
        assertFailure(400, () -> verify(envelope("\"statuses\":[" + status("sent").replace(TIME, timestamp) + "]")));
    }

    @Test void rejectsTooOldOrFutureTimestampsButAllowsSevenDayRetryBoundary() {
        String body = envelope("\"statuses\":[" + status("sent") + "]");
        assertFailure(400, () -> verify(body.replace(TIME, Long.toString(NOW.minusSeconds(604801).getEpochSecond()))));
        assertFailure(400, () -> verify(body.replace(TIME, Long.toString(NOW.plusSeconds(301).getEpochSecond()))));
        assertThat(verify(body.replace(TIME, Long.toString(NOW.minusSeconds(604800).getEpochSecond())))).hasSize(1);
        assertThat(verify(body.replace(TIME, Long.toString(NOW.plusSeconds(300).getEpochSecond())))).hasSize(1);
    }

    @ParameterizedTest @ValueSource(strings={"STOP", " stop ", "Berhenti", "BATAL", "unsubscribe"})
    void explicitStopTextProducesOnlyOptOutWithoutMessageContent(String command) {
        var event = verify(envelope("\"messages\":[" + message("text", "\"text\":{\"body\":\"" + command + "\"}") + "]")).getFirst();
        assertThat(event.kind()).isEqualTo(Kind.OPT_OUT);
        assertThat(event.callbackToken()).isNull();
        assertThat(event.toString()).doesNotContain(command, ID, "628000000001");
    }

    @Test void approvedQuickReplyOptsOutAndOtherContentIsIgnored() {
        assertThat(verify(envelope("\"messages\":[" + message("button", "\"button\":{\"payload\":\"STOP_REMINDERS\",\"text\":\"Stop reminders\"}") + "]")))
                .extracting(e -> e.kind()).containsExactly(Kind.OPT_OUT);
        assertThat(verify(envelope("\"messages\":[" + message("text", "\"text\":{\"body\":\"Please stop tomorrow\"}") + ","
                + message("image", "\"image\":{\"id\":\"ignored\"}") + "]"))).isEmpty();
    }

    @Test void statusCorrelationIsOptionalButMalformedCorrelationIsRejected() {
        String body = envelope("\"statuses\":[" + status("sent") + "]");
        assertThat(verify(body.replace(",\"biz_opaque_callback_data\":\"" + TOKEN + "\"", "")).getFirst().callbackToken()).isNull();
        assertFailure(400, () -> verify(body.replace(TOKEN, "1-1-1-1-1")));
        assertFailure(400, () -> verify(body.replace(TOKEN, "not-a-uuid")));
    }

    @ParameterizedTest @ValueSource(strings={"played", "unknown", "accepted"})
    void unsupportedStatusNeverInventsDelivery(String status) {
        assertFailure(400, () -> verify(envelope("\"statuses\":[" + status(status) + "]")));
    }

    @Test void rejectsMalformedEventIdRecipientGroupAndWrongShape() {
        String body = envelope("\"statuses\":[" + status("delivered") + "]");
        for (String invalid : List.of(body.replace(ID, "other"), body.replace(ID, "wamid.bad id"),
                body.replace("628000000001", "+628000000001"), body.replace("\"status\":", "\"recipient_type\":\"group\",\"status\":"),
                body.replace("\"messages\"", "\"other\""), body.replace("\"whatsapp\"", "\"sms\""),
                body.replace("\"statuses\":[", "\"statuses\":{\"items\":[").replace("]}}]", "]}}}]"))) {
            assertFailure(400, () -> verify(invalid));
        }
    }

    @Test void strictJsonRejectsDuplicatesTrailingRootsOversizeDepthAndLongValues() {
        String body = envelope("\"statuses\":[" + status("sent") + "]");
        assertFailure(400, () -> verify(body + " {}"));
        assertFailure(400, () -> verify(body.replace("\"object\":", "\"object\":\"wrong\",\"object\":")));
        assertFailure(400, () -> verify(body.replace("\"statuses\":", "\"extra\":" + "[".repeat(33) + "0" + "]".repeat(33) + ",\"statuses\":")));
        assertFailure(400, () -> verify(body.replace("\"statuses\":", "\"extra\":\"" + "x".repeat(4097) + "\",\"statuses\":")));
        assertFailure(413, () -> verify(" ".repeat(262145)));
        assertFailure(400, () -> verify(envelope("\"statuses\":[" + String.join(",", java.util.Collections.nCopies(101, status("sent"))) + "]")));
    }

    private List<id.tbcall.application.reminder.ReminderCallbackVerifier.VerifiedEvent> verify(String json) {
        try {
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            return verifier.verify(bytes, Map.of("x-HuB-sIgNaTuRe-256", signature(bytes)), NOW);
        } catch (java.security.GeneralSecurityException e) { throw new AssertionError(e); }
    }

    private static void assertFailure(int status, org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApplicationFailure.class, failure -> {
            assertThat(failure.status()).isEqualTo(status);
            assertThat(failure.getMessage()).doesNotContain(SECRET, ID, "628000000001");
        });
    }

    private static String signature(byte[] body) throws java.security.GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return "sha256=" + HexFormat.of().formatHex(mac.doFinal(body));
    }

    private static String status(String status) {
        return "{\"id\":\"" + ID + "\",\"status\":\"" + status + "\",\"timestamp\":\"" + TIME
                + "\",\"recipient_id\":\"628000000001\",\"biz_opaque_callback_data\":\"" + TOKEN + "\"}";
    }

    private static String message(String type, String content) {
        return "{\"id\":\"" + ID + "\",\"from\":\"628000000001\",\"timestamp\":\"" + TIME + "\",\"type\":\"" + type + "\"," + content + "}";
    }

    private static String envelope(String events) {
        return "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"12345\",\"changes\":[{\"field\":\"messages\",\"value\":{"
                + "\"messaging_product\":\"whatsapp\",\"metadata\":{\"phone_number_id\":\"67890\"}," + events + "}}]}]}";
    }
}
