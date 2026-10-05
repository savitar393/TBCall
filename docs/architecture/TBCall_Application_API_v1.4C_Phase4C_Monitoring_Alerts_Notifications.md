# TBCall Application/API v1.4C — Phase 4C Monitoring, Alerts & In-App Notifications

Base commit: `62551397a38f8ff54ce895fb2ad152690bc177b1`

Status: approved architecture for the final major local-domain slice before the SITB integration boundary.

Phase 4:
- Phase 4A: referral / treatment-transfer continuity — implemented
- Phase 4B: contact investigation + contact-driven TPT — implemented
- Phase 4C: monitoring plans + monitoring events + alerts + in-app notifications — this specification

## 1. Architectural decision: monitoring becomes multi-target

Yes: `monitoring_plans` becomes multi-target.

Do **not** replace relational ownership with a generic `target_type/target_id` polymorphic pair.

Instead preserve foreign-key integrity by giving a monitoring plan exactly one explicit target:

- `treatment_id`, or
- `preventive_treatment_id`

This lets the same monitoring/event/alert infrastructure serve active TB treatment and contact-driven TPT while preserving strong FKs and target-specific authorization.

The existing V1 treatment-only active-plan index remains valid. V15 adds the TPT equivalent.

## 2. Clinical/source boundary

Current national guidance contains different monitoring schedules depending on TB category, regimen, age, treatment phase and clinical circumstance. TB SO includes adherence monitoring and bacteriologic follow-up at defined treatment points; TB RO includes repeated clinical, bacteriologic and safety monitoring; TPT includes regular review of symptoms, adverse effects and adherence.

Phase 4C therefore provides a **manual explicit schedule + deterministic due/overdue engine**.

It does NOT:
- choose a clinical monitoring schedule automatically;
- infer which lab/ECG/clinical examination is clinically required;
- infer diagnosis, failure, regimen changes, dose changes or treatment outcome;
- interpret lab values;
- automatically create lab requests or follow-up clinical records;
- create missed-dose alerts from adherence thresholds.

All monitoring events are explicit TBCall operational reminders entered by an authorized TB officer.

## 3. Canonical monitoring event codes

Application-layer codes, not official SITB identifiers:

- `CLINICAL_REVIEW`
- `WEIGHT_REVIEW`
- `ADHERENCE_REVIEW`
- `ADVERSE_EVENT_REVIEW`
- `BACTERIOLOGY_FOLLOW_UP`
- `SAFETY_MONITORING`
- `MEDICATION_PICKUP`

Treatment targets may use all seven.

TPT targets may use:
- `CLINICAL_REVIEW`
- `WEIGHT_REVIEW`
- `ADHERENCE_REVIEW`
- `ADVERSE_EVENT_REVIEW`
- `MEDICATION_PICKUP`

Phase 4C does not permit arbitrary free-text `eventType`.

## 4. V15 migration

Create:

`V15__monitoring_alert_notification_support.sql`

Do not modify V1–V14.

### 4.1 Multi-target monitoring plan

```sql
ALTER TABLE monitoring_plans
    ALTER COLUMN treatment_id DROP NOT NULL,
    ADD COLUMN preventive_treatment_id uuid
        REFERENCES preventive_treatments(id) ON DELETE CASCADE,
    ADD CONSTRAINT chk_monitoring_plan_exact_target
        CHECK (num_nonnulls(treatment_id, preventive_treatment_id) = 1);
```

Keep the existing V1 index:

`uq_monitoring_plan_active_treatment`

Add:

```sql
CREATE UNIQUE INDEX uq_monitoring_plan_active_tpt
ON monitoring_plans(preventive_treatment_id)
WHERE preventive_treatment_id IS NOT NULL
  AND status = 'ACTIVE';
```

### 4.2 Monitoring schedule scan index

```sql
CREATE INDEX idx_monitoring_events_schedule
ON monitoring_events(status, scheduled_at)
WHERE status IN ('SCHEDULED','DUE');
```

### 4.3 Alerts become TPT-capable

```sql
ALTER TABLE alerts
    ALTER COLUMN patient_id DROP NOT NULL,
    ADD COLUMN contact_id uuid REFERENCES contacts(id),
    ADD COLUMN preventive_treatment_id uuid REFERENCES preventive_treatments(id),
    ADD CONSTRAINT chk_alert_treatment_target_exclusive
        CHECK (NOT (
            treatment_id IS NOT NULL
            AND preventive_treatment_id IS NOT NULL
        ));
```

