-- Phase 4C.1: restore non-TPT patient requirements after V15 relaxed the column.
-- Existing V6 and V15 lineage functions/triggers remain unchanged.
ALTER TABLE alerts
    ADD CONSTRAINT chk_alert_patient_required_except_tpt
        CHECK (
            patient_id IS NOT NULL
            OR preventive_treatment_id IS NOT NULL
        ),
    ADD CONSTRAINT chk_alert_contact_requires_tpt
        CHECK (
            contact_id IS NULL
            OR preventive_treatment_id IS NOT NULL
        );
