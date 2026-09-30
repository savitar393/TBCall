-- Cross-row integrity only; no clinical interpretation or workflow automation.
ALTER TABLE diagnoses ADD CONSTRAINT uq_diagnoses_id_registration UNIQUE (id, registration_id);
ALTER TABLE tb_cases ADD CONSTRAINT fk_tb_cases_confirming_diagnosis_registration
    FOREIGN KEY (confirming_diagnosis_id, registration_id) REFERENCES diagnoses(id, registration_id);

-- Fail the migration if existing data need reconciliation. Never silently repair lineage.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM lab_results r JOIN lab_request_tests t ON t.id=r.lab_request_test_id
               JOIN lab_specimens s ON s.id=r.specimen_id WHERE s.lab_request_id<>t.lab_request_id) THEN
        RAISE EXCEPTION 'Data hasil laboratorium lama memiliki spesimen dari permintaan yang berbeda.' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM referrals r JOIN treatments t ON t.id=r.treatment_id WHERE r.case_id<>t.case_id) THEN
        RAISE EXCEPTION 'Data rujukan lama memiliki pengobatan dari kasus yang berbeda.' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM preventive_treatments p JOIN contacts c ON c.id=p.contact_id
               WHERE p.index_case_id<>c.index_case_id) THEN
        RAISE EXCEPTION 'Data TPT lama memiliki kasus indeks yang berbeda dari kontak.' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM alerts a JOIN tb_cases c ON c.id=a.case_id
               JOIN tb_registrations r ON r.id=c.registration_id WHERE a.patient_id<>r.patient_id)
       OR EXISTS (SELECT 1 FROM alerts a JOIN treatments t ON t.id=a.treatment_id
                  JOIN tb_cases c ON c.id=t.case_id JOIN tb_registrations r ON r.id=c.registration_id
                  WHERE a.patient_id<>r.patient_id OR (a.case_id IS NOT NULL AND a.case_id<>t.case_id)) THEN
        RAISE EXCEPTION 'Data peringatan lama memiliki hubungan pasien/kasus/pengobatan yang tidak sesuai.' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM treatment_outcomes o JOIN treatments t ON t.id=o.treatment_id
               WHERE o.outcome_date<t.start_date) THEN
        RAISE EXCEPTION 'Data hasil akhir lama memiliki tanggal sebelum mulai pengobatan.' USING ERRCODE='23514';
    END IF;
END;
$$;

CREATE FUNCTION validate_lab_result_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE test_request uuid; specimen_request uuid;
BEGIN
    IF NEW.specimen_id IS NOT NULL THEN
        SELECT lab_request_id INTO test_request FROM lab_request_tests WHERE id=NEW.lab_request_test_id FOR SHARE;
        SELECT lab_request_id INTO specimen_request FROM lab_specimens WHERE id=NEW.specimen_id FOR SHARE;
        IF test_request<>specimen_request THEN
            RAISE EXCEPTION 'Spesimen dan pemeriksaan harus berasal dari permintaan laboratorium yang sama.'
                USING ERRCODE='23514', CONSTRAINT='chk_lab_result_lineage';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_lab_result_lineage BEFORE INSERT OR UPDATE OF lab_request_test_id, specimen_id ON lab_results
    FOR EACH ROW EXECUTE FUNCTION validate_lab_result_lineage();

CREATE FUNCTION guard_lab_parent_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='lab_specimens' THEN
        IF EXISTS (SELECT 1 FROM lab_results r JOIN lab_request_tests t ON t.id=r.lab_request_test_id
                   WHERE r.specimen_id=OLD.id AND t.lab_request_id<>NEW.lab_request_id) THEN
            RAISE EXCEPTION 'Perubahan permintaan spesimen akan memutus hubungan hasil laboratorium.' USING ERRCODE='23514';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM lab_results r JOIN lab_specimens s ON s.id=r.specimen_id
                   WHERE r.lab_request_test_id=OLD.id AND s.lab_request_id<>NEW.lab_request_id) THEN
            RAISE EXCEPTION 'Perubahan permintaan pemeriksaan akan memutus hubungan hasil laboratorium.' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_lab_specimen_lineage BEFORE UPDATE OF lab_request_id ON lab_specimens
    FOR EACH ROW EXECUTE FUNCTION guard_lab_parent_lineage();
