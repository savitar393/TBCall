# Phase 4C completion report

Approved base: `62551397a38f8ff54ce895fb2ad152690bc177b1`. Implementation branch: `feat/phase4c-monitoring`. Scope: manual operational monitoring, overdue alerts and IN_APP notifications only.

## Files

Created:

- `src/main/resources/db/migration/V15__monitoring_alert_notification_support.sql`
- `src/main/resources/application-test.properties`
- `src/main/java/id/tbcall/persistence/entity/AlertAcknowledgement.java`
- `src/main/java/id/tbcall/authorization/MonitoringSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/authorization/PrototypeMonitoringSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringAccess.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringAlerts.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringDtos.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringQueryService.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringScheduler.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringService.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringSweepService.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringSweepWorker.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringValidation.java`
- `src/main/java/id/tbcall/application/monitoring/MonitoringViews.java`
- `src/main/java/id/tbcall/application/monitoring/AlertService.java`
- `src/main/java/id/tbcall/application/monitoring/NotificationService.java`
- `src/main/java/id/tbcall/web/MonitoringController.java`
- `src/main/java/id/tbcall/web/AlertController.java`
- `src/main/java/id/tbcall/web/NotificationController.java`
- `src/test/java/id/tbcall/application/MonitoringIntegrationTest.java`
- `src/test/java/id/tbcall/persistence/MonitoringSchemaIntegrationTest.java`
- `docs/MONITORING.md`
- `docs/ALERTS_NOTIFICATIONS.md`
- `docs/PHASE4C_REPORT.md`
- `docs/architecture/TBCall_Application_API_v1.4C_Phase4C_Monitoring_Alerts_Notifications.md`
- `docs/superpowers/plans/2026-10-05-phase4c.md`

Modified:

- `src/main/java/id/tbcall/persistence/entity/MonitoringPlan.java`
- `src/main/java/id/tbcall/persistence/entity/Alert.java`
- `src/main/resources/application.properties`
- `src/test/java/id/tbcall/persistence/PersistenceIntegrationTest.java` (migration expectation through V15 and 60-table count)
- `README.md`
- `docs/AUTHORIZATION.md`

No local task prompts, Kemenkes PDFs, test logs or `.tools/` helpers are included. Application sources are ordinary committed Java; compilation does not execute development generators. Java 21 and Docker Desktop are environment prerequisites.

## V15 and schema review

V1–V14 are unchanged. No genuine schema/specification conflict was found. The permanent schema test creates clean PostgreSQL through V14, retains an existing treatment plan, captures the original `uq_monitoring_plan_active_treatment` definition, upgrades to V15 and proves it is identical. V6 `trg_alert_lineage` remains present and its migration/function are untouched.

V15 contains only:

1. Nullable plan treatment FK, new preventive_treatment_id FK with ON DELETE CASCADE, exact-one-target CHECK, unique ACTIVE TPT index. Existing ACTIVE treatment index is reused unchanged.
2. Partial monitoring_events(status,scheduled_at) scan index.
3. Nullable alert patient, contact/TPT FKs, treatment/TPT exclusivity CHECK, contact/TPT status indexes, unique non-null monitoring_event_id.
4. Additional monitoring/TPT lineage function and trigger without replacing V6; direct TPT alerts also checked.
5. Per-user alert_acknowledgements with UUID PK, FK deletes, timestamps and alert/user uniqueness.
6. Unique non-null notification(alert,user,channel) index.

No reference data, role changes, reverse clinical triggers, polymorphic target replacement or clinical constraints are added.

## API and workflow

All **24 routes** are documented in [MONITORING.md](MONITORING.md) and [ALERTS_NOTIFICATIONS.md](ALERTS_NOTIFICATIONS.md): 12 staff plan/event operations, 2 safe monitoring reads, 4 staff alerts, 4 safe alert/receipt operations, 2 self notifications.

Plans target exactly one Treatment or TPT; they contain 1..100 explicitly entered initial events under server-owned MANUAL_V1. No guideline/regimen/category schedule is selected automatically. Seven treatment codes and five TPT codes are allowlisted TBCall choices, not official SITB identifiers. Staff commands require officer role, permission, active target facility and independent MonitoringSourceAuthorityPolicy. Existing clinical/lab/referral/contact policies remain unchanged.

Clock alone selects SCHEDULED, DUE and strictly-past-deadline OVERDUE. Merely DUE does not create an alert. Rescheduling only SCHEDULED/DUE may immediately open an overdue alert. Complete/cancel resolves open alerts. Staff resolution leaves event status unchanged; event uniqueness prevents recreation. Plan cancellation cancels open events and resolves alerts.

Sweep discovers at most 100 plan IDs, then processes each in a separate transaction with target-first locks. Terminal Treatment/TPT COMPLETED closes plan COMPLETED; TPT STOPPED/LOST_TO_FOLLOW_UP closes plan CANCELLED, cancels open events and resolves alerts. Terminal targets with only future/overdue events are still candidates. No clinical rows or outcomes are changed. Config defaults scheduling enabled at 60000 ms fixed delay; test profile disables the wrapper.

Treatment transfer keeps plan/event IDs/history and moves current staff scope/future officer fanout with the Treatment facility. Existing user notifications remain their users' history. Contact TPT and its monitoring stay with the recorded TPT facility after index-case transfer.

## Privacy and notifications

Lineage is explicit: treatment alerts include case/patient/treatment; TPT alerts include TPT/contact and optional direct/linked patient, never index case/treatment. Fixed safe WARNING text and empty details are used. APIs never expose raw event metadata/source identifiers, alert details, notification payload, clinical notes or HIV/DM/lab data.

