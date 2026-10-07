# Backend v1.5A.5 - monitoring reference checkpoint report

## Base and scope

- Approved base: `f478c470e8004ed140cf0899c4802fdb1599d315`.
- Branch: `feat/frontend-f2e-read-contracts`, already present at the approved base when work began.
- Exactly one additive GET endpoint. V1-V17 unchanged; no V18. Existing frontend, monitoring validation/services, alerts, notifications, scheduler/sweep, fanout, patient/supporter endpoints and source-authority behavior unchanged.
- No schema or specification conflict was found. No F2E/F3 UI or SITB networking was implemented.
- No dependency/build configuration changes. Compilation does not depend on `.tools/`. Prompts, logs, PDFs, helpers, caches, secrets, screenshots and unrelated assets are excluded. The unrelated untracked backend v1.5A.3.1 architecture and frontend logo are preserved and excluded.

## Changed-file manifest

1. `src/main/java/id/tbcall/application/monitoring/MonitoringReferenceDtos.java` - explicit ten-group code/name DTOs.
2. `src/main/java/id/tbcall/application/monitoring/MonitoringReferenceService.java` - existing officer/facility authorization and exact ordered vocabulary under a read-only transaction.
3. `src/main/java/id/tbcall/web/MonitoringReferenceController.java` - the single GET route.
4. `src/test/java/id/tbcall/application/MonitoringReferenceIntegrationTest.java` - 40 PostgreSQL/Spring integration cases.
5. `docs/FRONTEND_MONITORING_READ_CONTRACTS.md` - complete JSON contract, authorization and F2E handoff.
6. `docs/PHASE5A_5_REPORT.md` - this report.
7. `docs/architecture/TBCall_Backend_v1.5A.5_Frontend_F2E_Monitoring_Reference.md` - supplied approved architecture, tracked unchanged.
8. `README.md` - checkpoint documentation links and scope summary.

## Endpoint authorization

`GET /api/v1/monitoring-reference-data` requires authenticated TB_OFFICER, at least one active assigned facility, and any one actually-held grant from MONITORING_READ, MONITORING_MANAGE, ALERT_READ, ALERT_ACKNOWLEDGE, ALERT_RESOLVE or NOTIFICATION_READ_SELF. No unrelated clinical permission is required.

The service chooses a held relevant permission and calls existing MonitoringAccess.officer/ClinicalAccess.officer. Session resolution supplies only active assignments. If none of the relevant grants is held, the existing MONITORING_READ gate denies the request and preserves denial auditing. Anonymous access returns 401; wrong role, missing grant or absent active facility assignment returns 403. Successful reads create no audit.

There is no input, resource identifier, ETag or write capability. Existing commands still enforce their own permissions, ownership/facility scope, source authority, validation, state and concurrency preconditions. NOTIFICATION_READ_SELF retains its existing ownership-scoped notification-read capability; fetching reference vocabulary grants nothing further.

## Exact ordered reference codes

Every option has only `code` and `name`; all ten groups are always present. Exact Indonesian names and full response JSON are recorded in [the contract guide](FRONTEND_MONITORING_READ_CONTRACTS.md), matching the approved architecture.

| Group | Codes in response order |
| --- | --- |
| treatmentEventTypes | CLINICAL_REVIEW, WEIGHT_REVIEW, ADHERENCE_REVIEW, ADVERSE_EVENT_REVIEW, BACTERIOLOGY_FOLLOW_UP, SAFETY_MONITORING, MEDICATION_PICKUP |
| tptEventTypes | CLINICAL_REVIEW, WEIGHT_REVIEW, ADHERENCE_REVIEW, ADVERSE_EVENT_REVIEW, MEDICATION_PICKUP |
| planStatuses | DRAFT, ACTIVE, PAUSED, COMPLETED, CANCELLED |
| eventStatuses | SCHEDULED, DUE, OVERDUE, COMPLETED, CANCELLED |
| alertTypes | MONITORING_OVERDUE |
| alertStatuses | OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED |
| alertSeverities | INFO, WARNING, HIGH, CRITICAL |
| alertTargetTypes | TREATMENT, TPT |
| notificationStatuses | PENDING, SENT, DELIVERED, READ, FAILED, CANCELLED |
| notificationChannels | IN_APP |