CREATE TRIGGER trg_lab_request_test_lineage BEFORE UPDATE OF lab_request_id ON lab_request_tests
    FOR EACH ROW EXECUTE FUNCTION guard_lab_parent_lineage();

CREATE FUNCTION validate_referral_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE treatment_case uuid;
BEGIN
    IF NEW.treatment_id IS NOT NULL THEN
        SELECT case_id INTO treatment_case FROM treatments WHERE id=NEW.treatment_id FOR SHARE;
        IF treatment_case<>NEW.case_id THEN
            RAISE EXCEPTION 'Pengobatan rujukan harus berasal dari kasus yang sama.'
                USING ERRCODE='23514', CONSTRAINT='chk_referral_lineage';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_referral_lineage BEFORE INSERT OR UPDATE OF treatment_id, case_id ON referrals
    FOR EACH ROW EXECUTE FUNCTION validate_referral_lineage();

CREATE FUNCTION validate_preventive_treatment_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE contact_case uuid;
BEGIN
    IF NEW.contact_id IS NOT NULL AND NEW.index_case_id IS NOT NULL THEN
        SELECT index_case_id INTO contact_case FROM contacts WHERE id=NEW.contact_id FOR SHARE;
        IF contact_case<>NEW.index_case_id THEN
            RAISE EXCEPTION 'Kasus indeks TPT harus sesuai dengan kasus indeks kontak.'
                USING ERRCODE='23514', CONSTRAINT='chk_preventive_treatment_lineage';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_preventive_treatment_lineage BEFORE INSERT OR UPDATE OF contact_id, index_case_id ON preventive_treatments
    FOR EACH ROW EXECUTE FUNCTION validate_preventive_treatment_lineage();

CREATE FUNCTION guard_contact_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM preventive_treatments WHERE contact_id=OLD.id AND index_case_id<>NEW.index_case_id) THEN
        RAISE EXCEPTION 'Perubahan kasus indeks kontak akan memutus hubungan TPT.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_contact_lineage BEFORE UPDATE OF index_case_id ON contacts
    FOR EACH ROW EXECUTE FUNCTION guard_contact_lineage();

CREATE FUNCTION validate_alert_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE case_patient uuid; treatment_case uuid; treatment_patient uuid;
BEGIN
    IF NEW.case_id IS NOT NULL THEN
        SELECT r.patient_id INTO case_patient FROM tb_cases c JOIN tb_registrations r ON r.id=c.registration_id
        WHERE c.id=NEW.case_id FOR SHARE OF c,r;
        IF case_patient<>NEW.patient_id THEN
            RAISE EXCEPTION 'Kasus peringatan harus berasal dari pasien yang sama.'
                USING ERRCODE='23514', CONSTRAINT='chk_alert_lineage';
        END IF;
    END IF;
    IF NEW.treatment_id IS NOT NULL THEN
        SELECT t.case_id,r.patient_id INTO treatment_case,treatment_patient FROM treatments t
        JOIN tb_cases c ON c.id=t.case_id JOIN tb_registrations r ON r.id=c.registration_id
        WHERE t.id=NEW.treatment_id FOR SHARE OF t,c,r;
        IF treatment_patient<>NEW.patient_id OR (NEW.case_id IS NOT NULL AND treatment_case<>NEW.case_id) THEN
            RAISE EXCEPTION 'Pengobatan peringatan harus sesuai dengan pasien dan kasus yang diberikan.'
                USING ERRCODE='23514', CONSTRAINT='chk_alert_lineage';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_alert_lineage BEFORE INSERT OR UPDATE OF patient_id, case_id, treatment_id ON alerts
    FOR EACH ROW EXECUTE FUNCTION validate_alert_lineage();

