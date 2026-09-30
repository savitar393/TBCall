package id.tbcall.application.auth;

import java.time.OffsetDateTime;

/** Adapter must deliver to the specified contact without logging or retaining the raw secret. */
public interface VerificationDeliveryPort {
    boolean isAvailable();
    /** Local response delivery can support registration without providing an email/SMS adapter. */
    default boolean isRegistrationAvailable() { return isAvailable(); }
    void deliver(String purpose, String destination, String secret, OffsetDateTime expiresAt);
}
