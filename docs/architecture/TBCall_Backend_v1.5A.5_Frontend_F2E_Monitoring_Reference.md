# TBCall Backend v1.5A.5 — Frontend F2E Monitoring Reference Contract

Base commit: `f478c470e8004ed140cf0899c4802fdb1599d315`

This is a narrow read-contract checkpoint before staff monitoring/alerts/notifications frontend F2E. Do not modify V1–V17 or add V18.

## Why

The existing backend already supports:
- treatment/TPT monitoring-plan create/history/detail/update/cancel
- monitoring-event list/add/reschedule/complete/cancel
- staff alert queue/detail/acknowledge/resolve
- current-user notification list/read

The remaining F2E gap is server-owned reference vocabulary so the frontend does not duplicate backend constants or the treatment-vs-TPT event allowlists.

## Endpoint

Add:

`GET /api/v1/monitoring-reference-data`

Authorization:
- TB_OFFICER
- at least one active assigned facility
- at least one of:
  - MONITORING_READ
  - MONITORING_MANAGE
  - ALERT_READ
  - ALERT_ACKNOWLEDGE
  - ALERT_RESOLVE
  - NOTIFICATION_READ_SELF

Select an actually-held relevant permission and reuse existing officer/facility authorization semantics.

No success-read audit.

## Response

Return explicit code/name options only.

### treatmentEventTypes
- CLINICAL_REVIEW — Tinjauan klinis
- WEIGHT_REVIEW — Tinjauan berat badan
- ADHERENCE_REVIEW — Tinjauan kepatuhan
- ADVERSE_EVENT_REVIEW — Tinjauan kejadian tidak diinginkan
- BACTERIOLOGY_FOLLOW_UP — Tindak lanjut bakteriologis
- SAFETY_MONITORING — Pemantauan keamanan
- MEDICATION_PICKUP — Pengambilan obat

### tptEventTypes
- CLINICAL_REVIEW — Tinjauan klinis
- WEIGHT_REVIEW — Tinjauan berat badan
- ADHERENCE_REVIEW — Tinjauan kepatuhan
- ADVERSE_EVENT_REVIEW — Tinjauan kejadian tidak diinginkan
- MEDICATION_PICKUP — Pengambilan obat

Do not include BACTERIOLOGY_FOLLOW_UP or SAFETY_MONITORING for TPT.

### planStatuses
- DRAFT — Draf
- ACTIVE — Aktif
- PAUSED — Dijeda
- COMPLETED — Selesai
- CANCELLED — Dibatalkan

### eventStatuses
- SCHEDULED — Terjadwal
- DUE — Jatuh tempo
- OVERDUE — Terlambat
- COMPLETED — Selesai
- CANCELLED — Dibatalkan

### alertTypes
- MONITORING_OVERDUE — Pemantauan terlambat

### alertStatuses
- OPEN — Terbuka
- ACKNOWLEDGED — Diakui
- RESOLVED — Terselesaikan
- DISMISSED — Dikesampingkan

### alertSeverities
- INFO — Informasi
- WARNING — Peringatan
- HIGH — Tinggi
- CRITICAL — Kritis

### alertTargetTypes
- TREATMENT — Pengobatan
- TPT — TPT

### notificationStatuses
- PENDING — Menunggu
- SENT — Dikirim
- DELIVERED — Terkirim
- READ — Dibaca
- FAILED — Gagal
- CANCELLED — Dibatalkan

### notificationChannels
- IN_APP — Dalam aplikasi

Do not expose EMAIL/SMS/WHATSAPP/PUSH as available F2E channels. Current Phase 4C implements IN_APP only.

All labels are TBCall workflow/UI labels, not SITB physical/API codes.

## Safety boundary

This endpoint must not provide or infer:
- monitoring schedules
- due dates
- event frequency
- which events a patient should receive
- treatment/TPT eligibility
- lab orders
- diagnosis
- regimen/outcome changes
- notification recipients

Do not expose internal rules metadata or alert details JSON.

The frontend must still create each monitoring event/date explicitly.

## Existing behavior unchanged

Do not alter:
- MonitoringValidation allowlists
- MonitoringService
- MonitoringQueryService
- MonitoringAlerts
- AlertService
- NotificationService
- scheduler/sweep behavior
- safe patient/supporter endpoints
- source-authority policy
- notification fanout
- existing frontend files

The endpoint grants no monitoring/alert/notification write scope.

## Tests

Backend baseline: 1102.

Add PostgreSQL/Spring tests covering:
- each relevant permission independently authorizes TB_OFFICER
- no relevant permission -> 403
- wrong roles with artificial permissions denied
- missing/inactive facility assignment denied
- exact treatmentEventTypes code/order/labels
- exact tptEventTypes code/order/labels
- TPT excludes bacteriology and safety monitoring
- exact plan/event status lists
- exact alert type/status/severity/target lists
- exact notification status list
- notificationChannels exactly IN_APP
- code/name-only projection
- no audit side effect
- reference read does not grant writes
- existing MonitoringValidation still rejects treatment-only event types on TPT
- current overdue alert remains MONITORING_OVERDUE / WARNING
- no schedule/frequency/rules metadata leakage
- all previous 1102 tests green
- frontend unchanged

Run:

```powershell
.\mvnw.cmd clean test
```

## Documentation

Add:
- `docs/FRONTEND_MONITORING_READ_CONTRACTS.md`
- `docs/PHASE5A_5_REPORT.md`
- `docs/architecture/TBCall_Backend_v1.5A.5_Frontend_F2E_Monitoring_Reference.md`

Update root README only if useful.

After approval, F2E may implement contextual staff monitoring plans/events, staff alerts, and TB Officer IN_APP notifications. Patient/supporter monitoring/alerts remain deferred to F3.
