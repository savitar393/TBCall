# Phase 1.1 Administration and Recovery Plan

Spec: `docs/architecture/TBCall_Application_API_v1.1_Admin_Recovery.md`; base `47463847d020d0a77ca22ec87e882dda3e050aef`. The user authorized implementation inline and a final commit.

## Constraints

Preserve V1–V9 and entity schema, opaque sessions, CSRF/CORS, current DB scopes, safe DTO/problem responses, Clock times, READ_COMMITTED, If-Match and no silent retry. Add only the prescribed V10 permission/index. No clinical Phase 2, facility-specific role tables or production delivery provider.

## Tasks

- [x] Write PostgreSQL/HTTP administration and recovery tests; verify missing endpoints/policies fail against Phase 1.
- [x] Implement facility master, exact lookup, memberships, global role/status commands and locking for last-admin/primary/assignment consistency.
- [x] Extend delivery availability; implement generic resend/reset, user-first token locking/invalidation, password reset and session revocation.
- [x] Split patient link vs clinical scope; preserve account-link behavior and enforce current episode scope for the future policy.
- [x] Update migration/grant expectations and documentation; review independently, resolve findings, run `mvn clean test`, verify historical migrations and commit.

## Review focus

- Concurrent removal/suspension of admins must never leave zero usable admins.
- Facility deactivation and assignment changes must serialize; primary switching must respect the existing partial unique index.
- Token invalidation and consumption must use one lock order and current rows, preventing deadlocks/stale token reuse.
- Recovery bodies/status must not reveal existence, status, verification or delivery availability per identity.
- Facility-admin projections must mask identities and omit unrelated assignments; historical link scope must not become clinical authorization.

## Decisions/progress

The approved architecture is the implementation authority; no extra design approval is needed. Token invalidation uses existing `used_at`; no new token status/table. Recovery responses remain generic even in development; the configured delivery port supplies tokens to test/local adapters. Existing registration token exposure remains explicitly dev/test only.

The independent review found two operational gaps, both addressed: lookup includes User.version for status If-Match without SQL, and the default dev registration response port reports recovery unavailable instead of silently dropping replacement tokens. The latter has a regression test observed failing with expected 503 versus actual 202 before the fix. Initial red runs observed 19 missing-endpoint failures and 11 missing-policy failures; the expanded 40 Phase 1.1 tests and existing 45 Phase 1 authorization tests passed before the final full clean gate.

Architecture section 7 applies ACTIVE/verified to add/reactivate membership; soft removal permits cleanup of suspended/disabled targets. Global roles remain intact on the last membership's removal. No V1–V9/schema-model conflict was discovered.

Final gate: `mvn clean test` exit 0, 152 tests / 0 failures / 0 errors / 0 skipped, BUILD SUCCESS, 04:38 min. Completion evidence and full file manifest are in docs/PHASE1_1_REPORT.md. V1–V9 and persistence entities are unchanged; implementation and docs are committed together.
