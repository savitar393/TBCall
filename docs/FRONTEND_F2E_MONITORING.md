# F2E staff monitoring, alerts and notifications

Frontend-only checkpoint against backend base `24a922a067191f0788de444a054b2334355aac5e`. The [approved architecture](architecture/TBCall_Frontend_v1.5_F2E_Monitoring.md) defines the scope. Java, backend tests, V1–V17, source-authority rules and monitoring scheduler/fanout remain unchanged.

## Routes and access

Every F2E route requires the explicit `TB_OFFICER` role as well as the permissions below. Permissions are read from `/me`; roles never imply grants. Backend authorization and facility scope remain authoritative.

| Route | Required permission |
|---|---|
| `/treatments/[treatmentId]/monitoring` | `MONITORING_READ` and `TREATMENT_READ` |
| `/preventive-treatments/[tptId]/monitoring` | `MONITORING_READ` and `TPT_READ` |
| `/monitoring-plans/[planId]` | `MONITORING_READ` |
| `/alerts`, `/alerts/[alertId]` | `ALERT_READ` |
| `/notifications` | `NOTIFICATION_READ_SELF` |

`Pemantauan` is contextual to treatment/TPT detail. There is no global monitoring-plan queue. Global `Peringatan` and `Notifikasi` navigation independently checks the corresponding read permission. Plan/event management additionally requires `MONITORING_MANAGE`; alert acknowledgement requires `ALERT_ACKNOWLEDGE`, and resolution requires `ALERT_RESOLVE`. Target links independently check treatment/TPT read permission.

## Manually entered plans and events

Target pages display target status/dates and paginated plan history. Creation requires an ACTIVE target, no ACTIVE plan in the returned history and `MONITORING_MANAGE`; backend uniqueness and current state are the final checks. The availability check reads the existing target-history pages so an ACTIVE plan outside the visible page still blocks creation. Incomplete/failed history cannot authorize creation. The person enters the start date, optional end date/notes and 1–100 events, each with an explicitly selected event type and entered scheduled time. Due time is optional. No dates, frequencies, schedules or clinical decisions are generated.

The form explains: “TBCall tidak membuat jadwal pemantauan otomatis. Tambahkan setiap kegiatan dan waktunya berdasarkan rencana yang telah ditetapkan petugas.”

Live `/monitoring-reference-data` labels and target-specific event lists supply choices. TPT never offers `BACTERIOLOGY_FOLLOW_UP` or `SAFETY_MONITORING`; `IN_APP` is the only implemented notification channel. `MANUAL_V1` identifies the existing manual rules version without implying clinical recommendations.

An ACTIVE plan can be edited using dirty `endDate`/`notes` fields, canceled with confirmation, or given another explicitly entered event. There are no pause/resume/complete-plan actions. Canceling a plan explicitly warns that open events will be canceled and related alerts resolved.

Events can be rescheduled only in SCHEDULED/DUE state. Complete/cancel actions are available only for SCHEDULED/DUE/OVERDUE events in an ACTIVE plan. Blank completion time delegates the timestamp to the backend. Terminal events have no write controls. Frontend date checks are structural; backend clock, calendar boundaries and workflow validation remain authoritative.

## ETags and conflicts

F2E retains actual response ETag headers as opaque values. It never synthesizes a precondition from a list or detail `version`.

| Command | ETag source |
|---|---|
| Create plan | No If-Match |
| Edit/cancel plan; add event | Latest reviewed plan-detail GET |
| Reschedule/complete/cancel event | Authoritative event-detail GET when opening its action panel |
| Acknowledge/resolve alert | Alert-detail GET |
| Mark notification read | Self-notification detail GET immediately before the command |

Adding an event advances the parent plan version; success must await plan refetch before another versioned plan command. Event writes refresh relevant event/plan/history/counts/alerts. Alert commands refresh detail and queue. Notification commands refresh the self list/detail and do not alter alert state.

Writes are never retried automatically. Stale/precondition failures retain the draft, refresh authoritative state and require manual review. A source-authority conflict locks the relevant mounted monitoring save action while reads remain available. Workflow conflicts use safe Indonesian feedback and refresh current state. Raw backend problem prose is never rendered. A missing ETag cannot fall back to a numeric version.

## Alerts and self notifications

Alert status/target/page filters remain in memory. Lists and details use the safe backend projection, without patient enrichment. OPEN alerts can be acknowledged; OPEN or ACKNOWLEDGED alerts can be resolved with the separate permission. Direct resolution of an OPEN alert requires confirmation. There is no dismiss action. Severity and state have text labels as well as visual styling.

The staff notification page displays the safe current-user projection. Only SENT/DELIVERED notifications expose mark-read; the authoritative detail is fetched and its status rechecked before POST `/read`. READ/PENDING/FAILED/CANCELLED notifications have no read command. Payload and failure reason are neither fetched nor exposed. Refresh is explicit: no polling, WebSocket or background notification mechanism is added.

## Session, privacy and time

Strict Zod schemas reject malformed responses with safe feedback. Every F2E query key starts with `monitoring` and includes the current user ID; every request consumes an AbortSignal. Commands bind to the full current `/me` context and mounted route, suppressing late previous-account results, errors, invalidations and navigation. Queries and drafts stay in memory and are cleared with the existing session lifecycle.

Clinical content is excluded from storage, logs, page query/history state, document metadata and global chrome. Route UUIDs identify only the approved resource paths. Browser-local datetime input uses the existing tested ISO serializer, with invalid/DST ambiguous or missing times rejected and browser timezone explained. Untouched backend timestamps retain their exact original offsets and fractional seconds in dirty-only rescheduling.

Labeled inputs, semantic event fieldsets, safe live feedback, confirmation focus restoration and mobile alert cards follow the existing frontend standards.

## Verification and later work

Run from `frontend/`: `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`. See the [checkpoint report](FRONTEND_F2E_REPORT.md) for actual results and the changed-file manifest. No `.tools/` helper is required to compile or run the application.

F3 patient/supporter portals and F4 administration/integration UI need separate approval. SITB networking remains unimplemented. A real-backend smoke test needs an already provisioned officer account and representative authorized fixtures; authentication must not be weakened for testing.
