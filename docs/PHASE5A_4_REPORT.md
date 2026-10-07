# Backend v1.5A.4 — continuity read-contract checkpoint report

## Base and scope

- Approved base: `e55f769e60184013f7fb61a85bbfc5b2679ba153`.
- Branch: `feat/frontend-f2d-read-contracts`, already present at the approved base when work began.
- Five additive GET endpoints only. V1–V17 unchanged; no V18. Frontend and existing referral/query/contact/investigation/TPT services, contact-patient linking, ownership/source-authority policies and write semantics unchanged. No F2D UI or SITB networking.
- No schema, persistence mapping or specification conflict requires a change. V11 already forbids a REFERRED diagnosis without a target; regression fixtures respect that invariant rather than disabling constraints. The preparation projection still handles missing diagnosis/target defensively.
- No dependency/configuration changes or production dependency on `.tools/`. Prompts, local logs/helpers, PDFs, caches, secrets, screenshots and unrelated assets excluded. Unrelated untracked backend v1.5A.3.1 architecture and frontend logo preserved/excluded.

## Changed-file manifest

1. `src/main/java/id/tbcall/application/continuity/ContinuityReadDtos.java` — explicit safe preparation/facility/reference DTOs.
2. `src/main/java/id/tbcall/application/continuity/ContinuityReadService.java` — officer-gated, read-only scalar projections/search/live preventive catalog and fixed options.
3. `src/main/java/id/tbcall/web/ContinuityReadController.java` — exactly five new GET routes.
4. `src/test/java/id/tbcall/application/ContinuityReadIntegrationTest.java` — PostgreSQL/Spring/session regression matrix.
5. `docs/FRONTEND_CONTINUITY_READ_CONTRACTS.md` — complete endpoint contracts and F2D handoff guide.
6. `docs/PHASE5A_4_REPORT.md` — this report.
7. `docs/architecture/TBCall_Backend_v1.5A.4_Frontend_F2D_Continuity_Read_Contracts.md` — supplied approved architecture, tracked unchanged.

## Exact endpoints and scope

All paths below are GETs under `/api/v1`. All require TB_OFFICER and active facility assignment through existing session/officer semantics. No unrelated PATIENT_READ/CASE_READ/DIAGNOSIS_READ/TREATMENT_READ is required.

| Endpoint | Permission and additional scope | Exact response groups/fields |
| --- | --- | --- |
| `/cases/{caseId}/referral-preparation` | REFERRAL_WRITE; case current facility active and assigned | caseId, caseStatus, caseCategoryCode, sourceFacility `{id,name}`, nullable preTreatmentDestination `{id,name}`, nullable openTreatment `{id,status,startDate,plannedEndDate,regimenCode,regimenName}`, inFlightReferral |
| `/continuity-facilities` | REFERRAL_WRITE OR CONTACT_WRITE | content of `{id,name,facilityTypeCode,provinceCode,regencyCode}`, page, size, totalElements |
| `/referral-reference-data` | REFERRAL_READ | referralTypes, referralStatuses |
| `/contact-reference-data` | CONTACT_READ | workflowTypes, creatableWorkflowTypes, investigationStatuses |
| `/tpt-reference-data` | TPT_READ OR TPT_WRITE | preventiveRegimens `{code,name,caseCategoryCode}`, tptStatuses, durationUnits |

Fixed options contain only code/name and match every approved Indonesian label/order. INCOMING_REFERRAL is displayed but excluded from contact creation options. All labels are TBCall workflow labels, not SITB physical-schema/API identifiers. The handoff guide records the complete option tables.

Referral preparation reads only the confirming diagnosis for a REFERRED destination; no fallback to other diagnoses. It selects only PLANNED/ACTIVE/PAUSED treatment and SENT/RECEIVED in-flight referral. Existing V1 uniqueness guarantees at most one open episode. Scalar queries use no write lock and do not call sendCase(). Historical inactive regimen names remain available, nullable regimen/end date/diagnosis do not eliminate rows, and terminal treatments are excluded. No ETag/reservation; send remains authoritative for state, source authority, concurrency and scope.

Facility directory is global active-only, default page=0/size=20, size 1–50, integer-offset overflow guard. Optional supplied query is trimmed and must contain 2–255 characters; blank is invalid. Case-insensitive substring matching escapes literal !/%/_. Order is name then UUID. Directory visibility grants no case/referral/contact write scope.

TPT catalog queries live active PREVENTIVE regimens with non-null category, ordered category/code. TB_TREATMENT, inactive and null-category entries excluded. No effective-date filtering, composition or eligibility inference. Either OR gate selects a relevant permission the actor actually holds.

