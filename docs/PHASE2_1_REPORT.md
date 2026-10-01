# Phase 2.1 clinical transition hardening report

Base commit: `d6d02e75e0fb2ce0d1f1026d455702121c8342a2`. Contract: [Application/API v1.2.1](architecture/TBCall_Application_API_v1.2.1_Phase2.1_Transition_Hardening.md). The final handoff identifies the completion commit containing this report.

## Files changed

- `src/main/java/id/tbcall/application/clinical/CaseService.java` — disposition-driven confirmation and destination revalidation.
- `src/main/java/id/tbcall/application/clinical/ClinicalQueryService.java` — current-only status-filter validation.
- `src/test/java/id/tbcall/application/ClinicalIntakeIntegrationTest.java` — 16 additional regression executions.
- `docs/CLINICAL_INTAKE.md` — current transition/filter contract and future ACTIVE treatment precondition.
- `docs/PHASE2_REPORT.md` — checkpoint addendum; original Phase 2 build evidence retained as history.
- `README.md` — current public behavior and checkpoint links.
- `docs/architecture/TBCall_Application_API_v1.2.1_Phase2.1_Transition_Hardening.md` — supplied architecture.
- `docs/PHASE2_1_REPORT.md` — this report.

## Behavior changes

After registration/diagnosis locking, lineage checks and registration If-Match, case confirmation uses diagnosis.treatmentDisposition:

| Disposition | Result |
|---|---|
| TREAT_HERE | ACTIVE case |
| REFERRED | REFERRED case after validating its destination |
| NOT_TREATED / UNKNOWN | 409 CLINICAL_STATE_CONFLICT with Indonesian eligibility detail |

Both successful branches retain currentFacility = registration.facility, use injected Clock for confirmedAt, change registration DIAGNOSED → CONVERTED_TO_CASE and record TB_CASE_CONFIRMED. Failure creates no case/success audit and leaves registration status/version unchanged. A legacy null disposition is also rejected: it cannot satisfy either eligible branch. No new diagnosis-result catalog or codes were introduced; diagnosisResult remains narrative and category/resistance remain explicit input.

REFERRED requires a non-null destination that is active and different from the registration facility. The destination is locked for the active-state check at confirmation. An invalid stored destination returns 409 CLINICAL_STATE_CONFLICT. The existing V1 constraint already prevents persisted REFERRED diagnoses without a destination; it remains intact. The confirming diagnosis retains destination data. No referral row, acceptance, facility transfer or treatment is created. Source current clinical scope still includes ACTIVE/REFERRED cases, so the source officer retains visibility after conversion; the destination officer acquires no scope merely from the diagnosis destination.

Patient-list registrationStatus accepts only OPEN/DIAGNOSED and caseStatus only ACTIVE/REFERRED. Historical/noncurrent values return 400 VALIDATION_ERROR. Current-scope queries, projection restrictions, pagination, security, source policy, audits and If-Match are preserved. No new endpoint is added.

## Tests and verification

The 16 additional PostgreSQL Testcontainers/Spring Security HTTP executions cover:

- TREAT_HERE/REFERRED initial statuses, source facility, Clock timestamp, explicit category despite narrative diagnosis result, registration conversion, success audit and current visibility (2).
- No implicit referral/treatment creation or destination access (checked in both success executions); destination retained through confirming diagnosis for REFERRED.
- NOT_TREATED, UNKNOWN and legacy null rejection, unchanged registration status/version, no case and no success audit (3).
- Destination becoming inactive or incorrectly pointing to source between recording and confirmation, with rejection/rollback (2). Missing REFERRED destination is already prohibited by V1 and exercised by the existing diagnosis-validation HTTP test.
- OPEN/DIAGNOSED registration filters (2) and ACTIVE/REFERRED case filters (in the success executions).
- All historical registration/case filter values returning validation errors (7).

All original 199 executions are retained; no previous expected case status needed changing because previous confirmation fixtures use TREAT_HERE. The regression tests run through actual authenticated HTTP commands and migrated PostgreSQL, with no new mocks.

Regression evidence before implementation: the corrected 16-execution focused run produced 13 expected failures, 0 errors and 0 skipped. The initial missing-destination persistence fixture was corrected because V1 already prohibits that state; no constraint was weakened. The corrected tests reproduced the disposition and filter gaps through real HTTP before the production patch.

Final command: `mvn clean test` with Java 21.0.12.1, Maven 3.9.16 and PostgreSQL 16.15 Testcontainers through the local WSL/Docker toolchain. Exit code: **0**.

Exact Maven summary:

```text
[INFO] Tests run: 215, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  05:23 min
[INFO] Finished at: 2026-10-01T19:09:50+07:00
```

| Suite | Executions | Failures/errors/skipped |
|---|---:|---|
| AdminRecoveryIntegrationTest | 40 | 0/0/0 |
| ClinicalIntakeIntegrationTest | 63 | 0/0/0 |
| IdentityAuthorizationIntegrationTest | 46 | 0/0/0 |
| ProductionVerificationIntegrationTest | 1 | 0/0/0 |
| SecurityConfigurationTest | 13 | 0/0/0 |
| PersistenceIntegrationTest | 7 | 0/0/0 |
| RuntimePersistenceIntegrationTest | 8 | 0/0/0 |
| SchemaHardeningIntegrationTest | 37 | 0/0/0 |

All 199 existing and 16 new executions are green. The clean gate removes target, recompiles repository sources, applies V1–V11 from empty PostgreSQL and starts Spring with Hibernate validation. No `.tools/` generator is a compilation prerequisite. The full local log is `.tools/final-mvn-clean-test.log` (ignored, not committed). Independent read-only review found no Critical/Important issues; the intentionally excluded referral/treatment and taxonomy behavior stays deferred exactly as specified.

## Persistence and boundary confirmation

V1–V11 remain unchanged. No V12, entity, schema, DTO, controller, security configuration or permission change is included. Java compiles from ordinary repository sources; local `.tools/` files and Kemenkes PDFs/task prompts are not committed.

## Blocker assessment before Phase 3

No architecture/schema contradiction was found for this checkpoint. Future treatment initiation must enforce current status ACTIVE; REFERRED is pre-treatment and cannot start treatment at the source. Phase 4 referral acceptance will specify destination activation/ownership changes. Phase 3 laboratory/treatment APIs are not implemented in this checkpoint.
