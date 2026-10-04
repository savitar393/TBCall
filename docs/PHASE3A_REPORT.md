# Phase 3A laboratory implementation report

Base commit: `a2edfb1582d0a7e9d469713d0308038740a1bf24`. Contract: [Application/API v1.3A](architecture/TBCall_Application_API_v1.3A_Phase3A_Laboratory.md). The final handoff identifies the completion commit containing this report.

This report preserves the original Phase 3A behavior and build evidence as history. The Phase 3A.1 addendum below and [Phase 3A.1 report](PHASE3A_1_REPORT.md) define the current first-FINAL lineage rule.

## Files created/changed

| Files | Purpose |
|---|---|
| `src/main/java/id/tbcall/application/laboratory/LabDtos.java` | Strict inputs and explicit minimum-context outputs |
| `LabAccess.java` in the same package | Role/permission/facility scope and fresh lock fetches |
| `LabValidation.java` | Active catalogs/facility, text and timeline validation |
| `LabErrors.java` | Indonesian laboratory state/lineage conflicts |
| `LabQueryService.java`, `LabViews.java` | Scoped paginated union, batched children, latest lineage projections |
| `LabRequestService.java` | Owner/state/reason creation, source specimen and cancellation |
| `LabSpecimenService.java` | Laboratory receipt/rejection |
| `LabResultService.java` | FINAL entry and append-only CORRECTED entry |
| `LabStatusService.java` | Central aggregation and request/test version advancement |
| `src/main/java/id/tbcall/authorization/LaboratorySourceAuthorityPolicy.java`, `PrototypeLaboratorySourceAuthorityPolicy.java` | Independent local laboratory authority adapter |
| `src/main/java/id/tbcall/web/LaboratoryController.java` | Eight HTTP endpoints |
| `src/test/java/id/tbcall/application/LaboratoryIntegrationTest.java` | PostgreSQL and authenticated HTTP regressions |
| `docs/LABORATORY.md`, `docs/PHASE3A_REPORT.md` | Operational contract and this report |
| `README.md`, `docs/AUTHORIZATION.md` | Current phase and scope/projection rules |
| `docs/architecture/TBCall_Application_API_v1.3A_Phase3A_Laboratory.md` | Supplied approved architecture, preserved as provided |
| `docs/superpowers/plans/2026-10-01-phase3a-laboratory.md` | Implementation/review checklist and judgments |

No existing Java source, entity, repository, migration, security configuration, permission grant, dependency or build configuration was changed.

## Endpoints and authorization

| Endpoint (`/api/v1`) | Scope and permission | Version precondition |
|---|---|---|
| POST `/lab-requests` | TB_OFFICER, LAB_REQUEST_WRITE, owner/source facility | None |
| GET `/lab-requests` | LAB_REQUEST_READ, officer requesting facility OR lab testing facility | None |
| GET `/lab-requests/{requestId}` | Same read union | None |
| POST `/lab-requests/{requestId}/specimens` | TB_OFFICER, LAB_REQUEST_WRITE, requesting facility | Request |
| POST `/lab-specimens/{specimenId}/receive` | LAB_STAFF, LAB_RESULT_WRITE, testing facility | Specimen |
| POST `/lab-requests/{requestId}/cancel` | TB_OFFICER, LAB_REQUEST_WRITE, requesting facility | Request |
| POST `/lab-request-tests/{testId}/results` | LAB_STAFF, LAB_RESULT_WRITE, testing facility | Requested test |
| POST `/lab-results/{resultId}/corrections` | LAB_STAFF, LAB_RESULT_WRITE, testing facility | Result |

Every assignment/facility must be active. Mixed officer/lab roles receive a deduplicated read union. Facility filters remain within active actor assignments and never widen the role-sensitive query. Result payloads on GET detail additionally require LAB_RESULT_READ. Roles are global across a user's active facilities, as in previous phases. No admin/program/patient/supporter operational bypass or patient SELF lab endpoint is added.

Existing sessions, CSRF/CORS, problem+json, correlation and quoted numeric If-Match behavior are preserved. Source/result input DTOs reject unknown/derived fields. Outputs expose minimal patient UUID/name/sex/birth context, never identity numbers, HIV/DM, unrelated clinical history/notes, accounts or audit/sync data. Audit metadata is traceId-only.

