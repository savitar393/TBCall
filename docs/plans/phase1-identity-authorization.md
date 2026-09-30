# Phase 1 Identity and Authorization Implementation Plan

Goal: Implement the approved Phase 1 identity/session/authorization foundation.

Spec: `docs/architecture/TBCall_Application_API_v1.md` and the supplied Phase 1 task brief. The user explicitly authorized implementation and a final commit in the current repository; execute inline.

Architecture: Add application services, explicit DTOs, request policies and a Spring Security chain over the existing Flyway-managed entities. Opaque sessions and verification tokens use existing tables. V9 changes only the prescribed identity indexes and two TB-officer permissions.

## Constraints

- Preserve V1–V8 and existing persistence mappings.
- No clinical API, frontend, SITB server/integration or guessed source authority.
- Indonesian user-facing text; English Java/SQL/JSON names.
- JPA/Hibernate writes for versioned entities; no silent retry.
- PostgreSQL Testcontainers; Java 21; `mvn clean test` before final commit.

## Tasks

- [x] 1. Write HTTP/DB integration tests for registration, verification, login/session, logout and safe `/me`; run red against V8. Add V9 and authentication/session implementation, then verify those tests.
- [x] 2. Write and run scope/link tests red; implement current DB authorization resolution, patient/supporter link transactions and version preconditions. Verify uniqueness, scope denial and role lifecycle.
- [x] 3. Test bootstrap idempotence, delivery/config safeguards, full-length passwords, real CSRF/CORS, expiry, concurrent one-time token consumption and competing link ownership. Implement any remaining foundation and verify.
- [x] 4. Document security, authorization, endpoints, configuration and design judgments. Update existing migration/grant expectations, review the diff, run `mvn clean test`, verify immutable migration history and prepare all completed Phase 1 files for the requested commit.

## Review focus

1. Passwords beyond BCrypt's 72-byte limit must retain full-password distinction while satisfying the specified 12–128 characters.
2. Verification/session secrets must never appear in production responses, audit or logs; production delivery is an explicit port.
3. Concurrent token consumers and linkers must produce at most one successful ownership/consumption and consistent roles.
4. Non-active users, removed roles/facilities and revoked links must lose access on the next request.
5. CSRF must work with real browser cookie/header requests, including login and logout; malformed inputs and security-filter failures must use safe correlated problem responses.

## Decisions and progress

The approved architecture supplies design approval. No additional approval gate is required for the requested implementation. Application-owned business times use injected `Clock`; database-owned audit columns remain unchanged. New versioned resource creation needs no If-Match; update/revoke of an existing patient link does, and every supporter mutation does.

Initial HTTP tests: 31 failures against V8, then 30/31 passing with implementation. Browser CSRF failure traced to Spring Security test support replacing the repository; actual cookie flow tested after restoring it. Expanded tests: 54/55 passing; the remaining assertion depended on cookie attribute order and was corrected to assert attributes independently.

Independent read-only review found Hibernate constraint errors and pre-controller session failures bypassing problem responses. Its CORS formatting finding was graded as required contract work because the supplied brief requires global problem responses. Four regression executions reproduced all three paths (duplicate email/phone returned 500, session-store exception escaped, CORS was plain text); error boundaries were corrected without changing endpoint/domain contracts.

Final verification: `mvn clean test`, 111 tests, 0 failures, 0 errors, 0 skipped; BUILD SUCCESS; 03:28 min; 2026-09-30T23:37:34+07:00. All four review regressions pass in the full suite. V1–V8 compare unchanged against the baseline. No remaining review finding or architecture conflict. The production delivery adapter remains an explicitly configured deployment port, as required by the brief.
