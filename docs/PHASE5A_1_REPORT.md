# Backend v1.5A.1 read-contract checkpoint report

## Scope and base

- Base: `5731ddcad3e5a24c897d81c15a170152de534968`.
- Branch: `feat/frontend-f2a-read-contracts`.
- Four new GET contracts only. Clinical commands, source authority, schema and frontend behavior are unchanged.
- V1–V17 remain unchanged; no V18 is added. No genuine schema/specification conflict was found.
- Supplied architecture is committed; ignored local briefs/PDFs/logs and `.tools/` are excluded.
- Pre-existing untracked `frontend/public/brand/tbcall-logo.svg` is preserved byte-for-byte and excluded from the backend commit.

## Changed-file manifest

```text
README.md
docs/FRONTEND_BACKEND_READ_CONTRACTS.md
docs/PHASE5A_1_REPORT.md
docs/architecture/TBCall_Backend_v1.5A.1_Frontend_F2A_Read_Contracts.md
docs/superpowers/plans/2026-10-07-backend-read-contracts.md
src/main/java/id/tbcall/application/clinical/ClinicalAccess.java
src/main/java/id/tbcall/application/clinical/ClinicalDirectoryDtos.java
src/main/java/id/tbcall/application/clinical/ClinicalDirectoryService.java
src/main/java/id/tbcall/application/clinical/ClinicalQueryService.java
src/main/java/id/tbcall/application/clinical/ClinicalViews.java
src/main/java/id/tbcall/web/ClinicalDirectoryController.java
src/main/java/id/tbcall/web/ClinicalIntakeController.java
src/test/java/id/tbcall/application/ClinicalReadContractsIntegrationTest.java
```

## Endpoint contracts

| GET endpoint | Authorization/scope | Projection |
| --- | --- | --- |
| `/api/v1/registrations/{registrationId}/diagnoses` | TB_OFFICER + DIAGNOSIS_READ; active registration facility in actor scope | Existing DiagnosisView array; diagnosisDate/id ascending; `[]` if none |
| `/api/v1/diagnoses/{diagnosisId}` | Same role/permission/registration-facility scope | Existing DiagnosisView plus quoted numeric ETag |
| `/api/v1/clinical-reference-data` | TB_OFFICER + PATIENT_READ; existing officer active-assignment semantics | Eleven active code/name groups plus exact four workflow lists |
| `/api/v1/clinical-facilities` | TB_OFFICER + PATIENT_READ; active assigned facility required | Paginated globally discoverable active facilities; five safe fields only |

Diagnosis reads use a dedicated DIAGNOSIS_READ access path, independent of DIAGNOSIS_WRITE. Missing, out-of-scope and retired-facility resources remain non-enumerating 404. No extra registration-state restriction is invented; historical label rendering remains unchanged. List views share one label batch. Detail ETag reuses IfMatch formatting. A stateless client can list/recover an ID, fetch detail, and use the server ETag in the existing PATCH command.

Patient/supporter/lab/admin/program roles receive no bypass, even with explicitly granted read permissions. Directories use the existing resolver's active assignments, but returned directory facilities are not limited to those assignments. Visibility does not grant mutation scope. Successful reads add no audit and do not change clinical rows/versions/timestamps; existing denial audit/authentication behavior remains intact. Mutation source-authority policies are unchanged and are not used as read gates.

## References and facility directory

Groups: sexCodes, suspectTypes, previousTreatmentCategories, hivStatuses, dmStatuses, anatomicalSites, diagnosisTypes, caseCategories, drugResistancePatterns, pregnancyStatuses, bcgStatuses. Each uses existing `active=true` canonical rows, code ordering and code/name only. Descriptions, inactive historical options, internal IDs, patient data and SITB mapping are excluded.

Fixed TBCall workflow lists preserve the exact architecture labels/order: citizenships WNI/WNA; treatmentDispositions TREAT_HERE/REFERRED/NOT_TREATED/UNKNOWN; registrationStatusFilters OPEN/DIAGNOSED; caseStatusFilters ACTIVE/REFERRED. These are TBCall application options, not claims about official SITB physical codes.

