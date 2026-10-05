# Phase 4C completion report

Approved base: `62551397a38f8ff54ce895fb2ad152690bc177b1`. Implementation branch: `feat/phase4c-monitoring`. Scope: manual operational monitoring, overdue alerts and IN_APP notifications only.

The Phase 4C sections below retain the historical V15 implementation and its 694-test result. The separate Phase 4C.1 post-review checkpoint is recorded at the end of this report.

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

## Phase 4C.1 — post-review alert lineage hardening

Approved base: `6401328b9a5da525cff0ad2b20d8119b677f183d`. Branch: `feat/phase4c-monitoring`. This checkpoint addresses a schema-integrity gap in the approved V15 contract, without changing the Phase 4C endpoint/service behavior or starting SITB integration.

### Review finding and V16

V15 made alert patient nullable for contact-owned TPT. V6's ordinary `<>` comparisons then permitted NULL-patient direct treatment/case alerts, because PostgreSQL `IF NULL` does not raise. V15 also left contact IDs possible without a preventive-treatment target. The application generates valid monitoring alerts; this checkpoint hardens database writes rather than changing HTTP behavior.

`V16__alert_nullable_patient_lineage_hardening.sql` contains only these authorized guards (plus explanatory comments):

```sql
ALTER TABLE alerts
    ADD CONSTRAINT chk_alert_patient_required_except_tpt
        CHECK (
            patient_id IS NOT NULL
            OR preventive_treatment_id IS NOT NULL
        ),
    ADD CONSTRAINT chk_alert_contact_requires_tpt
        CHECK (
            contact_id IS NULL
            OR preventive_treatment_id IS NOT NULL
        );
```

The named constraints reject violations with SQLSTATE `23514` on INSERT and UPDATE. Generic non-TPT alerts require a patient, preserving V1's intent. Generic patient-only alerts remain valid. Contact-owned TPT may still have NULL patient, and linked/direct matching-patient TPT remains valid. No broader target-shape constraint, trigger replacement, reference data or data cleanup is added. Existing invalid imported/manual rows would cause V16 to fail, requiring explicit review rather than silent repair.

### Changed-file manifest

Created:

- `src/main/resources/db/migration/V16__alert_nullable_patient_lineage_hardening.sql`
- `src/test/java/id/tbcall/persistence/AlertLineageHardeningSchemaIntegrationTest.java`
- `docs/superpowers/plans/2026-10-05-phase4c1.md`

Modified:

- `src/test/java/id/tbcall/persistence/PersistenceIntegrationTest.java`: fresh database expectation extends through V16; Hibernate validation/startup coverage retained.
- `src/test/java/id/tbcall/persistence/MonitoringSchemaIntegrationTest.java`: explicitly target V15 in the historical V14→V15 regression.
- `docs/PHASE4C_REPORT.md`: separate checkpoint report; historical Phase 4C result retained.
- `docs/ALERTS_NOTIFICATIONS.md`: document both invariants and valid shapes.
- `README.md`: fresh migration endpoint advances to V16.

All Java files under `src/main/java`, application configuration, dependencies and V1–V15 remain unchanged. The approved Phase 4C architecture is not rewritten. Local task briefs, PDFs, `.tools/` logs and development helpers are excluded.

### Regression coverage

Twenty-five new PostgreSQL Testcontainers cases:

- 1 V15→V16 upgrade case: seven pre-existing valid alert shapes remain byte-for-byte identical when represented as full row JSON; both V6/V15 function and trigger definitions remain identical; only V16 is applied.
- 6 direct treatment-only/case-only/combined alert cases: NULL patient rejected on INSERT and UPDATE by the exact patient guard.
- 2 generic non-TPT alert cases: NULL patient rejected on INSERT and UPDATE by the exact patient guard.
- 6 generic/case/treatment alert cases: contact without TPT rejected on INSERT and UPDATE by the exact contact guard.
- 5 accepted-shape cases: treatment monitoring, unlinked contact TPT monitoring with NULL patient, linked contact TPT with matching patient, direct patient TPT, generic patient-only alert.
- 2 V6 regressions: wrong patient rejected for direct case/treatment alerts by the existing lineage trigger.
- 3 V15 regressions: wrong TPT contact, patient or monitoring-event target rejected by the existing lineage trigger.

Each negative test asserts SQLSTATE `23514` and the exact PostgreSQL constraint identity. Fresh V1–V16 migrations, Hibernate validation and application startup are covered by the updated persistence test and the existing Spring integration suites. The original V15 schema regression remains active separately.

TDD evidence: against V15, 25 cases ran with 15 expected failures, 0 errors, 0 skipped: all 14 invalid INSERT/UPDATE shapes were accepted and the upgrade assertion found no V16. Valid shapes and existing trigger checks passed. Initial test compilation/resource-reference and absent-target setup errors were corrected before this behavior-level RED run.

### Final verification

Focused GREEN: 33 tests, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS (25 new schema cases + 1 historical V15 schema case + 7 persistence cases). Total time 31.678 s; finished 2026-10-05T13:23:34+07:00. The independent read-only reviewer found no critical, important or minor issue and requested no revisions.

All 15 historical migration Git content hashes match the approved base; none of those files was edited. V1–V15 repository contents remain byte-for-byte unchanged. No application Java, configuration, dependency or approved architecture diff exists. Windows working-tree line endings are subject to the existing Git configuration; no line-ending conversion is introduced by this checkpoint.

Final Windows clean verification used Java 21 and the Maven Wrapper with Docker Desktop/PostgreSQL Testcontainers:

```text
.\mvnw.cmd clean test
Tests run: 719, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 10:39 min
Finished at: 2026-10-05T13:35:23+07:00
```

Exit code: 0. Independently summed all 18 fresh Surefire XML reports: 719 tests, 0 failures, 0 errors, 0 skipped. All previous 694 cases and the 25 new cases passed. The build covers fresh V1–V16 migration, V15→V16 with existing valid alerts, Hibernate validation/application startup, retained V6/V15 trigger behavior and earlier phases. No source/test changes followed this build; finalization changes documentation only.

Expected negative-test database messages, existing Mockito/JVM warnings and known cached-test-context/Hikari reconnect warnings caused no failures. No production behavior was changed to suppress warnings. Logs stay ignored under `.tools/`. No generated source directory, local prompt, PDF or ignored file is included in the eight-file checkpoint. Final commit identity and remote push verification are returned in the completion response. Deferred minors: none.

### Implementation rulings

- Retain the explicitly requested Windows feature checkout rather than create a worktree. Cost if wrong: changes remain on this branch until commit.
- Use native Windows verification commands and this plan/report as the execution record instead of Unix skill helper scripts. Cost if wrong: process records require manual checking; application/build behavior is unaffected.
- Production migration locking/load was not measured; the approved two CHECK constraints remain ordinary validated PostgreSQL constraints. Cost if wrong: deployment timing requires evaluation against production-sized data.
- No live/imported database was supplied; fixture compatibility is proven and V16 intentionally fails on incompatible existing rows. Cost if wrong: such rows require explicit review before deployment.
- Broader lineage constraints and SITB work remain outside the authorized brief. Cost if wrong: future architecture must address any additional invariants separately.

No schema/specification conflict has been identified in existing approved application fixtures. No additional architectural decision is required for these two guards. Authorized SITB integration architecture remains a separate future task.
