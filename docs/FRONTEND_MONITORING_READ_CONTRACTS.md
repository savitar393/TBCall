# F2E monitoring reference read contract - backend v1.5A.5

Approved base: `f478c470e8004ed140cf0899c4802fdb1599d315`.

## Endpoint and authorization

`GET /api/v1/monitoring-reference-data`

Requires authenticated TB_OFFICER, at least one active assigned facility, and at least one actually-held permission from:

- MONITORING_READ
- MONITORING_MANAGE
- ALERT_READ
- ALERT_ACKNOWLEDGE
- ALERT_RESOLVE
- NOTIFICATION_READ_SELF

The service selects a held relevant grant and delegates to existing MonitoringAccess.officer/ClinicalAccess.officer. Existing session resolution supplies only active user/facility assignments. No unrelated clinical permission is needed. Anonymous requests return 401; wrong role, missing permission or absent active assignment returns 403. Existing denial auditing remains intact; successful reads produce no audit.

There is no request body, pagination, target identifier or precondition/ETag. This global vocabulary neither exposes resource data nor changes facility/resource access. Existing permission/state/source-authority/If-Match checks still protect commands. In particular, NOTIFICATION_READ_SELF retains its existing ownership-scoped notification-read behavior; this reference GET grants no additional capability.

## Exact ordered response

Each option contains only `code` and `name`. All ten groups are always present. Names/order match the approved architecture; these are TBCall workflow/UI labels, not official SITB physical schema or API codes.

```json
{
  "treatmentEventTypes": [
    {"code":"CLINICAL_REVIEW","name":"Tinjauan klinis"},
    {"code":"WEIGHT_REVIEW","name":"Tinjauan berat badan"},
    {"code":"ADHERENCE_REVIEW","name":"Tinjauan kepatuhan"},
    {"code":"ADVERSE_EVENT_REVIEW","name":"Tinjauan kejadian tidak diinginkan"},
    {"code":"BACTERIOLOGY_FOLLOW_UP","name":"Tindak lanjut bakteriologis"},
    {"code":"SAFETY_MONITORING","name":"Pemantauan keamanan"},
    {"code":"MEDICATION_PICKUP","name":"Pengambilan obat"}
  ],
  "tptEventTypes": [
    {"code":"CLINICAL_REVIEW","name":"Tinjauan klinis"},
    {"code":"WEIGHT_REVIEW","name":"Tinjauan berat badan"},
    {"code":"ADHERENCE_REVIEW","name":"Tinjauan kepatuhan"},
    {"code":"ADVERSE_EVENT_REVIEW","name":"Tinjauan kejadian tidak diinginkan"},
    {"code":"MEDICATION_PICKUP","name":"Pengambilan obat"}
  ],
  "planStatuses": [
    {"code":"DRAFT","name":"Draf"},
    {"code":"ACTIVE","name":"Aktif"},
    {"code":"PAUSED","name":"Dijeda"},
    {"code":"COMPLETED","name":"Selesai"},
    {"code":"CANCELLED","name":"Dibatalkan"}
  ],
  "eventStatuses": [
    {"code":"SCHEDULED","name":"Terjadwal"},
    {"code":"DUE","name":"Jatuh tempo"},
    {"code":"OVERDUE","name":"Terlambat"},
    {"code":"COMPLETED","name":"Selesai"},
    {"code":"CANCELLED","name":"Dibatalkan"}
  ],
  "alertTypes": [{"code":"MONITORING_OVERDUE","name":"Pemantauan terlambat"}],
  "alertStatuses": [
    {"code":"OPEN","name":"Terbuka"},
    {"code":"ACKNOWLEDGED","name":"Diakui"},
    {"code":"RESOLVED","name":"Terselesaikan"},
    {"code":"DISMISSED","name":"Dikesampingkan"}
  ],
  "alertSeverities": [
    {"code":"INFO","name":"Informasi"},
    {"code":"WARNING","name":"Peringatan"},
    {"code":"HIGH","name":"Tinggi"},
    {"code":"CRITICAL","name":"Kritis"}
  ],
  "alertTargetTypes": [
    {"code":"TREATMENT","name":"Pengobatan"},
    {"code":"TPT","name":"TPT"}
  ],
  "notificationStatuses": [
    {"code":"PENDING","name":"Menunggu"},
    {"code":"SENT","name":"Dikirim"},
    {"code":"DELIVERED","name":"Terkirim"},
    {"code":"READ","name":"Dibaca"},
    {"code":"FAILED","name":"Gagal"},
    {"code":"CANCELLED","name":"Dibatalkan"}
  ],
  "notificationChannels": [{"code":"IN_APP","name":"Dalam aplikasi"}]
}
```

## Workflow and privacy boundary

TPT excludes BACTERIOLOGY_FOLLOW_UP and SAFETY_MONITORING. Only MONITORING_OVERDUE is an available alert type and only IN_APP is an implemented notification channel. Severity/status vocabulary describes existing states; it does not alter generation rules. Current overdue events still generate MONITORING_OVERDUE / WARNING alerts with IN_APP delivery.

The endpoint returns no schedule, frequency, due-date defaults, clinical guidance, eligibility, lab orders, regimen/outcome changes, recipients, identifiers, rules metadata or alert details JSON. Every monitoring event/date remains explicitly entered under the current MANUAL_V1 workflow. Read vocabulary alone never creates a plan/event/alert/notification or relaxes authorization, target scope, validation, source authority or concurrency requirements.

No changes to MonitoringValidation, monitoring/query/alert/notification services, scheduler/sweep, fanout, patient/supporter safe endpoints, frontend or V1-V17. No V18 or SITB networking. The options intentionally remain a separate projection from the immutable validation logic; integration regressions exercise the current treatment/TPT allowlists to detect drift.

## Verification and handoff

See [checkpoint report](PHASE5A_5_REPORT.md) for the PostgreSQL/Spring test matrix and exact clean-build result. The supplied [architecture](architecture/TBCall_Backend_v1.5A.5_Frontend_F2E_Monitoring_Reference.md) is tracked unchanged.

This contract supplies the missing vocabulary for a separately authorized F2E staff frontend. Staff contextual monitoring/events, alerts and TB Officer IN_APP notifications require that next UI specification/approval. Patient/supporter UI remains deferred to F3. No frontend implementation or live SITB calls are included here.