Patient monitoring/alerts require VERIFIED SELF and matching PATIENT permission; direct/linked TPT uses explicit left joins. Supporter access is active linked treatment case only, never index-case-derived contact/TPT. Patient/supporter acknowledgements are idempotent per-user receipts and leave global Alert status/version/timestamps unchanged.

First-open fanout includes active assigned TB officers, verified SELF linked users and, for treatment only, active linked supporters. All recipients must be ACTIVE with NOTIFICATION_READ_SELF; overlapping relationships are deduplicated. TPT never fans out to index-case supporters. Notifications are IN_APP/DELIVERED, with scheduledAt/deliveredAt from Clock, and payload only alertId/alertType/severity. Own notification reads require permission and If-Match; SENT/DELIVERED -> READ, already READ idempotent with current version. No external channel/provider or networking is implemented.

## Concurrency and audit

Treatment lock order: TBCase -> Treatment -> MonitoringPlan -> MonitoringEvent -> Alert. Contact TPT: Contact -> PreventiveTreatment -> MonitoringPlan -> MonitoringEvent -> Alert. Existing patient TPT: PreventiveTreatment -> MonitoringPlan -> MonitoringEvent -> Alert. Scalar discovery precedes hydration; state, scope and If-Match rechecked after locks. No retries.

Real PostgreSQL tests cover concurrent plan creation for both targets; cancel/complete; reschedule/sweep; complete/sweep; two sweeps; staff acknowledgement/auto-resolve; patient and supporter receipt races; TPT closure/sweep; transfer/sweep. The ordered transfer test proves the sweep actually waits on PostgreSQL's TBCase lock and then notifies the destination facility.

Sixteen actions: MONITORING_PLAN_CREATED/UPDATED/CANCELLED/AUTO_CLOSED, MONITORING_EVENT_CREATED/RESCHEDULED/COMPLETED/CANCELLED/DUE/OVERDUE, ALERT_OPENED/ACKNOWLEDGED/RESOLVED/AUTO_RESOLVED/ACKNOWLEDGEMENT_RECORDED, NOTIFICATION_READ. Sweep uses null actor. Audit metadata remains traceId only.

## Architectural judgments

- Retain the existing Windows feature checkout from the approved base; no extra worktree needed. Cost if wrong: edits remain on the current feature branch until final commit.
- Schedule calendar bounds use the injected Clock zone, preventing caller-selected offsets from bypassing plan dates. Cost if wrong: clients must follow the application's calendar zone.
- Plan PATCH preserves scheduled/due bounds for non-cancelled events. Cost if wrong: shortening endDate beyond a due date requires cancelling that event.
- Adding an event advances plan version so its If-Match protects the command. Cost if wrong: clients must refresh plan version after adding events.
- Initial staff queue projection omits patient/contact names and exposes permitted target/event identifiers. Cost if wrong: a future queue UI needs a separately reviewed display projection.
- The review's future-only fixture gap is treated as required verification coverage rather than deferred polish; both future-only and overdue-only target closure are exercised. Cost if wrong: four additional test cases.
- Automatic clinical scheduling, external delivery and SITB integration remain outside this scope, as instructed. Cost: future functionality requires its own approved architecture.
- Deployment-scale throughput/latency was not measured; this task verifies bounded discovery and correctness races. Cost: deployment sizing needs load measurements, especially for many due events on one plan.

## Verification

Schema RED: missing active TPT index on V14. HTTP RED: 66 missing-route failures, zero errors. First focused GREEN: 67 tests, zero failures/errors/skips. Expanded GREEN: 98 HTTP tests, zero failures/errors/skips. Additional final privacy/receipt checks are included in the clean build.

Affected suite after review corrections: 112 tests (104 monitoring HTTP, 1 V15 schema, 7 persistence), zero failures/errors/skips, BUILD SUCCESS. An intermediate clean run passed all 694 tests. Final test-fixture audit corrected an unrecognized SUPER_ADMIN label to actual V7 SYSTEM_ADMIN and requires role assignment to exist; affected authorization tests and a fresh clean build are required for the final committed fixture.

Final Windows verification used Java 21 and the Maven Wrapper, with Docker Desktop/PostgreSQL Testcontainers. No generator or local PDF was executed/read by the build. Exact command/result:

```text
.\mvnw.cmd clean test
Tests run: 694, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 10:50 min
Finished at: 2026-10-05T12:56:51+07:00
```

Exit code: 0. Independently summed 17 fresh Surefire XML reports: 694/0/0/0. Baseline 589 tests plus **105 Phase 4C cases** (104 HTTP integration + 1 permanent PostgreSQL schema test). The run verifies fresh V1–V15 migrations, V14 upgrade with existing treatment monitoring, Hibernate validation/application startup, all previous phases, and the required PostgreSQL races/privacy/audit behavior. The real SYSTEM_ADMIN fixture and all seven role assignments are verified; its affected four-case test also passed before the final clean run.

Expected negative-test constraint messages and known cached-test-context/Hikari reconnection warnings remain in the log; they caused no failures. Production behavior was not changed to suppress them. Finalization after this build changes documentation only. Files: 33 total, 27 created and 6 modified; no ignored application sources or development-generated source dependency.

Independent final read-only review found no production correctness, privacy or concurrency defect. It identified the stale 59-table expectation and missing advertised future-only terminal fixture. Both test corrections are included in the final affected suite and clean build. No production fix was required. Deferred minors: none.

## Before SITB integration architecture

No Phase 4C schema blocker is known. The next architecture must define authorized SITB access/API contracts, source authority/field ownership, external identifiers, reconciliation/conflicts/write-back, synchronization transactions/idempotency, credentials/security and operational failure handling. No SITB physical schema/API claims or fake SITB database are introduced. External notification delivery and automatic clinical decision/schedule engines remain deferred.