CREATE FUNCTION guard_case_alert_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE new_patient uuid;
BEGIN
    SELECT patient_id INTO new_patient FROM tb_registrations WHERE id=NEW.registration_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM alerts a WHERE a.patient_id<>new_patient AND
               (a.case_id=OLD.id OR a.treatment_id IN (SELECT id FROM treatments WHERE case_id=OLD.id))) THEN
        RAISE EXCEPTION 'Perubahan registrasi kasus akan memutus hubungan pasien pada peringatan.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_case_alert_lineage BEFORE UPDATE OF registration_id ON tb_cases
    FOR EACH ROW EXECUTE FUNCTION guard_case_alert_lineage();

CREATE FUNCTION guard_registration_alert_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM alerts a WHERE a.patient_id<>NEW.patient_id AND
               (a.case_id IN (SELECT id FROM tb_cases WHERE registration_id=OLD.id)
                OR a.treatment_id IN (SELECT t.id FROM treatments t JOIN tb_cases c ON c.id=t.case_id WHERE c.registration_id=OLD.id))) THEN
        RAISE EXCEPTION 'Perubahan pasien registrasi akan memutus hubungan peringatan.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_registration_alert_lineage BEFORE UPDATE OF patient_id ON tb_registrations
    FOR EACH ROW EXECUTE FUNCTION guard_registration_alert_lineage();

CREATE FUNCTION validate_treatment_outcome_date() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE treatment_start date;
BEGIN
    SELECT start_date INTO treatment_start FROM treatments WHERE id=NEW.treatment_id FOR SHARE;
    IF NEW.outcome_date<treatment_start THEN
        RAISE EXCEPTION 'Tanggal hasil akhir tidak boleh sebelum tanggal mulai pengobatan.'
            USING ERRCODE='23514', CONSTRAINT='chk_treatment_outcome_date';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_treatment_outcome_date BEFORE INSERT OR UPDATE OF treatment_id, outcome_date ON treatment_outcomes
    FOR EACH ROW EXECUTE FUNCTION validate_treatment_outcome_date();

CREATE FUNCTION guard_treatment_dependents() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE new_patient uuid;
BEGIN
    IF NEW.case_id IS DISTINCT FROM OLD.case_id THEN
        IF EXISTS (SELECT 1 FROM referrals WHERE treatment_id=OLD.id AND case_id<>NEW.case_id) THEN
            RAISE EXCEPTION 'Perubahan kasus pengobatan akan memutus hubungan rujukan.' USING ERRCODE='23514';
        END IF;
        SELECT r.patient_id INTO new_patient FROM tb_cases c JOIN tb_registrations r ON r.id=c.registration_id
        WHERE c.id=NEW.case_id FOR SHARE OF c,r;
        IF EXISTS (SELECT 1 FROM alerts WHERE treatment_id=OLD.id
                   AND (patient_id<>new_patient OR (case_id IS NOT NULL AND case_id<>NEW.case_id))) THEN
            RAISE EXCEPTION 'Perubahan kasus pengobatan akan memutus hubungan peringatan.' USING ERRCODE='23514';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM treatment_outcomes WHERE treatment_id=OLD.id AND outcome_date<NEW.start_date) THEN
        RAISE EXCEPTION 'Tanggal mulai pengobatan tidak boleh setelah tanggal hasil akhir.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_treatment_dependents BEFORE UPDATE OF case_id, start_date ON treatments
    FOR EACH ROW EXECUTE FUNCTION guard_treatment_dependents();

-- Index trigger lookup paths that are not already covered by V1 indexes.
CREATE INDEX idx_lab_results_specimen ON lab_results(specimen_id) WHERE specimen_id IS NOT NULL;
CREATE INDEX idx_referrals_treatment ON referrals(treatment_id) WHERE treatment_id IS NOT NULL;
CREATE INDEX idx_alerts_case ON alerts(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX idx_alerts_treatment ON alerts(treatment_id) WHERE treatment_id IS NOT NULL;
