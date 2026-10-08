# Backend v1.5A.7 — F4 administration read checkpoint report

## Base and scope

Approved base: `d1c0cdd15a7eb4a3fd9a51dd633a75cfae6c5425`.
Branch: `feat/frontend-f4-read-contracts`.
Specification: [approved architecture](architecture/TBCall_Backend_v1.5A.7_F4_Admin_Read_Contracts.md).

This adds exactly three administration GET contracts. No schema change or administration/integration write change was required. F4 UI is not implemented.

## Changed-file manifest

| Path | Change |
| --- | --- |
| `src/main/java/id/tbcall/application/admin/AdminDtos.java` | Explicit safe summary/page and code/name reference DTOs |
| `src/main/java/id/tbcall/application/admin/AdministrationReadService.java` | New read-only list and reference queries |
| `src/main/java/id/tbcall/application/admin/FacilityAdministrationService.java` | Authorized read-only detail using the existing response mapper |
| `src/main/java/id/tbcall/authorization/AdministrativePolicies.java` | Additive reference-read authorization; existing gates unchanged |
| `src/main/java/id/tbcall/web/AdministrationController.java` | Exactly three GET mappings and additive read-service wiring |
| `src/test/java/id/tbcall/application/AdminReadContractsIntegrationTest.java` | 52 new PostgreSQL/Spring regression cases |
| `src/test/java/id/tbcall/application/MonitoringIntegrationTest.java` | Correct existing midnight-dependent invalid-end-date fixture; no production behavior change |
| `docs/FRONTEND_ADMIN_READ_CONTRACTS.md` | Exact contracts, preconditions and frontend handoff |
| `docs/architecture/TBCall_Backend_v1.5A.7_F4_Admin_Read_Contracts.md` | Supplied approved architecture, unchanged |
| `docs/PHASE5A_7_REPORT.md` | This checkpoint report |
| `README.md` | Link to the new read checkpoint |

## Exact endpoint contracts and authorization

| Endpoint | Authorization | Response |
| --- | --- | --- |
| GET `/api/v1/admin/facilities` | SYSTEM_ADMIN + FACILITY_MANAGE; no assignment required | Page with `content`, `page`, `size`, `totalElements`; summaries contain only `id`, `name`, `facilityTypeCode`, `parentFacilityId`, `provinceCode`, `regencyCode`, `active` |
| GET `/api/v1/admin/facilities/{facilityId}` | SYSTEM_ADMIN + FACILITY_MANAGE; authorization before resource existence | Existing FacilityResponse and actual quoted ETag; missing resource 404 |
| GET `/api/v1/admin/reference-data` | SYSTEM_ADMIN + any actually-held FACILITY_MANAGE/USER_MANAGE_FACILITY/ROLE_MANAGE/USER_ACCOUNT_MANAGE, or FACILITY_ADMIN + USER_MANAGE_FACILITY + active assignment to an active facility | Exactly `facilityTypes` and `adminManagedRoles`, each database-backed code/name only, sorted by code |

List parameters: page defaults to 0; size defaults to 20, allowed 1..50; nonnegative page and integer-safe offset; optional trimmed query must be 2..255 characters when supplied; optional active boolean. Omitted active includes both states. Search is a case-insensitive facility-name substring with literal `%`, `_`, `!` escaping. Order is name then UUID. Summary omits version and private/unneeded master fields; no list ETag is emitted.

Detail reuses all existing master fields: `id`, `version`, `name`, `facilityTypeCode`, `parentFacilityId`, `address`, `provinceCode`, `regencyCode`, `districtCode`, `villageCode`, `postalCode`, `latitude`, `longitude`, `active`. Its actual ETag is the authoritative If-Match source for existing PATCH/deactivate. A successful PATCH increments version, making the previous ETag stale (409). Existing missing-precondition behavior (428) is unchanged. No facility reactivation is added.

References include active facility types only. Managed roles reuse the existing ADMIN_MANAGED set and return exactly FACILITY_ADMIN, LAB_STAFF, PROGRAM_MONITOR, SYSTEM_ADMIN, TB_OFFICER. No PATIENT/TREATMENT_SUPPORTER, role IDs, descriptions or permissions appear. Database labels remain live. All values are TBCall administration vocabulary, not official SITB user/group mappings.

