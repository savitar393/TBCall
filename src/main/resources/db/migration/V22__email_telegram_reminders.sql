-- Channel-specific enrollment; existing WhatsApp rows/evidence remain unchanged.
ALTER TABLE reminder_preferences ADD COLUMN email_consent boolean NOT NULL DEFAULT false;
ALTER TABLE reminder_preferences ADD COLUMN telegram_consent boolean NOT NULL DEFAULT false;
ALTER TABLE reminder_preferences ADD COLUMN email_binding varchar(64);
ALTER TABLE reminder_preferences ADD COLUMN telegram_binding varchar(64);
-- UI version and per-channel enrollment versions are separate: unlinking Telegram
-- must not invalidate an independently consented Email/WhatsApp job.
ALTER TABLE reminder_preferences ADD COLUMN whatsapp_version bigint CHECK(whatsapp_version>0);
ALTER TABLE reminder_preferences ADD COLUMN email_version bigint NOT NULL DEFAULT 0 CHECK(email_version>=0);
ALTER TABLE reminder_preferences ADD COLUMN telegram_version bigint NOT NULL DEFAULT 0 CHECK(telegram_version>=0);
UPDATE reminder_preferences SET whatsapp_version=version;
ALTER TABLE reminder_preferences ADD CONSTRAINT ck_reminder_email_binding CHECK (NOT email_consent OR email_binding IS NOT NULL);
ALTER TABLE reminder_preferences ADD CONSTRAINT ck_reminder_telegram_binding CHECK (NOT telegram_consent OR telegram_binding IS NOT NULL);
ALTER TABLE reminder_preferences ADD CONSTRAINT ck_reminder_channel_hours CHECK (
    NOT (email_consent OR telegram_consent) OR (time_zone IS NOT NULL AND
    ((all_day AND permitted_from IS NULL AND permitted_until IS NULL) OR
    (NOT all_day AND permitted_from IS NOT NULL AND permitted_until IS NOT NULL AND permitted_from<>permitted_until))));

ALTER TABLE reminder_consent_events DROP CONSTRAINT reminder_consent_events_channel_check;
ALTER TABLE reminder_consent_events ADD CONSTRAINT reminder_consent_events_channel_check CHECK (channel IN ('WHATSAPP','EMAIL','TELEGRAM'));
ALTER TABLE reminder_consent_events ADD COLUMN destination_binding varchar(64);
ALTER TABLE reminder_consent_events ADD CONSTRAINT ck_reminder_consent_destination CHECK (
    (channel='WHATSAPP' AND destination_binding IS NULL) OR
    (channel IN ('EMAIL','TELEGRAM') AND phone_binding IS NULL AND destination_binding IS NOT NULL AND destination_binding ~ '^[a-f0-9]{64}$'));

ALTER TABLE reminder_jobs DROP CONSTRAINT reminder_jobs_channel_check;
ALTER TABLE reminder_jobs ADD CONSTRAINT reminder_jobs_channel_check CHECK (channel IN ('WHATSAPP','EMAIL','TELEGRAM'));
ALTER TABLE reminder_attempts DROP CONSTRAINT reminder_attempts_channel_check;
ALTER TABLE reminder_attempts ADD CONSTRAINT reminder_attempts_channel_check CHECK (channel IN ('WHATSAPP','EMAIL','TELEGRAM'));
ALTER TABLE reminder_jobs DROP CONSTRAINT reminder_jobs_mode_check;
ALTER TABLE reminder_jobs ADD CONSTRAINT reminder_jobs_mode_check CHECK (mode IN ('DISABLED','SIMULATED','CLOUD_TEST','CHANNEL_TEST'));
ALTER TABLE reminder_attempts DROP CONSTRAINT reminder_attempts_mode_check;
ALTER TABLE reminder_attempts ADD CONSTRAINT reminder_attempts_mode_check CHECK (mode IN ('DISABLED','SIMULATED','CLOUD_TEST','CHANNEL_TEST'));
ALTER TABLE reminder_jobs ALTER COLUMN phone_binding DROP NOT NULL;
ALTER TABLE reminder_jobs ADD COLUMN destination_binding varchar(64);
ALTER TABLE reminder_jobs ADD CONSTRAINT ck_reminder_job_destination CHECK (
    (channel='WHATSAPP' AND phone_binding IS NOT NULL AND destination_binding IS NULL) OR
    (channel IN ('EMAIL','TELEGRAM') AND phone_binding IS NULL AND destination_binding IS NOT NULL AND destination_binding ~ '^[a-f0-9]{64}$'));
