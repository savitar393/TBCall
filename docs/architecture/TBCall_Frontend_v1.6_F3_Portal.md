# TBCall Frontend v1.6 — F3 Patient & Treatment-Supporter Portal

Approved backend base: `f1023b4c459983c8f1edbd01bcc6fca55b1138ef`

Frontend-only F3. Use only existing safe self/supporter APIs plus `GET /api/v1/me/portal-reference-data`. Do not change backend, V1–V17, staff workflows, or SITB integration.

## Scope

PATIENT: self profile/current summaries, safe treatment, dose history/report, follow-ups, safe TPT, monitoring, alerts with personal acknowledgement receipt, and IN_APP notifications.

TREATMENT_SUPPORTER: linked-case list from `/me.supporterCaseIds`; per-case safe treatment, dose history/report, monitoring, alerts with personal acknowledgement receipt; shared IN_APP notifications.

Deferred: patient clinical editing, supporter TPT/contact/investigation, lab portal UI, F4 admin/integration UI, SITB networking.

## Existing backend APIs

Portal references: `GET /api/v1/me/portal-reference-data`.

Patient: `GET /me/patient`, `GET /me/treatment`, `GET|POST /me/treatment/dose-events`, `GET /me/follow-ups`, `GET /me/tpt`, `GET /me/monitoring`, `GET /me/alerts`, `POST /me/alerts/{id}/acknowledge`.

Supporter: case IDs from `/me`; `GET /me/supporting-cases/{caseId}/treatment`; `GET|POST /me/supporting-cases/{caseId}/dose-events`; `GET /me/supporting-cases/{caseId}/monitoring`; `GET /me/supporting-cases/{caseId}/alerts`; `POST /me/supporting-cases/{caseId}/alerts/{id}/acknowledge`.

Notifications: `GET /me/notifications`, `GET /me/notifications/{id}`, `POST /me/notifications/{id}/read`.

Never use staff `/patients/*`, `/cases/*`, staff `/treatments/{id}`, `/alerts*`, `/monitoring-plans/*`, or staff TPT/contact/referral/lab APIs for portal rendering.

## Routes

- `/portal`
- `/portal/treatment`
- `/portal/tpt`
- `/portal/monitoring`
- `/portal/alerts`
- `/portal/notifications`
- `/supporting-cases`
- `/supporting-cases/[caseId]`

## Role/permission gates

Never infer permission from role.

PATIENT routes require role `PATIENT`; sections/actions additionally require their existing permission: PATIENT_READ, TREATMENT_READ, ADHERENCE_READ, ADHERENCE_RECORD, FOLLOW_UP_READ, TPT_READ, MONITORING_READ, ALERT_READ, ALERT_ACKNOWLEDGE, NOTIFICATION_READ_SELF.

Supporter routes require role `TREATMENT_SUPPORTER`. Per-case sections require TREATMENT_READ, ADHERENCE_READ/RECORD, MONITORING_READ, ALERT_READ/ACKNOWLEDGE. Before any supporter resource call, caseId must be present in current `/me.supporterCaseIds`; backend remains final authority.

F3 `/portal/notifications` requires PATIENT or TREATMENT_SUPPORTER plus NOTIFICATION_READ_SELF. TB_OFFICER-only accounts continue to use staff `/notifications`.

## Navigation

PATIENT: Portal Saya, Pengobatan Saya, TPT Saya, Pemantauan Saya, Peringatan Saya, Notifikasi Saya — each independently permission-gated.

TREATMENT_SUPPORTER: Pendampingan and Notifikasi Saya.

Mixed-role users may see both staff and portal navigation if independently authorized. Do not put patient names in global nav/title/chrome. Hide the staff facility box when there are no active facilities.

## Feature architecture

Create `frontend/features/portal/` with `api.ts`, `schemas.ts`, `types.ts`, `permissions.ts`, `queries.ts`, `references.ts`, `use-command.ts`, `boundary.tsx`, plus patient/supporter/notifications subfolders.

All protected query keys begin `['portal', userId, ...]`; all queryFns consume TanStack AbortSignal. Commands snapshot current `/me`, abort on unmount/account/role/link/case-context change, and suppress late old-context success/error/invalidation/navigation. No portal persistence.

Use strict Zod schemas for PortalReferenceData, SelfPatient, PatientTreatment, SupporterTreatment, SafeDose/page, SafeFollowUp, SafeTpt, SafeEvent/page, SafeAlert/page, NotificationDetail/page. Reject extra fields with INVALID_RESPONSE.

## Portal references

Use all server labels. PATIENT dose form uses `patientDoseStatuses`; supporter uses `supporterDoseStatuses`. Patient must never see TAKEN_OBSERVED or DISPENSED_HOME; supporter must never see DISPENSED_HOME. Use live administration modes. Use treatment/TPT-specific monitoring-event labels. Only IN_APP is displayed.

## Patient portal

