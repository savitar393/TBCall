# F2E authoritative detail reads - backend v1.5A.5.1

Approved base: `892e54c35636f47fc2ca5457c27fdff5510b2212`.

These two additive GETs supply current resource state and actual quoted response ETags for existing commands. No migration, new permission, write behavior, frontend implementation or SITB networking is included.

## Monitoring event detail

`GET /api/v1/monitoring-events/{eventId}`

Requires authenticated TB_OFFICER with MONITORING_READ and an active assigned facility. The monitoring plan's treatment/TPT target facility must be active and assigned to the actor. This uses the existing `MonitoringAccess.event(actor, "MONITORING_READ", eventId, false)` path. The episode target facility supplies scope; the case's current facility alone does not grant access.

Returns HTTP 200, existing `MonitoringDtos.EventDetail`, and `ETag: "<current-version>"` from `IfMatch.etag(detail.version())`.

| Field | Type |
| --- | --- |
| id | UUID |
| version | integer |
| eventType | string |
| scheduledAt | date-time |
| dueAt | nullable date-time |
| completedAt | nullable date-time |
| status | string |

No plan notes, patient/contact identity, regimen, lab data, source metadata or alert details are returned. Successful reads do not mutate data, version or audit. MONITORING_MANAGE alone does not authorize this GET; MONITORING_READ does not grant management.

Anonymous requests return 401. Wrong role, missing MONITORING_READ or no active assigned facility returns 403 through the existing officer gate. Missing events, foreign targets and inactive targets return the same generic RESOURCE_NOT_FOUND 404 without ETag. If the actor has no other active assignment when the target facility becomes inactive, the officer gate returns 403 before resource lookup; an actor with another active assignment reaches the target-scope 404. Existing denial auditing remains unchanged.

## Current-user notification detail

`GET /api/v1/me/notifications/{notificationId}`

Requires authenticated actor with NOTIFICATION_READ_SELF. The row must belong to `actor.userId()`. There is no TB_OFFICER role or facility-assignment requirement; PATIENT and TREATMENT_SUPPORTER roles retain their existing self-permission access.

Returns HTTP 200, existing `MonitoringDtos.NotificationDetail` through `MonitoringViews.notification()`, and `ETag: "<current-version>"` from the same helper.

| Field | Type |
| --- | --- |
| id | UUID |
| version | integer |
| alertId | nullable UUID |
| channel | string |
| status | string |
| scheduledAt | date-time |
| deliveredAt | nullable date-time |
| readAt | nullable date-time |
| alertType | nullable string |
| severity | nullable string |

Notification payload JSON, failure_reason, patient/contact identity, alert message/details and clinical data are excluded. A notification without an alert has null alertId/alertType/severity. GET preserves all statuses, including SENT and DELIVERED; it never calls NotificationService.read(), marks READ or records NOTIFICATION_READ audit. It does not grant access to another user's row or any additional permission.

Anonymous requests return 401; absent self permission returns 403. Missing and other users' rows return the same generic RESOURCE_NOT_FOUND 404 without ETag. No new status, role or facility filter is introduced.

## Command ETag chain

Fetch the authoritative detail immediately before preparing an existing versioned command, retain its response ETag and submit that exact header as If-Match. Never construct an ETag from a numeric list-row version.

| Existing command | Authoritative GET |
| --- | --- |
| Plan patch/cancel/add-event | `/api/v1/monitoring-plans/{id}` |
| Event reschedule/complete/cancel | `/api/v1/monitoring-events/{id}` (new) |
| Alert acknowledge/resolve | `/api/v1/alerts/{id}` |
| Notification read | `/api/v1/me/notifications/{id}` (new) |

Plan creation still needs no If-Match. Existing command behavior remains: missing If-Match is 428, invalid format is 400, stale version is 409 OPTIMISTIC_LOCK_CONFLICT. A GET does not reserve the version: a concurrent write can make the header stale. Refetch current detail and require deliberate conflict review rather than automatically replaying a command. Legitimate event changes and SENT/DELIVERED -> READ advance the version; subsequent GET returns the advanced ETag. The old header is rejected even when a notification is already READ.

## Handoff and verification

The [monitoring reference contract](FRONTEND_MONITORING_READ_CONTRACTS.md) remains unchanged. These are authoritative per-resource reads, separate from list/reference vocabulary. Existing monitoring validation, source authority, write state/concurrency behavior, alert generation, scheduler/sweep, notification fanout and patient/supporter safe monitoring/alert projections are unchanged. V1-V17 and frontend files are unchanged; no V18 or F2E UI.

See the [approved architecture](architecture/TBCall_Backend_v1.5A.5.1_F2E_ETag_Read_Completion.md) and [checkpoint report](PHASE5A_5_1_REPORT.md) for the test matrix and exact clean-build result. F2E UI requires its separate authorized checkpoint. No schema/specification conflict or additional detail-read contract blocker was found.
