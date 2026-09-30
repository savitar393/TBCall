package id.tbcall.application.auth;

import java.time.OffsetDateTime;

/** Adapter must deliver to the specified contact without logging or retaining the raw secret. */
public interface VerificationDeliveryPort {
    void deliver(String purpose, String destination, String secret, OffsetDateTime expiresAt);
}
