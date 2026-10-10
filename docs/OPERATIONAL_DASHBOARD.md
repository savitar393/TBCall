# Operational TB dashboard

Staff navigation → **Pemantauan operasional** (`/dashboard`). The existing account overview, monitoring plans, alerts, and workflow screens remain separate.

`GET /api/v1/operational-dashboard` is read-only. It returns one repeatable-read database snapshot with `asOf` and `upcomingUntil = asOf + 7 days`. Each queue has ten rows and an independent zero-based page: `upcomingPage`, `overduePage`, `labPage`. Unknown filters and negative/overflowing pages are rejected. Ordering is scheduled/request time followed by UUID.

| Section | Exact selection | Required permissions and scope |
| --- | --- | --- |
| Case counts | `tb_cases.status = ACTIVE` or `COMPLETED`; counts episodes, not patients. Other statuses, including `REFERRED`, are excluded. | `CASE_READ`; assigned active current case facility |
| Upcoming follow-ups | `SCHEDULED`, no completion time, treatment `ACTIVE`; `asOf <= scheduled_at <= upcomingUntil` | `TREATMENT_READ` + `FOLLOW_UP_READ`; both treatment and current case facilities assigned and active |
| Overdue follow-ups | Same unfinished/active treatment selection; `scheduled_at < asOf` | Same follow-up scope |
| Pending laboratory | Requests `REQUESTED`, `SENT`, `RECEIVED`, or `PARTIAL`; either registration-owned or case-owned | `LAB_REQUEST_READ`; existing requesting-facility officer scope, plus existing testing-facility scope for officers also holding `LAB_STAFF` |

Entry requires `TB_OFFICER`, an active facility assignment, and at least one eligible section. Each denied section returns `PERMISSION_DENIED` with null data: no counts or record identities. Laboratory result permission is unnecessary because results are not returned. Follow-up facility is the recorded nullable location, not a grant of write access. Referral history does not broaden current case/treatment scope; laboratory reads retain their existing independent request scope.

Rows contain only the patient name and identifiers/times/statuses/facilities needed to open existing treatment or laboratory details. No identity number, address, clinical notes, results, risk score, adherence calculation, or outcome inference is returned. Detail screens retain their own permissions and lifecycle rules. The patient-worklist shortcut additionally requires `PATIENT_READ`; that worklist also contains open registrations and referred cases, so its population differs from the ACTIVE case count.

Displayed timestamps use the device timezone. “Overdue” is a schedule comparison, not an automatic `MISSED` transition. Counts update on a fresh read; no scheduler or clinical writes were added. Restricted sections are distinct from authorized empty results. Failed refreshes conceal cached protected rows.