Add:

```sql
CREATE INDEX idx_alerts_contact_status
ON alerts(contact_id, status, triggered_at DESC)
WHERE contact_id IS NOT NULL;

CREATE INDEX idx_alerts_tpt_status
ON alerts(preventive_treatment_id, status, triggered_at DESC)
WHERE preventive_treatment_id IS NOT NULL;
```

One monitoring event produces at most one alert ever:

```sql
CREATE UNIQUE INDEX uq_alert_monitoring_event
ON alerts(monitoring_event_id)
WHERE monitoring_event_id IS NOT NULL;
```

### 4.4 Per-user alert acknowledgements

Add:

```sql
CREATE TABLE alert_acknowledgements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    acknowledged_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(alert_id, user_id)
);
```

Patient/supporter acknowledgement is a per-user receipt. It does **not** mutate the global staff alert status.

### 4.5 Notification idempotency

```sql
CREATE UNIQUE INDEX uq_notifications_alert_user_channel
ON notifications(alert_id, user_id, channel)
WHERE alert_id IS NOT NULL;
```

### 4.6 Monitoring-alert lineage trigger

V6 alert lineage remains immutable.

V15 adds a new trigger/function that additionally validates monitoring/TPT lineage.

When `monitoring_event_id` is present:
- find the event's plan;
- if plan targets Treatment:
  - `alert.treatment_id` must equal the plan treatment;
  - `alert.preventive_treatment_id` and `contact_id` must be null;
  - `patient_id` and `case_id` must match that treatment lineage;
- if plan targets PreventiveTreatment:
  - `alert.preventive_treatment_id` must equal the plan TPT;
  - `treatment_id` and `case_id` must be null;
  - for contact-owned TPT, `contact_id` must equal TPT.contact;
  - `patient_id` may be null or must match TPT.patient / the contact's linked patient as applicable.

A direct TPT alert with `preventive_treatment_id` must satisfy the same TPT lineage even when `monitoring_event_id` is null.

Do not weaken or remove the V6 treatment alert checks.

Update JPA mappings:
- MonitoringPlan.preventiveTreatment
- Alert.contact
- Alert.preventiveTreatment
- new AlertAcknowledgement entity/repository if useful

## 5. Ownership semantics

### Treatment monitoring

Operational owner is the **current Treatment facility**.

If Phase 4A moves an active treatment:
- the same monitoring plan/events remain;
- no rows are copied;
- future staff monitoring access follows the new treatment facility;
- future overdue alerts notify the new facility;
- already-created historical notifications remain owned by their original users.

### TPT monitoring

Operational owner is `PreventiveTreatment.facility`.

Index-case referral/transfer does not move TPT or its monitoring plan.

## 6. Source authority

Add:

`MonitoringSourceAuthorityPolicy`

with prototype-local implementation.

Suggested operation:

`requireLocalManage(CurrentActor actor, String permission, UUID facilityId, UUID monitoringPlanId)`

Use it for officer plan/event create/update/cancel/complete operations.

Monitoring plans/events/alerts are TBCall-owned operational records. Their source policy does not permit mutation of the underlying clinical Treatment/TPT.

Do not weaken:
- ClinicalSourceAuthorityPolicy
- LaboratorySourceAuthorityPolicy
- ReferralSourceAuthorityPolicy
- ContactSourceAuthorityPolicy

## 7. Lock ordering

Target-first locking is mandatory.

### Treatment target

`TBCase -> Treatment -> MonitoringPlan -> MonitoringEvent -> Alert`

### TPT target

Contact-owned:
`Contact -> PreventiveTreatment -> MonitoringPlan -> MonitoringEvent -> Alert`

Future patient-owned TPT:
`PreventiveTreatment -> MonitoringPlan -> MonitoringEvent -> Alert`

The monitoring sweep must use the same target-first ordering after selecting candidate IDs non-lockingly.

Recheck scope/state after locks.

No retry loops.

## 8. Create treatment monitoring plan

Endpoint:

`POST /api/v1/treatments/{treatmentId}/monitoring-plans`

TB_OFFICER + MONITORING_MANAGE.

Require:
- current treatment facility assignment;
- active treatment;
- no ACTIVE monitoring plan for treatment;
- MonitoringSourceAuthorityPolicy.

Lock TBCase -> Treatment.

Input:
- startDate
- endDate optional
- notes optional
- events: 1..100 explicit event definitions

