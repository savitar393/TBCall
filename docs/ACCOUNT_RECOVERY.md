# Account recovery — Phase 1.1

## Public routes

All routes below retain CSRF, explicit CORS, Indonesian problem+json and correlation IDs. No JWT or clinical endpoint is added.

| Method / path | Body | Success |
|---|---|---|
| POST `/api/v1/auth/verification/resend` | `{ "identity": "email-or-phone" }` | Generic 202 |
| POST `/api/v1/auth/password-reset/request` | `{ "identity": "email-or-phone" }` | Generic 202 |
| POST `/api/v1/auth/password-reset/confirm` | `{ "token": "...", "newPassword": "..." }` | 204 |

For syntactically valid identities and available delivery, request/resend return the same body regardless of account existence, status or verification. The response contains no user ID, contact information or token, including in development. Invalid request syntax still returns 400. This contract prevents response-based enumeration; timing and abuse defenses require deployment-level controls.

Resend issues only for a PENDING/ACTIVE account whose requested identity remains unverified. Email and phone have separate purposes; all older unused tokens of that purpose are invalidated atomically using the existing used_at field. A verified contact, unknown account or suspended/disabled account receives no token. PASSWORD_RESET is issued only to an ACTIVE account whose requested contact is verified; older unused reset tokens are invalidated across contacts.

Confirmation accepts only an unused, unexpired PASSWORD_RESET token belonging to a currently ACTIVE account with a verified configured login identity. It uses the existing 12–128 character PasswordHasher, consumes the token, changes the password, revokes all sessions and audits in one transaction. Invalid/expired/used/wrong-purpose tokens receive 400 PASSWORD_RESET_TOKEN_INVALID. Contact verification remains separate and rejects reset tokens.

## Delivery contract

VerificationDeliveryPort.isAvailable() is a non-secret capability check. Registration, resend and reset request check it before any identity-specific database lookup. Unavailable delivery returns the same 503 VERIFICATION_DELIVERY_UNAVAILABLE for existing/unknown/verified/unverified contacts and duplicate registration. No account/token/audit issuance occurs in this case. Reset confirmation consumes an already-delivered token and does not require delivery availability.

The default production adapter reports unavailable. Configure a real email/SMS adapter before production registration/recovery can be used. There is no fake provider. Raw secrets must never be logged, audited, retained by a production adapter or exposed in production responses. Persisted verification/reset/session tokens are SHA-256 hashes only.

Existing dev/test registration exposure still requires the dev/test profile, production=false and expose-verification-tokens=true. Production/prod profiles reject exposure. isRegistrationAvailable() defaults to isAvailable(); the local default port overrides it to support registration response delivery while isAvailable() remains false. Default dev resend/reset therefore return the same 503 for every identity without invalidating tokens. To receive resend/reset tokens locally, configure an explicit development adapter reporting real delivery availability. Test adapters capture tokens in memory for assertions; they are not application providers.

Delivery occurs synchronously inside the transaction and may precede commit; a rollback leaves the delivered token unusable. A durable outbox/retry strategy must be separately reviewed when implementing a production adapter.

## Locking and audit

Issuance/invalidation locks the user then token rows. Consumption first looks up only the owner UUID, locks that user and then locks/reloads the token, avoiding stale managed tokens and opposite lock order between consumption and resend. READ_COMMITTED is preserved; concurrent consumers succeed once, and concurrent resends leave only the latest unused token.

Audit VERIFICATION_RESENT and PASSWORD_RESET_REQUESTED occurs only for real issuance. Successful confirmation emits PASSWORD_RESET_COMPLETED. Audit metadata contains traceId only; no contact, token or password payload is retained. Registration and CONTACT_VERIFIED audits remain unchanged.

Before public internet exposure, deploy edge/distributed rate limiting for registration, login, resend, reset and administrative lookup. This checkpoint adds no client-IP trust model or process-local limiter. TLS, secure cookies, explicit origins and real delivery configuration remain required.
