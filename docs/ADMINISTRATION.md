# Administrative provisioning — Phase 1.1

The [approved v1.1 architecture](architecture/TBCall_Application_API_v1.1_Admin_Recovery.md) retains global roles plus active facility assignments. SITB's administrator-controlled operational workflow informed provisioning; TBCall keeps self-registration and does not claim to reproduce SITB's physical user/group schema or API.

## Endpoints and authorization

Every mutation requires an authenticated opaque session and CSRF. Permissions and active facility scope are resolved from PostgreSQL on each request. Administrative roles grant no clinical bypass.

| Method / path under `/api/v1/admin` | Required authority | Result |
|---|---|---|
| POST `/facilities` | SYSTEM_ADMIN + FACILITY_MANAGE | 201, facility DTO + ETag |
| PATCH `/facilities/{facilityId}` | SYSTEM_ADMIN + FACILITY_MANAGE, If-Match | 200, facility DTO + ETag |
| POST `/facilities/{facilityId}/deactivate` | SYSTEM_ADMIN + FACILITY_MANAGE, If-Match | 200, soft deactivation |
| GET `/users/lookup?identity=...` | SYSTEM_ADMIN or scoped FACILITY_ADMIN + USER_MANAGE_FACILITY | 200, minimal masked user DTO |
| POST `/facilities/{facilityId}/users/{userId}` | SYSTEM_ADMIN or FACILITY_ADMIN scoped to that active facility, USER_MANAGE_FACILITY | 200, membership DTO |
| DELETE `/facilities/{facilityId}/users/{userId}` | Same as membership POST | 200, inactive membership DTO |
| POST / DELETE `/users/{userId}/roles/{roleCode}` | SYSTEM_ADMIN + ROLE_MANAGE | 200, idempotent role DTO |
| POST `/users/{userId}/suspend` | SYSTEM_ADMIN + USER_ACCOUNT_MANAGE, If-Match | 200, status DTO + ETag |
| POST `/users/{userId}/reactivate` | Same as suspend | 200, status DTO + ETag |
| POST `/users/{userId}/disable` | Same as suspend | 200, status DTO + ETag |

## Facility records and lookup

Facility input accepts name, facilityTypeCode, parentFacilityId, address, provinceCode, regencyCode, districtCode, villageCode, postalCode, latitude and longitude. Name is required on create; type/parent must exist when supplied. Unknown fields are rejected. PATCH preserves omitted fields; explicit null clears optional fields. Coordinates must be in range with at most six decimal places. Timestamps and active flags cannot be supplied. Deactivation rejects any active user assignment and never deletes records or disables accounts.

Lookup accepts an exact normalized email or phone. The requested contact must be verified; unknown/unverified contacts return 404. No directory, fuzzy search, NIK/BPJS lookup or patient lookup exists. Responses contain masked email/phone, account status, verification flags, admin-managed role summaries and active facilities. The DTO also includes User.version so administrators can construct `If-Match: "<version>"` for status commands without SQL or guessing. This completes the approved minimal projection's conditional-write read path without changing the database. FACILITY_ADMIN sees only own facilities and `hasOtherFacilityAssignments`; a facility administrator without an active assignment is inert. No credentials, sessions, SELF links, supporter cases or clinical fields are included.

## Memberships and roles

Membership POST accepts `{ "primary": false }`; an omitted body/primary defaults to false. The target must be ACTIVE with a verified configured login identity. Existing inactive rows are reactivated. A primary switch clears the prior primary before writing the new one, in one transaction. DELETE sets active=false and isPrimary=false. As specified in architecture section 7, deletion also permits cleanup of memberships of suspended/disabled targets; ACTIVE/verified is the add/reactivate precondition. FACILITY_ADMIN cannot remove their own last active assignment. No row is hard deleted.

Admin-managed roles: SYSTEM_ADMIN, PROGRAM_MONITOR, TB_OFFICER, LAB_STAFF, FACILITY_ADMIN. Targets for role commands must be ACTIVE and verified. Operational roles require an active facility assignment before assignment. PATIENT and TREATMENT_SUPPORTER remain managed by identity-link workflows. Removing the last facility assignment leaves the global role intact and inert without scope. A global operational role applies to every active facility assignment; different roles per facility require a separately approved migration.

## Status and concurrency

Only ACTIVE → SUSPENDED, SUSPENDED → ACTIVE, and ACTIVE/SUSPENDED → DISABLED are supported. PENDING activation remains contact verification; DISABLED is terminal. Reactivation requires a verified login identity. Suspend/disable revokes all sessions in the same transaction. Role/status commands never leave zero ACTIVE, verified SYSTEM_ADMIN accounts.

Commands use READ_COMMITTED. Facility membership commands lock the facility then target user; deactivation takes the same facility lock. Target-user locking serializes nonversioned memberships and primary changes. A lock on the SYSTEM_ADMIN role row, acquired before the target user, serializes global role/status commands and first-admin bootstrap so concurrent admin loss cannot defeat the guard. These narrow locks do not replace JPA version checks on ordinary master updates. If-Match missing/malformed/stale returns 428/400/409; there is no silent retry.

## V10 and audit

V10 adds USER_ACCOUNT_MANAGE (`Mengelola status akun pengguna`) only to SYSTEM_ADMIN, and an index on user_verification_tokens(user_id, purpose, used_at, expires_at). V1–V9 remain unchanged. No entity/table redesign is included.

Successful commands audit FACILITY_CREATED, FACILITY_UPDATED, FACILITY_DEACTIVATED, ADMIN_USER_LOOKUP, FACILITY_USER_ASSIGNED, FACILITY_USER_REMOVED, PRIMARY_FACILITY_CHANGED, ROLE_ASSIGNED, ROLE_REMOVED, USER_SUSPENDED, USER_REACTIVATED and USER_DISABLED. Role no-ops do not create duplicate assignment/removal events. Audit rows commit with the command; authorization denials use the existing separate transaction. Metadata contains only traceId, without input identities or payload dumps.