Server:
- treatment target set
- preventiveTreatment null
- status ACTIVE
- rulesVersion = `MANUAL_V1`
- createdByUser = current actor

Plan dates:
- startDate >= treatment.startDate
- startDate <= today
- endDate >= startDate when supplied
- endDate may not exceed treatment.plannedEndDate when plannedEndDate exists unless officer explicitly leaves plan end null; do not infer treatment duration.

Each event input:
- eventType
- scheduledAt
- dueAt optional

Validation:
- allowed treatment event code;
- `dueAt >= scheduledAt` if supplied;
- scheduled date/time not before plan start;
- when plan.endDate exists, scheduled/due date may not be after plan end.

Create plan + initial events atomically.

Event initial status is derived only from Clock:
- future scheduledAt -> SCHEDULED
- scheduledAt <= now and dueAt null/future -> DUE
- dueAt < now -> OVERDUE

If an event is immediately OVERDUE, open its alert in the same transaction using the rules below.

Audit:
- `MONITORING_PLAN_CREATED`
- `MONITORING_EVENT_CREATED` once per created event
- `ALERT_OPENED` for any immediately overdue event

## 9. Create TPT monitoring plan

Endpoint:

`POST /api/v1/preventive-treatments/{tptId}/monitoring-plans`

TB_OFFICER + MONITORING_MANAGE.

Require:
- TPT facility assignment;
- TPT status ACTIVE;
- no ACTIVE TPT monitoring plan;
- source policy.

Lock:
Contact -> PreventiveTreatment when contact-owned.

Same plan/event request shape as treatment monitoring.

Additional:
- startDate >= TPT.startDate
- event type must be allowed for TPT
- no BACTERIOLOGY_FOLLOW_UP or SAFETY_MONITORING in TPT Phase 4C.

No automatic monthly schedule is generated. National guidance informs officer scheduling but does not become a hard-coded clinical decision engine.

## 10. Staff monitoring reads

Implement:

- GET `/api/v1/treatments/{treatmentId}/monitoring-plans`
- GET `/api/v1/preventive-treatments/{tptId}/monitoring-plans`
- GET `/api/v1/monitoring-plans/{planId}`
- GET `/api/v1/monitoring-plans/{planId}/events`

TB_OFFICER + MONITORING_READ + target facility scope.

Pagination max 50.

Plan detail:
- id/version
- targetType = TREATMENT | TPT
- target id
- status
- start/end
- rulesVersion
- staff notes
- event counts by status
- createdAt/updatedAt

Event detail:
- id/version
- eventType
- scheduledAt/dueAt/completedAt
- status

Do not expose `metadata` or generic sourceEntity fields in Phase 4C APIs.

LAB_STAFF does not receive broad patient-monitoring endpoints in Phase 4C despite the legacy MONITORING_READ grant; lab-specific monitoring projection is deferred.

## 11. Update/cancel monitoring plan

### PATCH

`PATCH /api/v1/monitoring-plans/{planId}`

TB_OFFICER + MONITORING_MANAGE + If-Match + target facility + source policy.

Require ACTIVE.

Mutable:
- endDate
- notes

Immutable:
- target
- startDate
- rulesVersion
- createdBy

End date must remain >= start and may not precede any non-cancelled event's scheduledAt.

Audit:
`MONITORING_PLAN_UPDATED`

### Cancel

`POST /api/v1/monitoring-plans/{planId}/cancel`

Require ACTIVE + If-Match.

Set plan CANCELLED.

All SCHEDULED/DUE/OVERDUE events become CANCELLED.
Any open/acknowledged monitoring alert becomes RESOLVED with resolvedAt=Clock now.

Audit:
- `MONITORING_PLAN_CANCELLED`
- event/alert system effects do not copy clinical data into audit metadata.

## 12. Add/reschedule/complete/cancel event

### Add

`POST /api/v1/monitoring-plans/{planId}/events`

TB_OFFICER + MONITORING_MANAGE.
Require plan ACTIVE and Plan If-Match.

Input same event definition.
Lock target -> plan.

Create event; derive initial status by Clock.
Immediate overdue may open alert.

Audit:
`MONITORING_EVENT_CREATED`

### Reschedule

`PATCH /api/v1/monitoring-events/{eventId}`

Require Event If-Match.

Allowed status:
- SCHEDULED
- DUE

Mutable only:
- scheduledAt
- dueAt

Recompute SCHEDULED/DUE/OVERDUE from Clock.