## State transitions and correction strategy

- Registration owners: OPEN/DIAGNOSED + DIAGNOSIS; requesting facility from registration. Case owners: ACTIVE + FOLLOW_UP; requesting facility from currentFacility. REFERRED is ineligible. Exactly one owner and distinct 1–10 active test types; testing facility/reason active.
- Create sets REQUESTED and Clock requestedAt; equal facilities derive INTERNAL, different EXTERNAL. Source specimen recording only REQUESTED/SENT; external sent specimens produce SENT, internal stays REQUESTED.
- Receipt only REQUESTED/SENT/RECEIVED; validates not-future/order including request time. A receipt cannot be overwritten. Received usable and rejected specimens both establish RECEIVED. A rejected specimen produces needsNewSpecimen if no usable receipt remains, without cancelling tests/request. Replacement uses explicit eligible cancellation/new request; no notifications.
- Explicit cancellation only REQUESTED/SENT/RECEIVED with no FINAL/CORRECTED evidence. Sets request/tests CANCELLED, preserving existing children/history.
- Result writer is LAB_STAFF. FINAL requires testedAt and a nonblank code/value/text, a same-request usable specimen if supplied, and non-cancelled request/test. Test becomes RESULT_AVAILABLE; some complete tests produce PARTIAL and all non-cancelled tests complete produce COMPLETED. Results never change diagnosis/case/resistance/treatment.
- Corrections target latest FINAL/CORRECTED in the same nullable-specimen lineage; original row remains byte-for-field unchanged in tests. New CORRECTED row uses same test/specimen, next sequence and new supplied values/date. Diagnostic correction closes at registration conversion; case FOLLOW_UP correction closes when any case treatment has an outcome.
- Request-first locking serializes children/aggregation/cancellation and sequence decisions. Every child write invalidates the root ETag and every result write invalidates the test ETag, even without a status change. Correction locks owner first, sharing registration serialization with clinical case confirmation. V6 uniqueness/lineage checks remain final database protection. No hidden retries or schema changes.

## Source authority

The new LaboratorySourceAuthorityPolicy interface has requireLocalCreate/requireLocalEdit. Its prototype local implementation checks the appropriate role, permission and active actor facility. Every accepted source command uses requestingFacility; receipt/result/correction use testingFacility. Policy denial occurs before mutation and rolls back the command. ClinicalSourceAuthorityPolicy and all Phase 2 checks are unchanged. No external authority fields, guessed SITB schema/API, connector or write-back automation were introduced.

## Judgment and architectural follow-up

No schema/architecture contradiction prevents Phase 3A implementation; no new migration was needed. The existing four laboratory entities remain distinct and unmodified.

Judgments: unknown fields rejected; detail result values require LAB_RESULT_READ; needsNewSpecimen means zero received usable specimens, including before first receipt; repeated receipt rejected; receipt notes replace the existing notes only when supplied; list facility filters restricted to active actor assignments; IN_PROGRESS unused. Multiple FINAL entries use next sequence with current test ETag, as allowed by the approved contract. List/detail use read-only REPEATABLE_READ so parent ETags/child versions/counts/results are projected from one snapshot; commands retain READ_COMMITTED with explicit locks.

Before Phase 3B, resolve two architectural details:

1. Outcome writers must lock the case before inserting an outcome, matching this correction gate, so outcome/correction eligibility cannot race.
2. The approved owner barriers apply to corrections only. A successive FINAL with current test ETag can advance the displayed latest lineage even after registration conversion/outcome. Clarify whether subsequent FINAL entries should share correction barriers; this checkpoint preserves the specified distinction rather than inventing a restriction.

Test-specific interpretation, carried/external historical result ingestion, unusable-specimen notifications and SITB networking are deferred. Phase 3B must consume finalized lab data as displayed evidence, not automatic clinical decisions. No treatment/adherence/follow-up/outcome/adverse-event/referral-transfer/contact/TPT application features were added; a treatment/outcome test fixture only exercises the existing persistence gate.

## Tests and verification

