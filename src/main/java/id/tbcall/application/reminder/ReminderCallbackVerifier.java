package id.tbcall.application.reminder;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Future provider boundary DESIGN ONLY. No bean, callback endpoint or event consumer exists in 2C-A.
 * A future approved adapter must authenticate the original bytes/signature, enforce timestamp/replay
 * limits, bind provider account and correlation to the recorded attempt, and durably deduplicate events.
 * Opt-out must revoke the bound recipient's consent without accepting user/patient IDs from the body.
 * Acceptance is never delivery. Provider-specific protocol and credential custody require separate review.
 */
public interface ReminderCallbackVerifier {
    VerifiedEvent verify(byte[] originalBody,Map<String,String> headers,Instant receivedAt);
    enum Kind { AUTHORITATIVE_DELIVERY, TERMINAL_FAILURE, OPT_OUT }
    record VerifiedEvent(String providerEventId,UUID attemptId,Kind kind,Instant occurredAt){}
}