If rescheduling causes immediate OVERDUE, create the one permitted alert.

OVERDUE/COMPLETED/CANCELLED events are not rescheduled; cancel and create a replacement event instead.

Audit:
`MONITORING_EVENT_RESCHEDULED`

### Complete

`POST /api/v1/monitoring-events/{eventId}/complete`

Input:
- completedAt optional, defaults Clock now

Require status SCHEDULED/DUE/OVERDUE.

Validation:
- completedAt >= scheduledAt
- completedAt <= now

Set COMPLETED.
Resolve the monitoring alert if present/open/acknowledged.

No FollowUp/LabRequest/DoseEvent/TPT clinical row is created or mutated.

Audit:
`MONITORING_EVENT_COMPLETED`

### Cancel

`POST /api/v1/monitoring-events/{eventId}/cancel`

Require SCHEDULED/DUE/OVERDUE.

Set CANCELLED.
Resolve alert when present.

Audit:
`MONITORING_EVENT_CANCELLED`

## 13. Deterministic monitoring sweep

Implement:

`MonitoringSweepService`

and a scheduled wrapper.

Configuration:

```properties
tbcall.monitoring.scheduler-enabled=${TBCALL_MONITORING_SCHEDULER_ENABLED:true}
tbcall.monitoring.sweep-interval-ms=${TBCALL_MONITORING_SWEEP_INTERVAL_MS:60000}
```

Scheduled wrapper:
- enabled outside tests unless explicitly disabled;
- calls one bounded sweep batch;
- no HTTP/admin endpoint for sweep.

Candidate discovery must not lock targets in the wrong order.

For each candidate:
1. discover target IDs;
2. lock target with target-specific order;
3. lock MonitoringPlan;
4. lock MonitoringEvent;
5. recheck current state/time;
6. transition if still required.

Transitions:
- SCHEDULED -> DUE when now >= scheduledAt and not overdue;
- SCHEDULED/DUE -> OVERDUE when dueAt is non-null and now > dueAt;
- OVERDUE opens one alert.

If target becomes terminal:
- Treatment COMPLETED -> plan COMPLETED; open events CANCELLED; alerts RESOLVED.
- TPT COMPLETED -> plan COMPLETED; open events CANCELLED; alerts RESOLVED.
- TPT STOPPED/LOST_TO_FOLLOW_UP -> plan CANCELLED; open events CANCELLED; alerts RESOLVED.

Do not infer any clinical outcome beyond reading the already-recorded target lifecycle status.

System audit actor is null.

Useful actions:
- `MONITORING_EVENT_DUE`
- `MONITORING_EVENT_OVERDUE`
- `MONITORING_PLAN_AUTO_CLOSED`
- `ALERT_OPENED`
- `ALERT_AUTO_RESOLVED`

## 14. Alert creation

Phase 4C automatically creates alerts **only for OVERDUE monitoring events**.

No alert is created merely for DUE.

Alert:
- monitoringEvent = event
- alertType = `MONITORING_OVERDUE`
- severity = `WARNING`
- status = OPEN
- triggeredAt = Clock now
- dueAt = event.dueAt
- ruleCode = `MONITORING_OVERDUE_V1`
- message = fixed generic Indonesian safe text, e.g. `Jadwal pemantauan telah melewati batas waktu.`
- details = `{}`

Treatment alert lineage:
- patient from case registration
- case
- treatment
- no contact/TPT fields

TPT alert lineage:
- preventiveTreatment
- contact when contact-owned
- patient only when TPT.patient or current contact.linkedPatient exists
- no case/treatment fields

No severity escalation from lab values, adherence counts, symptoms, adverse events or free text.

## 15. Staff alert API

Implement:

- GET `/api/v1/alerts`
- GET `/api/v1/alerts/{alertId}`
- POST `/api/v1/alerts/{alertId}/acknowledge`
- POST `/api/v1/alerts/{alertId}/resolve`

TB_OFFICER + corresponding V7 permission.

Facility scope follows the **current monitoring target owner**:
- Treatment -> current treatment facility
- TPT -> TPT facility

GET filters:
- status optional
- targetType optional
- page/size max 50

Staff projection:
- id/version
- alertType/severity/status
- triggeredAt/dueAt/acknowledgedAt/resolvedAt
- monitoringEvent id/type/schedule
- targetType/targetId
- minimal patient/contact display only where needed for work queue
- fixed message

