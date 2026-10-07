# Backend v1.5A.5.1 - authoritative F2E detail GET + ETag report

## Base and scope

- Approved base: `892e54c35636f47fc2ca5457c27fdff5510b2212`.
- Continued the existing `feat/frontend-f2e-read-contracts` branch.
- Exactly two additive detail GETs; no new services, DTOs, permissions, mutations or schema changes. Existing monitoring/alert/notification write, validation, source-authority, scheduler/sweep/fanout and patient/supporter safe endpoint behavior are unchanged. The v1.5A.5 reference endpoint is unchanged.
- V1-V17 and frontend files remain unchanged; no V18, F2E UI or SITB networking.
- No schema/specification conflict or additional detail-read contract blocker was discovered.
- No build/dependency changes or dependency on `.tools/`. Local prompts, logs, scratch helpers, PDFs, secrets, caches, screenshots and unrelated assets are excluded. The unrelated untracked v1.5A.3.1 architecture and frontend logo are preserved and excluded.

## Changed-file manifest

1. `src/main/java/id/tbcall/application/monitoring/MonitoringQueryService.java` - two query methods under its existing read-only transaction.
2. `src/main/java/id/tbcall/web/MonitoringController.java` - one event-detail GET using the existing EventDetail response/ETag helper.
3. `src/main/java/id/tbcall/web/NotificationController.java` - one self-notification-detail GET using the existing NotificationDetail response/ETag helper.
4. `src/test/java/id/tbcall/application/MonitoringEtagReadIntegrationTest.java` - 44 real PostgreSQL/Spring integration cases.
5. `docs/FRONTEND_MONITORING_ETAG_READ_CONTRACTS.md` - complete contracts and authoritative command ETag chain.
6. `docs/PHASE5A_5_1_REPORT.md` - this report.
7. `docs/architecture/TBCall_Backend_v1.5A.5.1_F2E_ETag_Read_Completion.md` - supplied approved architecture, tracked unchanged.
8. `docs/FRONTEND_MONITORING_READ_CONTRACTS.md` - handoff link; existing reference vocabulary/contract unchanged.
9. `README.md` - checkpoint summary and guide/report links.

## Exact endpoint contracts

| Endpoint | Authorization/scope | HTTP 200 projection |
| --- | --- | --- |
| GET `/api/v1/monitoring-events/{eventId}` | TB_OFFICER + MONITORING_READ + active assigned facility; plan's treatment/TPT target facility must be active and assigned. Reuses MonitoringAccess.event(actor, "MONITORING_READ", eventId, false). | Existing EventDetail: id, version, eventType, scheduledAt, dueAt, completedAt, status |
| GET `/api/v1/me/notifications/{notificationId}` | NOTIFICATION_READ_SELF and row user.id equals actor.userId(); no additional role or facility requirement. | Existing NotificationDetail: id, version, alertId, channel, status, scheduledAt, deliveredAt, readAt, alertType, severity |

Both return the actual quoted current ETag via `IfMatch.etag(detail.version())`. No response fields were added to either DTO. Dates/nullable fields retain their existing types. The notification query selects by both resource ID and owner ID and projects with unchanged MonitoringViews.notification(). It does not call NotificationService.read(). Neither query takes a write lock.

Anonymous calls return 401. Event wrong-role/missing-read/no-active-assignment calls return 403 through the existing officer gate. MONITORING_MANAGE alone does not imply MONITORING_READ; tests assert the actor's exact `/me` grants. Missing/foreign/inactive event targets return generic RESOURCE_NOT_FOUND 404 without ETag after passing that gate. If an inactive target leaves the actor with no active assignment, the existing global gate returns 403; another active assignment permits reaching the target-scope 404. Scope follows the historical treatment/TPT episode's facility, not merely the case's current facility.

Notification permission absence returns 403; missing and other users' rows return generic RESOURCE_NOT_FOUND 404 without ETag. PATIENT and TREATMENT_SUPPORTER access works with their existing self permission, including without facility assignment. No new role, status or facility filter is introduced.

## ETag and privacy behavior

GET supplies an authoritative resource snapshot and header; it does not reserve the version. Existing commands still perform all scope, permission, source-authority, state and If-Match checks. Legitimate reschedule/complete/cancel and SENT/DELIVERED -> READ advance versions; new GET returns the advanced current header. An old header fails with 409 OPTIMISTIC_LOCK_CONFLICT, including a notification already READ. No existing write transition or idempotence behavior changed.

Frontend must pass the actual detail GET response ETag; it must not synthesize headers from numeric list versions. Plan patch/cancel/add-event uses existing plan detail GET, event commands use the new event GET, alert acknowledge/resolve uses existing alert detail GET, and notification read uses the new self-notification GET. Plan creation still has no If-Match requirement.

