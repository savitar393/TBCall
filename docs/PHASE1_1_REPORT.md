# Phase 1.1 implementation report

Base: `47463847d020d0a77ca22ec87e882dda3e050aef`. Scope: approved administrative provisioning and identity recovery checkpoint. Clinical Phase 2 is not implemented. The resulting commit SHA is supplied in the completion response.

## Files created

- `src/main/resources/db/migration/V10__administrative_identity_support.sql`
- `src/main/java/id/tbcall/application/admin/AdminDtos.java`
- `src/main/java/id/tbcall/application/admin/AdministrativeUsers.java`
- `src/main/java/id/tbcall/application/admin/FacilityAdministrationService.java`
- `src/main/java/id/tbcall/application/admin/FacilityMembershipService.java`
- `src/main/java/id/tbcall/application/admin/SystemAdminGuard.java`
- `src/main/java/id/tbcall/application/admin/UserAdministrationService.java`
- `src/main/java/id/tbcall/application/admin/UserLookupService.java`
- `src/main/java/id/tbcall/application/auth/AccountRecoveryService.java`
- `src/main/java/id/tbcall/application/auth/SessionRevocationService.java`
- `src/main/java/id/tbcall/application/auth/VerificationTokens.java`
- `src/main/java/id/tbcall/authorization/AdministrativePolicies.java`
- `src/main/java/id/tbcall/web/AdministrationController.java`
- `src/test/java/id/tbcall/application/AdminRecoveryIntegrationTest.java`
- `docs/ADMINISTRATION.md`
- `docs/ACCOUNT_RECOVERY.md`
- `docs/architecture/TBCall_Application_API_v1.1_Admin_Recovery.md`
- `docs/plans/phase1-1-admin-recovery.md`
- `docs/PHASE1_1_REPORT.md`

## Files changed

- `src/main/java/id/tbcall/application/auth/AuthDtos.java`
- `src/main/java/id/tbcall/application/auth/AuthService.java`
- `src/main/java/id/tbcall/application/auth/VerificationDeliveryPort.java`
- `src/main/java/id/tbcall/application/identity/AccountLinkService.java`
- `src/main/java/id/tbcall/authorization/ScopePolicies.java`
- `src/main/java/id/tbcall/security/SecurityConfiguration.java`
- `src/main/java/id/tbcall/web/ApiExceptionHandler.java`
- `src/main/java/id/tbcall/web/AuthController.java`
- `src/test/java/id/tbcall/application/IdentityAuthorizationIntegrationTest.java`
- `src/test/java/id/tbcall/application/ProductionVerificationIntegrationTest.java`
- `src/test/java/id/tbcall/persistence/PersistenceIntegrationTest.java`
- `src/test/java/id/tbcall/persistence/SchemaHardeningIntegrationTest.java`
- `README.md`
- `docs/SECURITY.md`
- `docs/AUTHORIZATION.md`

## Migration and administrative endpoints

V10 adds only USER_ACCOUNT_MANAGE / `Mengelola status akun pengguna`, granted to SYSTEM_ADMIN, and the requested four-column token index. V1–V9, JPA entities and the database/domain model remain unchanged; no schema discrepancy was discovered.

The 11 administrative routes and exact authorization/input/result contracts are listed in [ADMINISTRATION.md](ADMINISTRATION.md). SYSTEM_ADMIN requires each corresponding permission for facility master, roles and account status. Membership and exact lookup also permit FACILITY_ADMIN with USER_MANAGE_FACILITY within active facility scope. Lookup masks identities, excludes workflow/clinical/secret information, and limits unrelated assignments to a boolean for facility administrators.

Role commands are idempotent; PATIENT/TREATMENT_SUPPORTER manual mutation is rejected. Operational role assignment requires an active facility membership. Membership removal is soft and leaves global roles intact; primary switching is transactional. Last usable administrator protection serializes concurrent role/status changes. Facility deactivation serializes against assignment and rejects active members. Versioned status/master commands retain If-Match, 428/400/409 and no retry.

## Recovery and scope

