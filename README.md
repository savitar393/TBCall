# TBCall backend — Phase 5A integration boundary

This backend implements the migration-managed persistence foundation, identity/authorization and administration, clinical intake, laboratory workflows, treatment Phase 3B, Phase 4A referral/transfer continuity, Phase 4B contact investigation/contact-driven TPT, Phase 4C manual monitoring/overdue alerts/IN_APP notifications, and Phase 5A local integration metadata/source-authority boundary. The F1 frontend foundation is described below. SITB networking and clinical automation remain unimplemented.

## Requirements

- Java 21
- Maven Wrapper (included; downloads Maven 3.9.16), or Maven 3.9 or newer
- PostgreSQL 15 or newer for application startup
- Docker-compatible container runtime for `mvn test`

Set `TBCALL_DB_URL`, `TBCALL_DB_USER`, and `TBCALL_DB_PASSWORD` for a PostgreSQL database, then start with `.\mvnw.cmd spring-boot:run` on Windows. For tests at `D:\TBCall`, run `.\mvnw.cmd clean test`; Maven does not need to be globally installed. On Unix use `./mvnw`. The database user needs permission to install the V1 `pgcrypto`, `citext`, and `pg_trgm` extensions and create schema objects. Testcontainers starts empty PostgreSQL 16 databases and Spring Boot applies V1 through V17 before Hibernate validates the mappings. All Java sources are committed under `src/main/java`; no generation helper or local reference PDF is required to compile or test a clone.

## Frontend F1 foundation

The [Next.js frontend](frontend/README.md) lives under `frontend/` and requires Node.js 24.15–24.x and pnpm 11.19.0. From that directory run `pnpm install --frozen-lockfile`, copy `.env.example` to ignored `.env.local`, and run `pnpm dev`. Server-only `TBCALL_BACKEND_URL` points to the separately running backend. Browser calls use a fixed same-origin proxy; existing opaque-session cookies, CSRF, authorization and ETag contracts are preserved.

F1 implements only `/login`, `/`, `/forbidden` and an Indonesian responsive identity/context shell. It has no clinical workflow screens, browser persistence or SITB calls. Frontend checks are `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build`. See [FRONTEND_FOUNDATION.md](docs/FRONTEND_FOUNDATION.md), the [approved architecture](docs/architecture/TBCall_Frontend_v1.0_F1_Foundation.md) and [F1 report](docs/FRONTEND_F1_REPORT.md). Backend source and migrations are unchanged by this checkpoint.

## Identity configuration and browser use

Production defaults: `TBCALL_PRODUCTION=true`, secure cookies and verification-secret exposure disabled. Registration requires an email/SMS `VerificationDeliveryPort` adapter; the default port returns 503 and rolls back registration when delivery is unavailable. No outbound adapter or fake SITB service is provided.

- Bootstrap: set `TBCALL_BOOTSTRAP_EMAIL` and/or `TBCALL_BOOTSTRAP_PHONE`, plus `TBCALL_BOOTSTRAP_PASSWORD` (12–128 characters). The first `SYSTEM_ADMIN` is ACTIVE with verified configured identities. Once any SYSTEM_ADMIN assignment exists, bootstrap is a no-op. Remove bootstrap credentials from deployment configuration after initial use. Existing ordinary accounts are never automatically promoted.
- `TBCALL_CORS_ALLOWED_ORIGINS`: comma-separated exact HTTP(S) origins; default empty means no cross-origin access. Credentials never use wildcard origins.
- `TBCALL_VERIFICATION_LIFETIME`: default `30m`, positive and at most `24h`.
- Local development only: use profile `dev`, `TBCALL_PRODUCTION=false`, and `TBCALL_EXPOSE_VERIFICATION_TOKENS=true` for tokens in registration responses. Local HTTP additionally requires `TBCALL_COOKIE_SECURE=false`. Any `prod`/`production` profile rejects secret exposure and insecure cookies.

Sessions are random opaque tokens, stored as SHA-256 hashes, delivered in `TBCALL_SESSION` (HttpOnly, Secure in production, SameSite=Strict, path `/`, 8 hours). There is no JWT or servlet authentication session. `/me` resolves current roles, permissions and links from PostgreSQL on every request.