Facility entries contain only id/name/facilityTypeCode/provinceCode/regencyCode; address, coordinates, parents, users/assignments, versions and audit metadata are excluded. Page defaults to 0, size to 20/max50; negative/overflowing offsets and unknown filters are invalid. Supplied query is stripped and length2..255; blank is invalid. Bound case-insensitive substring search escapes `%`, `_` and `!`. Ordering is name/id. Directory lookup never changes existing destination/write validation.

## Tests and verification

New `ClinicalReadContractsIntegrationTest` adds **58 authenticated Spring/PostgreSQL tests**, covering:

- Empty/multiple diagnosis lists, date/id ordering, safe detail/ETag and stateless DIAGNOSED reload/edit.
- Read-only officer without write permission, missing read grants, six isolated non-officer roles even with both grants, three inactive-assignment modes, scoped/missing/retired-facility 404, five registration states and historical labels.
- All eleven active code/name groups, sorted entries, inactive history exclusion and exact workflow options.
- Active safe globally visible facilities, trim/case/literal wildcard search, deterministic pagination, size/query/offset bounds, unknown filters and mutation-scope isolation.
- Clinical row/version/timestamp/audit snapshots around successful reads; anonymous denial.

Evidence before implementation: **58 tests, 57 expected missing-route failures, 0 errors, 0 skipped**. After implementation: **58 tests, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS**; total time 56.608s, finished 2026-10-07T09:36:00+07:00. Existing ClinicalIntakeIntegrationTest baseline: **63 tests, 0 failures/errors/skipped, BUILD SUCCESS**.

Initial baseline attempt failed solely because the Docker Linux engine pipe was unavailable (1 environment error). Docker Desktop was started and the baseline rerun passed. No application change was made to bypass Testcontainers or database verification.

### Required full clean gate

Executed the exact command from `D:\TBCall` on Windows with Java 21 and Docker Desktop:

```powershell
.\mvnw.cmd clean test
```

Exact final Maven result:

```text
Tests run: 944, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 11:57 min
Finished at: 2026-10-07T09:49:41+07:00
```

Process exit code: **0**. The total is the previous **886** tests plus **58** new read-contract tests. Fresh PostgreSQL Testcontainers migrations applied V1–V17; Hibernate and Spring startup succeeded. All previous backend tests remain green.

The log includes known Hikari closed-connection/reconnect warnings from earlier terminated test containers. At final shutdown Surefire also logged `Surefire is going to kill self fork JVM. The exit has elapsed 30 seconds after System.exit(0).` Maven still completed with exit0 and the exact successful result above. This is a test-process shutdown diagnostic, not a reported test failure; no unrelated pool/runtime change was made in this narrow read-contract checkpoint.

Final preservation checks show no diff in tracked frontend files or V1–V17, exactly seventeen migrations, and no untracked/new migration or V18. The pre-existing untracked logo retains SHA256 `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696` and remains outside the commit. Local logs/caches/prompts are ignored.

### Independent review and publication

Independent final read-only review found **no Critical, Important or Minor issues** and no genuine specification conflict. The reviewer verified scope/projection/permission/search safeguards, meaningful PostgreSQL tests, unchanged migrations/frontend and the preserved logo hash. Its assessment is ready subject to the executor's required clean-test/publication gates; no code/test fix or second review is needed.

The reviewer set aside final clean-test outcome, commit/push outcome and unrelated logo design/content. Executor rulings: finish the exact clean gate and inspect actual totals (cost if wrong: an unverified build); perform the directly authorized publication and verify remote/local SHA (cost if wrong: an unpublished/mismatched checkpoint); preserve/exclude the unrelated logo (cost if wrong: user artwork remains separately uncommitted). The returned commit SHA identifies this report without embedding a circular self-reference.

## Judgment and F2A readiness

- Ruling: use the user feature checkout and native durable plan/ledger for the supplied approved specification, without repeating design/worktree consent. Cost if wrong: manual process evidence requires checking.
- Catalog sort is canonical code; workflow lists retain the explicit architecture order. Facility pagination uses the existing page/size/totalElements style and rejects overflowing integer offsets. These choices require no new schema or clinical behavior.
- Successful clinical reads remain read-only; pre-existing authentication activity and denial auditing are unchanged.

The clean gate passed; no backend read-contract blocker remains before separately approved F2A UI. F2A must consume live references, diagnosis list/detail with server ETags, and this directory while preserving backend permission/scope/write validation. No F2A UI or SITB networking is included.
