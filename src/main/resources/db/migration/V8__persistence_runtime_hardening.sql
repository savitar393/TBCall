-- Runtime Persistence v1.2. Hibernate owns optimistic version increments.
-- These are TBCall identifiers and wording, not SITB API/database values.
UPDATE drug_resistance_patterns
SET description = 'TBC Sensitif Obat sesuai klasifikasi program; interpretasi rinci mengikuti hasil uji kepekaan dan pedoman nasional.'
WHERE code = 'TB_SO';

ALTER TABLE facilities ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE patients ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE patient_user_links ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE tb_registrations ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE diagnoses ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE tb_cases ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE lab_requests ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE lab_request_tests ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE lab_specimens ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE lab_results ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE treatments ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE treatment_drugs ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE dose_events ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE follow_ups ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE treatment_outcomes ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE patient_supporters ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE referrals ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE contact_investigations ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE preventive_treatments ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE adverse_events ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE monitoring_plans ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE monitoring_events ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE alerts ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN version bigint NOT NULL DEFAULT 0;