A wrong role cannot bypass any role gate with artificial grants. FACILITY_ADMIN reference visibility grants no facility-master, global-role or account-status command. Existing session resolution provides current permissions and active facility scope; grant/assignment revocations apply on an existing session. Anonymous reads remain 401; authorization denials retain existing audit behavior. Successful new GETs produce no audit or data mutation.

## Tests and review

The new class adds **52 PostgreSQL/Spring test cases** for default/filter/search/literal wildcard/paging contracts, stable same-name UUID order, exact summary/detail projection, ETag absence on list and actual detail tags, PATCH stale-tag rejection, deactivate handoff, authorization role/grant matrix, active assignment requirements, live active types, exactly five DB-backed managed roles, write isolation, anonymous requests, revocation and complete database snapshots proving successful reads have no audit/domain mutation.

RED before production implementation: **52 tests, 51 failures, 0 errors, 0 skipped, BUILD FAILURE**. Missing routes returned 404; the existing anonymous guard already passed.

Focused GREEN command: `.\mvnw.cmd '-Dtest=AdminReadContractsIntegrationTest,AdminRecoveryIntegrationTest' test`.
Result: **92 tests, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS**, including 52 new cases plus all 40 existing administration/recovery tests. Total time: 01:32 min; finished 2026-10-08T07:05:55+07:00.

An independent read-only review found no actionable issues in the administration checkpoint. Final clean-suite evidence is recorded below after completion.

The initial full clean build returned **1310 tests, 1 failure, 0 errors, 0 skipped, BUILD FAILURE** (13:53 min; finished 2026-10-08T07:20:03+07:00). Its only failure exposed the existing `MonitoringIntegrationTest.planHistoryAndEventCountAreScopedAndBounded` fixture assumption: its UTC clock was shortly after midnight, so an event scheduled two hours earlier fell yesterday. The test used yesterday as an allegedly invalid plan end and received a correct 200 rather than expected 400. The fixture now uses three days ago, after the plan start (five days ago) and strictly before the event at any UTC time of day. This preserves the intended event-bound rejection regression and changes no monitoring production code or semantics. An independent read-only follow-up review confirmed this correction. The affected regression and exact clean build are rerun before commit.

## Exact clean-build result

After the isolated fixture regression passed (**1 test, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS**; 28.299 s; finished 2026-10-08T07:20:45+07:00), the exact command `.\mvnw.cmd clean test` was rerun on Windows with Java 21.0.12.1 and Maven wrapper 3.9.16.

Final Maven output:

```text
Tests run: 1310, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 14:06 min
Finished at: 2026-10-08T07:35:01+07:00
```

Exit code: **0**. All 1258 existing tests and 52 new cases passed. The existing monitoring test count is unchanged by its fixture correction. Fresh PostgreSQL Testcontainers applied all 17 migrations through V17; Hibernate validation and Spring application startup succeeded. No code/test changes followed this final clean build.

The run logged Hikari reconnection/teardown warnings for previously stopped Testcontainers and the following Surefire shutdown diagnostic after all tests completed:

```text
Surefire is going to kill self fork JVM. The exit has elapsed 30 seconds after System.exit(0).
```

Maven nevertheless returned BUILD SUCCESS and exit 0, with zero test errors. This test-harness shutdown diagnostic is retained transparently; pool/Surefire configuration and production lifecycle behavior were not changed to suppress it.

## Protected scope and F4 handoff

All 296 snapshotted protected tracked files remain byte-for-byte unchanged: frontend files, migration/resources, integration implementation/tests and Maven configuration/wrapper. V1–V17 are unchanged and no V18 exists. The final manifest contains only this checkpoint. Existing administration write bodies, exact user lookup, membership/primary assignment, role/status management, revocation, verification, system-admin guard and patient/supporter identity workflows remain unchanged.

All Phase 5A integration endpoints/persistence are unchanged. No connector/credential/sync/conflict-resolution controls, authority mutations, SITB network calls or external contract claims are added. F4 must use detail ETags and existing command scopes, and keep integration browsing read-only.

No schema/specification conflict or additional backend contract blocker was found for the documented F4 scope. F4 UI needs its own approved architecture/task brief. The test-harness shutdown diagnostic above remains a separate verification limitation, rather than a new F4 API requirement.

Local logs and hash snapshots are ignored under `.tools/`; they are not compilation dependencies. Prompts, PDFs, secrets, caches and unrelated assets are excluded. The pre-existing untracked backend category-guard architecture and brand asset are left untouched and uncommitted. No merge is performed.
