# F2C staff treatment workflow

Approved backend base: `6afcfe697ceebfe2ebfd2edbd6030815e005a2bd`. See the [approved architecture](architecture/TBCall_Frontend_v1.3_F2C_Treatment.md) and [verification report](FRONTEND_F2C_REPORT.md).

## Routes and access

- `/cases/[caseId]/treatments`: contextual episode list and explicit start form.
- `/treatments/[treatmentId]`: detail, metadata, dose evidence, follow-up, adverse events and final outcome.
- F2A case detail exposes `Pengobatan` with TB_OFFICER + TREATMENT_READ. There is no global treatment queue.

Both routes use SessionBoundary and require explicit TB_OFFICER plus TREATMENT_READ. Independent write/read checks use TREATMENT_WRITE, ADHERENCE_READ/ADHERENCE_RECORD, FOLLOW_UP_READ/FOLLOW_UP_WRITE, ADVERSE_EVENT_READ/ADVERSE_EVENT_WRITE and OUTCOME_READ/OUTCOME_WRITE. LAB_REQUEST_READ gates neutral follow-up laboratory links. CASE_READ gates case context and links; detail fetches case status only for ACTIVE treatments with outcome read/write permissions, so historical reads need no extra case request; if unavailable, case-dependent start/outcome actions cannot be offered. Backend authorization remains authoritative.

## References, start and snapshots

Strict Zod records mirror existing Java treatment DTOs and validate every response before use. `/treatment-reference-data` supplies live regimen, drug and outcome catalogs and workflow labels. Null/unknown categories and unapproved extra fields are rejected; PREVENTIVE rows have no valid category in this contract. Reference cache is memory-only with a five-minute stale time.

Start requires an ACTIVE case and no visible PLANNED/ACTIVE/PAUSED episode. Regimens are filtered by the actual case category; missing catalogs show an unavailable state. The user explicitly chooses 1–20 drug lines. Selecting a regimen supplies no drug, dose, phase, frequency or duration. Structural rules mirror backend limits, decimal precision, duplicate trimmed tuples and date ordering. Case-sensitive phase text is preserved. Backend owns clinical validation and concurrency.

The detail displays historical drug-name snapshots from the treatment response, rather than replacing them with current catalog names. It requests no additional patient identity record. Clinical text remains within the staff view and wraps on narrow screens.

## Preconditions and editing

Actual treatment GET ETag is used for metadata PATCH, follow-up scheduling and final outcome. Missing ETags disable those saves; the client never synthesizes a parent ETag. Metadata PATCH includes only dirty permitted fields; null clears an optional field. Regimen/start/status/drugs and owner IDs are never sent in that PATCH.

`treatmentChildEtagFromVersion` is limited to published child versions for follow-up completion and adverse-event update. It is not used by F2A or for parent writes. Scheduling advances the treatment version: successful commands await authoritative detail refetch before closing the editor or enabling another command. The follow-up response ETag is not substituted for a treatment ETag.

## Dose, follow-up and adverse workflows

- Dose evidence: paginated page 0 / size 20, each evidence record stays separate, including contradictory same-day records. Summary counts are report counts, not clinical scores. Recording requires ADHERENCE_RECORD and ACTIVE treatment, live staff status/mode options, and an explicit date within treatment start/today. No ETag. Duplicate actor/day conflicts refetch evidence and require manual review without overwrite or replay.
- Follow-up scheduling: ACTIVE treatment, free-text type, explicit local schedule time, optional facility from `/me.activeFacilities` only, and notes. Blank facility delegates the default to the backend. Completion requires SCHEDULED, ACTIVE treatment, write/read permissions and the assigned facility in current active assignments. The user supplies completion time, optional positive weight, symptoms/adherence text and notes; no interpretation is performed.
- Adverse creation: ACTIVE treatment, free-text event fields and explicit serious boolean (false initially), no ETag. Existing events may be edited after closure. Updates use the child's version and dirty fields; eventType/parent/reportedAt are immutable. Unchanged timestamps retain the original precision and offset exactly, even when the local control cannot represent them. No causality or treatment change is inferred.

## Final outcome

The form requires OUTCOME_READ and OUTCOME_WRITE, ACTIVE treatment and case, and no existing outcome. It uses live outcome codes, an explicit date and notes, and confirmation: `Pencatatan hasil akhir akan menutup episode pengobatan dan kasus ini.` No evidence, lab, duration, adverse event or regimen determines an outcome automatically. Success refetches treatment/context and invalidates case detail and episode lists. A second outcome action is not offered.

## Session, conflict, time and privacy

All treatment query keys start `["treatment", userId, ...]`, including case context. Every query consumes AbortSignal. Mounted actor boundaries reset editors when identity/permissions/assignments change. Commands snapshot the full actor, abort on unmount and check current identity before errors, invalidation, success feedback or navigation. Aborting a browser request does not assert the server rolled back a command already received.

No generic mutation cache, browser persistence, payload logging, clinical URL/query/history state, dynamic clinical document metadata or patient data in global chrome. Only case/treatment UUID route identifiers are used. Safe Indonesian feedback never renders arbitrary backend problem prose.

Conflicts preserve dirty values, refetch relevant authoritative state, and require explicit review before another submission. No command retries automatically. SOURCE_AUTHORITY_CONFLICT locks the relevant save for the mounted editor while navigation and reads remain available.

Dates use YYYY-MM-DD. Timestamp controls identify the browser timezone and do not claim it is the facility timezone. The treatment-local serializer validates calendar values and rejects nonexistent/repeated DST local times. Explicit input is serialized to an ISO instant; unchanged adverse timestamps are omitted/preserved exactly.

## Verification and deferred scope

Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` from `frontend/`. No `.tools/` helper is required by compilation. Java/backend tests, V1–V17 and dependency lockfile are unchanged.

F2D referral/contact/TPT, F2E monitoring/alerts/notifications, F3 patient/supporter portal and F4 administration/integration boundary remain deferred. No SITB networking or clinical recommendations are implemented. Live-backend smoke testing requires separately provisioned accounts; no credentials or auth bypass are created by F2C.