-- Resolve the generated V20 constraint by exact columns, never a guessed/truncated name.
DO $$ DECLARE legacy text; BEGIN
    SELECT conname INTO STRICT legacy FROM pg_constraint WHERE conrelid='reminder_jobs'::regclass AND contype='u'
        AND conkey=ARRAY[
            (SELECT attnum FROM pg_attribute WHERE attrelid='reminder_jobs'::regclass AND attname='schedule_id'),
            (SELECT attnum FROM pg_attribute WHERE attrelid='reminder_jobs'::regclass AND attname='scheduled_at'),
            (SELECT attnum FROM pg_attribute WHERE attrelid='reminder_jobs'::regclass AND attname='user_id'),
            (SELECT attnum FROM pg_attribute WHERE attrelid='reminder_jobs'::regclass AND attname='preferences_version')
        ]::smallint[];
    EXECUTE format('ALTER TABLE reminder_jobs DROP CONSTRAINT %I',legacy);
END $$;
ALTER TABLE reminder_jobs ADD CONSTRAINT uq_reminder_occurrence_channel UNIQUE(schedule_id,scheduled_at,user_id,preferences_version,channel);
DROP INDEX uq_reminder_one_handoff;
CREATE UNIQUE INDEX uq_reminder_one_handoff ON reminder_jobs(logical_key,channel)
    WHERE state IN ('DISPATCHED','ACCEPTED','DELIVERED','UNCERTAIN');
ALTER TABLE reminder_jobs ADD CONSTRAINT uq_reminder_job_channel UNIQUE(id,channel);
ALTER TABLE reminder_attempts ADD CONSTRAINT fk_reminder_attempt_channel FOREIGN KEY(job_id,channel) REFERENCES reminder_jobs(id,channel);

-- Only the current private destination is retained; historical jobs keep a change detector.
CREATE TABLE reminder_telegram_links (
    user_id uuid PRIMARY KEY REFERENCES users(id), patient_link_id uuid NOT NULL REFERENCES patient_user_links(id),
    link_generation varchar(64) NOT NULL, bot_key varchar(64) NOT NULL,
    chat_id varchar(16) UNIQUE CHECK (chat_id ~ '^[1-9][0-9]{0,15}$' AND chat_id::numeric<=4503599627370495),
    version bigint NOT NULL CHECK (version>0), linked_at timestamptz, updated_at timestamptz NOT NULL,
    CHECK ((chat_id IS NULL)=(linked_at IS NULL))
);
CREATE TABLE reminder_telegram_link_tokens (
    token_digest varchar(64) PRIMARY KEY CHECK (token_digest ~ '^[a-f0-9]{64}$'),
    user_id uuid NOT NULL REFERENCES users(id),patient_link_id uuid NOT NULL REFERENCES patient_user_links(id),
    link_generation varchar(64) NOT NULL,bot_key varchar(64) NOT NULL,
    created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,
    CHECK (expires_at>created_at)
);
CREATE INDEX idx_reminder_telegram_tokens_user ON reminder_telegram_link_tokens(user_id);
CREATE TABLE reminder_telegram_consumers (
    bot_key varchar(64) PRIMARY KEY,last_update_id bigint NOT NULL DEFAULT -1 CHECK(last_update_id>=-1),
    lease_token uuid,lease_until timestamptz,CHECK((lease_token IS NULL)=(lease_until IS NULL))
);
CREATE TABLE reminder_telegram_updates (
    bot_key varchar(64) NOT NULL,update_id bigint NOT NULL CHECK(update_id>=0),
    result varchar(20) NOT NULL CHECK(result IN ('APPLIED','IGNORED','STALE')),received_at timestamptz NOT NULL,
    PRIMARY KEY(bot_key,update_id)
);