The three recovery routes are documented in [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md). Valid request/resend bodies receive generic 202 when a real delivery adapter is available. Only eligible identities receive a token. Older unused same-purpose tokens are invalidated atomically; reset confirms an unexpired one-time PASSWORD_RESET token, hashes the new 12–128 character password and revokes all sessions. User-first/token-second locking prevents resend/consumption deadlocks. Production responses/audits/persistence expose no raw secret.

Registration, resend and reset request check delivery capability before identity-specific behavior and use the same 503 when unavailable. Explicit dev registration response delivery is retained, with separate registration availability; default dev recovery is uniformly unavailable rather than dropping tokens. No production provider or fake SITB service was added.

Account linking now uses requireOfficerPatientLinkScope with preserved historical association. requireOfficerClinicalPatientScope accepts OPEN/DIAGNOSED registrations or ACTIVE/REFERRED cases at current assigned facilities. Historical-only registrations/cases do not satisfy it. The policy is tested without exposing clinical endpoints; future services still require resource-level authorization and restricted field projections.

## Audit and implementation judgments

New successful actions: FACILITY_CREATED, FACILITY_UPDATED, FACILITY_DEACTIVATED, ADMIN_USER_LOOKUP, FACILITY_USER_ASSIGNED, FACILITY_USER_REMOVED, PRIMARY_FACILITY_CHANGED, USER_SUSPENDED, USER_REACTIVATED, USER_DISABLED, VERIFICATION_RESENT, PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED. ROLE_ASSIGNED/ROLE_REMOVED reuse the existing lifecycle helper; AUTHORIZATION_DENIED retains separate-transaction recording. Command audit commits atomically, with traceId metadata only.

- Lookup includes User.version to make the specified status If-Match commands usable without SQL; the independent review identified the missing conditional-write read path.
- PATCH distinguishes omission from explicit null for optional fields; unknown facility fields are rejected.
- Architecture section 7's ACTIVE/verified target rule applies to add/reactivate membership; soft deletion permits cleanup of suspended/disabled targets.
- Invalidated tokens use existing used_at, without new token state/tables.
- Default local registration delivery has a distinct capability from actual email/SMS delivery; a reproduced review regression proved the prior local recovery fallback returned 202 when 503 was required.

## Verification

Executed `mvn clean test` with Java 21 and Maven 3.9.16 under WSL Ubuntu/Docker. Exit code: **0**. Completed at `2026-10-01T02:38:52+07:00`.

```text
[INFO] Tests run: 152, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  04:38 min
```

| Suite | Tests |
|---|---:|
| AdminRecoveryIntegrationTest | 40 |
| IdentityAuthorizationIntegrationTest | 46 |
| ProductionVerificationIntegrationTest | 1 |
| SecurityConfigurationTest | 13 |
| PersistenceIntegrationTest | 7 |
| RuntimePersistenceIntegrationTest | 8 |
| SchemaHardeningIntegrationTest | 37 |
| **Total** | **152** |

Tests use PostgreSQL 16 Testcontainers, Flyway from empty databases, Hibernate validate, real Spring Security/HTTP and database persistence assertions. Coverage includes all previous identity/link/persistence tests, administrative boundaries/projections, grants/index, facility versions, primary uniqueness, last-admin concurrency, assignment/deactivation races, recovery eligibility/anti-enumeration/expiry/purpose/one-time use, session revocation, production secret isolation and historical versus clinical scope. The new default-development-delivery regression is green in the clean run after the observed failing reproduction. `git diff --check` passed; historical migrations and entity mappings have no changes. Independent review findings were fixed before this run.

## Before Phase 2 / deployment

No unresolved schema conflict blocks Phase 2 design. Different roles per facility remain outside the approved global-role model and require separate architecture review. Future clinical services must add resource-level scope, sensitive field projections and source-authority checks; current patient scope is not authority over every historical resource. Production needs a real delivery adapter, a reviewed durable outbox/retry strategy, and edge/distributed rate limiting before public internet exposure. No client-IP trust model or local limiter is introduced here.

Build tooling under .tools, target outputs, local task briefs and Kemenkes PDFs remain ignored and uncommitted. All application sources are ordinary src/main/java files; compilation does not depend on generation scripts.
