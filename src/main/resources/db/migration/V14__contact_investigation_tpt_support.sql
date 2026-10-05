-- Approved contact-driven workflow support. Earlier migrations remain immutable.
ALTER TABLE contact_investigations
    ADD COLUMN active_tb_excluded boolean,
    ADD COLUMN tpt_eligible boolean,
    ADD COLUMN eligibility_assessed_at timestamptz,
    ADD CONSTRAINT chk_contact_investigation_eligibility
        CHECK (tpt_eligible IS NOT TRUE OR active_tb_excluded IS TRUE);

CREATE UNIQUE INDEX uq_contact_investigation_one_open
    ON contact_investigations(contact_id)
    WHERE status IN ('NEW','SENT','RECEIVED','IN_PROGRESS');
CREATE INDEX idx_contact_investigation_source_status
    ON contact_investigations(source_facility_id, status, requested_at DESC);

ALTER TABLE preventive_treatments
    ADD COLUMN regimen_description text,
    ADD COLUMN closure_reason text;
CREATE UNIQUE INDEX uq_preventive_treatment_open_contact
    ON preventive_treatments(contact_id)
    WHERE contact_id IS NOT NULL AND status IN ('PLANNED','ACTIVE');

-- TBCall canonical concepts, not official SITB identifiers or prescribing rules.
-- Eligibility/dose selection follows current national guidance and clinician assessment.
INSERT INTO regimens(code,name,regimen_kind,tb_case_category_code,description) VALUES
    ('TPT_SO_6H','TPT 6H','PREVENTIVE','TB_SO','TBCall canonical concept. Eligibility/dose selection follows current national guidance and clinician assessment.'),
    ('TPT_SO_3HP','TPT 3HP','PREVENTIVE','TB_SO','TBCall canonical concept. Eligibility/dose selection follows current national guidance and clinician assessment.'),
    ('TPT_SO_3HR','TPT 3HR','PREVENTIVE','TB_SO','TBCall canonical concept. Eligibility/dose selection follows current national guidance and clinician assessment.'),
    ('TPT_SO_4R','TPT 4R','PREVENTIVE','TB_SO','TBCall canonical concept. Eligibility/dose selection follows current national guidance and clinician assessment.'),
    ('TPT_SO_1HP','TPT 1HP','PREVENTIVE','TB_SO','TBCall canonical concept. Eligibility/dose selection follows current national guidance and clinician assessment.'),
    ('TPT_RO_6LFX','TPT RO 6Lfx','PREVENTIVE','TB_RO','TBCall canonical concept. Eligibility/dose selection follows current national guidance and clinician assessment. Use an individualized regimen_description when this concept is inappropriate.');
-- No fixed regimen_drugs, dosing rules or inferred durations.
