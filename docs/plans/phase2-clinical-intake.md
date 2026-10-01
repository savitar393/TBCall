# Phase 2 Clinical Intake Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and a fresh independent review before the final commit.

**Goal:** Implement patient identity → Terduga registration → diagnosis → confirmed case, stopping before laboratory/treatment workflows.

**Architecture:** Dedicated clinical intake command/query services use explicit DTOs, current patient scope and registration/case resource scope. Flyway remains authoritative; existing entity mappings remain intact. Every clinical write invokes the create/edit source policy after permission/scope checks.

**Tech stack:** Java 21, Spring Boot/Maven, PostgreSQL, JPA, Flyway, JUnit 5, Testcontainers, Spring Security HTTP tests.

**Spec:** docs/architecture/TBCall_Application_API_v1.2_Phase2_Clinical_Intake.md; base dbb659fdbf48f9333ecfc819c1f814e69a6de5fc. The user explicitly authorized inline implementation and a completion commit.

## Constraints and review focus

- Preserve V1–V10 and Phase 1/1.1 authorization, CSRF/CORS, sessions, audit and If-Match; add only prescribed V11.
- No laboratory/treatment/referral/contact/TPT/monitoring/network integration or negative/non-TB closure.
- Exact identity resolution requires authoritative key plus secondary confirmation; never expand into a directory or trust an out-of-scope patientId.
- Unknown and unrelated resource IDs must receive indistinguishable errors; projection must exclude other facilities' historical records.
- Concurrent diagnosis editing and case confirmation must share registration-before-diagnosis locks; case uniqueness remains enforced by PostgreSQL.
- A same-version additional diagnosis must advance registration.version even if already DIAGNOSED; otherwise registration If-Match is ineffective.
- List filters, projections and summaries must use the same scoped current episodes, with bounded batch queries and size≤50.

## Tasks

### 1. Identity, registration and reference validation

Files: ClinicalIntakeIntegrationTest; V11; clinical DTOs/errors/references/policies; PatientIdentityService and RegistrationService.

- [x] Write/run failing HTTP tests for exact resolution, WNI/WNA, duplicates, atomic creation, historical re-confirmation, reference codes and scope.
- [x] Implement trimmed canonical identities, normalized secondary name/phone, exact resolver, database-backed duplicate handling, explicit modes and OPEN creation.
- [x] Verify migration grants/index and representative identity/registration persistence.

### 2. Clinical queries and demographic/registration patches

Files: ClinicalQueryService, PatientService, ClinicalIntakeController, DTOs/policies.

- [x] Write/run failing tests for bounded list filters, current-only detail, historical resource reads, safe projections, patch merge/version/reference rules and SELF view.
- [x] Implement explicit projections and batched summaries; queries scope at database level before fetching entities; patches accept only enumerated fields and revalidate merged state.
- [x] Verify scope/field restrictions and source policy invocation.

### 3. Diagnosis and confirmation/case profile

Files: DiagnosisService, CaseService; source policy interface/implementation; integration tests.

- [x] Write/run failing tests for state transitions, dates, lineage, resistance, immutable confirming diagnosis, concurrent confirmation, source checks and sensitive audit exclusion.
- [x] Implement registration-first locks for episode commands, explicit version increments for additional diagnosis, prescribed ACTIVE confirmation and allowed case profile patch.
- [x] Verify end-to-end sequence and previous tests.

### 4. Documentation, review and completion

- [x] Add CLINICAL_INTAKE.md; update README/AUTHORIZATION, approved architecture and final report.
- [x] Request independent review; resolve material findings with regression evidence.
- [x] Run mvn clean test; check exact counts and preserved migrations; prepare verified changes for the requested commit and SHA/report handoff.

## Decisions / evidence ledger

Ruling: the supplied approved architecture and explicit implementation request authorize execution without a second design approval. No database contradiction found during initial review.

Ruling: secondary fullName confirmation normalizes trim, repeated whitespace and case for exact comparison; it does not permit substring/fuzzy matching. WNA ambiguity is evaluated after all supplied confirmations. BPJS is additional verification only.

Ruling: clinical resource lookups apply facility/current scope in the query and return the same 404 for absent/out-of-scope resources; callers lacking role/permission receive 403 ACCESS_DENIED. This avoids existence disclosure while retaining existing problem semantics.

Evidence: initial 39 executions failed for missing Phase 2 endpoints. Expanded regression runs reproduced malformed/ambiguous confirmation UUID disclosure, duplicate NIK/BPJS PATCH returning DATA_CONFLICT, and a concurrent new-identity flush race. Confirmation now resolves before UUID lookup and is rechecked after lock/refresh; explicit clinical flush precedes IDENTITY audit persistence. Final independent review found no remaining Important/Critical issues.

Ruling: birthDate and birthDateUnknown=true are mutually exclusive; active reference validation applies to merged writes. Identity uniqueness remains NIK/BPJS under existing PostgreSQL constraints. No WNA uniqueness or SITB ownership schema was invented.

Final evidence: mvn clean test exited 0, BUILD SUCCESS; 199 executions, 0 failures/errors/skipped (152 existing + 47 new), 05:09 min, finished 2026-10-01T18:36:46+07:00. The obsolete Phase 1 route-absence test now asserts public NIK claim rejection and ordinary-account clinical denial; the test remains in the suite. V1–V10/entity diffs are empty.