Exclude:
- HIV/DM
- labs
- clinical notes
- monitoring plan notes
- TPT notes/regimenDescription
- event metadata/sourceEntity
- audit/sync/account data

### Staff acknowledge

If-Match required.
OPEN -> ACKNOWLEDGED.
Set acknowledgedAt.

Audit:
`ALERT_ACKNOWLEDGED`

Already ACKNOWLEDGED may return current representation idempotently.

### Staff resolve

If-Match required.
OPEN/ACKNOWLEDGED -> RESOLVED.
Set resolvedAt.

Does not alter monitoring event status.

Because `uq_alert_monitoring_event` permits only one alert ever per event, resolving an alert does not cause repeated recreation on later sweeps.

Audit:
`ALERT_RESOLVED`

## 16. Patient and supporter safe monitoring

### Patient

GET `/api/v1/me/monitoring`

PATIENT + MONITORING_READ + VERIFIED SELF.

Return paged safe events from:
- patient's Treatment plans;
- TPT plans where TPT.patient=self OR TPT.contact.linkedPatient=self.

Safe fields:
- targetType
- eventType
- scheduledAt
- dueAt
- status
- completedAt

Exclude:
- plan notes
- rulesVersion
- other identities
- index case identity
- internal metadata/sourceEntity
- staff identity

### Supporter

GET `/api/v1/me/supporting-cases/{caseId}/monitoring`

TREATMENT_SUPPORTER + MONITORING_READ + active supporter-case link.

Only treatment monitoring for that case.
No contact/TPT monitoring is inferred from the index case.

Same safe event fields.

## 17. Patient/supporter safe alerts

### Patient

GET `/api/v1/me/alerts`

PATIENT + ALERT_READ + VERIFIED SELF.

Visible when alert target belongs to:
- own Treatment, or
- own/linked TPT.

Safe fields:
- id/version
- alertType
- severity
- status
- triggeredAt/dueAt
- eventType
- fixed safe message
- whether current user already acknowledged

No index-case/contact identity, clinical notes or details.

POST `/api/v1/me/alerts/{alertId}/acknowledge`

PATIENT + ALERT_ACKNOWLEDGE.

Create `alert_acknowledgements` receipt for current user.
Do not mutate global Alert.status.

Idempotent.

Audit:
`ALERT_ACKNOWLEDGEMENT_RECORDED`

### Supporter

GET `/api/v1/me/supporting-cases/{caseId}/alerts`

TREATMENT_SUPPORTER + ALERT_READ + active supporter link.

Only alerts from monitoring plans for that case's Treatment.

POST `/api/v1/me/supporting-cases/{caseId}/alerts/{alertId}/acknowledge`

TREATMENT_SUPPORTER + ALERT_ACKNOWLEDGE.

Per-user receipt only; global alert unchanged.

No TPT/contact alert access through supporter relationship.

## 18. In-app notification fan-out

Phase 4C implements **IN_APP only**.

Do not send EMAIL/SMS/WHATSAPP/PUSH and do not create a fake external delivery provider.

When an alert is first opened, create an IN_APP notification for eligible active users.

### Treatment alert recipients

- active TB_OFFICER users actively assigned to current treatment facility;
- verified SELF user(s) for the treatment patient;
- active `PatientSupporter.linkedUser` users for the treatment case.

### TPT alert recipients

- active TB_OFFICER users assigned to TPT facility;
- verified SELF user(s) for TPT.patient or contact.linkedPatient;
- no treatment-supporter fanout inferred from index case.

Require recipient has `NOTIFICATION_READ_SELF`.

Notification:
- channel = IN_APP
- status = DELIVERED
- scheduledAt = Clock now
- deliveredAt = Clock now
- payload contains only:
  - alertId
  - alertType
  - severity

No patient/contact name, diagnosis, treatment/TPT details or message is copied into payload.

Unique `(alert,user,channel)` prevents duplicate fan-out.

## 19. Notification self API

Implement:

- GET `/api/v1/me/notifications`
- POST `/api/v1/me/notifications/{notificationId}/read`

Requires NOTIFICATION_READ_SELF.

GET only current user's notifications, newest first, max page 50.

Projection:
- id/version
- alertId
- channel
- status
- scheduledAt/deliveredAt/readAt
- safe alertType/severity when alert still exists

Do not expose raw payload directly.

Read:
- If-Match required
- only own notification
- DELIVERED/SENT -> READ
- already READ idempotent
- set readAt = Clock now

Audit:
`NOTIFICATION_READ`