`/portal`: PATIENT role. If `/me.patientLink` is null, do not call `/me/patient`; show a neutral unlinked-account message. If linked and PATIENT_READ, show safe self profile/current registration/case summaries only. Independent cards link to treatment/TPT/monitoring/alerts/notifications.

`/portal/treatment`: PATIENT + TREATMENT_READ + patientLink. GET `/me/treatment`. 404 is an empty state, not forbidden. Display safe status/regimen/dates/drugs/outcome/adverse events only as returned. Never infer treatment success, regimen advice, prognosis, or adherence.

If ADHERENCE_READ, show paginated safe dose evidence. If ADHERENCE_RECORD and treatment status ACTIVE, allow explicit dose report with scheduledDate, status, optional administrationMode, optional notes. No default status, no automatic today's-dose selection, no expected-dose generation, no missed-dose inference. Client date bounds are UX-only; backend final. No ETag on dose create. Preserve draft on failure; no replay.

If FOLLOW_UP_READ, show `/me/follow-ups` read-only.

`/portal/tpt`: PATIENT + TPT_READ + patientLink. GET `/me/tpt`. 404 is empty. ACTIVE_TPT_AMBIGUOUS is safe conflict guidance; never choose client-side. Read-only safe fields; no eligibility/regimen recommendation.

`/portal/monitoring`: PATIENT + MONITORING_READ + patientLink. Read-only SafeEvent page; no plan IDs/notes/rulesVersion; no inference from overdue status; explicit refresh only.

`/portal/alerts`: PATIENT + ALERT_READ + patientLink. Display SafeAlert. `acknowledged` is the user's personal receipt, NOT staff alert workflow state. If ALERT_ACKNOWLEDGE and false, action label is `Tandai sudah diketahui`; POST receipt without ETag. Do not claim OPEN->ACKNOWLEDGED transition.

## Supporter portal

`/supporting-cases`: source case IDs only from current `/me.supporterCaseIds`. Empty list is a normal state. Never enumerate arbitrary case IDs or call staff case APIs. With TREATMENT_READ, safe treatment may enrich each case card; treatment 404 must not remove the linked case.

`/supporting-cases/[caseId]`: local-deny without resource calls when caseId is not currently linked. Sections are independently permission-gated.

Treatment: safe SupporterTreatment only. Patient displayName may appear only inside authorized case content, not URL/title/global shell.

If adherenceSummary is returned, label it `Jumlah laporan bukti dosis` and state it is not an adherence score or clinical assessment.

Dose history/report mirrors patient flow, but status options come from `supporterDoseStatuses`; TAKEN_OBSERVED is allowed. No clinical inference.

Monitoring is read-only SafeEvent. Alerts use SafeAlert and personal acknowledgement receipt semantics only.

## Notifications

`/portal/notifications`: PATIENT or TREATMENT_SUPPORTER + NOTIFICATION_READ_SELF. Display safe list only. For SENT/DELIVERED: GET detail, recheck actor/channel/status, use actual response ETag, POST `/read`. Never synthesize ETag from list version. No action for READ/PENDING/FAILED/CANCELLED. No staff alert-detail link. No polling/websocket/background refresh.

## Expected empty/error states

Expected 404 states: no patient treatment, no patient TPT, no supporter treatment for a linked case. Render neutral empty states, not `/forbidden`.

403 = access denied; 401 = session handling. Known 409 ambiguity/state conflicts use safe local text. Never render raw backend problem prose.

## Privacy

No clinical data in localStorage, sessionStorage, IndexedDB, service worker cache, console logs, document metadata, or URL query/history state. Pagination stays component memory-only. Patient routes contain no patient UUID. Supporter routes may contain only linked case UUID.

## UX language

Dose guidance: `Catatan ini merekam laporan dosis. TBCall tidak menghitung skor kepatuhan atau menentukan keberhasilan pengobatan dari catatan ini.`

Monitoring guidance: `Jadwal ini ditampilkan sesuai catatan petugas. Status jadwal tidak dengan sendirinya menunjukkan kondisi klinis.`

Supporter evidence summary: `Jumlah laporan bukti dosis, bukan skor kepatuhan.`

Use text as well as color for status/severity. Accessible labels, live feedback, mobile cards.

## Tests

Cover role+independent permission gates, patientLink null request suppression, supporterCaseIds local allowlist, staff-only artificial grants denied, mixed-role navigation, strict safe schemas, actor-specific dose options, no default/inference, 404 empty states, patient/supporter dose payloads/no ETag/no replay, read-only follow-up/TPT/monitoring, personal alert acknowledgement semantics, actual notification detail ETag, no list-version ETag synthesis, old-account command/query races, same-account role/link/case-link changes, and no storage/log/history/metadata leakage.

## Gates

From `frontend/`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Backend source/tests/migrations must remain unchanged.

## Documentation

Add `docs/FRONTEND_F3_PORTAL.md`, `docs/FRONTEND_F3_REPORT.md`, `docs/architecture/TBCall_Frontend_v1.6_F3_Portal.md`; update frontend/root README.

Do not begin F4.
