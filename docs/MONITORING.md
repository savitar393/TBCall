# Monitoring — Phase 4C

Contract: [approved v1.4C architecture](architecture/TBCall_Application_API_v1.4C_Phase4C_Monitoring_Alerts_Notifications.md). Codes are TBCall canonical operational values, not SITB database/API identifiers.

## Ownership and schedule boundary

A plan has exactly one FK target: Treatment or PreventiveTreatment. Creation requires an ACTIVE target, its current active facility, TB_OFFICER and MONITORING_MANAGE, and the independent MonitoringSourceAuthorityPolicy. One ACTIVE plan per target is enforced both under target locks and by PostgreSQL. Historical cancelled/completed plans remain available.

Treatment ownership follows the current Treatment facility after Phase 4A report; plan/event rows remain the same. TPT ownership follows its recorded facility and does not move with the index case. Existing patient-owned TPT rows are supported without adding an enrollment route for non-contact risk groups.

Creation takes startDate, optional endDate/notes, and 1..100 explicit events (eventType, scheduledAt, optional dueAt). rulesVersion is server-owned MANUAL_V1. Start is between target start and Clock today; an explicit end cannot exceed target planned end. Null end does not infer duration. Schedule timestamps must fall within plan calendar dates in the injected Clock zone, and dueAt cannot precede scheduledAt.

Treatment codes: CLINICAL_REVIEW, WEIGHT_REVIEW, ADHERENCE_REVIEW, ADVERSE_EVENT_REVIEW, BACTERIOLOGY_FOLLOW_UP, SAFETY_MONITORING, MEDICATION_PICKUP. TPT permits these except BACTERIOLOGY_FOLLOW_UP and SAFETY_MONITORING. Arbitrary codes and generic JSON/source fields are rejected.

There is no generated clinical schedule, lab/follow-up creation, clinical interpretation, missed-dose threshold, outcome inference, or treatment/TPT mutation.

## Routes

All routes are under `/api/v1`; authenticated sessions and CSRF apply. Staff reads require TB_OFFICER + MONITORING_READ and target facility scope. LAB_STAFF's legacy permission does not grant these staff APIs. Lists default to page 0/size 20, maximum size 50.

| Method | Route | Contract |
|---|---|---|
| POST / GET | `/treatments/{treatmentId}/monitoring-plans` | Create explicit ACTIVE plan / scoped history |
| POST / GET | `/preventive-treatments/{tptId}/monitoring-plans` | Create explicit ACTIVE plan / scoped history |
| GET / PATCH | `/monitoring-plans/{planId}` | Detail / endDate and notes only |
| POST | `/monitoring-plans/{planId}/cancel` | ACTIVE plan -> CANCELLED |
| GET / POST | `/monitoring-plans/{planId}/events` | List / add one explicit event |
| PATCH | `/monitoring-events/{eventId}` | Reschedule SCHEDULED or DUE only |
| POST | `/monitoring-events/{eventId}/complete` | Open event -> COMPLETED |
| POST | `/monitoring-events/{eventId}/cancel` | Open event -> CANCELLED |
| GET | `/me/monitoring` | PATIENT + MONITORING_READ + VERIFIED SELF; own Treatment and direct/linked TPT |
| GET | `/me/supporting-cases/{caseId}/monitoring` | TREATMENT_SUPPORTER + permission + active link; case Treatment only |

Staff writes require MONITORING_MANAGE and the monitoring source policy. Existing-resource writes require quoted numeric If-Match: plan version for PATCH/cancel/add-event, event version for reschedule/complete/cancel. Missing 428, malformed 400, stale 409. Adding an event advances the parent plan version. Details/mutations return ETag; creates return 201 and other successful commands 200. Command bodies are explicit; empty commands accept `{}`.

PATCH cannot change target, start, rulesVersion or createdBy. An end-date change retains schedule/due bounds for every non-cancelled event. Event PATCH changes scheduledAt/dueAt only; null dueAt clears the deadline. Completion defaults completedAt to Clock now, constrained between scheduledAt and now. OVERDUE cannot be rescheduled: cancel it and explicitly add a replacement. Plan cancellation cancels all open events and resolves their OPEN/ACKNOWLEDGED alerts.

Staff DTOs expose plan identifiers/versions, target, lifecycle/dates/rulesVersion/notes/counts/timestamps; event DTOs expose identifier/version/type/schedule/completion/status. Self/supporter events expose only targetType/eventType/scheduledAt/dueAt/status/completedAt. No JSON metadata, sourceEntity fields, other identities, rules or staff notes appear in these safe projections.

## Deterministic sweep

Initial and rescheduled states use Clock only: future scheduledAt -> SCHEDULED; reached scheduledAt -> DUE; strictly past a non-null dueAt -> OVERDUE. Equality to dueAt is DUE. DUE without a deadline remains DUE and produces no alert.

MonitoringSweepService discovers at most 100 candidate plan IDs without target locks, including terminal targets regardless of event time/state. MonitoringSweepWorker processes each plan in a separate READ_COMMITTED transaction, locks target -> plan -> events -> alerts, and rechecks lifecycle/time. Repeated/concurrent sweeps create at most one alert ever per event.

Recorded Treatment/TPT COMPLETED closes the plan as COMPLETED. Recorded TPT STOPPED/LOST_TO_FOLLOW_UP closes it as CANCELLED. Open events are CANCELLED and open/acknowledged alerts RESOLVED. No other clinical lifecycle status is inferred or changed.

Scheduled wrapper defaults enabled and runs one bounded batch with fixed delay:

```properties
tbcall.monitoring.scheduler-enabled=${TBCALL_MONITORING_SCHEDULER_ENABLED:true}
tbcall.monitoring.sweep-interval-ms=${TBCALL_MONITORING_SWEEP_INTERVAL_MS:60000}
```

The test profile disables scheduling; tests invoke sweep directly using an injected fixed Clock. There is no sweep HTTP endpoint or retry loop.

## Lock order and audit

Treatment: TBCase -> Treatment -> MonitoringPlan -> MonitoringEvent -> Alert.
Contact TPT: Contact -> PreventiveTreatment -> MonitoringPlan -> MonitoringEvent -> Alert.
Patient-owned TPT: PreventiveTreatment -> MonitoringPlan -> MonitoringEvent -> Alert.

Scalar scope/target discovery precedes entity hydration and locks. Ownership/state/version are rechecked under locks. Existing clinical source policies/services remain unchanged.

Actions: MONITORING_PLAN_CREATED, MONITORING_PLAN_UPDATED, MONITORING_PLAN_CANCELLED, MONITORING_PLAN_AUTO_CLOSED, MONITORING_EVENT_CREATED, MONITORING_EVENT_RESCHEDULED, MONITORING_EVENT_COMPLETED, MONITORING_EVENT_CANCELLED, MONITORING_EVENT_DUE, MONITORING_EVENT_OVERDUE. Sweep actor is null. Audit metadata contains only traceId; schedules/notes/identities are never copied.
