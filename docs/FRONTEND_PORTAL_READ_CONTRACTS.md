# F3 portal reference read contract — backend v1.5A.6

Approved base: `653c48a5b005c6a84f211bc826b64c007b62c8b0`.

## Endpoint and authorization

`GET /api/v1/me/portal-reference-data`

Requires an authenticated, active account/session, role **PATIENT or TREATMENT_SUPPORTER**, and at least one actually-held permission from:

- TREATMENT_READ
- ADHERENCE_READ
- ADHERENCE_RECORD
- FOLLOW_UP_READ
- TPT_READ
- MONITORING_READ
- ALERT_READ
- ALERT_ACKNOWLEDGE
- NOTIFICATION_READ_SELF

No facility assignment, verified SELF patient link, active treatment or supporter-case linkage is required to read this global vocabulary. Existing session resolution supplies current roles and grants on each request; revocation takes effect on an existing session. Having both a portal role and another role still satisfies the approved OR role gate. A staff/admin role alone cannot bypass the role gate using artificial portal grants.

Anonymous, expired-session and suspended-account requests return 401. A wrong role, missing relevant grant or unrelated grant returns 403. Existing AUTHORIZATION_DENIED auditing is retained for the service's authorization denials. Successful reads create no audit or domain mutation.

There is no body, resource identifier, pagination, ETag or If-Match precondition for this vocabulary GET. POST/PATCH/DELETE on the new route are unsupported (405 for authenticated callers with valid CSRF). This endpoint does not replace authoritative resource reads or their existing command preconditions.

## Exact ordered response

All fourteen groups are always returned, regardless of which relevant permission authorized the read. Each option has exactly `code` and `name`; order and Indonesian labels below match the approved architecture. All values are **TBCall canonical UI/workflow vocabulary**, not official SITB physical database fields or API codes.

| Group | Ordered code — name options |
| --- | --- |
| treatmentStatuses | PLANNED — Direncanakan; ACTIVE — Aktif; PAUSED — Dijeda; TRANSFERRED — Dialihkan; COMPLETED — Selesai; STOPPED — Dihentikan; CANCELLED — Dibatalkan |
| tptStatuses | PLANNED — Direncanakan; ACTIVE — Aktif; COMPLETED — Selesai; STOPPED — Dihentikan; LOST_TO_FOLLOW_UP — Putus tindak lanjut; CANCELLED — Dibatalkan |
| patientDoseStatuses | TAKEN_SELF_REPORTED — Diminum berdasarkan laporan sendiri; MISSED — Tidak diminum; UNKNOWN — Tidak diketahui |
| supporterDoseStatuses | TAKEN_OBSERVED — Diminum terobservasi; TAKEN_SELF_REPORTED — Diminum berdasarkan laporan; MISSED — Tidak diminum; UNKNOWN — Tidak diketahui |
| administrationModes | DIRECTLY_OBSERVED — Diawasi langsung; SELF_ADMINISTERED — Diminum mandiri; OTHER — Lainnya |
| followUpStatuses | SCHEDULED — Terjadwal; COMPLETED — Selesai |
| treatmentMonitoringEventTypes | CLINICAL_REVIEW — Tinjauan klinis; WEIGHT_REVIEW — Tinjauan berat badan; ADHERENCE_REVIEW — Tinjauan kepatuhan; ADVERSE_EVENT_REVIEW — Tinjauan kejadian tidak diinginkan; BACTERIOLOGY_FOLLOW_UP — Tindak lanjut bakteriologis; SAFETY_MONITORING — Pemantauan keamanan; MEDICATION_PICKUP — Pengambilan obat |
| tptMonitoringEventTypes | CLINICAL_REVIEW — Tinjauan klinis; WEIGHT_REVIEW — Tinjauan berat badan; ADHERENCE_REVIEW — Tinjauan kepatuhan; ADVERSE_EVENT_REVIEW — Tinjauan kejadian tidak diinginkan; MEDICATION_PICKUP — Pengambilan obat |
| monitoringEventStatuses | SCHEDULED — Terjadwal; DUE — Jatuh tempo; OVERDUE — Terlambat; COMPLETED — Selesai; CANCELLED — Dibatalkan |
| alertTypes | MONITORING_OVERDUE — Pemantauan terlambat |
| alertStatuses | OPEN — Terbuka; ACKNOWLEDGED — Diakui; RESOLVED — Terselesaikan; DISMISSED — Dikesampingkan |
| alertSeverities | INFO — Informasi; WARNING — Peringatan; HIGH — Tinggi; CRITICAL — Kritis |
| notificationStatuses | PENDING — Menunggu; SENT — Dikirim; DELIVERED — Terkirim; READ — Dibaca; FAILED — Gagal; CANCELLED — Dibatalkan |
| notificationChannels | IN_APP — Dalam aplikasi |

For example, the patient dose group is:

```json
"patientDoseStatuses": [
  {"code": "TAKEN_SELF_REPORTED", "name": "Diminum berdasarkan laporan sendiri"},
  {"code": "MISSED", "name": "Tidak diminum"},
  {"code": "UNKNOWN", "name": "Tidak diketahui"}
]
```

## Safety and existing workflow boundary

The patient and supporter dose lists exactly match their existing AdherenceService write allowlists. patientDoseStatuses excludes TAKEN_OBSERVED and DISPENSED_HOME; supporterDoseStatuses excludes DISPENSED_HOME. Both roles receive every group; the frontend must select the matching actor's dose group, and existing write validation remains authoritative. TPT monitoring excludes BACTERIOLOGY_FOLLOW_UP and SAFETY_MONITORING. The only advertised notification channel is IN_APP.

The response contains no patient identity, case/treatment/TPT identifier, regimen/drug/outcome catalog, regimen composition or dose, adherence score, outcome inference, monitoring schedule/frequency/due date, alert-generation internal data, notification recipient or external channel.

Vocabulary availability is separate from resource and command authorization. A successful GET supplies no new grant and does not relax linkage, selected-treatment state, permission, scope, source-authority or If-Match checks. Existing self/supporter treatment and TPT projections, adherence validation, follow-ups, monitoring, alert acknowledgement receipts, and notification-read semantics remain unchanged. No scheduler, sweep, fanout or source-authority policy is modified.

## Verification and F3 handoff

PortalReferenceIntegrationTest exercises real PostgreSQL migrations and Spring session/MockMvc authorization, every relevant grant for both roles, role/grant revocation, exact option order/labels, existing dose-write acceptance/rejection, repeated-read database snapshots and denied writes. The [checkpoint report](PHASE5A_6_REPORT.md) records the exact clean-build result and protected-file checks.

The [approved architecture](architecture/TBCall_Backend_v1.5A.6_F3_Portal_Reference.md) defines this backend checkpoint. F3 requires separate approval and must use existing safe self/supporter resource APIs, the correct actor's dose choices, current permissions and authoritative detail ETags where existing writes require them. Reading vocabulary without a link or active episode does not make clinical resource data available. No additional backend contract or schema conflict was identified during this checkpoint. F3 UI and SITB networking are not implemented here.