## Privacy and compatibility

No patient identity, diagnosis prose, treatment notes, addresses/coordinates/parent internals/assignments/audit data, regimen UUID/description/effective dates/regimen_drugs/dose/frequency/duration guidance is exposed by these projections. Successful reads have no audit or clinical/configuration/authorization mutation. Existing denial auditing remains. No write permission or ownership expansion, no contact linking changes, no new schema/index/enum and no source-authority-policy change.

## Tests

Existing backend baseline: 998. Added **104** integration cases in one test class using real PostgreSQL 16 Testcontainers, migrations, Spring application startup, sessions and MockMvc, without component mocks:

| Cases | Coverage |
| --- | --- |
| 24 | REFERRAL_WRITE-only preparation; exact private projection/no ETag; confirming-diagnosis-only destination; nullable joins; three open/four terminal states; six in-flight states; missing/foreign/inactive current facility; concurrent case write-lock read |
| 16 | Either directory permission without PATIENT_READ; global active-only safe projection; name/UUID pagination; trimmed case-insensitive literal wildcard search; blank/length/pagination/overflow/max-size boundaries |
| 5 | Exact referral/contact/TPT labels and creatable subset; TPT_READ-only/TPT_WRITE-only; live active PREVENTIVE categorized catalog ordering/exclusions/privacy |
| 5 | Missing independent permission denied on each endpoint |
| 30 | Six wrong roles with artificial permissions denied on all five endpoints |
| 15 | Missing/inactive assignment or inactive facility denied on all five endpoints |
| 5 | Anonymous access denied on each endpoint |
| 4 | Directory does not confer foreign mutation ownership; read references do not confer writes; repeated reads leave persistence/permissions/audit unchanged |

Initial sandbox run could not access Docker (environment error); the authorized elevated run reached PostgreSQL. Before production implementation, the 102-case RED run had 93 missing-contract assertion failures and two errors: the asynchronous missing-route assertion and one invalid REFERRED/null-target fixture rejected by V11. That fixture was corrected to a valid TREAT_HERE/null-target state; two additional isolation regressions were added. No database invariant was weakened.

Focused verification command: `.\mvnw.cmd -Dtest=ContinuityReadIntegrationTest test`.

```text
Tests run: 104, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time:  01:05 min
Finished at: 2026-10-07T18:48:30+07:00
```

Independent read-only review: **0 Critical, 0 Important, 0 Minor**. Reviewer checked production contracts, existing session/access/send semantics, tests, guide and protected-file scope; did not run tests, network, mutate files or review this report draft. Executor checked this report and verifies build/publication evidence separately.

Reviewed design judgments: preparation may span READ_COMMITTED snapshots and remains advisory; historical inactive destination/regimen display represents recorded data; effective-date/eligibility/source-authority write policy is not inferred by GETs; fixed lists describe statuses, not transition permissions; existing denial audits remain. These match the approved architecture. Send/write commands recheck state and scope; preparation does not reserve either. No deferred code-review finding or newly invented backend workaround.

Exact required command: `.\mvnw.cmd clean test`, run from repository root on Windows with Docker/PostgreSQL Testcontainers access.

```text
Tests run: 1102, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time:  12:51 min
Finished at: 2026-10-07T19:01:42+07:00
Process exit code: 0
```

The result includes all 998 previous tests plus 104 new cases, fresh PostgreSQL migrations through V17, Hibernate validation and Spring startup. Final staged scope check has no frontend, migration, existing workflow/policy or dependency-file changes.

Non-test-failure diagnostics remain visible: Hikari background pools attempted reconnects after earlier test classes' containers terminated. During cached Spring-context pool shutdown, Surefire emitted `[ERROR] Surefire is going to kill self fork JVM. The exit has elapsed 30 seconds after System.exit(0).` The same shutdown message is present in the preserved earlier v1.5A.3.1 clean-build log. All assertions and test classes completed, Maven then reported the exact BUILD SUCCESS above with exit 0. Mockito/JDK agent warnings also appeared. This checkpoint makes no production behavior/configuration changes to silence test lifecycle diagnostics. The existing shutdown diagnostic is a test-harness operational limitation, not an additional continuity contract blocker.

## F2D handoff

No schema/specification conflict or additional backend contract blocker was found. Preparation is advisory; existing sends, investigation transitions, exact patient linking and TPT commands remain authoritative and unchanged. F2D UI requires its separate approved checkpoint and has not begun.
