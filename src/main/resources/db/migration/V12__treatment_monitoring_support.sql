-- Phase 3B, schema-reconciled v1.3B.1; verified clean PostgreSQL V1–V11 constraint names.
-- Reuse V1 uq_treatments_one_open_per_case unchanged: PLANNED/ACTIVE/PAUSED are open.
-- All codes are TBCall canonical values, not official SITB physical schema/API values.

ALTER TABLE follow_ups
    ADD COLUMN weight_kg numeric(6,2),
    ADD COLUMN symptom_summary text,
    ADD COLUMN adherence_assessment varchar(80),
    ADD CONSTRAINT chk_follow_up_weight CHECK (weight_kg IS NULL OR weight_kg > 0);

ALTER TABLE dose_events DROP CONSTRAINT dose_events_treatment_id_scheduled_date_key;

CREATE UNIQUE INDEX uq_dose_events_actor_day
    ON dose_events(treatment_id, scheduled_date, recorded_by_user_id)
    WHERE recorded_by_user_id IS NOT NULL;

ALTER TABLE dose_events DROP CONSTRAINT dose_events_source_check;
ALTER TABLE dose_events ADD CONSTRAINT chk_dose_event_source CHECK (
    source IN ('SITB', 'PATIENT', 'HEALTH_WORKER', 'TREATMENT_SUPPORTER', 'TBCALL', 'IMPORT')
);
-- V1 status and administration-mode CHECKs remain unchanged.
