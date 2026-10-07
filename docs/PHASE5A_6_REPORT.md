# Backend v1.5A.6 — F3 portal reference checkpoint report

## Base and scope

- Approved base: `653c48a5b005c6a84f211bc826b64c007b62c8b0`; continued `feat/frontend-f3-read-contracts`.
- Exactly one additive GET, one DTO container and one read-only service. No new permission, role grant, write endpoint, repository, schema, dependency or configuration change.
- All 515 pre-existing tracked files under frontend, src, pom.xml, Maven wrapper and .mvn match their pre-implementation SHA-256 hashes. V1–V17 remain unchanged; exactly 17 migration files exist and no V18 is added.
- Existing patient/supporter treatment selection, TPT projections, actor-specific adherence validation, follow-up, monitoring, alert receipt and notification-read behavior remain unchanged. No scheduler/fanout or source-authority change.
- F3 UI and SITB networking are not implemented. No schema/specification conflict or additional backend read-contract blocker was identified.
- No compilation dependency on `.tools/`. Local prompts, logs, helpers, PDFs, secrets, caches, screenshots and unrelated assets are excluded. The unrelated untracked v1.5A.3.1 architecture and frontend logo are preserved and excluded.

## Changed-file manifest

1. `src/main/java/id/tbcall/application/portal/PortalReferenceDtos.java` — code/name Option and fourteen-group ReferenceData records.
2. `src/main/java/id/tbcall/application/portal/PortalReferenceService.java` — explicit role/held-grant gate and approved ordered immutable vocabulary under a read-only transaction.
3. `src/main/java/id/tbcall/web/PortalReferenceController.java` — GET `/api/v1/me/portal-reference-data` using the existing authenticated CurrentActor.
4. `src/test/java/id/tbcall/application/PortalReferenceIntegrationTest.java` — 72 PostgreSQL/Spring/session/MockMvc regression cases.
5. `docs/FRONTEND_PORTAL_READ_CONTRACTS.md` — authorization, exact codes/order/labels, privacy and F3 handoff.
6. `docs/PHASE5A_6_REPORT.md` — this report.
7. `docs/architecture/TBCall_Backend_v1.5A.6_F3_Portal_Reference.md` — supplied approved architecture, tracked unchanged.
8. `README.md` — checkpoint summary and guide/report links.

## Authorization and design judgments

`GET /api/v1/me/portal-reference-data` requires an authenticated active account/session, **PATIENT or TREATMENT_SUPPORTER**, and at least one actually-held grant from TREATMENT_READ, ADHERENCE_READ, ADHERENCE_RECORD, FOLLOW_UP_READ, TPT_READ, MONITORING_READ, ALERT_READ, ALERT_ACKNOWLEDGE, NOTIFICATION_READ_SELF.

The gate deliberately checks only the specified portal role and held grant. Existing resource access helpers also require SELF/supporter linkage or facility scope, so this vocabulary service uses an explicit gate without modifying those helpers. No facility assignment, patient link, active treatment or supporter-case linkage is required. Actors with a portal and staff role satisfy the approved OR gate; staff/admin-only actors with artificial portal grants fail. Existing session resolution rereads roles/grants each request, including after revocation.

Anonymous, expired-session and suspended-account calls return 401; service role/grant denials return 403 and retain the existing AUTHORIZATION_DENIED audit. Successful vocabulary reads produce no audit, entity mutation or additional permission. There is no resource identifier or ETag/If-Match requirement for this global vocabulary. POST/PATCH/DELETE on the new path return 405 for authenticated callers with valid CSRF.

Explicit ordered List.of options avoid deriving portal choices from broad database CHECK enums. No AdherenceService allowlist is changed; actual existing patient/supporter POST acceptance and rejection verify compatibility. Options are TBCall canonical UI/workflow codes and labels, not official SITB physical-schema or API codes.

## Exact response groups and codes

