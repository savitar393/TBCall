package id.tbcall.application.reminder;

import id.tbcall.application.common.ApplicationFailure;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Authenticates the raw bytes before parsing; returns only correlation digests and event facts. */
@Component
public class MetaReminderCallbackVerifier implements ReminderCallbackVerifier {
    private static final int MAX_BODY_BYTES = 256 * 1024;
    private static final int MAX_EVENTS = 100;
    private static final Set<String> STOP_COMMANDS = Set.of("STOP", "BERHENTI", "BATAL", "UNSUBSCRIBE");
    private static final JsonMapper JSON = JsonMapper.builder(JsonFactory.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .disable(StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION)
            .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(32)
                    .maxStringLength(4096).maxNameLength(128).maxNumberLength(128).build()).build())
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private final MetaWhatsAppProperties properties;

    public MetaReminderCallbackVerifier(MetaWhatsAppProperties properties) { this.properties = properties; }

    @Override
    public List<VerifiedEvent> verify(byte[] originalBody, Map<String,String> headers, Instant receivedAt) {
        if (originalBody == null || receivedAt == null) throw malformed();
        if (originalBody.length > MAX_BODY_BYTES) {
            throw new ApplicationFailure(413, "WEBHOOK_TOO_LARGE", "Webhook ditolak", "Webhook tidak valid.");
        }
        authenticate(originalBody, headers);
        if (properties.getBusinessAccountId() == null || properties.getBusinessAccountId().isBlank()
                || properties.getTestPhoneNumberId() == null || properties.getTestPhoneNumberId().isBlank()
                || properties.getWebhookMaxAgeHours() < 1 || properties.getWebhookMaxAgeHours() > 168) {
            throw ApplicationFailure.forbidden();
        }
        final JsonNode root;
        try { root = JSON.readTree(originalBody); }
        catch (JacksonException | IllegalArgumentException e) { throw malformed(); }
        requireObject(root);
        requireEqual(root, "object", "whatsapp_business_account");
        List<VerifiedEvent> events = new ArrayList<>();
        for (JsonNode entry : array(root, "entry")) {
            requireObject(entry);
            if (!properties.getBusinessAccountId().equals(text(entry, "id"))) throw ApplicationFailure.forbidden();
            for (JsonNode change : array(entry, "changes")) {
                requireObject(change);
                requireEqual(change, "field", "messages");
                JsonNode value = change.get("value");
                requireObject(value);
                requireEqual(value, "messaging_product", "whatsapp");
                JsonNode metadata = value.get("metadata");
                requireObject(metadata);
                if (!properties.getTestPhoneNumberId().equals(text(metadata, "phone_number_id"))) {
                    throw ApplicationFailure.forbidden();
                }
                if (value.has("statuses")) {
                    for (JsonNode status : array(value, "statuses")) add(events, statusEvent(status, receivedAt));
                }
                if (value.has("messages")) {
                    for (JsonNode message : array(value, "messages")) {
                        VerifiedEvent event = optOutEvent(message, receivedAt);
                        if (event != null) add(events, event);
                    }
                }
            }
        }
        // No consumer sees a partially validated batch. Durable replay detection belongs to the consumer.
        return List.copyOf(events);
    }

    private void authenticate(byte[] body, Map<String,String> headers) {
        String signature = null;
        if (headers != null) {
            for (Map.Entry<String,String> header : headers.entrySet()) {
                if ("X-Hub-Signature-256".equalsIgnoreCase(header.getKey())) {
                    if (signature != null || header.getValue() == null) throw ApplicationFailure.forbidden();
                    signature = header.getValue();
                }
            }
        }
        String secret = properties.getAppSecret();
        if (secret == null || secret.isBlank() || signature == null || !signature.matches("sha256=[0-9a-fA-F]{64}")) {
            throw ApplicationFailure.forbidden();
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            if (!MessageDigest.isEqual(mac.doFinal(body), HexFormat.of().parseHex(signature.substring(7)))) {
                throw ApplicationFailure.forbidden();
            }
        } catch (GeneralSecurityException e) {
            // Do not retain provider bytes, the signature or credentials in the failure chain.
            throw ApplicationFailure.forbidden();
        }
    }

    private VerifiedEvent statusEvent(JsonNode status, Instant receivedAt) {
        requireObject(status);
        requireIndividual(status);
        String rawId = messageId(status);
        String recipient = recipient(status, "recipient_id");
        Instant occurredAt = timestamp(status, receivedAt);
        String rawKind = text(status, "status");
        Kind kind = switch (rawKind) {
            case "sent" -> Kind.ACCEPTANCE;
            case "delivered", "read" -> Kind.AUTHORITATIVE_DELIVERY;
            case "failed" -> Kind.TERMINAL_FAILURE;
            default -> throw malformed();
        };
        UUID callbackToken = null;
        if (status.has("biz_opaque_callback_data")) {
            String opaque = text(status, "biz_opaque_callback_data");
            if (!opaque.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
                throw malformed();
            }
            callbackToken = UUID.fromString(opaque);
        }
        return event(rawId, recipient, rawKind, callbackToken, kind, occurredAt);
    }

    private VerifiedEvent optOutEvent(JsonNode message, Instant receivedAt) {
        requireObject(message);
        String type = text(message, "type");
        boolean optOut;
        if ("text".equals(type)) {
            JsonNode body = message.get("text");
            requireObject(body);
            optOut = STOP_COMMANDS.contains(text(body, "body").strip().toUpperCase(Locale.ROOT));
        } else if ("button".equals(type)) {
            JsonNode button = message.get("button");
            requireObject(button);
            optOut = "STOP_REMINDERS".equals(text(button, "payload"));
        } else {
            // Other inbound types are intentionally unsupported; no clinical/message processing occurs.
            return null;
        }
        if (!optOut) return null;
        requireIndividual(message);
        return event(messageId(message), recipient(message, "from"), "opt_out", null, Kind.OPT_OUT,
                timestamp(message, receivedAt));
    }

    private VerifiedEvent event(String rawId, String recipient, String rawKind, UUID token, Kind kind, Instant time) {
        // All components reject newlines. The original status keeps read and delivered distinct.
        String canonical = properties.getBusinessAccountId() + "\n" + properties.getTestPhoneNumberId()
                + "\n" + rawId + "\n" + rawKind + "\n" + time.getEpochSecond();
        return new VerifiedEvent(ReminderIdentity.digest(canonical), token, kind, time,
                ReminderIdentity.digest(rawId), MetaWhatsAppProperties.recipientDigest(recipient));
    }

    private Instant timestamp(JsonNode event, Instant receivedAt) {
        String value = text(event, "timestamp");
        if (!value.matches("0|[1-9][0-9]{0,11}")) throw malformed();
        final Instant occurredAt;
        try { occurredAt = Instant.ofEpochSecond(Long.parseLong(value)); }
        catch (java.time.DateTimeException | NumberFormatException e) { throw malformed(); }
        // HMAC authenticates the provider timestamp; it does not independently establish send time.
        if (occurredAt.isBefore(receivedAt.minusSeconds(properties.getWebhookMaxAgeHours() * 3600L))
                || occurredAt.isAfter(receivedAt.plusSeconds(300))) throw malformed();
        return occurredAt;
    }

    private static String messageId(JsonNode event) {
        String id = text(event, "id");
        if (id.length() > 512 || !id.matches("wamid\\.[A-Za-z0-9._/+=:-]+")) throw malformed();
        return id;
    }

    private static String recipient(JsonNode event, String field) {
        String value = text(event, field);
        if (!value.matches("[1-9][0-9]{7,14}")) throw malformed();
        return value;
    }

    private static void requireIndividual(JsonNode event) {
        if (event.has("recipient_type") && !"individual".equals(text(event, "recipient_type"))) throw malformed();
    }

    private static void add(List<VerifiedEvent> events, VerifiedEvent event) {
        if (events.size() >= MAX_EVENTS) throw malformed();
        events.add(event);
    }

    private static JsonNode array(JsonNode object, String field) {
        JsonNode value = object.get(field);
        if (value == null || !value.isArray() || value.isEmpty() || value.size() > MAX_EVENTS) throw malformed();
        return value;
    }

    private static String text(JsonNode object, String field) {
        JsonNode value = object.get(field);
        if (value == null || !value.isString()) throw malformed();
        return value.stringValue();
    }

    private static void requireEqual(JsonNode object, String field, String expected) {
        if (!expected.equals(text(object, field))) throw malformed();
    }

    private static void requireObject(JsonNode value) {
        if (value == null || !value.isObject()) throw malformed();
    }

    private static ApplicationFailure malformed() {
        return new ApplicationFailure(400, "INVALID_WEBHOOK", "Webhook ditolak", "Webhook tidak valid.");
    }
}
