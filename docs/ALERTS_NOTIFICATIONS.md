# Alerts and IN_APP notifications — Phase 4C

Contract: [approved v1.4C architecture](architecture/TBCall_Application_API_v1.4C_Phase4C_Monitoring_Alerts_Notifications.md). These are TBCall-owned operational records and canonical codes.

## Alerts

Only an explicit OVERDUE monitoring event opens an automatic alert. Type MONITORING_OVERDUE, severity WARNING, rule MONITORING_OVERDUE_V1, fixed safe message `Jadwal pemantauan telah melewati batas waktu.`, details `{}`. No lab, symptom, adverse-event or adherence inference occurs.

Treatment lineage includes patient/case/treatment; contact/TPT are null. TPT lineage includes preventiveTreatment/contact when applicable, direct/linked patient when available, and no case/treatment. V15 adds a monitoring/TPT lineage trigger while retaining V6 verbatim. Null patient supports unlinked contact-owned TPT. A unique event index permits one alert ever, including after staff resolution.

### Phase 4C.1 post-review schema hardening

V15 implemented Phase 4C. Subsequent review identified that nullable `alerts.patient_id` could bypass V6's ordinary NULL comparisons for direct treatment/case alerts, and `contact_id` could exist without TPT. V16 independently closes those two gaps:

- `chk_alert_patient_required_except_tpt`: `patient_id IS NOT NULL OR preventive_treatment_id IS NOT NULL`.
- `chk_alert_contact_requires_tpt`: `contact_id IS NULL OR preventive_treatment_id IS NOT NULL`.

Both guards apply on INSERT and UPDATE and reject violations with SQLSTATE `23514`. Generic patient-only alerts preserve V1 behavior. Unlinked contact-owned TPT may retain NULL patient; matching linked/direct patient TPT alerts remain valid. V1–V15, both lineage triggers/functions, all endpoint/service behavior and the approved v1.4C architecture remain unchanged. V16 performs no data repair; conflicting pre-existing rows cause migration failure and require review rather than automatic changes.

All routes below are under `/api/v1`; lists use page 0/size 20 by default, max 50.

| Method | Route | Permission/scope |
|---|---|---|
| GET | `/alerts` | TB_OFFICER + ALERT_READ; optional status/targetType; current target facility |
| GET | `/alerts/{alertId}` | Same staff scope |
| POST | `/alerts/{alertId}/acknowledge` | TB_OFFICER + ALERT_ACKNOWLEDGE + If-Match |
| POST | `/alerts/{alertId}/resolve` | TB_OFFICER + ALERT_RESOLVE + If-Match |
| GET | `/me/alerts` | PATIENT + ALERT_READ + VERIFIED SELF; own Treatment or direct/linked TPT |
| POST | `/me/alerts/{alertId}/acknowledge` | PATIENT + ALERT_ACKNOWLEDGE + VERIFIED SELF |
| GET | `/me/supporting-cases/{caseId}/alerts` | TREATMENT_SUPPORTER + ALERT_READ + active case link; Treatment only |
| POST | `/me/supporting-cases/{caseId}/alerts/{alertId}/acknowledge` | Supporter + ALERT_ACKNOWLEDGE + active link; Treatment only |

Staff acknowledge OPEN -> ACKNOWLEDGED, sets acknowledgedAt; already ACKNOWLEDGED is idempotent with current If-Match. Staff resolve OPEN/ACKNOWLEDGED -> RESOLVED, sets resolvedAt, leaves the event status unchanged. Completion/cancellation and terminal-plan sweep resolve open alerts. Resolution never recreates an alert for the same event.

Patient/supporter acknowledge records a unique per-user receipt, idempotently, under the target/plan/event/alert locks. It does not alter global status, timestamps or Alert version and requires no If-Match. Safe alerts include id/version/type/severity/status/triggeredAt/dueAt/eventType/fixed message and the user's receipt flag. There is no supporter access to TPT through an index-case link.

Staff queue DTOs provide event/target identifiers and schedule plus alert lifecycle fields/fixed message, without patient/contact names. This keeps the initial queue projection minimal. No notes, HIV/DM, laboratory data, regimen descriptions, generic details/source/metadata or identity/account/audit/sync records are exposed.

## Notifications

First-open fanout creates IN_APP / DELIVERED rows with scheduledAt=deliveredAt=Clock now. No external provider/channel is used. Unique `(alert_id,user_id,channel)` guards duplicates.

Treatment recipients: active TB officers actively assigned to current Treatment facility; verified SELF linked users for the treatment patient; active linked PatientSupporter users for that case. TPT recipients: active TB officers assigned to recorded TPT facility and verified SELF users for direct TPT.patient or contact.linkedPatient; no inferred supporters. Every recipient must be an ACTIVE user with NOTIFICATION_READ_SELF. Multiple qualifying relationships are deduplicated.

Payload contains only alertId, alertType, severity. No names, clinical details or free text are copied. Historical notifications remain owned by their original users after transfers; future alerts select destination officers from current Treatment ownership.

| Method | Route | Contract |
|---|---|---|
| GET | `/me/notifications` | NOTIFICATION_READ_SELF; own rows, newest first, max 50 |
| POST | `/me/notifications/{notificationId}/read` | Permission + own row + If-Match; `{}` body |

Read transitions DELIVERED/SENT -> READ at Clock now; already READ with current version is idempotent. Another user's notification is 404, including for staff. DTO fields: id/version/alertId/channel/status/scheduledAt/deliveredAt/readAt and safe alertType/severity when the alert exists. Raw payload and failure details are excluded.

## Audit

ALERT_OPENED, ALERT_ACKNOWLEDGED, ALERT_RESOLVED, ALERT_AUTO_RESOLVED, ALERT_ACKNOWLEDGEMENT_RECORDED, NOTIFICATION_READ. System sweep uses null actor; all metadata is correlation-only traceId.

SITB integration, write-back/reconciliation, clinical decision automation and external delivery remain deferred pending their own architecture.
