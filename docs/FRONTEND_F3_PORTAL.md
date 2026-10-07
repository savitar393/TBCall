# F3 patient and treatment-supporter portal

Approved base: `f1023b4c459983c8f1edbd01bcc6fca55b1138ef`. This frontend-only checkpoint follows the [approved architecture](architecture/TBCall_Frontend_v1.6_F3_Portal.md). Backend source/tests, V1–V17, authentication and staff workflows are unchanged; no F4/SITB networking.

## Routes and independent access

| Route | Role/permission | Resource guard |
| --- | --- | --- |
| `/portal` | PATIENT; PATIENT_READ for profile | patientLink before self profile request |
| `/portal/treatment` | PATIENT + TREATMENT_READ | patientLink |
| `/portal/tpt` | PATIENT + TPT_READ | patientLink |
| `/portal/monitoring` | PATIENT + MONITORING_READ | patientLink |
| `/portal/alerts` | PATIENT + ALERT_READ | patientLink |
| `/portal/notifications` | PATIENT or TREATMENT_SUPPORTER + NOTIFICATION_READ_SELF | Backend current-user ownership; no facility/link prerequisite |
| `/supporting-cases` | TREATMENT_SUPPORTER | Only current `/me.supporterCaseIds` |
| `/supporting-cases/[caseId]` | TREATMENT_SUPPORTER | Current case-ID allowlist before resource queries |

Patient links: Portal Saya, Pengobatan Saya, TPT Saya, Pemantauan Saya, Peringatan Saya, Notifikasi Saya. Supporter links: Pendampingan, Notifikasi Saya. Actually-held permissions gate each section/action; roles imply no grant. Staff-only artificial grants cannot bypass portal roles. Mixed-role actors retain independently authorized staff and portal links. Empty facility boxes are hidden; patient names never label global navigation/chrome.

## Safe APIs

Paths are under `/api/v1`, using the unchanged same-origin `/api/tbcall/v1` browser proxy.

- GET `/me/portal-reference-data`.
- Patient GET `/me/patient`, `/me/treatment`, `/me/treatment/dose-events`, `/me/follow-ups`, `/me/tpt`, `/me/monitoring`, `/me/alerts`; POST `/me/treatment/dose-events`, `/me/alerts/{id}/acknowledge`.
- Supporter GET `/me/supporting-cases/{caseId}/treatment`, `/me/supporting-cases/{caseId}/dose-events`, `/me/supporting-cases/{caseId}/monitoring`, `/me/supporting-cases/{caseId}/alerts`; POST `/me/supporting-cases/{caseId}/dose-events`, `/me/supporting-cases/{caseId}/alerts/{id}/acknowledge`.
- Notifications GET `/me/notifications`, `/me/notifications/{id}`; POST `/me/notifications/{id}/read`.

No staff patient/case/treatment, alert detail, monitoring-plan, laboratory, referral, contact or TPT API renders portal content. Strict nested Zod schemas match safe DTOs and reject extra fields with INVALID_RESPONSE. Live labels are TBCall UI/workflow vocabulary, not official SITB physical-schema/API codes.

## Workflow behavior

Unlinked patients receive a neutral message without `/me/patient`. Profile shows safe demographics/current summaries only. Patient treatment/TPT 404s are normal empty states. ACTIVE_TPT_AMBIGUOUS gives safe staff-contact guidance without client episode selection. Linked supporter cards survive treatment 404.

Treatment displays returned regimen, dates/drug snapshots and supplied patient outcomes/adverse events without advice or clinical interpretation. Supporter patientDisplayName stays inside authorized case content. Raw counts are labeled **Jumlah laporan bukti dosis, bukan skor kepatuhan.**

Dose history requires ADHERENCE_READ; recording requires ADHERENCE_RECORD and displayed ACTIVE treatment. Supporter sections remain independently gated; without treatment read, the client never assumes an ACTIVE episode. Explicit scheduledDate/status are required; administrationMode/notes are optional. No default date/status, expected-dose generation, missed-dose inference, adherence/outcome score or automatic replay. Live patient choices exclude TAKEN_OBSERVED/DISPENSED_HOME; supporter choices allow TAKEN_OBSERVED and exclude DISPENSED_HOME. Live administration modes and selected choices are revalidated at submission. A removed choice requires reselection. Date minimum is UX-only; backend validation is final. Dose POST has no ETag. Success clears current drafts; failures preserve them.

Guidance: **Catatan ini merekam laporan dosis. TBCall tidak menghitung skor kepatuhan atau menentukan keberhasilan pengobatan dari catatan ini.**

Follow-ups/TPT/monitoring are read-only. Treatment/TPT-specific monitoring labels and recorded dates/statuses imply no schedule or clinical condition. Guidance: **Jadwal ini ditampilkan sesuai catatan petugas. Status jadwal tidak dengan sendirinya menunjukkan kondisi klinis.** Refresh/pagination are explicit, without polling/websocket/background refresh.

SafeAlert `acknowledged` is a personal receipt. ALERT_ACKNOWLEDGE permits **Tandai sudah diketahui** when false; POST has no ETag and makes no global staff-state claim. Already acknowledged receipts have no action.

Only IN_APP notifications display. SENT/DELIVERED actions obtain detail, recheck current actor/context and returned ID/channel/status, then pass the actual detail ETag to `/read`. Missing ETag or changed channel/status prevents POST; list versions never synthesize headers. READ/PENDING/FAILED/CANCELLED have no action. No staff alert-detail links.

## Context isolation and privacy

All protected keys begin `['portal', userId, ...]`; query functions consume AbortSignal. Existing `/me` refresh clears protected caches on context change. Boundaries remount by complete `/me` and route context, discarding old drafts. Commands check the live cached context before starting, subscribe to changes, abort on unmount/account/role/grant/patientLink/supporterCaseIds changes, and suppress late success/error/invalidation/navigation. This covers old handlers invoked before React observer rerender.

No clinical localStorage/sessionStorage/IndexedDB/service-worker cache, logs, URL query/history state or metadata. Pagination is component memory-only. Patient URLs contain no patient UUID; supporter URLs contain only linked case UUIDs. Existing no-store, CSRF, same-origin credentials and safe session error handling remain unchanged; raw problem prose never renders.

## Verification and handoff

The [report](FRONTEND_F3_REPORT.md) records manifest, exact gates and regression coverage. Source/tests compile without `.tools/` or local prompts/PDFs. No additional backend contract was required. F4 needs separate approval. A live smoke requires already authorized patient/supporter accounts and linked records; no credentials, provisioning or authentication bypass is introduced.