## 20. Privacy and audit

Audit metadata remains correlation-only.

Never place in audit metadata:
- patient/contact identity
- monitoring notes
- event schedules
- TPT/treatment clinical data
- alert message
- notification payload

System-generated audit records use null actor.

Monitoring/alert/notification DTOs must not expose generic JSON `metadata/details/payload`.

## 21. Concurrency and race tests

Use real PostgreSQL Testcontainers.

Mandatory:

- concurrent treatment plan creation -> one ACTIVE plan
- concurrent TPT plan creation -> one ACTIVE plan
- plan cancel vs event complete -> one coherent state
- event reschedule vs sweep -> one coherent fresh-state result
- event complete vs sweep-overdue -> at most one alert; completed event has no open alert
- two concurrent sweeps on same overdue event -> one alert and one notification per user
- staff alert acknowledge vs auto-resolve -> coherent final alert state
- patient/supporter acknowledgement races are idempotent unique receipts
- notification duplicate fan-out blocked by unique index
- treatment transfer racing alert sweep follows target-first locks and produces no cross-facility clinical write
- TPT close racing sweep auto-closes/cancels plan coherently

No retries.

## 22. Test matrix

Baseline is 589 tests.

At minimum verify:

### V15 schema
- V1–V15 fresh migration + Hibernate validate
- treatment monitoring rows remain valid
- exact-one-plan-target check
- active treatment index unchanged
- active TPT index
- alert patient can be null only in legitimate TPT workflow used by app
- monitoring-alert lineage trigger
- one alert per event
- acknowledgement uniqueness
- notification uniqueness
- no V1–V14 mutation

### Plan/event
- treatment plan creation + event validation
- TPT plan creation + event-code restrictions
- no auto clinical schedule
- explicit initial SCHEDULED/DUE/OVERDUE status
- plan history/read scope
- If-Match
- source authority
- immutable target/start/rulesVersion
- add/reschedule/complete/cancel event
- no generic metadata/sourceEntity write
- cancel plan resolves alerts
- target terminal auto-close behavior

### Sweep
- due transition
- overdue transition
- no alert for merely DUE
- one fixed WARNING alert for OVERDUE
- no clinical-value interpretation
- deterministic Clock
- scheduler wrapper can be disabled for tests

### Transfer continuity
- treatment plan remains same row after Phase 4A report
- destination gains staff monitoring access
- source loses current staff access
- new alert fanout goes to destination officers
- historical source notification remains its user's record
- TPT monitoring facility unchanged when index case transfers

### Staff alerts
- dynamic target-facility scope
- acknowledge/resolve If-Match
- no admin/program/lab bypass
- fixed safe projection

### Patient
- own treatment monitoring visible
- linked TPT monitoring visible
- unrelated monitoring hidden
- safe projection only
- own alerts safe
- patient acknowledgement does not change global alert state

### Supporter
- linked treatment monitoring/alerts visible
- unrelated case hidden
- no TPT/contact inference
- acknowledgement receipt does not change global alert

### Notifications
- recipient selection
- inactive/unlinked users excluded
- IN_APP only
- safe payload/projection
- read own notification only
- staff cannot read another user's notification
- external channels absent

### Audit/privacy
- all required actions
- null actor for system sweep
- metadata correlation-only
- JSON internals not exposed

All previous 589 tests must remain green.

Run on Windows:

```powershell
.\mvnw.cmd clean test
```

## 23. Documentation

Add:
- `docs/MONITORING.md`
- `docs/ALERTS_NOTIFICATIONS.md`
- `docs/PHASE4C_REPORT.md`

Update:
- README
- `docs/AUTHORIZATION.md`

Commit approved architecture under:
- `docs/architecture/TBCall_Application_API_v1.4C_Phase4C_Monitoring_Alerts_Notifications.md`

Do not commit local task prompts, logs, Kemenkes PDFs or tool scratch.

## 24. Explicitly deferred after Phase 4C

- automatic guideline-based monitoring-plan generation;
- automatic lab/follow-up creation;
- clinical threshold/risk scoring;
- missed-dose threshold inference;
- automated regimen/dose/outcome decisions;
- external SMS/WhatsApp/email/push gateways;
- program-level aggregate dashboards;
- SITB network/API integration;
- reconciliation/write-back with SITB;
- generalized TPT enrollment for non-contact risk groups.

After Phase 4C, the next architecture should define the SITB integration boundary rather than adding more local clinical automation.
