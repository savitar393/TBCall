# TBCall Application/API v1.1 — Administrative Provisioning & Identity Recovery

Status: approved Phase 1.1 architecture checkpoint after commit `47463847d020d0a77ca22ec87e882dda3e050aef`.

This checkpoint closes the operational identity gap before clinical Phase 2.

The 2021 SITB technical manual is used only as workflow evidence here: SITB account creation is administrator-controlled, higher administrative levels create lower-level administrators, and operational users are separated by organizational level/fasyankes/laboratory responsibility. TBCall does not copy SITB's account model one-for-one because TBCall also supports patient self-registration.

## 1. Goals

Phase 1.1 must make the prototype operable without direct SQL/test fixtures:

1. Provision facilities.
2. Find already-registered verified application users through controlled administrative lookup.
3. Assign/remove global operational roles.
4. Assign/deactivate users at facilities.
5. Manage global account status.
6. Add verification resend and password reset.
7. Split identity-link scope from future clinical-record scope so Phase 2 cannot accidentally reuse historical facility association as blanket clinical access.
8. Preserve all Phase 1 security/session behavior.

No clinical patient CRUD is implemented in this checkpoint.

## 2. Existing model decision: global roles + facility assignments

Do not introduce facility-scoped role tables in Phase 1.1.

The current model remains:

`effective facility capability = global operational role + active user_facilities assignment`

Examples:
- TB_OFFICER + Facility A/B assignments => TB officer scope at A and B.
- LAB_STAFF + Facility B => laboratory scope at B.
- FACILITY_ADMIN + Facility A => facility administration scope at A.

This limitation is explicit: the same user's operational role currently applies to all of their active facility assignments. If future production requirements need different roles per facility, implement that through a separately reviewed additive schema migration rather than silently changing V10.

## 3. V10 migration

Create `V10__administrative_identity_support.sql`.

Do not edit V1–V9.

### 3.1 New permission

Add `USER_ACCOUNT_MANAGE` — `Mengelola status akun pengguna`.

Grant only to `SYSTEM_ADMIN`.

Existing permissions are reused: `ROLE_MANAGE`, `USER_MANAGE_FACILITY`, `FACILITY_MANAGE`.

### 3.2 Token lookup index

Add an index on `user_verification_tokens(user_id, purpose, used_at, expires_at)`.

Do not add new token tables.

## 4. Administrative authorization

### SYSTEM_ADMIN

May create/update/deactivate facility master records; exact user lookup; assign/remove admin-managed global roles; assign/deactivate facility memberships anywhere; suspend/reactivate/disable global accounts. This does not grant clinical record scope.

### FACILITY_ADMIN

May perform exact user lookup for staff onboarding and assign/reactivate/deactivate `user_facilities` only for facilities in the caller's own active scope.

May not assign/remove global roles, create/deactivate facility master records, suspend/disable global accounts, or access clinical data.

### Admin-managed vs workflow-managed roles

Admin-managed:
- SYSTEM_ADMIN
- PROGRAM_MONITOR
- TB_OFFICER
- LAB_STAFF
- FACILITY_ADMIN

Workflow-managed:
- PATIENT
- TREATMENT_SUPPORTER

Administrative endpoints must reject manual mutation of workflow-managed roles.

Only SYSTEM_ADMIN + ROLE_MANAGE may mutate admin-managed roles.

Facility-scoped operational roles require at least one active facility assignment before assignment succeeds.

Removing the last facility assignment does not silently remove a global role; without facility scope the role is inert.

At least one SYSTEM_ADMIN assignment must always remain.

## 5. Facility administration

### Create
`POST /api/v1/admin/facilities`

SYSTEM_ADMIN only. Input may include facilityTypeCode, parentFacilityId, name, address, administrative region codes, postalCode, latitude and longitude. Do not expose arbitrary active/createdAt/updatedAt input.

### Update
`PATCH /api/v1/admin/facilities/{facilityId}`

SYSTEM_ADMIN only. Requires `If-Match`. Explicit master-data fields only.

