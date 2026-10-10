# TBCall F6A — Real-Stack Verification Readiness Audit

**Reviewed starting point:** `ce7c5f353dd4593c86775f957a2f7d826f9e7337` (approved F5C).

**Scope:** inspect, execute non-destructive prerequisites where practical, and produce a concrete F6B live-stack test plan. Do not alter application source, migrations, production/staging data, credentials, integrations or existing workflows in this checkpoint.

## Purpose

F1–F5C are implementation-complete at their approved scopes, but frontend Vitest/RTL and backend Spring/PostgreSQL integration tests do **not** establish that the production-build Next.js application and live Spring Boot application work together. F6A determines a reproducible, isolated, synthetic-data procedure before attempting live end-to-end verification.

Do not declare production readiness, clinical validation, or official SITB interoperability from a successful development smoke test.

## Verified repository baseline

- Backend: Java 21, Spring Boot, Maven Wrapper, PostgreSQL 15+ with Flyway V1–V17. PostgreSQL Testcontainers cover the backend integration suite.
- Frontend: Next.js 16 App Router, Node 24.15+, pnpm 11.19; same-origin `/api/tbcall/v1` proxy to `TBCALL_BACKEND_URL`.
- Local backend settings require `TBCALL_DB_URL`, `TBCALL_DB_USER`, `TBCALL_DB_PASSWORD`; ordinary local HTTP uses `TBCALL_PRODUCTION=false`, `TBCALL_COOKIE_SECURE=false` and an explicitly nonproduction profile. Registration token exposure is development-only and must not be used in production.
- The repository currently does not contain an established Playwright/Cypress browser E2E suite or project-level Docker Compose launch stack. Investigate the least risky reproducible approach; do not assume these have already been configured.
- Prior reported gates: backend 1,375 and frontend 1,132 tests passed, but do **not** substitute these for live E2E evidence. Re-run only if time/environment permits, and report executed versus unexecuted gates explicitly.

## Non-negotiable data safety

1. Use a new, disposable PostgreSQL database/cluster with **synthetic data only**. Never point destructive SQL, reset, truncate, migration test, or fixture cleanup at an existing personal, staging, production, or shared database.
2. Before any data-modifying test, require an explicit safety check proving the target is disposable (e.g. ephemeral container identity plus a designated test DB name and dedicated test credentials). Refuse execution when it is uncertain.
3. Never use real patients, phone numbers, emails, NIK, BPJS, official SITB credentials or real-world clinical data.
4. Keep test accounts/passwords/token delivery local and synthetic. No credentials, session cookies, CSRF tokens, clinical responses, screenshots with sensitive material or `.env` values in commits/logs/reports.
5. All external connectivity must remain disabled except explicitly needed loopback Docker/container traffic; no SITB calls.
6. No disabling RBAC, CSRF, optimistic locking, cookie restrictions or source-authority guards simply to make tests pass.
7. If Docker, Postgres, Node or required browser dependencies are unavailable, document the exact blocker and stop instead of fabricating a passing result.

## Audit tasks

### A. Inventory the actual launch configuration

Confirm versions, scripts, profiles, environment variables, server ports, cookie/CSRF/proxy behavior, verification-delivery strategy, scheduler defaults and Flyway startup requirements. Inspect current README, `frontend/.env.example`, Next proxy and backend application settings.

Explain whether `pnpm dev` or `pnpm build && pnpm start` should be used for F6B. Prefer a production **build** (with loopback and synthetic settings) for the final smoke while documenting any local development-mode prerequisites.

### B. Provision synthetic actors legitimately

Plan a repeatable scenario covering all seven roles:

- SYSTEM_ADMIN
- FACILITY_ADMIN
- TB_OFFICER
- LAB_STAFF
- PROGRAM_MONITOR
- PATIENT
- TREATMENT_SUPPORTER

Review existing public registration/verification, initial bootstrap, admin user lookup/role/facility assignment, and TB Officer account-link workflows. Identify which accounts/roles can be provisioned through the supported APIs and which require **test-only fixtures**. Distinguish nonprod identity bootstrap from authorization shortcuts. Do not invent public user-directory endpoints or allow PATIENT/TREATMENT_SUPPORTER role assignment via admin APIs.

### C. Define reproducible minimum smoke flow

In F6B, verify a real browser or real HTTP client through the Next same-origin proxy and live backend/PostgreSQL:

1. Anonymous `/me` + CSRF initialization; login; cookies and authorization; logout/session expiry.
2. System admin creates facilities; scopes/roles/accounts via approved operations; compare real facility GET ETag vs stale PATCH/deactivate.
3. TB Officer creates synthetic patient/registration/diagnosis/case with existing clinical rules and performs F5C SELF account link; patient `/me` and self portal change immediately on subsequent requests.
4. TB Officer creates synthetic supporter record, resolves verified account, links it; supporter `/me` and safe supporter view work; unlink removes access on the next request.
5. Test LAB_STAFF independent scopes, referral/transfer boundary, treatment and dose evidence, monitoring/alert/personal receipt/notification as available under valid synthetic lifecycle prerequisites.
6. Test foreign-facility, wrong-role/permission, old-account, stale ETag, invalid CSRF, duplicate/uncertain-create and controlled 429 lookup limits.
7. Confirm no unintended outbound integration calls; Phase 5A integration pages remain read-only metadata.

No clinical outcome, dose, eligibility, notification, or treatment inference may be claimed from UI displays or smoke data.

### D. Choose tooling after verification

Assess existing dependencies and Windows/Docker environment. Recommend one of:

- repeatable HTTP-level real-proxy smoke plus a small, opt-in browser journey;
- Playwright with new locked dev dependency and test-only isolation, **only if justified**;
- existing browser automation, if the repo/environment genuinely has one.

Do not add a dependency or generate a new harness in F6A. Propose time estimate, required infrastructure and how tests will be started/reset/stopped safely in F6B.

### E. Security, operations and deployment-readiness checklist

Cover TLS/secure-cookie assumptions for deployment, CSRF/proxy forwarding, session revocation, no-store/privacy headers, audit of identity resolution, rate limiting, logging/redaction, secrets management, PostgreSQL backups/restore, migrations, readiness/liveness behavior, concurrency, resource use and shutdown. Clearly distinguish **verified**, **untested**, **requires production policy/adapter**, and **deferred by design**.

Real-person identity verification and consent SOP, email/SMS verification adapter, and authorized external SITB integration remain separate requirements. Do not treat their absence as an excuse to bypass protections.

## Expected audit report

Create `docs/F6A_REAL_STACK_READINESS_REPORT.md` **only if the task is explicitly approved to write docs**; otherwise return the report in chat or a local untracked audit file. The report should contain:

- Exact Git SHA and clean/dirty worktree inventory before the audit.
- Actual available versions/services/ports; startup commands and **redacted** environment-variable names, not values.
- Whether an isolated disposable database can be established safely.
- Role-provisioning matrix and explicit prerequisite chain.
- Proposed scenario matrix (positive, negative, concurrency and privacy cases).
- Concrete suggested F6B test harness and execution commands (as a proposal, not as successful results).
- Which checks were actually executed, with exact exit codes/log references that do not disclose secrets.
- Any blockers ranked critical/important/minor.
- The exact file/diff scope proposed for F6B and a stop/go decision.

## Boundaries

F6A is audit/design only. Do not modify backend/frontend application code, tests, scripts, dependencies or V1–V17. No migration or SITB networking. No commit or push in F6A. Do not begin F6B until the audit is reviewed.
