-- Administrative account lifecycle remains TBCall-owned.
INSERT INTO permissions(code, name) VALUES
    ('USER_ACCOUNT_MANAGE', 'Mengelola status akun pengguna');
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='SYSTEM_ADMIN' AND p.code='USER_ACCOUNT_MANAGE';

CREATE INDEX idx_user_verification_tokens_identity_purpose
    ON user_verification_tokens(user_id, purpose, used_at, expires_at);
