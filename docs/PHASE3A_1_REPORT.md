# Phase 3A.1 result-lineage hardening report

Base commit: `ff2a56c885c036da1ced99e8b294dbaae788b119`. Contract: [Application/API v1.3A.1](architecture/TBCall_Application_API_v1.3A.1_Phase3A.1_Result_Lineage_Hardening.md). The final handoff identifies the completion commit containing this report.

## Files changed

- `src/main/java/id/tbcall/application/laboratory/LabResultService.java` — exact-lineage FINAL/CORRECTED existence guard after request/test/optional specimen locks and validation, before write/source-create execution.
- `src/main/java/id/tbcall/application/laboratory/LabErrors.java` — 409 LAB_RESULT_ALREADY_EXISTS with Indonesian correction guidance.
- `src/test/java/id/tbcall/application/LaboratoryIntegrationTest.java` — new authenticated PostgreSQL lineage, late entry, no-op and concurrency regressions.
- `docs/LABORATORY.md` — current first-entry/correction contract and future outcome lock order.
- `docs/PHASE3A_REPORT.md` — checkpoint addendum; original Phase 3A verification retained as history.
- `README.md` — current checkpoint and links.
- `docs/architecture/TBCall_Application_API_v1.3A.1_Phase3A.1_Result_Lineage_Hardening.md` — approved architecture, as supplied.
- `docs/superpowers/plans/2026-10-04-phase3a-1-result-lineage.md` — implementation and verification checklist.
- `docs/PHASE3A_1_REPORT.md` — this report.

## Lineage and HTTP semantics

Lineage is exactly `(lab_request_test_id, specimen_id-or-null)`. `/results` permits a first FINAL only when that lineage has no FINAL/CORRECTED row. Different specimens and null each remain independent; a requested test can have multiple first results in different lineages. Existence checks any qualifying row, including a historical CORRECTED-only lineage or a lineage whose latest row is nonfinal. PRELIMINARY/CANCELLED-only history does not block first FINAL, and next sequence remains max(all existing sequence numbers in that lineage)+1.

The command preserves scoped request -> test -> optional specimen PESSIMISTIC_WRITE locks, If-Match and existing validation. A duplicate with a current test ETag returns 409 LAB_RESULT_ALREADY_EXISTS with Indonesian instructions to use the correction endpoint when correction is permitted. No result, sequence increment, request/test status/version update or LAB_RESULT_RECORDED audit is created. Existing result rows/versions remain unchanged. Missing/stale ETags retain ordinary 428/409 behavior and precedence; no retry is added.

Late first diagnostic results remain allowed after registration CONVERTED_TO_CASE. Late first follow-up results remain allowed after a TreatmentOutcome exists. Already reported lineages can only be superseded through corrections. Correction stays append-only/latest-only, blocked after diagnostic conversion or follow-up outcome, with cancelled request/test rules unchanged.

Authorization, laboratory/clinical source authority, privacy/projections, status aggregation, response DTOs and all existing endpoint routes remain unchanged. No test-specific clinical interpretation or diagnosis/case/treatment automation is added. This is TBCall application semantics, not a representation of SITB physical API design.

## Tests

16 new executions across seven test methods use PostgreSQL Testcontainers/Spring Security HTTP coverage:

- Same usable-specimen duplicate with current ETag; complete request/test/result row, status/version and success-audit snapshots unchanged.
- Null-lineage duplicate after CORRECTED; subsequent permitted correction still appends normally.
- Two specimens and null for the same test remain independent and aggregate PARTIAL until the other requested test completes.
- Late first entry after actual HTTP case confirmation or an existing outcome fixture, with null/non-null specimens; duplicate FINAL and correction both blocked afterwards; clinical rows remain unchanged (4 executions).
- Historical PRELIMINARY/CANCELLED-only null/non-null lineages permit first FINAL at sequence 8 after sequence 7 (4).
- Historical FINAL/CORRECTED null/non-null lineages reject first-entry command even with a later CANCELLED row (4).
- Two real HTTP worker threads synchronized with ready/start CountDownLatch gates submit the same first FINAL specimen lineage and test ETag. Exactly one 201 and one 409; refreshing the test ETag still rejects another FINAL, with one result and success audit only.

No existing test expectation needs weakening: the earlier specimen/null sequence test already enters different lineages, which remain valid. All original 267 executions are retained. Treatment/outcome rows are persistence test fixtures only; no Phase 3B API or service is implemented.

Regression evidence before production changes: 68 executions, 12 expected failures, 0 errors/skipped, exit 1. Each failure was duplicate FINAL returning 201 instead of the required 409; the original 52 laboratory executions and four nonfinal-history executions passed.

Independent read-only review found no Critical/Important/Minor issues. The reviewer assessed the application against the supplied approved architecture; future outcome/import implementations and independent SITB source verification remain outside this checkpoint, and runtime gates are owned by the executor. No discretionary change to the approved contract was required.

Focused green run: 68 executions (original 52 + new 16), 0 failures/errors/skipped, exit 0.

Final command: `mvn clean test` using Java 21.0.12.1, Maven 3.9.16 and PostgreSQL 16.15 Testcontainers through the local WSL/Docker toolchain. Exit code: **0**.

Exact Maven summary:

```text
[INFO] Tests run: 283, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  11:00 min
[INFO] Finished at: 2026-10-04T20:52:10+07:00
```

| Suite | Executions | Failures/errors/skipped |
|---|---:|---|
| AdminRecoveryIntegrationTest | 40 | 0/0/0 |
| ClinicalIntakeIntegrationTest | 63 | 0/0/0 |
| IdentityAuthorizationIntegrationTest | 46 | 0/0/0 |
| LaboratoryIntegrationTest | 68 | 0/0/0 |
| ProductionVerificationIntegrationTest | 1 | 0/0/0 |
| SecurityConfigurationTest | 13 | 0/0/0 |
| PersistenceIntegrationTest | 7 | 0/0/0 |
| RuntimePersistenceIntegrationTest | 8 | 0/0/0 |
| SchemaHardeningIntegrationTest | 37 | 0/0/0 |

All 267 original and 16 new executions passed. The clean gate removes target, recompiles 157 main Java sources, applies V1–V11 from empty PostgreSQL and starts Spring with Hibernate validation. All compilation sources remain ordinary tracked files; no `.tools/` generator is required. The full local log is `.tools/final-mvn-clean-test.log` (ignored, not committed). Final staged checks confirmed no changes to migrations, persistence mappings, clinical code, source policies, authorization/security configuration, aggregation or pom.xml. No review finding remains and no approved-contract deviation was necessary.

## Persistence and Phase 3B blocker assessment

No schema conflict or migration is required. V1–V11, entities, repositories and build/security configuration remain unchanged. Local prompts/PDFs and `.tools/` helpers/logs are not committed; ordinary repository Java sources compile without generator execution.

The successive-FINAL correction bypass is resolved by first-entry semantics. The remaining Phase 3B lock contract is documented only: lock TBCase PESSIMISTIC_WRITE, then Treatment PESSIMISTIC_WRITE, verify no existing outcome, then create TreatmentOutcome. This serializes with follow-up correction's existing case lock. Phase 3B remains unimplemented and requires its own approved architecture.
