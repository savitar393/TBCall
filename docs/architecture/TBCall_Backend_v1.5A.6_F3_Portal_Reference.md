# TBCall Backend v1.5A.6 — F3 Portal Reference Contract

Base commit after approved F2E frontend: `653c48a5b005c6a84f211bc826b64c007b62c8b0`

This is a narrow read-contract checkpoint before F3 PATIENT / TREATMENT_SUPPORTER portal UI. Do not modify V1–V17 or add V18.

## Why

The backend already provides safe self/supporter routes for:
- patient profile
- patient treatment/TPT
- patient/supporter dose evidence list/create
- patient follow-ups
- patient/supporter monitoring events
- patient/supporter alerts and acknowledgement receipts
- current-user notifications and authoritative notification ETags

The missing browser contract is safe server-owned vocabulary for portal display and dose-entry choices.

## Endpoint

Add:

`GET /api/v1/me/portal-reference-data`

Authorization:
- authenticated actor
- role PATIENT or TREATMENT_SUPPORTER
- at least one actually-held portal-relevant permission:
  - TREATMENT_READ
  - ADHERENCE_READ
  - ADHERENCE_RECORD
  - FOLLOW_UP_READ
  - TPT_READ
  - MONITORING_READ
  - ALERT_READ
  - ALERT_ACKNOWLEDGE
  - NOTIFICATION_READ_SELF
- no facility assignment required

Wrong roles must not bypass with artificial grants.

No successful-read audit.

## Response

Return code/name options only.

### treatmentStatuses
- PLANNED — Direncanakan
- ACTIVE — Aktif
- PAUSED — Dijeda
- TRANSFERRED — Dialihkan
- COMPLETED — Selesai
- STOPPED — Dihentikan
- CANCELLED — Dibatalkan

### tptStatuses
- PLANNED — Direncanakan
- ACTIVE — Aktif
- COMPLETED — Selesai
- STOPPED — Dihentikan
- LOST_TO_FOLLOW_UP — Putus tindak lanjut
- CANCELLED — Dibatalkan

### patientDoseStatuses
- TAKEN_SELF_REPORTED — Diminum berdasarkan laporan sendiri
- MISSED — Tidak diminum
- UNKNOWN — Tidak diketahui

### supporterDoseStatuses
- TAKEN_OBSERVED — Diminum terobservasi
- TAKEN_SELF_REPORTED — Diminum berdasarkan laporan
- MISSED — Tidak diminum
- UNKNOWN — Tidak diketahui

### administrationModes
- DIRECTLY_OBSERVED — Diawasi langsung
- SELF_ADMINISTERED — Diminum mandiri
- OTHER — Lainnya

### followUpStatuses
- SCHEDULED — Terjadwal
- COMPLETED — Selesai

### treatmentMonitoringEventTypes
- CLINICAL_REVIEW — Tinjauan klinis
- WEIGHT_REVIEW — Tinjauan berat badan
- ADHERENCE_REVIEW — Tinjauan kepatuhan
- ADVERSE_EVENT_REVIEW — Tinjauan kejadian tidak diinginkan
- BACTERIOLOGY_FOLLOW_UP — Tindak lanjut bakteriologis
- SAFETY_MONITORING — Pemantauan keamanan
- MEDICATION_PICKUP — Pengambilan obat

### tptMonitoringEventTypes
- CLINICAL_REVIEW — Tinjauan klinis
- WEIGHT_REVIEW — Tinjauan berat badan
- ADHERENCE_REVIEW — Tinjauan kepatuhan
- ADVERSE_EVENT_REVIEW — Tinjauan kejadian tidak diinginkan
- MEDICATION_PICKUP — Pengambilan obat

### monitoringEventStatuses
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

### notificationStatuses
- PENDING — Menunggu
- SENT — Dikirim
- DELIVERED — Terkirim
- READ — Dibaca
- FAILED — Gagal
- CANCELLED — Dibatalkan

### notificationChannels
- IN_APP — Dalam aplikasi

All values are TBCall UI/workflow vocabulary, not SITB physical/API codes.

## Safety boundary

Do not return/infer:
- patient identity or case/treatment/TPT identifiers
- regimen composition/dose
- adherence score
- treatment outcome
- monitoring schedule/frequency/due date
- alert-generation internals
- notification recipients
- external notification channels
- staff-only regimen/drug/outcome catalogs

## Existing behavior unchanged

Do not alter:
- AdherenceService actor-specific status allowlists
- patient/supporter projections
- treatment selection logic
- `/me/tpt`
- safe monitoring/alert endpoints
- alert acknowledgement receipt semantics
- notification read behavior
- frontend files

No new write endpoint.

## Tests

Backend baseline: 1186.

Cover:
- PATIENT with representative relevant permission can read
- TREATMENT_SUPPORTER can read
- no relevant permission -> 403
- TB_OFFICER/LAB_STAFF/admin roles with artificial portal grants -> 403
- no facility assignment required
- PATIENT does not require active treatment merely to read vocabulary
- supporter does not require supporter-case linkage merely to read vocabulary
- exact code/order/labels for every group
- patient dose list exactly matches current patient write allowlist
- supporter dose list exactly matches current supporter write allowlist
- patient excludes TAKEN_OBSERVED and DISPENSED_HOME
- supporter excludes DISPENSED_HOME
- TPT monitoring excludes BACTERIOLOGY_FOLLOW_UP and SAFETY_MONITORING
- notificationChannels exactly IN_APP
- code/name-only projection
- no audit/domain side effect
- vocabulary read grants no write capability
- existing actor-inappropriate dose status validation unchanged
- all previous 1186 tests green
- frontend unchanged
- V1–V17 unchanged/no V18

Run:

```powershell
.\mvnw.cmd clean test
```

## Documentation

Add:
- `docs/FRONTEND_PORTAL_READ_CONTRACTS.md`
- `docs/PHASE5A_6_REPORT.md`
- `docs/architecture/TBCall_Backend_v1.5A.6_F3_Portal_Reference.md`

Update README only if useful.

After approval, F3 may implement separate PATIENT and TREATMENT_SUPPORTER portal experiences using existing safe self/supporter APIs.
