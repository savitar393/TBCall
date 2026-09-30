-- TBCall account ownership and staff-assisted linking; no SITB identifiers.
CREATE UNIQUE INDEX uq_patient_verified_self
    ON patient_user_links(patient_id)
    WHERE relationship_type = 'SELF' AND verification_status = 'VERIFIED';
CREATE UNIQUE INDEX uq_user_verified_self
    ON patient_user_links(user_id)
    WHERE relationship_type = 'SELF' AND verification_status = 'VERIFIED';
CREATE INDEX idx_patient_user_links_user_verification
    ON patient_user_links(user_id, verification_status);
CREATE INDEX idx_active_supporters_linked_user
    ON patient_supporters(linked_user_id)
    WHERE active = true AND linked_user_id IS NOT NULL;

INSERT INTO permissions(code, name) VALUES
    ('PATIENT_LINK_VERIFY', 'Memverifikasi tautan akun pasien'),
    ('SUPPORTER_LINK_MANAGE', 'Mengelola tautan akun pendamping');
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'TB_OFFICER' AND p.code IN ('PATIENT_LINK_VERIFY', 'SUPPORTER_LINK_MANAGE');