### Deactivate
`POST /api/v1/admin/facilities/{facilityId}/deactivate`

SYSTEM_ADMIN only. Requires `If-Match`. Reject while active user assignments remain. No hard delete and no cascade-disable of users.

## 6. Administrative user lookup

`GET /api/v1/admin/users/lookup?identity=...`

Allowed:
- SYSTEM_ADMIN with user-management permission;
- FACILITY_ADMIN with USER_MANAGE_FACILITY.

Rules:
- exact normalized email or phone only;
- no fuzzy search, NIK/BPJS lookup, patient lookup, or directory listing;
- target identity must be verified;
- audit successful lookup as `ADMIN_USER_LOOKUP`.

Return a minimal DTO: userId, appropriately masked identity information, account status, verification flags, admin-managed roles, active facility assignments.

FACILITY_ADMIN responses must not reveal unrelated facility assignments; `hasOtherFacilityAssignments` is sufficient.

Never return password hashes, tokens/sessions, patient SELF links, supporter cases, or clinical data.

## 7. Facility assignment management

### Add/reactivate
`POST /api/v1/admin/facilities/{facilityId}/users/{userId}`

Body: `{ "primary": false }`.

- SYSTEM_ADMIN may manage any active facility.
- FACILITY_ADMIN may manage only own active facility.
- target user must be ACTIVE with a verified login identity.
- create/reactivate existing user_facilities row.
- if primary=true, clear prior primary assignment transactionally.
- lock target user while changing assignment.
- audit `FACILITY_USER_ASSIGNED`; audit `PRIMARY_FACILITY_CHANGED` when relevant.

### Deactivate
`DELETE /api/v1/admin/facilities/{facilityId}/users/{userId}`

- set active=false and isPrimary=false; do not delete.
- FACILITY_ADMIN may not remove their own last active facility assignment.
- audit `FACILITY_USER_REMOVED`.

`user_facilities` remains non-versioned. Use narrow pessimistic locking plus existing constraints.

## 8. Global role administration

Endpoints:
- `POST /api/v1/admin/users/{userId}/roles/{roleCode}`
- `DELETE /api/v1/admin/users/{userId}/roles/{roleCode}`

Authorization: SYSTEM_ADMIN + ROLE_MANAGE.

Rules:
- target ACTIVE with verified login identity;
- admin-managed roles only;
- facility-scoped operational roles require at least one active facility assignment;
- assignment/removal idempotent;
- last SYSTEM_ADMIN cannot be removed;
- audit `ROLE_ASSIGNED` / `ROLE_REMOVED`.

Do not expose generic permission-grant endpoints.

## 9. Global account status

SYSTEM_ADMIN + USER_ACCOUNT_MANAGE:
- `POST /api/v1/admin/users/{userId}/suspend`
- `POST /api/v1/admin/users/{userId}/reactivate`
- `POST /api/v1/admin/users/{userId}/disable`

All require If-Match against User.version.

Transitions:
- ACTIVE -> SUSPENDED
- SUSPENDED -> ACTIVE
- ACTIVE|SUSPENDED -> DISABLED

PENDING activates only through verification. DISABLED is terminal in v1.1.

Suspension/disable revokes all active sessions. Reactivation requires a verified login identity.

Never leave zero usable SYSTEM_ADMIN accounts.

Audit `USER_SUSPENDED`, `USER_REACTIVATED`, `USER_DISABLED`.

## 10. Verification resend

`POST /api/v1/auth/verification/resend`

Request: `{ "identity": "email-or-phone" }`.

- generic response to prevent account enumeration;
- only a PENDING/ACTIVE account with that identity still unverified receives a token;
- invalidate older unused tokens of the same purpose atomically;
- use email vs phone verification purpose correctly;
- audit `VERIFICATION_RESENT` only when a token is really issued;
- never expose production secret in response/log/audit.

Delivery availability must be checked before identity-specific behavior. When unavailable, return the same 503 for all identities.

## 11. Password reset

### Request
`POST /api/v1/auth/password-reset/request`