Event GET excludes plan notes, patient/contact identity, regimen/lab/source metadata and alert details. Notification GET excludes payload JSON, failure_reason, patient/contact identity, alert message/details and clinical data. Existing nullable-alert behavior is retained. GET preserves notification status/readAt/version, including SENT and DELIVERED, and creates no NOTIFICATION_READ audit. Repeated successful reads of both resources leave domain, sessions, permissions and audit unchanged. Existing denial auditing is retained. Reads grant no MONITORING_MANAGE or other user's notification access.

## Tests and review

Baseline: **1142**. Added **44** PostgreSQL 16 Testcontainers/Spring/session/MockMvc integration cases without component mocks:

| Cases | Coverage |
| --- | --- |
| 2 | Treatment/TPT exact EventDetail projection and current nonzero quoted ETag; target scope independent of current case facility; private metadata excluded |
| 2 | Exact MONITORING_MANAGE-only grants and absent monitoring grant denied |
| 6 | Wrong roles denied with artificial MONITORING_READ |
| 5 | Foreign/inactive treatment/TPT targets and missing event return generic 404 without ETag |
| 3 | Missing/inactive assignment or inactive sole facility denied by officer gate |
| 2 | Repeated treatment/TPT event GETs leave persisted data/versions/audit unchanged |
| 3 | GET does not grant reschedule/complete/cancel; exact read-only permissions remain |
| 3 | Existing legitimate reschedule/complete/cancel accept actual GET header, advance it, and reject stale header |
| 3 | Own notification readable by TB_OFFICER/PATIENT/TREATMENT_SUPPORTER without facility assignment |
| 6 | SENT/DELIVERED/PENDING/FAILED/CANCELLED/READ retain exact safe projection, status/version and persisted values |
| 3 | Foreign/missing notification 404 and missing permission 403 |
| 1 | Repeated notification GETs never mark READ or create read audit |
| 2 | Existing SENT/DELIVERED read transitions accept actual GET header, advance it and reject stale header; one legitimate read audit only |
| 1 | Nullable alert projection retained |
| 2 | Anonymous denial on both new GET routes |

Before production additions, five positive cases failed for the missing contracts: event GET 405 (existing PATCH route, no GET) and notification GET 404; errors/skips zero. This differed from the internal plan's anticipated event 404 because the existing router already knew that path's mutation method. The observed 405 still demonstrates the absent GET. No application/schema contract was changed to accommodate the test.

Targeted verification ran the new class plus unchanged v1.5A.5 reference class:

```text
Command: .\mvnw.cmd -Dtest=MonitoringEtagReadIntegrationTest,MonitoringReferenceIntegrationTest test
Tests run: 84, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time:  01:06 min
Finished at: 2026-10-07T22:20:09+07:00
Process exit code: 0
```

Independent read-only review: **0 Critical, 0 Important, 0 Minor**; no behaviors were declined for judgment. The reviewer checked both specifications, three production additions, all 44 cases, privacy/access/ETag behavior and documentation/manifest. It ran no tests and changed no files or Git state. The executor verifies the clean-build result and final staging separately.

### Required clean build

Command: `.\mvnw.cmd clean test` from repository root on Windows with Docker/PostgreSQL Testcontainers access.

```text
Tests run: 1186, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time:  13:25 min
Finished at: 2026-10-07T22:34:15+07:00
Process exit code: 0
```

All 1142 previous backend tests plus 44 new cases passed. Fresh PostgreSQL migrations through V17, Hibernate validation and Spring startup were exercised. Surefire XML reports independently total 1186 cases with zero failures/errors/skips across 28 test classes. Final protected-file comparisons and staged manifest checks found no frontend, migration, existing write/policy/reference or build-file change.

Existing lifecycle diagnostics remain visible: Hikari pools attempted reconnects after earlier classes' Testcontainers stopped. During cached Spring-context shutdown, Surefire printed `[ERROR] Surefire is going to kill self fork JVM. The exit has elapsed 30 seconds after System.exit(0).` The same diagnostic is recorded in the prior v1.5A.5 report. All assertions completed without failures or errors; Maven subsequently reported the exact BUILD SUCCESS above and exited 0. Mockito/JDK agent warnings also appeared. This checkpoint makes no production or test-harness configuration changes to silence these existing diagnostics.

## Protected scope and F2E handoff

The approved-base Git comparison has no frontend/migration changes. SHA-256 comparisons confirm zero byte changes across all 215 tracked frontend/migration files. V1-V17 are retained; the migration directory contains exactly 17 files and no V18. Existing writes/access/views/DTOs/validation/source policies/reference classes and build configuration are unchanged. Only the three listed production files gain new query/GET methods.

No additional backend contract blocker was found. F2E UI may use these actual response headers under a separately authorized frontend checkpoint. Patient/supporter UI remains deferred to F3. No UI or later integration work has begun.