52 new executions in LaboratoryIntegrationTest use PostgreSQL 16 Testcontainers, Flyway V1–V11, Hibernate validation, real sessions and authenticated Spring Security HTTP commands. The sole spy observes/denies the real laboratory source adapter; persistence and HTTP behavior are not mocked.

Coverage includes owner/reason/state matrices; INTERNAL/EXTERNAL creation; inactive/unknown/duplicate catalogs; role/facility isolation and live revocation; mixed-role read union, pagination/filter bounds, minimum projections and result-read permission; specimen timeline, receipt/rejection, required/stale ETags and explicit cancellation; optional/null specimen and same-request lineage; FINAL/PARTIAL/COMPLETED without clinical mutation; append-only/latest/correction barriers; source-policy calls and denied-write rollback; all seven sensitive-data-free audit actions; concurrent same-test and different-test results, corrections and cancellation/result races.

Red evidence before implementation: 45 executions, 44 expected missing-route failures, 0 errors and 0 skipped. The one foreign-owner 404 already passed. Focused green evidence: 45 then 52 executions, 0 failures/errors/skipped, exit 0.

Final command: `mvn clean test`, with Java 21.0.12.1, Maven 3.9.16 and PostgreSQL 16.15 Testcontainers through the local WSL/Docker toolchain. Exit code: **0**.

Exact Maven summary:

```text
[INFO] Tests run: 267, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  06:06 min
[INFO] Finished at: 2026-10-01T20:09:01+07:00
```

| Suite | Executions | Failures/errors/skipped |
|---|---:|---|
| AdminRecoveryIntegrationTest | 40 | 0/0/0 |
| ClinicalIntakeIntegrationTest | 63 | 0/0/0 |
| IdentityAuthorizationIntegrationTest | 46 | 0/0/0 |
| LaboratoryIntegrationTest | 52 | 0/0/0 |
| ProductionVerificationIntegrationTest | 1 | 0/0/0 |
| SecurityConfigurationTest | 13 | 0/0/0 |
| PersistenceIntegrationTest | 7 | 0/0/0 |
| RuntimePersistenceIntegrationTest | 8 | 0/0/0 |
| SchemaHardeningIntegrationTest | 37 | 0/0/0 |

All 215 existing and 52 new executions are green. The clean gate deletes target, recompiles 157 ordinary main Java source files, applies V1–V11 from empty PostgreSQL and starts Spring with Hibernate validation. Compilation has no dependency on executing `.tools/` generators. Local toolchain helpers/logs and target build artifacts remain ignored; they are not application sources. The full local log is `.tools/final-mvn-clean-test.log` (not committed). Kemenkes PDFs and the local task prompt are not committed.

Independent read-only review found no Critical/Important defects. Its minor multi-statement read-consistency finding was resolved using REPEATABLE_READ for queries; follow-up review verified the fix and documentation with no remaining findings. The successive-FINAL owner-gate interaction and future outcome lock protocol are explicitly retained as architectural follow-ups above. Staged diff checks confirmed that migrations, persistence/clinical/security sources, clinical source policy and pom.xml remain unchanged.

## Phase 3A.1 checkpoint addendum

The preceding behavior and 267-test clean-build evidence are the historical Phase 3A checkpoint at ff2a56c885c036da1ced99e8b294dbaae788b119. [Phase 3A.1](architecture/TBCall_Application_API_v1.3A.1_Phase3A.1_Result_Lineage_Hardening.md) resolves its successive-FINAL follow-up: `/results` creates only the first FINAL for an exact `(test, specimen-or-null)` lineage with no existing FINAL/CORRECTED. Subsequent FINAL returns 409 LAB_RESULT_ALREADY_EXISTS without row/version/status/success-audit mutation. Supersession uses the unchanged correction command and owner barriers. Late first entries after conversion/outcome remain allowed; historical nonfinal-only lineages retain max sequence +1.

The future outcome lock order is explicitly TBCase PESSIMISTIC_WRITE -> Treatment PESSIMISTIC_WRITE -> verify no existing outcome -> create TreatmentOutcome. No treatment/outcome service, migration, new clinical interpretation or authorization/source-policy change is introduced. See [Phase 3A.1 report](PHASE3A_1_REPORT.md) for current verification evidence and files changed.