All groups contain only `code` and `name`; all fourteen are returned in the approved shape. [The read contract](FRONTEND_PORTAL_READ_CONTRACTS.md#exact-ordered-response) records every exact Indonesian label and option order.

| Group | Ordered codes |
| --- | --- |
| treatmentStatuses | PLANNED, ACTIVE, PAUSED, TRANSFERRED, COMPLETED, STOPPED, CANCELLED |
| tptStatuses | PLANNED, ACTIVE, COMPLETED, STOPPED, LOST_TO_FOLLOW_UP, CANCELLED |
| patientDoseStatuses | TAKEN_SELF_REPORTED, MISSED, UNKNOWN |
| supporterDoseStatuses | TAKEN_OBSERVED, TAKEN_SELF_REPORTED, MISSED, UNKNOWN |
| administrationModes | DIRECTLY_OBSERVED, SELF_ADMINISTERED, OTHER |
| followUpStatuses | SCHEDULED, COMPLETED |
| treatmentMonitoringEventTypes | CLINICAL_REVIEW, WEIGHT_REVIEW, ADHERENCE_REVIEW, ADVERSE_EVENT_REVIEW, BACTERIOLOGY_FOLLOW_UP, SAFETY_MONITORING, MEDICATION_PICKUP |
| tptMonitoringEventTypes | CLINICAL_REVIEW, WEIGHT_REVIEW, ADHERENCE_REVIEW, ADVERSE_EVENT_REVIEW, MEDICATION_PICKUP |
| monitoringEventStatuses | SCHEDULED, DUE, OVERDUE, COMPLETED, CANCELLED |
| alertTypes | MONITORING_OVERDUE |
| alertStatuses | OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED |
| alertSeverities | INFO, WARNING, HIGH, CRITICAL |
| notificationStatuses | PENDING, SENT, DELIVERED, READ, FAILED, CANCELLED |
| notificationChannels | IN_APP |

patientDoseStatuses excludes TAKEN_OBSERVED and DISPENSED_HOME; supporterDoseStatuses excludes DISPENSED_HOME. Both roles receive all fourteen groups, and each actor's existing write validation still determines allowed dose choices. TPT monitoring has no bacteriology/safety option and only IN_APP is advertised for notifications. There is no patient/case/treatment/TPT identifier, staff catalog, regimen/dose composition, adherence score, outcome inference, monitoring schedule guidance, alert-generation internal data or notification recipient in the response.

## Tests and review

Baseline: **1186 backend tests**. Added **72** real PostgreSQL 16 Testcontainers/Spring integration cases, with no mocked application components:

| Cases | Coverage |
| --- | --- |
| 2 | Patient/supporter vocabulary read without facility, patient or supporter-case linkage, or treatment |
| 18 | Each of nine individually-held relevant permissions authorizes each portal role; exact resolved grants checked |
| 4 | Missing relevant grant and unrelated PATIENT_READ rejected for each portal role |
| 5 | TB_OFFICER, LAB_STAFF, SYSTEM_ADMIN, FACILITY_ADMIN and PROGRAM_MONITOR rejected despite all nine artificial portal grants |
| 1 | Anonymous request returns 401 |
| 4 | Existing-session grant/portal-role revocation, suspended account and expired session |
| 1 | Legitimate portal role alongside a staff role remains allowed |
| 1 | Linked patient with only terminal treatment can read vocabulary, while dose write remains rejected |
| 14 | Exact codes, Indonesian labels and ordering for every option group |
| 2 | Exact fourteen-group code/name-only privacy projection and prohibited option exclusions |
| 2 | Repeated successful reads leave every public table, including sessions, grants, audit and notifications, unchanged |
| 12 | Actual patient/supporter dose writes for observed/self-reported/dispensed-home/missed/unknown/invalid statuses match the advertised allowlists; accepted source provenance unchanged |
| 2 | Vocabulary access grants no dose, alert receipt or notification-read write permission or domain side effect |
| 3 | No POST/PATCH/DELETE method on the reference endpoint |
| 1 | Fresh PostgreSQL Flyway history contains exactly V1 through V17; Spring/Hibernate startup succeeds |

Initial feature regression failed with expected 200 versus actual 404 before endpoint implementation. After implementation the focused suite passed 72/0/0/0. An expanded test fixture initially violated the existing expires_at > created_at session constraint; moving both timestamps into the past corrected the fixture without any schema or production change.

Independent read-only review covered the approved architecture, gate, safe projections, unchanged AdherenceService compatibility and tests; no actionable implementation finding or blocker was identified.

## Exact clean-build result

Command on Windows with Java 21 and Docker Desktop:

```powershell
.\mvnw.cmd clean test
```

Exact Maven result:

```text
[INFO] Tests run: 1258, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  13:45 min
[INFO] Finished at: 2026-10-08T02:17:23+07:00
EXIT_CODE=0
```

Fresh Surefire XML independently totals **1258 tests across 29 classes**, zero failures/errors/skipped: all previous 1186 plus 72 new cases. Fresh PostgreSQL migrations through V17 and Spring/Hibernate startup succeeded. No source/test file changed after the clean build started.

The log includes Hikari reconnect warnings from pools associated with terminated Testcontainers, existing V1 nested-transaction warnings, and JVM/Mockito dynamic-agent warnings. Surefire also logged `[ERROR] Surefire is going to kill self fork JVM. The exit has elapsed 30 seconds after System.exit(0).` during shutdown; the same diagnostic appears in the previous 1186-test clean-build log. Maven nevertheless returned exit code 0 and BUILD SUCCESS with all test XML green. These diagnostics are retained in the local log and reported here; no workflow/configuration change was introduced to suppress them.

Default-sandbox Testcontainers initially could not access the Windows Docker named pipe. The focused and clean builds were run with approved Docker access; no tests were disabled or skipped and no build/test dependency was changed.

## Before F3

No new backend contract or schema change is required by this checkpoint. F3 remains a separately approved frontend task. Its PATIENT and TREATMENT_SUPPORTER experiences must use existing safe resource APIs, actual current grants/linkage, the matching actor's dose options and authoritative detail ETags for existing If-Match writes. Vocabulary access alone supplies no clinical resource access or command capability. Authorized SITB interface material is still required before any networking implementation.
