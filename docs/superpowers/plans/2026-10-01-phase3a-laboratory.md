# Phase 3A Laboratory Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and requesting-code-review before completion. The user supplied the approved specification and explicitly authorized implementation, clean testing and a commit.

**Goal:** Implement the eight laboratory request/specimen/result endpoints, stopping before treatment Phase 3B.

**Architecture:** Dedicated laboratory DTOs, access/validation/query/view components and command services use the existing four laboratory entities. One status component aggregates results and specimen readiness. A separate local laboratory source policy preserves clinical policy semantics.

**Tech Stack:** Java 21, Spring Boot/Maven, PostgreSQL/Flyway/JPA, JUnit 5/Testcontainers and authenticated Spring Security HTTP tests.

**Spec:** docs/architecture/TBCall_Application_API_v1.3A_Phase3A_Laboratory.md; base a2edfb1582d0a7e9d469713d0308038740a1bf24.

## Global constraints

- V1–V11 and all entities remain unchanged; no migration unless a genuine blocker is reported first.
- No treatment/adherence/follow-up/outcome/clinical interpretation/referral-transfer/contact/TPT/network integration features.
- Explicit projections, role+permission+active facility scope, existing CSRF/CORS/session/problem/If-Match and privacy contract.

## Review focus

- Concurrent specimens/results/corrections/cancellation: request-before-child locks, fresh state after lock waits, version advancement for representation changes.
- Correction versus clinical validation/outcome: owner-before-request locks for correction; reject converted diagnostic owner and existing case outcomes.
- Mixed-role read union with foreign IDs and facility filters: scoped scalar lookup before entities; never widen patient/clinical access.
- Latest results grouped by test and nullable specimen: preserve original rows and use all sequence numbers for lineage ordering.
- Privacy for lab staff and removed result-read permission: minimal patient context, result values require LAB_RESULT_READ; audit metadata only traceId.

## Tasks

### 1. Request, scope and specimen workflow

- [x] Add failing authenticated PostgreSQL tests for owners, active catalogs, union/projections, specimen timeline/version/receipt/cancellation.
- [x] Create LabDtos, LabAccess, LabValidation, LabViews, LabQueryService, LabRequestService, LabSpecimenService, laboratory policy interface/prototype and controller.
- [x] Verify role/facility isolation, source authorization and rollback.

### 2. Final results and corrections

- [x] Add failing tests for partial/completed, specimen lineage/usability, sequence/null lineage, append-only/latest/owner barriers, concurrent writes and sensitive audits.
- [x] Create LabStatusService and LabResultService; lock request/test before sequence decisions; correction locks owner first.
- [x] Verify no diagnosis/case/resistance/treatment mutations and stale If-Match behavior.

### 3. Completion

- [x] Add LABORATORY.md and PHASE3A_REPORT.md; update README/AUTHORIZATION; prepare approved architecture for the completion commit.
- [x] Independent read-only review; resolve material findings.
- [x] Run mvn clean test, verify exact totals and immutable files, stage/review and prepare the user-authorized completion commit.

Handoff: create the completion commit after recording build evidence; return its SHA and the final report. Full clean run: 267 executions, 0 failures/errors/skipped, exit 0; 06:06 min, finished 2026-10-01T20:09:01+07:00.

## Judgments

- Optional facility filters must reference an active actor assignment; the role-sensitive query still restricts requesting versus testing scope.
- Request details are readable with LAB_REQUEST_READ; result payloads additionally require LAB_RESULT_READ. Writer responses follow LAB_RESULT_WRITE authorization.
- needsNewSpecimen means there is no received usable specimen, including a request awaiting its first usable receipt. Rejected receipt records the receipt fact (RECEIVED) and never cancels.
- Repeated receipt is rejected; source specimens can only be added before receipt. The existing unusable-specimen workflow therefore requires explicit cancellation/new request when replacement is needed.
- Multiple FINAL entries are permitted using next sequence per test/specimen, as specified; correction must target the latest FINAL/CORRECTED row and appends CORRECTED.
- Future outcome services must share case-owner locking with corrections; no outcome command is implemented here.
- The owner correction gate does not close successive FINAL entry in the approved contract; document this architectural question before Phase 3B without silently changing the command.
- Read-only list/detail use REPEATABLE_READ to project aggregate versions and children from one snapshot; write commands retain READ_COMMITTED and explicit locks.
