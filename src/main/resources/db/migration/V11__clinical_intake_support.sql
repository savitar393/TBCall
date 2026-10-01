-- TBCall canonical permission; no claim about SITB physical schema/API identifiers.
INSERT INTO permissions(code,name) VALUES
    ('PATIENT_IDENTITY_RESOLVE','Mencocokkan identitas pasien untuk registrasi');
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='TB_OFFICER' AND p.code='PATIENT_IDENTITY_RESOLVE';

CREATE INDEX idx_patients_other_identity
    ON patients(other_identity_number)
    WHERE other_identity_number IS NOT NULL;