CSRF applies to **all** POST/PATCH/DELETE requests, including registration, verification, login and recovery. Browser initialization calls `GET /api/v1/me`; an unauthenticated 401 still issues an `XSRF-TOKEN` cookie. Send its value as `X-XSRF-TOKEN` with state-changing requests. Login/logout clear the old CSRF cookie; call `/me` again for a fresh token. Same-origin clients are preferred. See [SECURITY.md](docs/SECURITY.md) and [AUTHORIZATION.md](docs/AUTHORIZATION.md).

## Phase 1 endpoints

| Method | Path | Input/precondition |
|---|---|---|
| POST | `/api/v1/auth/register` | `email` and/or `phone`, `password` |
| POST | `/api/v1/auth/verify` | `token` |
| POST | `/api/v1/auth/login` | `identity`, `password` |
| POST | `/api/v1/auth/logout` | authenticated session + CSRF |
| GET | `/api/v1/me` | authenticated session |
| POST | `/api/v1/patients/{patientId}/account-link` | `userId`; If-Match for an existing link |
| DELETE | `/api/v1/patients/{patientId}/account-link` | If-Match for the verified SELF link |
| POST | `/api/v1/cases/{caseId}/supporters/{supporterId}/account-link` | `userId`, If-Match for supporter |
| DELETE | `/api/v1/cases/{caseId}/supporters/{supporterId}/account-link` | If-Match for supporter |

Versioned responses include their resource ID, `version` and ETag. Use `If-Match: "<version>"`; missing required preconditions return 428, stale versions return 409. Problem responses use Indonesian title/detail, stable technical `code` and `traceId`; `X-Request-ID` correlates requests and audit. Identity lookup for clinical registration requires a TB officer, exact identity plus secondary confirmation and an active facility assignment.

## Phase 2 clinical intake

The [clinical intake guide](docs/CLINICAL_INTAKE.md) lists all 13 endpoints, request examples, projections, state transitions and version requirements. The [approved Phase 2 architecture](docs/architecture/TBCall_Application_API_v1.2_Phase2_Clinical_Intake.md) and [Phase 2.1 checkpoint](docs/architecture/TBCall_Application_API_v1.2.1_Phase2.1_Transition_Hardening.md) define the contract. Patient, registration, diagnosis and case remain distinct records. New-patient registration is atomic; confirmation transitions a DIAGNOSED registration to CONVERTED_TO_CASE and creates one ACTIVE case for TREAT_HERE or one REFERRED case for REFERRED. NOT_TREATED/UNKNOWN cannot confirm a case. REFERRED retains the source currentFacility and creates no referral row or transfer. Future treatment initiation requires ACTIVE status. Current patient-list filters accept only OPEN/DIAGNOSED registrations and ACTIVE/REFERRED cases.

V11 adds only PATIENT_IDENTITY_RESOLVE for TB_OFFICER and the partial other-identity index. Phase 2.1 leaves V1–V11 unchanged and adds no V12. Current clinical patient scope is narrower than historical identity-link scope. Each clinical write checks permission, resource scope, create/edit source authority and applicable If-Match; admin/lab/program roles have no clinical bypass. Patients receive only the verified SELF projection. The [Phase 2 report](docs/PHASE2_REPORT.md) and [Phase 2.1 report](docs/PHASE2_1_REPORT.md) record changes and verification.

## Laboratory Phase 3A

See [LABORATORY.md](docs/LABORATORY.md) for the eight endpoints, facility scopes, ETags, specimen timeline and append-only correction rules, and the [approved architecture](docs/architecture/TBCall_Application_API_v1.3A_Phase3A_Laboratory.md) for the full contract. TB officers create requests and record specimens in requesting-facility scope. Laboratory staff receive specimens and enter/correct results in testing-facility scope. Results do not automatically change diagnosis, drug resistance, case status or treatment, and test-specific clinical interpretation is not encoded. External carried-result ingestion and unusable-specimen notifications are deferred. Phase 3B will consume finalized laboratory data as displayed evidence, without automatic clinical decisions.

Phase 3A adds no migration and preserves V1–V11. A separate `LaboratorySourceAuthorityPolicy` permits prototype local writes after authorization/scope checks and can be replaced independently of the clinical policy when authorized integration is defined. The [Phase 3A report](docs/PHASE3A_REPORT.md) records implementation and clean-build evidence.

