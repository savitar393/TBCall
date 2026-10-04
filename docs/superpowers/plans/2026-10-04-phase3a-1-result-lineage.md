# Phase 3A.1 Result-Lineage Hardening Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation, test-driven-development for the change, and requesting-code-review for one fresh final read-only review. The user explicitly authorized implementation, clean testing and a completion commit against the approved specification.

**Goal:** Make `/results` the first FINAL entry for an exact `(test, specimen-or-null)` lineage, preserving late first entry and existing correction barriers.

**Architecture:** Add a FINAL/CORRECTED existence check inside the existing locked result command, after optional specimen validation and before mutation. Reuse existing nullable-lineage sequence calculation, aggregation, authorization/source policy and DTOs. No schema change.

**Tech Stack:** Java 21, Spring Boot/Maven, JPA, PostgreSQL/Flyway, JUnit 5/Testcontainers, authenticated MockMvc.

**Spec:** docs/architecture/TBCall_Application_API_v1.3A.1_Phase3A.1_Result_Lineage_Hardening.md. Base: ff2a56c885c036da1ced99e8b294dbaae788b119.

## Global Constraints

- V1–V11 immutable; no new migration.
- Stop before Phase 3B. Document only the future TBCase-before-Treatment outcome lock contract.
- Preserve request -> test -> optional specimen locking, If-Match, authorization, source authority, privacy, aggregation and correction behavior. No retries or test-specific interpretation.
- First missing FINAL remains allowed after conversion/outcome; existing FINAL/CORRECTED lineage must use correction.

## Review Focus

- Null lineage must use IS NULL and must not block any non-null specimen lineage.
- Any existing FINAL/CORRECTED blocks initial entry, including a historical CORRECTED-only lineage or a later nonfinal row.
- Historical PRELIMINARY/CANCELLED alone permit first FINAL at max sequence +1.
- Duplicate with a current test ETag must return LAB_RESULT_ALREADY_EXISTS without any row/version/status/success-audit mutation.
- Concurrent first submissions must have one success; refreshing the loser ETag must not permit a second FINAL.

### Task 1: First-FINAL guard and checkpoint evidence

**Files:** Modify LabResultService.java, LabErrors.java, LaboratoryIntegrationTest.java, docs/LABORATORY.md, docs/PHASE3A_REPORT.md; add docs/PHASE3A_1_REPORT.md and commit supplied architecture. README only if needed to link checkpoint.

**Interfaces:** Consume existing record(CurrentActor, UUID, RecordResult, String) and nullable lineage sequence method; produce 409 LAB_RESULT_ALREADY_EXISTS without changing successful result/correction DTOs.

- [x] Add duplicate usable-specimen and null-lineage/corrected tests with full request/test/result and success-audit snapshots.
- [x] Add separate specimen/null lineages and multi-test PARTIAL/COMPLETED assertions.
- [x] Add parameterized late diagnostic/follow-up first entries for null/non-null lineages; verify both revision paths blocked after conversion/outcome and no clinical mutation.
- [x] Add historical nonfinal max-sequence tests and FINAL/CORRECTED existence tests, including later CANCELLED rows.
- [x] Add two-thread/latch HTTP first-FINAL race; assert one 201, one 409, then current-ETag duplicate rejection and unchanged state.
- [x] Run focused LaboratoryIntegrationTest before production edits; inspect expected 201-versus-409 failures. Result: 68 executions, 12 expected failures, 0 errors/skipped; exit 1. All failures were duplicate FINAL returning 201 instead of 409.
- [x] Add minimal exact-lineage FINAL/CORRECTED query and Indonesian already-exists error; retain nextSequence and correction body unchanged.
- [x] Run focused laboratory suite: all existing 52 and 16 new executions green. Actual 68 executions, 0 failures/errors/skipped, exit 0.
- [x] Update documentation: first entry versus correction, late entries, duplicate no-op, historical sequence, exact future outcome lock order. Preserve original Phase 3A build evidence as history.
- [x] Fresh read-only review; rule on findings against the approved spec. No Critical/Important/Minor findings. Review excluded future outcome service, external writer/import behavior, independent SITB source verification and executor-owned runtime gates; these remain outside this checkpoint or are verified by the executor. No contract deviation was required.
- [x] Run mvn clean test; record exact counts/summary and confirm immutable files, then prepare the requested completion commit. Actual: 283 executions, 0 failures/errors/skipped, exit 0; 11:00 min, finished 2026-10-04T20:52:10+07:00.

Completion handoff: create the user-authorized commit with the reviewed/tested code and recorded evidence; return its SHA and report. No contract deviations or deferred minor findings.

Pre-flight: one task, no shared task interfaces. No specification conflict or schema blocker found.
