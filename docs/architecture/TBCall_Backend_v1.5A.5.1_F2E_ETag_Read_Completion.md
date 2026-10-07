# TBCall Backend v1.5A.5.1 — F2E ETag Read Completion

Approved base: `892e54c35636f47fc2ca5457c27fdff5510b2212`

Status: narrow backend read-contract completion required before F2E frontend.

The v1.5A.5 monitoring-reference endpoint is approved. During full F2E command-chain review, two existing-resource writes were found to require `If-Match` without an authoritative per-resource GET ETag contract:

1. monitoring-event reschedule/complete/cancel;
2. current-user notification read.

Do not synthesize ETags from numeric `version` values in frontend list rows. Add exact detail GETs instead.

No migration, workflow, permission, scheduler, alert-generation or notification-fanout change.

## 1. Migration policy

Do not modify V1–V17.
Do not add V18.
No schema change.

## 2. Staff monitoring-event detail

Add:

`GET /api/v1/monitoring-events/{eventId}`

Authorization and scope:
- existing `TB_OFFICER + MONITORING_READ`;
- event's monitoring plan target must be in one of the actor's active assigned facilities;
- use the existing `MonitoringAccess.event(actor, "MONITORING_READ", eventId, false)` path;
- out-of-scope or missing event remains non-enumerating 404.

Response:
- existing `MonitoringDtos.EventDetail`
- HTTP 200
- quoted ETag generated through existing `IfMatch.etag(detail.version())`

Do not add fields to EventDetail.
Do not expose plan notes, patient/contact identity, regimen, lab data, source metadata or alert details.

Successful GET has no audit mutation.

This endpoint exists only to obtain authoritative current event state + ETag. It grants no `MONITORING_MANAGE`.

## 3. Current-user notification detail

Add:

`GET /api/v1/me/notifications/{notificationId}`

Authorization and scope:
- existing `NOTIFICATION_READ_SELF`;
- row must belong to `actor.userId()`;
- other users' or missing rows return non-enumerating 404;
- no role restriction beyond the existing self-notification permission contract, so future PATIENT/TREATMENT_SUPPORTER UI can reuse it.

Response:
- existing `MonitoringDtos.NotificationDetail`
- HTTP 200
- quoted ETag from current `version`

Do not expose:
- notification payload JSON;
- failure_reason;
- patient/contact identity;
- alert message/details;
- clinical data.

Use the existing safe `MonitoringViews.notification()` projection.

Successful GET must not mark the notification READ and must not write an audit row.

This endpoint grants no ability to read another user's notification and no additional permission.

## 4. Query/service shape

Preferred narrow implementation:

### MonitoringQueryService

Add:

```java
public EventDetail event(CurrentActor actor, UUID id) {
    return views.event(access.event(actor, "MONITORING_READ", id, false));
}
```

Add a read-only notification detail query using the same ownership and `NOTIFICATION_READ_SELF` semantics already used by notification list/read.

Do not call `NotificationService.read()` from GET because it mutates status.

### MonitoringController

Add the GET event route and respond with the existing ETag helper.

### NotificationController

Add the GET notification detail route and respond with the existing ETag helper.

Avoid new services/abstractions unless truly required.

## 5. Existing behavior unchanged

Do not alter:
- monitoring plan create/patch/cancel;
- monitoring event add/reschedule/complete/cancel;
- alert list/detail/acknowledge/resolve;
- notification list/read transition;
- MonitoringValidation;
- MonitoringAccess write semantics;
- MonitoringSourceAuthorityPolicy;
- MonitoringAlerts/sweeper;
- notification fanout;
- reference endpoint from v1.5A.5;
- patient/supporter safe monitoring/alert endpoints;
- frontend files.

No new mutation endpoint.

## 6. Concurrency contract after this checkpoint

Frontend F2E must use actual GET response ETags:

- plan patch/cancel/add-event -> GET `/monitoring-plans/{id}`
- event reschedule/complete/cancel -> GET `/monitoring-events/{id}` **new**
- alert acknowledge/resolve -> GET `/alerts/{id}`
- notification read -> GET `/me/notifications/{id}` **new**

No ETag may be synthesized from numeric list `version`.

Plan creation remains no If-Match.

## 7. Tests

Backend baseline after v1.5A.5: 1142.

Add PostgreSQL/Spring integration coverage.

### Monitoring event detail
- TB_OFFICER + MONITORING_READ + active target facility -> 200
- response body exactly existing EventDetail projection
- quoted ETag matches current version
- MONITORING_MANAGE without MONITORING_READ does not gain read endpoint unless existing permission model already independently grants MONITORING_READ; test exact `/me` grants
- wrong roles with artificial MONITORING_READ denied
- out-of-scope/inactive target facility -> 404
- missing UUID -> 404
- repeated GET no audit/data mutation
- GET does not grant MONITORING_MANAGE
- after legitimate event mutation, old ETag is stale and new GET returns advanced authoritative ETag

### Notification detail
- owner with NOTIFICATION_READ_SELF -> 200
- response exactly existing NotificationDetail safe projection
- quoted ETag matches current version
- GET does not change DELIVERED/SENT status to READ
- GET produces no notification-read audit
- another user's row -> 404
- missing row -> 404
- permission absent -> 403
- role remains unrestricted beyond permission (exercise TB_OFFICER and one non-officer self-capable role if consistent with existing RBAC)
- payload/failure_reason never returned
- after legitimate `/read`, new GET returns READ and advanced authoritative ETag; old If-Match fails

### Regression/scope
- v1.5A.5 monitoring-reference tests remain green
- all previous 1142 backend tests green
- V1–V17 byte-for-byte unchanged
- no V18
- frontend byte-for-byte unchanged

Run:

```powershell
.\mvnw.cmd clean test
```

## 8. Documentation

Add:
- `docs/FRONTEND_MONITORING_ETAG_READ_CONTRACTS.md`
- `docs/PHASE5A_5_1_REPORT.md`
- `docs/architecture/TBCall_Backend_v1.5A.5.1_F2E_ETag_Read_Completion.md`

Update the F2E monitoring contract guide/README only where useful.

Do not commit task prompts/tool scratch/logs/PDFs/secrets/screenshots/caches.

## 9. Stop condition

If either detail GET requires schema changes or changes to write behavior, stop and report the conflict.

Do not begin F2E UI.
