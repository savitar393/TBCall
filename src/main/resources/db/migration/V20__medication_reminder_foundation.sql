-- TBCall-owned messaging metadata. No provider credentials, message bodies or copied phone numbers.
CREATE TABLE reminder_preferences (
    user_id uuid PRIMARY KEY REFERENCES users(id),
    patient_link_id uuid NOT NULL REFERENCES patient_user_links(id),
    link_generation varchar(64) NOT NULL,
    phone_binding varchar(64),
    version bigint NOT NULL CHECK (version > 0),
    whatsapp_consent boolean NOT NULL DEFAULT false,
    sms_consent boolean NOT NULL DEFAULT false,
    preferred_channel varchar(10) NOT NULL CHECK (preferred_channel IN ('WHATSAPP','SMS')),
    sms_fallback boolean NOT NULL DEFAULT false,
    time_zone varchar(100),
    permitted_from time(0), permitted_until time(0), all_day boolean NOT NULL DEFAULT false,
    policy_version varchar(60) NOT NULL, updated_at timestamptz NOT NULL, last_planned_at timestamptz,
    CHECK (NOT sms_fallback OR (whatsapp_consent AND sms_consent AND preferred_channel='WHATSAPP')),
    CHECK (NOT (whatsapp_consent OR sms_consent) OR
        (phone_binding IS NOT NULL AND time_zone IS NOT NULL AND
        ((all_day AND permitted_from IS NULL AND permitted_until IS NULL) OR
         (NOT all_day AND permitted_from IS NOT NULL AND permitted_until IS NOT NULL AND permitted_from<>permitted_until))))
);
CREATE TABLE reminder_consent_events (
    id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES reminder_preferences(user_id),
    patient_link_id uuid NOT NULL REFERENCES patient_user_links(id), link_generation varchar(64) NOT NULL,
    phone_binding varchar(64), channel varchar(10) NOT NULL CHECK (channel IN ('WHATSAPP','SMS')),
    action varchar(12) NOT NULL CHECK (action IN ('GRANTED','WITHDRAWN')),
    purpose varchar(40) NOT NULL CHECK (purpose='MEDICATION_REMINDER'),
    policy_version varchar(60) NOT NULL, method varchar(30) NOT NULL CHECK (method='SELF_PORTAL'),
    actor_user_id uuid NOT NULL REFERENCES users(id), preferences_version bigint NOT NULL,
    recorded_at timestamptz NOT NULL, withdrawn_at timestamptz,
    CHECK (actor_user_id=user_id),
    CHECK ((action='WITHDRAWN')=(withdrawn_at IS NOT NULL))
);
CREATE FUNCTION reminder_consent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Reminder consent evidence is append-only'; END $$;
CREATE TRIGGER reminder_consent_no_rewrite BEFORE UPDATE OR DELETE ON reminder_consent_events
    FOR EACH ROW EXECUTE FUNCTION reminder_consent_immutable();
CREATE INDEX idx_reminder_consent_user ON reminder_consent_events(user_id,recorded_at);

ALTER TABLE medication_schedules ADD CONSTRAINT uq_reminder_schedule_treatment UNIQUE (id,treatment_id);
CREATE TABLE reminder_jobs (
    id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
    patient_link_id uuid NOT NULL REFERENCES patient_user_links(id), link_generation varchar(64) NOT NULL,
    phone_binding varchar(64) NOT NULL, preferences_version bigint NOT NULL,
    treatment_id uuid NOT NULL REFERENCES treatments(id), schedule_id uuid NOT NULL,
    revision_id uuid NOT NULL, occurrence_id varchar(200) NOT NULL,
    scheduled_at timestamptz NOT NULL, logical_key varchar(64) NOT NULL,
    idempotency_key uuid NOT NULL UNIQUE,
    channel varchar(10) NOT NULL CHECK (channel IN ('WHATSAPP','SMS')),
    state varchar(20) NOT NULL CHECK (state IN ('SCHEDULED','ELIGIBLE','SUPPRESSED','DISPATCHED','ACCEPTED','DELIVERED','FAILED','CANCELLED','UNCERTAIN')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
    next_attempt_at timestamptz NOT NULL, lease_token uuid, lease_until timestamptz,
    classification varchar(60), provider_correlation varchar(120),
    mode varchar(12) NOT NULL CHECK (mode IN ('DISABLED','SIMULATED')),
    created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    FOREIGN KEY (schedule_id,treatment_id) REFERENCES medication_schedules(id,treatment_id),
    FOREIGN KEY (schedule_id,revision_id) REFERENCES medication_schedule_revisions(schedule_id,id),
    UNIQUE (schedule_id,scheduled_at,user_id,preferences_version),
    CHECK ((state IN ('ELIGIBLE','DISPATCHED'))=(lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
-- One logical expectation can have superseded enrollment jobs, but never two
-- accepted or uncertain handoffs. Revision IDs deliberately do not define this key.
CREATE UNIQUE INDEX uq_reminder_one_handoff ON reminder_jobs(logical_key)
    WHERE state IN ('DISPATCHED','ACCEPTED','DELIVERED','UNCERTAIN');
CREATE INDEX idx_reminder_due ON reminder_jobs(next_attempt_at,id) WHERE state='SCHEDULED';
CREATE INDEX idx_reminder_lease ON reminder_jobs(lease_until) WHERE state IN ('ELIGIBLE','DISPATCHED');
CREATE INDEX idx_reminder_history ON reminder_jobs(user_id,link_generation,scheduled_at DESC,id);
CREATE TABLE reminder_attempts (
    id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES reminder_jobs(id), attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
    lease_token uuid NOT NULL, channel varchar(10) NOT NULL CHECK (channel IN ('WHATSAPP','SMS')),
    outcome varchar(30) NOT NULL CHECK (outcome IN ('PENDING','ACCEPTED','SAFE_RETRY','SAFE_FALLBACK','FAILED','UNCERTAIN')),
    mode varchar(12) NOT NULL CHECK (mode IN ('DISABLED','SIMULATED')),
    started_at timestamptz NOT NULL, finished_at timestamptz, provider_correlation varchar(120),
    UNIQUE(job_id,attempt_number), CHECK ((outcome='PENDING')=(finished_at IS NULL))
);
