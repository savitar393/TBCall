-- Official Cloud API testing only. No tokens, message bodies or recipient phone numbers.
ALTER TABLE reminder_jobs DROP CONSTRAINT reminder_jobs_mode_check;
ALTER TABLE reminder_jobs ADD CONSTRAINT reminder_jobs_mode_check CHECK (mode IN ('DISABLED','SIMULATED','CLOUD_TEST'));
ALTER TABLE reminder_attempts DROP CONSTRAINT reminder_attempts_mode_check;
ALTER TABLE reminder_attempts ADD CONSTRAINT reminder_attempts_mode_check CHECK (mode IN ('DISABLED','SIMULATED','CLOUD_TEST'));

-- A provider-authenticated opt-out is not an authenticated SELF_PORTAL session action.
ALTER TABLE reminder_consent_events ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE reminder_consent_events DROP CONSTRAINT reminder_consent_events_method_check;
ALTER TABLE reminder_consent_events DROP CONSTRAINT reminder_consent_events_check;
ALTER TABLE reminder_consent_events ADD CONSTRAINT ck_reminder_consent_method CHECK (method IN ('SELF_PORTAL','PROVIDER_OPT_OUT'));
ALTER TABLE reminder_consent_events ADD CONSTRAINT ck_reminder_consent_actor CHECK (
    (method='SELF_PORTAL' AND actor_user_id IS NOT NULL AND actor_user_id=user_id) OR
    (method='PROVIDER_OPT_OUT' AND actor_user_id IS NULL AND action='WITHDRAWN'));

CREATE TABLE reminder_provider_handoffs (
    attempt_id uuid PRIMARY KEY REFERENCES reminder_attempts(id),
    callback_token uuid NOT NULL UNIQUE,
    business_account_id varchar(32) NOT NULL,
    phone_number_id varchar(32) NOT NULL,
    recipient_digest varchar(64) NOT NULL CHECK (recipient_digest ~ '^[a-f0-9]{64}$'),
    message_digest varchar(64) UNIQUE CHECK (message_digest ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL,
    accepted_at timestamptz, delivered_at timestamptz, failed_at timestamptz
);
-- Digests are operational change/match keys, not anonymization guarantees.
CREATE TABLE reminder_provider_events (
    event_key varchar(64) PRIMARY KEY CHECK (event_key ~ '^[a-f0-9]{64}$'),
    handoff_attempt_id uuid REFERENCES reminder_provider_handoffs(attempt_id),
    kind varchar(30) NOT NULL CHECK (kind IN ('ACCEPTANCE','AUTHORITATIVE_DELIVERY','TERMINAL_FAILURE','OPT_OUT')),
    occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL,
    result varchar(12) NOT NULL CHECK (result IN ('PENDING','APPLIED','IGNORED','STALE'))
);
CREATE INDEX idx_reminder_provider_events_received ON reminder_provider_events(received_at);
