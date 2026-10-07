# Backend v1.5A.1 Read Contracts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with test-driven development and one independent final read-only review.

**Goal:** Enable stateless diagnosis recovery and safe active reference/facility reads before frontend F2A.

**Architecture:** Extend existing ClinicalAccess/ClinicalQueryService and add one read-only clinical directory service/controller with explicit DTOs. Reuse DiagnosisView and IfMatch. No clinical command, authority policy, entity or schema changes.

**Tech Stack:** Existing Java 21, Spring Boot, JPA, PostgreSQL, JUnit/Testcontainers and Windows Maven Wrapper.

**Spec:** docs/architecture/TBCall_Backend_v1.5A.1_Frontend_F2A_Read_Contracts.md.

## Global constraints

- Base 5731ddcad3e5a24c897d81c15a170152de534968; current user feature branch feat/frontend-f2a-read-contracts.
- Preserve V1–V17; no V18; no frontend changes, write semantics changes, authority changes or SITB networking.
- All reads require TB_OFFICER and the existing ClinicalAccess officer semantics. Diagnosis uses DIAGNOSIS_READ and registration-facility active scope; directories use PATIENT_READ.
- Diagnosis list orders diagnosisDate then id, detail uses existing DiagnosisView and normal ETag. Out-of-scope reads return non-enumerating 404; no success read audit.
- Eleven catalog groups contain active code/name only, sorted by code. Workflow options use exact supplied TBCall codes/labels.
- Facilities contain id/name/facilityTypeCode/provinceCode/regencyCode only, active globally discoverable, name/id ordering; page 0 default, size 20 default/max50, supplied query trimmed length2..255, literal wildcard escaping.
- Final gate .\mvnw.cmd clean test; commit/push only backend checkpoint files and approved architecture/docs.

## Review focus

- Read-only officers lacking DIAGNOSIS_WRITE can recover diagnoses without accidentally using a write access path.
- Facility retirement or scope changes hide diagnosis resources while role changes never provide an officer bypass.
- Literal %, _ and ! searches and extreme page offsets cannot broaden the directory or overflow pagination.
- Inactive catalog rows remain readable as historical DiagnosisView labels but never appear in selectable reference catalogs.
- Read endpoints do not update clinical versions/audit or consult mutation source authority; global directory visibility grants no mutation scope.

## Task 1: Authenticated PostgreSQL read-contract regression tests

**Files:** src/test/java/id/tbcall/application/ClinicalReadContractsIntegrationTest.java.
**Interfaces:** Real MockMvc authenticated sessions and PostgreSQL fixtures exercise four endpoint contracts; existing clinical POST/PATCH create/resume proves stateless recovery.

- [x] Add tests for zero/list/order/detail/ETag/reload/edit, role+permission isolation, 404 scope/missing/inactive, and unchanged historical projections.
- [x] Add eleven-group active-only/code-name/sorting checks and exact fixed workflow option labels.
- [x] Add safe global facility projection, query bounds/literal wildcard/case/trim searches, pagination/order and mutation-scope isolation.
- [x] Run .\mvnw.cmd -Dtest=ClinicalReadContractsIntegrationTest test; expect endpoint404 failures before implementation, not compilation errors.

## Task 2: Read-only implementation and delivery

**Files:** ClinicalAccess.java, ClinicalQueryService.java, ClinicalViews.java, ClinicalIntakeController.java; new ClinicalDirectoryDtos.java, ClinicalDirectoryService.java, ClinicalDirectoryController.java; required guide/report and approved architecture.
**Interfaces:** ClinicalAccess.diagnosis(actor,id) uses DIAGNOSIS_READ; ClinicalQueryService.diagnoses(actor,registrationId)/diagnosis(actor,id) returns existing safe view; ClinicalDirectoryService.referenceData(actor)/facilities(actor,page,size,query) returns explicit immutable code/name and page projections.

- [x] Implement dedicated scoped diagnosis read method, list/detail and ETag controller mapping; reuse one label batch for diagnosis list.
- [x] Implement active-only catalogs, exact workflow options and safe paginated facility DTO/search without new persistence abstractions or entities.
- [x] Run focused suite; expect all new tests pass; preserve existing clinical baseline.
- [x] Complete guide/report and independent read-only final review; no findings require fixes. Exact clean result is filled after the separate required gate.
- [x] Run exact .\mvnw.cmd clean test; baseline886 + added58 = 944, zero failures/errors/skips, BUILD SUCCESS.
Publication follows the verified checkpoint: stage only the thirteen allowed backend/documentation files, commit/push and verify remote SHA. Git metadata and the returned SHA record publication without a circular commit reference.

## Execution ledger

- Preflight: HEAD/branch match approved base; no AGENTS.md. Supplied architecture and an unrelated untracked frontend/public/brand/tbcall-logo.svg exist. Logo SHA256 5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696 must be preserved and excluded from commit.
- Ruling: execute the supplied approved design inline on the user feature checkout using a native durable ledger, with no duplicate design approval/worktree setup. Cost if wrong: manual process evidence needs checking.
- Interface scan: dedicated DIAGNOSIS_READ access must not call existing diagnosisRegistration (DIAGNOSIS_WRITE); view shapes and IfMatch remain reused. Directory officer permission uses authenticated actor's active assigned facilities, while returned facilities are not restricted to write scope.
- Baseline attempt: existing ClinicalIntakeIntegrationTest could not start because Docker Desktop Linux daemon pipe was absent; no production change caused this failure. Docker startup is required before valid RED/GREEN evidence.
- Baseline after Docker startup: ClinicalIntakeIntegrationTest 63/63, zero failures/errors/skips, BUILD SUCCESS, 56.958s. Initial daemon absence resolved without code changes.
- Task 1 complete: new endpoint regressions RED 58 run/57 failures/0 errors/0 skipped (missing GET mappings return404/405); anonymous guard passed as expected. No fixture/compile failure.
- Task 2 implementation: focused read-contract suite GREEN 58/58, zero failures/errors/skips, BUILD SUCCESS, 56.608s. Dedicated read permission and shared view label batch verified; no schema/entity/authority/frontend change.
- Final review: independent read-only reviewer found no Critical/Important/Minor issues and no specification conflict; implementation matches narrow approved contracts. No fix pass or second review required.
- Final: Ruling: reviewer declined final clean-test outcome; executor completes the exact clean gate and inspects real totals before publication. Cost if wrong: an unverified build.
- Final: Ruling: reviewer declined commit/push outcome; executor performs the directly authorized publication after verification and checks remote/local SHA. Cost if wrong: an unpublished or mismatched checkpoint.
- Final: Ruling: reviewer declined unrelated logo design/content; preserve its bytes and exclude it from this backend commit. Cost if wrong: user artwork remains separately uncommitted.
- Final exact clean gate: .\mvnw.cmd clean test exit0; Tests run944/Failures0/Errors0/Skipped0; BUILD SUCCESS; Total time11:57min; Finished2026-10-07T09:49:41+07:00. All886 prior tests plus58 new tests passed; fresh PostgreSQL migrations throughV17 and Hibernate/Spring startup verified.
- Shutdown diagnostic recorded transparently: known old-container Hikari reconnect warnings and Surefire fork shutdown after30seconds/System.exit(0); Maven still exit0/BUILD SUCCESS. No unrelated pool/runtime change in the narrow checkpoint.
- Preservation: exactly17 tracked migrations, no diff or new migration/noV18; tracked frontend unchanged; user logo hash remains5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696 and is excluded from the commit. Remaining changes after the clean gate are documentation only.