[Phase 3A.1](docs/architecture/TBCall_Application_API_v1.3A.1_Phase3A.1_Result_Lineage_Hardening.md) makes `/results` the first FINAL entry for an exact test/specimen-or-null lineage. Existing FINAL/CORRECTED lineages must use corrections; duplicate FINAL returns 409 LAB_RESULT_ALREADY_EXISTS without mutation. Late first entries remain allowed after case conversion/outcome. The [Phase 3A.1 report](docs/PHASE3A_1_REPORT.md) records verification; Phase 3B outcome creation must lock TBCase before Treatment and check outcome absence before insertion.

## Treatment Phase 3B

See [TREATMENT.md](docs/TREATMENT.md) for the 18 treatment, adherence, follow-up, adverse-event, outcome and safe patient/supporter routes. The [schema-reconciled architecture](docs/architecture/TBCall_Application_API_v1.3B.1_Phase3B_Treatment_Monitoring_Schema_Reconciled.md) supersedes the earlier blocked draft and incorporates the approved reuse of the existing V1 PLANNED/ACTIVE/PAUSED open-treatment index.

V12 adds structured follow-up observations, replaces dose treatment/day uniqueness with actor/day uniqueness, and adds TREATMENT_SUPPORTER provenance while preserving legacy statuses/sources. V1–V11 and laboratory semantics remain unchanged. Clinician-selected regimens and explicit drug snapshots are recorded without calculating doses or inferring outcomes. Outcome closure locks TBCase before Treatment and serializes with follow-up laboratory corrections. See [PHASE3B_REPORT.md](docs/PHASE3B_REPORT.md) for verification and architectural decisions. Phase 4A adds the referral continuity described below; Phase 4B is described below; Phase 4C is described below.

## Referral and transfer Phase 4A

See [REFERRALS.md](docs/REFERRALS.md) for the eight referral routes, source/destination scopes, state model, versions and handoff privacy. [Approved v1.4A](docs/architecture/TBCall_Application_API_v1.4A_Phase4A_Referral_Transfer.md) keeps the same case and treatment across transfer; current ownership moves only on destination report. V13 adds the in-flight referral constraint, source list index and return reason while preserving V1–V12. Historical drugs, dose/follow-up/adverse/laboratory data and user links stay attached without relocation or automation. See [PHASE4A_REPORT.md](docs/PHASE4A_REPORT.md) for verification and the file manifest. Phase 4B contact/TPT is described below; Phase 4C operational monitoring is described below; SITB networking remains deferred.

## Contact investigation and TPT Phase 4B

See [CONTACT_INVESTIGATION.md](docs/CONTACT_INVESTIGATION.md) and [TPT.md](docs/TPT.md) for the 21 contact, investigation, TPT and safe SELF routes. [Approved v1.4B](docs/architecture/TBCall_Application_API_v1.4B_Phase4B_Contact_Investigation_TPT.md) requires explicit exclusion of active TB and TPT eligibility before officer-selected contact TPT enrollment. Exact WNI/WNA patient linking reuses Phase 2 identity reconfirmation without copying demographics. Recorded investigation/TPT facilities remain unchanged by index-case transfers. V14 adds only approved eligibility fields/check/indexes, TPT description/reason/index and six PREVENTIVE concepts; V1–V13 are unchanged. No doses or eligibility are inferred. See [PHASE4B_REPORT.md](docs/PHASE4B_REPORT.md) for files and verification. Phase 4C is described below; non-contact enrollment and SITB networking remain deferred.

## Persistence ownership and mapping

Phase 1.1 adds facility provisioning, exact masked administrative user lookup, facility memberships, global role/status management, verification resend and password reset. See [ADMINISTRATION.md](docs/ADMINISTRATION.md), [ACCOUNT_RECOVERY.md](docs/ACCOUNT_RECOVERY.md) and the [approved Phase 1.1 architecture](docs/architecture/TBCall_Application_API_v1.1_Admin_Recovery.md) for endpoint contracts. V10 adds only USER_ACCOUNT_MANAGE for SYSTEM_ADMIN and a verification-token index; V1–V9 are unchanged. Recovery responses stay generic; delivery availability is checked before identity lookup. A real delivery adapter and edge/distributed rate limiting are required before public internet exposure.

