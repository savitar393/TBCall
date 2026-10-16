package id.tbcall.application.reminder;

import java.time.Instant;
import java.util.Map;
import java.util.List;
import java.util.UUID;

/**
 * Authenticates the original bytes and bounds the provider timestamp before returning a complete batch.
 * The consumer binds these digest facts to recorded attempts and durably deduplicates provider events.
 * Opt-out revokes the bound recipient's consent without accepting user/patient IDs from the body.
 * Acceptance and delivery never establish medication adherence.
 */
public interface ReminderCallbackVerifier {
    List<VerifiedEvent> verify(byte[] originalBody,Map<String,String> headers,Instant receivedAt);
    enum Kind { ACCEPTANCE, AUTHORITATIVE_DELIVERY, TERMINAL_FAILURE, OPT_OUT }
    record VerifiedEvent(String providerEventId,UUID callbackToken,Kind kind,Instant occurredAt,
            String messageDigest,String recipientDigest){}
}