Request: `{ "identity": "email-or-phone" }`.

When delivery is available, respond generic `202 Accepted` regardless of account existence.

Only ACTIVE accounts with that login identity verified receive a token. Invalidate older unused PASSWORD_RESET tokens before issuing a new one. Audit `PASSWORD_RESET_REQUESTED` only for a real account, without identity/token metadata.

When delivery is unavailable, return generic 503 before identity lookup.

### Confirm
`POST /api/v1/auth/password-reset/confirm`

Input: token + newPassword.

- 12–128 characters;
- atomically lock/consume PASSWORD_RESET token;
- reject expired/used/wrong-purpose token;
- hash with current PasswordHasher;
- revoke all existing sessions;
- audit `PASSWORD_RESET_COMPLETED`;
- return 204.

Never log/audit raw password or token.

## 12. Delivery availability

Extend `VerificationDeliveryPort` with a non-secret availability contract such as `boolean isAvailable()`.

The default unavailable production adapter must report unavailable. Dev/test token exposure remains constrained by existing non-production checks.

Registration, resend and password-reset must fail with the same `503 VERIFICATION_DELIVERY_UNAVAILABLE` before account-specific behavior when no adapter is configured.

Do not implement a fake production provider.

## 13. Scope split before Phase 2

The current historical facility association used for account-link verification must not become Phase 2's general clinical authorization rule.

Refactor naming explicitly.

### Identity-link scope

`requireOfficerPatientLinkScope(...)`

May continue Phase 1 behavior for staff-assisted identity verification. Used only for account linking.

### Future clinical patient scope

`requireOfficerClinicalPatientScope(...)`

Patient is clinically in scope when at least one is true:
- OPEN or DIAGNOSED TBRegistration belongs to an active assigned facility;
- TBCase with status ACTIVE or REFERRED has currentFacility in an active assigned facility.

Completed/closed/cancelled/transferred historical association alone must not grant blanket patient scope.

Implement/test this policy now but expose no clinical endpoint yet.

Future services must also perform resource-level checks; current patient scope must not authorize all historical resources.

## 14. Security retained

Preserve opaque sessions, CSRF, explicit CORS, current DB scope resolution, no JWT, no raw secrets, Indonesian problem+json, correlation IDs, READ_COMMITTED, If-Match/409/428, and no silent retry.

Internet-facing production deployment requires edge/distributed rate limiting. Do not invent an unreviewed client-IP trust model in this checkpoint.

## 15. Tests

At minimum verify:
- V1–V10 migration and Hibernate validate;
- USER_ACCOUNT_MANAGE only for SYSTEM_ADMIN;
- facility create/update/deactivate with If-Match;
- active-assignment facility deactivation rejected;
- exact administrative lookup only;
- non-admin denied;
- FACILITY_ADMIN lookup does not leak unrelated assignments;
- SYSTEM_ADMIN can manage facility assignments anywhere;
- FACILITY_ADMIN only within own facility;
- FACILITY_ADMIN cannot remove own last assignment;
- primary assignment uniqueness;
- global roles only SYSTEM_ADMIN;
- PATIENT/TREATMENT_SUPPORTER manual mutation rejected;
- operational role requires active facility assignment;
- last SYSTEM_ADMIN protection;
- suspend/reactivate/disable transitions and session revocation;
- resend non-enumeration and old-token invalidation;
- password-reset request non-enumeration;
- reset token expiry/one-time/wrong-purpose;
- reset revokes all sessions;
- delivery-unavailable result is identity-independent;
- current patient-link flow still works;
- identity-link and future clinical patient scopes differ;
- historical-only episode does not satisfy clinical patient scope;
- all previous tests remain green.

## 16. Documentation

Add `docs/ADMINISTRATION.md` and `docs/ACCOUNT_RECOVERY.md`.

Update README, SECURITY, AUTHORIZATION and architecture docs as needed.

Document that SITB's administrator-controlled user workflow informed TBCall operational provisioning, while TBCall intentionally retains self-registration and does not duplicate SITB's user/group schema.