Flyway is the schema authority (`spring.jpa.hibernate.ddl-auto=validate`). V1 and V2 are immutable historical migrations. V3–V7 implement the [Domain / Schema v1.1 checkpoint](docs/architecture/TBCall_Domain_Schema_v1.1.md): current reference catalogs, resistance/condition observations, relational integrity and RBAC seeds. Provenance and exact grants are in [REFERENCE_DATA.md](REFERENCE_DATA.md), and operational terminology is in [TERMINOLOGY.md](docs/TERMINOLOGY.md). Code strings are TBCall canonical choices, not claims about SITB database or API codes.

Each V1 table has a corresponding JPA entity. UUID foreign keys are lazy, unidirectional references toward the parent; reference table foreign keys are stored as code strings while PostgreSQL enforces them. The four composite-key join tables use explicit `@IdClass` keys. Polymorphic target IDs in external identifiers, sync items, monitoring events, and audit logs remain UUID values rather than false JPA foreign keys. PostgreSQL `jsonb`, `inet`, and `citext` columns have explicit mappings. Database defaults are retained through dynamic inserts, and database-managed creation/update timestamps are read-only in JPA.

V8 implements [Runtime Persistence v1.2](docs/architecture/TBCall_Runtime_Persistence_v1.2.md): corrected TB_SO wording, 26 versioned entities and 57 deterministic field initializers. PostgreSQL defaults remain in place; clock-dependent defaults still require refresh/reload when immediate database state is needed. `TBCase` retains dynamic updates, while concurrency protection uses JPA `@Version`.

The [runtime persistence policy](docs/PERSISTENCE_RUNTIME.md) documents exact version scope, Java defaults, database-owned timestamps and the direct-SQL restriction. Phase 1 commands own `READ_COMMITTED` transactions and map optimistic conflicts to HTTP 409 without silently retrying user updates. The [approved Application/API v1 architecture](docs/architecture/TBCall_Application_API_v1.md) defines subsequent phases.

The V1 `lab_requests` constraint permits either `registration_id` or `case_id`, exactly one per row. The integration suite tests both paths. The migration includes its own `BEGIN`/`COMMIT` around V1; Flyway also starts a transaction, so PostgreSQL emits a harmless nested-transaction warning on first migration. The source was preserved unchanged.

## Monitoring, alerts and notifications Phase 4C

See [MONITORING.md](docs/MONITORING.md) and [ALERTS_NOTIFICATIONS.md](docs/ALERTS_NOTIFICATIONS.md) for all 24 routes. V15 adds explicit Treatment/TPT plan targets, TPT alert lineage, unique event alerts, per-user receipts and notification uniqueness, preserving V1–V14 and the original treatment active-plan index. Plans contain explicit officer-entered events under MANUAL_V1; the injected Clock drives due/overdue transitions and terminal target cleanup. Target-first locks serialize with transfer/TPT closure. Alerts use fixed safe WARNING wording and notifications use IN_APP only with minimal payloads. Patient/supporter acknowledgements leave global alert state unchanged. No clinical schedules, laboratory/follow-up records, outcomes, external delivery or SITB networking are inferred or created. See [PHASE4C_REPORT.md](docs/PHASE4C_REPORT.md) and [approved v1.4C](docs/architecture/TBCall_Application_API_v1.4C_Phase4C_Monitoring_Alerts_Notifications.md).

Windows verification requires Java 21 and Docker Desktop: `.\mvnw.cmd clean test`. Monitoring background scheduling is disabled by the test profile; production defaults to a bounded sweep every 60 seconds. Configuration: TBCALL_MONITORING_SCHEDULER_ENABLED and TBCALL_MONITORING_SWEEP_INTERVAL_MS.

## SITB integration boundary Phase 5A

See [INTEGRATION_BOUNDARY.md](docs/INTEGRATION_BOUNDARY.md) for the seven administrator read routes, explicit source-authority checks and privacy boundary, and [PHASE5A_REPORT.md](docs/PHASE5A_REPORT.md) for implementation and verification. [Approved v1.5A](docs/architecture/TBCall_Application_API_v1.5A_SITB_Integration_Boundary.md) authorizes only V17: an inactive TBCall-internal SITB marker, authority/conflict ledgers and sync-item hash/conflict linkage. V1–V16 remain unchanged. External identifiers alone do not confer authority; policies check the actual edited entity and its domain scope after existing access checks. No SITB network call, credential, import, write-back or integration mutation endpoint is implemented. Authorized contemporary interface material is required before Phase 5B.