These are TBCall workflow/UI labels, not official SITB physical schema/API identifiers. TPT excludes bacteriology and safety monitoring. Alert severity/status vocabulary describes existing values; it does not select clinical events or change generation. Current overdue alerts remain MONITORING_OVERDUE / WARNING, with IN_APP delivery.

## Privacy and design judgments

The new projection is deliberately separate from unchanged MonitoringValidation constants. Regression tests check its compatibility with the existing treatment/TPT allowlists. Explicit lists keep the approved labels and ordering readable without introducing an abstraction or schema change.

No patient/clinical identifiers, clinical data, schedules, due-date defaults, frequency, eligibility, lab orders, diagnosis, regimen/outcome changes, recipients, internal rules metadata or alert details JSON are returned. Every monitoring event/date remains explicitly entered under MANUAL_V1. No automatic clinical inference, persistence mutation, authorization expansion or successful-read audit is introduced.

## Tests and review

Baseline: 1102 backend tests. Added **40** integration cases using real PostgreSQL 16 Testcontainers, fresh Flyway migrations, Hibernate validation, Spring startup, opaque sessions and MockMvc. No component mocks.

| Cases | Coverage |
| --- | --- |
| 6 | Each relevant permission independently authorizes TB_OFFICER without unrelated grants |
| 2 | Missing relevant permission and unrelated TREATMENT_READ denied |
| 6 | Six wrong roles denied despite artificial relevant grants |
| 4 | Missing/inactive assignment or inactive facility denied; an additional inactive assignment does not invalidate an active one |
| 1 | Anonymous access denied |
| 10 | Every exact group, code, label, order and code/name-only option shape |
| 1 | TPT exclusions, MONITORING_OVERDUE-only alert type and IN_APP-only channel |
| 1 | Whole response excludes clinical/rules/schedule metadata even when private monitoring data exists |
| 1 | Repeated GETs leave persisted rows, permissions and audit unchanged |
| 1 | Reference read does not grant plan/alert/notification writes |
| 4 | Existing validator rejects treatment-only events for TPT and accepts them for treatment |
| 2 | Existing treatment/TPT overdue flows still generate MONITORING_OVERDUE / WARNING alerts and IN_APP delivery |
| 1 | Route accepts GET only; POST cannot create a plan |

Before production implementation, the focused RED test reached PostgreSQL and failed on expected 200 versus missing-route 404. The implemented targeted run passed:

```text
Command: .\mvnw.cmd -Dtest=MonitoringReferenceIntegrationTest test
Tests run: 40, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 44.688 s
Finished at: 2026-10-07T21:48:26+07:00
Process exit code: 0
```

Independent read-only review found no actionable important issues. It checked both specifications, exact vocabulary, authorization/session gates, projection privacy, tests and existing protected-file scope. The executor checked the final report, protected-file comparisons and clean-build evidence separately.

### Required clean build

Command: `.\mvnw.cmd clean test` from repository root on Windows with Docker/PostgreSQL Testcontainers access.

```text
Tests run: 1142, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time:  12:57 min
Finished at: 2026-10-07T22:02:58+07:00
Process exit code: 0
```

All 1102 previous tests and 40 new cases passed. The run verifies fresh PostgreSQL migrations through V17, Hibernate validation and Spring startup. Comparison against the approved base confirms no frontend, V1-V17, existing workflow/policy or dependency-file changes; the migration directory contains exactly V1-V17 and no V18.

Existing non-test-failure diagnostics remain visible: Hikari pools attempted reconnects after earlier test classes' containers terminated. During cached Spring-context shutdown, Surefire emitted `[ERROR] Surefire is going to kill self fork JVM. The exit has elapsed 30 seconds after System.exit(0).` This same diagnostic is recorded in the previous v1.5A.4 report. Maven subsequently reported the exact BUILD SUCCESS above with exit 0, and all test cases completed without failures or errors. Mockito/JDK agent warnings also appeared. This checkpoint makes no production or test-harness configuration change to silence these existing lifecycle diagnostics.

## F2E handoff

No schema/specification conflict or additional backend contract blocker was found. Staff F2E monitoring/events, alert queues and TB Officer IN_APP notifications require their separate approved frontend checkpoint. Patient/supporter UI remains deferred to F3. This implementation stops at the reference contract.
