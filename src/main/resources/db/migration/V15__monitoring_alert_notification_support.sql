-- TBCall-owned operational reminders. These are not SITB identifiers or clinical rules.
ALTER TABLE monitoring_plans
    ALTER COLUMN treatment_id DROP NOT NULL,
    ADD COLUMN preventive_treatment_id uuid REFERENCES preventive_treatments(id) ON DELETE CASCADE,
    ADD CONSTRAINT chk_monitoring_plan_exact_target CHECK (num_nonnulls(treatment_id, preventive_treatment_id) = 1);

-- Reuse V1 uq_monitoring_plan_active_treatment unchanged.
CREATE UNIQUE INDEX uq_monitoring_plan_active_tpt ON monitoring_plans(preventive_treatment_id)
    WHERE preventive_treatment_id IS NOT NULL AND status = 'ACTIVE';
CREATE INDEX idx_monitoring_events_schedule ON monitoring_events(status, scheduled_at)
    WHERE status IN ('SCHEDULED','DUE');

ALTER TABLE alerts
    ALTER COLUMN patient_id DROP NOT NULL,
    ADD COLUMN contact_id uuid REFERENCES contacts(id),
    ADD COLUMN preventive_treatment_id uuid REFERENCES preventive_treatments(id),
    ADD CONSTRAINT chk_alert_treatment_target_exclusive
        CHECK (NOT (treatment_id IS NOT NULL AND preventive_treatment_id IS NOT NULL));
CREATE INDEX idx_alerts_contact_status ON alerts(contact_id, status, triggered_at DESC) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_alerts_tpt_status ON alerts(preventive_treatment_id, status, triggered_at DESC) WHERE preventive_treatment_id IS NOT NULL;
CREATE UNIQUE INDEX uq_alert_monitoring_event ON alerts(monitoring_event_id) WHERE monitoring_event_id IS NOT NULL;

CREATE TABLE alert_acknowledgements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    acknowledged_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(alert_id, user_id)
);
CREATE UNIQUE INDEX uq_notifications_alert_user_channel ON notifications(alert_id, user_id, channel) WHERE alert_id IS NOT NULL;

-- Additional checks; V6 validate_alert_lineage/trg_alert_lineage are retained verbatim.
CREATE FUNCTION validate_monitoring_alert_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_treatment uuid; plan_tpt uuid; target_case uuid; target_patient uuid;
        target_contact uuid; linked_patient uuid;
BEGIN
    IF NEW.monitoring_event_id IS NOT NULL THEN
        SELECT p.treatment_id,p.preventive_treatment_id INTO plan_treatment,plan_tpt
        FROM monitoring_events e JOIN monitoring_plans p ON p.id=e.monitoring_plan_id
        WHERE e.id=NEW.monitoring_event_id;
        IF plan_treatment IS NOT NULL THEN
            SELECT t.case_id,r.patient_id INTO target_case,target_patient FROM treatments t
            JOIN tb_cases c ON c.id=t.case_id JOIN tb_registrations r ON r.id=c.registration_id
            WHERE t.id=plan_treatment;
            IF NEW.treatment_id IS DISTINCT FROM plan_treatment OR NEW.case_id IS DISTINCT FROM target_case
               OR NEW.patient_id IS DISTINCT FROM target_patient OR NEW.preventive_treatment_id IS NOT NULL
               OR NEW.contact_id IS NOT NULL THEN
                RAISE EXCEPTION 'Monitoring alert treatment lineage is invalid.' USING ERRCODE='23514', CONSTRAINT='chk_monitoring_alert_lineage';
            END IF;
        ELSIF plan_tpt IS NOT NULL THEN
            IF NEW.preventive_treatment_id IS DISTINCT FROM plan_tpt THEN
                RAISE EXCEPTION 'Monitoring alert TPT target is invalid.' USING ERRCODE='23514', CONSTRAINT='chk_monitoring_alert_lineage';
            END IF;
        END IF;
    END IF;
    IF NEW.preventive_treatment_id IS NOT NULL THEN
        SELECT t.contact_id,t.patient_id,c.linked_patient_id INTO target_contact,target_patient,linked_patient
        FROM preventive_treatments t LEFT JOIN contacts c ON c.id=t.contact_id
        WHERE t.id=NEW.preventive_treatment_id;
        IF NEW.treatment_id IS NOT NULL OR NEW.case_id IS NOT NULL OR NEW.contact_id IS DISTINCT FROM target_contact
           OR (NEW.patient_id IS NOT NULL AND NEW.patient_id IS DISTINCT FROM target_patient AND NEW.patient_id IS DISTINCT FROM linked_patient) THEN
            RAISE EXCEPTION 'Alert TPT lineage is invalid.' USING ERRCODE='23514', CONSTRAINT='chk_monitoring_alert_lineage';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_monitoring_alert_lineage
    BEFORE INSERT OR UPDATE OF monitoring_event_id, patient_id, case_id, treatment_id, contact_id, preventive_treatment_id ON alerts
    FOR EACH ROW EXECUTE FUNCTION validate_monitoring_alert_lineage();
