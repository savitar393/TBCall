# TBCall Frontend v1.5 — F2E Staff Monitoring, Alerts and Notifications

Approved backend base: `24a922a067191f0788de444a054b2334355aac5e`

Status: approved final staff-facing monitoring slice.

F2E implements contextual TB Officer monitoring plans/events, staff alerts and TB Officer in-app notifications using the existing Phase 4C backend. It does not create guideline-derived schedules, infer clinical actions, implement patient/supporter views, add external notification channels, or change backend behavior.

## 1. Scope

Deliver:

```text
Treatment/TPT detail
       ↓
Contextual monitoring
  plan history/create
       ↓
 plan detail/manage
       ↓
 manual events

Staff workload
  Alerts queue → alert detail → acknowledge/resolve

Current staff user
  Notifications → mark SENT/DELIVERED notification READ
```

Deferred:
- patient self monitoring/alerts/notifications
- supporter monitoring/alerts/notifications
- administration/integration UI
- SITB networking

## 2. Existing backend contracts

Use only current APIs.

### References
- GET `/api/v1/monitoring-reference-data`

### Monitoring plans
- POST `/api/v1/treatments/{id}/monitoring-plans`
- POST `/api/v1/preventive-treatments/{id}/monitoring-plans`
- GET `/api/v1/treatments/{id}/monitoring-plans`
- GET `/api/v1/preventive-treatments/{id}/monitoring-plans`
- GET `/api/v1/monitoring-plans/{id}`
- PATCH `/api/v1/monitoring-plans/{id}`
- POST `/api/v1/monitoring-plans/{id}/cancel`

### Monitoring events
- GET `/api/v1/monitoring-plans/{id}/events`
- POST `/api/v1/monitoring-plans/{id}/events`
- GET `/api/v1/monitoring-events/{id}`
- PATCH `/api/v1/monitoring-events/{id}`
- POST `/api/v1/monitoring-events/{id}/complete`
- POST `/api/v1/monitoring-events/{id}/cancel`

### Alerts
- GET `/api/v1/alerts`
- GET `/api/v1/alerts/{id}`
- POST `/api/v1/alerts/{id}/acknowledge`
- POST `/api/v1/alerts/{id}/resolve`

### Notifications
- GET `/api/v1/me/notifications`
- GET `/api/v1/me/notifications/{id}`
- POST `/api/v1/me/notifications/{id}/read`

### Target context already available
- GET `/api/v1/treatments/{treatmentId}`
- GET `/api/v1/preventive-treatments/{tptId}`

Do not modify backend source, backend tests, V1–V17 or workflow semantics.

## 3. Routes

Add:

Contextual monitoring:
- `/treatments/[treatmentId]/monitoring`
- `/preventive-treatments/[tptId]/monitoring`
- `/monitoring-plans/[planId]`

Staff alerts:
- `/alerts`
- `/alerts/[alertId]`

Staff notifications:
- `/notifications`

Do not create a fake global monitoring-plan queue because no such backend contract exists.

UUID path identifiers are allowed. Do not place patient names, notes, monitoring messages or other clinical text in URL query/history.

## 4. Actor and permission model

### Monitoring

Contextual monitoring routes require:
- TB_OFFICER
- MONITORING_READ

Because F2E is entered contextually from the existing staff target screens, also require the corresponding target read permission for target-context rendering:
- treatment target -> TREATMENT_READ
- TPT target -> TPT_READ

This is a frontend navigation/context requirement, not an inference that MONITORING_READ implies those permissions.

Actions:
- create/patch/cancel plan -> MONITORING_MANAGE
- add/reschedule/complete/cancel event -> MONITORING_MANAGE

### Alerts

Queue/detail:
- TB_OFFICER + ALERT_READ

Actions:
- acknowledge -> ALERT_ACKNOWLEDGE
- resolve -> ALERT_RESOLVE

A write permission does not imply ALERT_READ. F2E only exposes actions on alerts the user can independently read.

### Notifications

F2E staff notification route:
- TB_OFFICER + NOTIFICATION_READ_SELF

The backend notification detail/read contract itself intentionally has no TB_OFFICER restriction so F3 can reuse it later. F2E must not broaden itself into PATIENT/TREATMENT_SUPPORTER UI.

Never infer a permission from role.

Backend remains authoritative for facility scope, state, source authority and concurrency.

## 5. Navigation and contextual links

Global navigation:

`Peringatan`
- TB_OFFICER + ALERT_READ
- `/alerts`

`Notifikasi`
- TB_OFFICER + NOTIFICATION_READ_SELF
- `/notifications`

Do not add a global `Pemantauan` link.

Add contextual `Pemantauan` links to:
- F2C treatment detail when TB_OFFICER + TREATMENT_READ + MONITORING_READ
- F2D TPT detail when TB_OFFICER + TPT_READ + MONITORING_READ

Do not show dead links.

## 6. Feature organization

Create:

```text
frontend/features/monitoring/
  api.ts
  schemas.ts
  types.ts
  permissions.ts
  queries.ts
  time.ts
  use-command.ts
  references.ts
  monitoring/
  alerts/
  notifications/
```

Reuse:
- native `apiRequest`
- SessionProvider
- TanStack Query
- React Hook Form + Zod
- shadcn primitives
- safe ApiProblem feedback
- established F2B/F2C datetime-local serializer
- existing source-authority/stale-conflict UX patterns

Do not create a generic CRUD framework.

## 7. Strict runtime schemas

Create strict Zod schemas for:
- monitoring reference data
- PlanDetail
- EventDetail
- plan/event pages
- AlertDetail
- alert page
- NotificationDetail
- notification page
- treatment/TPT target context reused from their existing feature schemas

No `any`.

Malformed responses use safe INVALID_RESPONSE handling.

## 8. Query/session isolation

Every protected F2E query key starts with:

```text
["monitoring", userId, ...]
```

Examples:
- references
- target plan history
- plan detail/events
- event detail
- alerts filters/page
- alert detail
- notifications page
- notification detail

Every queryFn consumes TanStack AbortSignal.

Commands must snapshot current `/me`, abort on unmount/context change and suppress late prior-account:
- success
- error
- invalidation
- navigation

Add permanent regressions for:
- late old-account monitoring GET
- late old-account alert command
- late old-account notification-read command

No F2E clinical state persistence.

## 9. Monitoring references

Consume `/monitoring-reference-data`.

Memory cache only; reasonable staleTime such as five minutes.

Use server labels for:
- treatmentEventTypes
- tptEventTypes
- planStatuses
- eventStatuses
- alertTypes
- alertStatuses
- alertSeverities
- alertTargetTypes
- notificationStatuses
- notificationChannels

Do not hard-code mutable/display label maps when the endpoint supplies them.

Structural status comparisons in code are permitted.

Never expose unsupported external notification channels.

## 10. Contextual target monitoring page

Routes:
- `/treatments/[id]/monitoring`
- `/preventive-treatments/[id]/monitoring`

Fetch:
- target detail through its existing F2C/F2D query
- monitoring-plan history
- monitoring references

Display:
- target type
- target status
- start date
- planned end date
- plan history newest first
- plan status
- plan date range
- rulesVersion as neutral technical metadata (`MANUAL_V1`), not clinical guidance
- event counts
- link to plan detail

Do not display target patient identity beyond the safe context already used by the target feature.

### Create-plan availability

Show create action only when:
- MONITORING_MANAGE
- target status ACTIVE
- returned history has no ACTIVE plan

Backend remains final uniqueness/state authority.

If target is not active or an active plan already exists, explain that a new active plan cannot currently be created.

## 11. Create monitoring plan

Create form fields:

Plan:
- startDate required
- endDate optional
- notes optional

Initial manual events: 1..100:
- eventType
- scheduledAt
- dueAt optional

Use target-specific live event types:
- treatment -> treatmentEventTypes
- TPT -> tptEventTypes

Do not display bacteriology/safety options for TPT.

Do not auto-generate:
- event types
- dates
- due dates
- frequency
- intervals
- schedule templates

Show explicit guidance:

`TBCall tidak membuat jadwal pemantauan otomatis. Tambahkan setiap kegiatan dan waktunya berdasarkan rencana yang telah ditetapkan petugas.`

No clinical recommendation is implied.

Client structural validation:
- 1..100 events
- dueAt >= scheduledAt when dueAt exists
- endDate >= startDate
- startDate not before target start date when target context is available
- endDate not after target plannedEndDate when target planned end exists

Do not attempt to duplicate backend timezone-calendar boundary logic beyond these safe obvious checks; backend remains final authority.

No ETag for plan creation.

On success:
- navigate to `/monitoring-plans/{id}`
- invalidate target history
- no automatic inferred event additions

## 12. Monitoring plan detail

Route `/monitoring-plans/[planId]`.

Require TB_OFFICER + MONITORING_READ.

Fetch:
- plan detail + actual response ETag
- plan events page
- references

Display:
- target type/id
- plan status
- date range
- rules version
- notes
- event counts
- events ordered by backend schedule

Target link may be shown only when corresponding target read permission exists.

### Edit plan

Show only with MONITORING_MANAGE and plan status ACTIVE.

PATCH dirty fields only:
- endDate
- notes

Use actual plan-detail GET ETag.

Explicit null clears optional values.

Do not send:
- startDate
- status
- rulesVersion
- target fields
- eventCounts

On success refetch plan/history/events as appropriate.

### Cancel plan

Show only with MONITORING_MANAGE and ACTIVE.

Use actual plan-detail GET ETag.

Require explicit confirmation:

`Membatalkan rencana akan membatalkan kegiatan pemantauan yang masih terbuka dan menyelesaikan peringatan terkait.`

Do not claim closed/completed events are deleted.

After success refetch plan/events/alerts/history.

## 13. Add monitoring event

Available with MONITORING_MANAGE while plan ACTIVE.

Fields:
- eventType from target-specific live list
- scheduledAt required
- dueAt optional

No automatic event type/date suggestion.

Use actual current plan-detail GET ETag.

Important: add-event advances the plan version.

After success:
- immediately refetch plan detail
- discard previous plan ETag
- refetch events
- invalidate alert list because creating an already-overdue event may produce the existing automatic overdue alert

Do not locally create an alert.

## 14. Monitoring event detail/actions

Plan page may open an event action panel/dialog, but before any versioned event action always fetch:

`GET /monitoring-events/{eventId}`

and retain its actual response ETag.

Never synthesize event ETag from list `version`.

### Reschedule

Show with MONITORING_MANAGE only when event status:
- SCHEDULED
- DUE

PATCH dirty fields:
- scheduledAt
- dueAt

`dueAt: null` explicitly clears due date.

Do not send eventType.

Validate dueAt >= scheduledAt.

After success refetch event, plan events, plan counts and alert queue.

### Complete

Show with MONITORING_MANAGE for open event statuses:
- SCHEDULED
- DUE
- OVERDUE

Input:
- completedAt optional

Blank means backend server-now; make that explicit in UI.

If supplied:
- completedAt >= scheduledAt
- completedAt <= current browser time as a UX check
- backend remains final clock authority

Use actual event-detail ETag.

Completion may resolve the related overdue alert; refetch alerts.

### Cancel event

Show with MONITORING_MANAGE for:
- SCHEDULED
- DUE
- OVERDUE

Use actual event-detail ETag.

Require explicit confirmation.

Cancellation may resolve an alert; refetch alerts.

COMPLETED/CANCELLED events have no mutation actions.

## 15. Date/time handling

Monitoring event timestamps are OffsetDateTime.

Reuse one tested datetime-local serializer:
- interpret in browser local timezone
- produce valid ISO offset/instant
- show browser timezone near editable controls
- reject nonexistent/ambiguous DST local times
- never claim browser timezone is facility timezone

For dirty-only event reschedule:
- preserve unchanged backend timestamp strings exactly
- only serialize fields actually edited

LocalDate plan fields use `YYYY-MM-DD`.

## 16. Staff alert queue

Route `/alerts`.

Require TB_OFFICER + ALERT_READ.

GET `/alerts`.

Filters:
- status
- targetType
- page
- size

Use live reference values.

Keep filters/page in memory, not URL query state.

Display:
- severity
- safe message
- alert type
- status
- target type
- event type
- triggeredAt
- dueAt
- acknowledged/resolved timestamps
- link to detail

Do not enrich with patient identity.

Do not treat severity as clinical triage beyond the backend label.

No color-only severity/state representation.

## 17. Alert detail and actions

Route `/alerts/[alertId]`.

Require ALERT_READ.

Fetch actual detail + response ETag.

Display existing safe `AlertDetail`. `message` is the backend fixed safe overdue message.

Optional target link:
- TREATMENT only if TREATMENT_READ
- TPT only if TPT_READ

Optional event context may be shown from AlertDetail fields; do not fetch event unless the user opens monitoring and has MONITORING_READ.

### Acknowledge

Show when:
- ALERT_ACKNOWLEDGE
- status OPEN

Use actual alert-detail ETag.

After success refetch alert + queue.

Before any subsequent versioned alert action, use the newly refetched detail/ETag.

### Resolve

Show when:
- ALERT_RESOLVE
- status OPEN or ACKNOWLEDGED

Use actual current alert-detail ETag.

Require explicit confirmation when resolving an OPEN alert without acknowledging first.

After success refetch alert + queue.

Do not expose a DISMISS action; no endpoint exists.

No automatic mutation replay.

## 18. Staff notifications

Route `/notifications`.

Require TB_OFFICER + NOTIFICATION_READ_SELF.

GET paginated `/me/notifications`.

Display:
- channel
- status
- alert type
- severity
- scheduledAt
- deliveredAt
- readAt

Only IN_APP is currently expected as an implemented channel.

Do not fetch notification payload, failure reason or clinical detail; backend does not expose them.

If `alertId` is present and user has ALERT_READ, offer link to `/alerts/{alertId}`.

### Mark read

Offer only for:
- SENT
- DELIVERED

Before action:
- fetch `GET /me/notifications/{id}`
- use its actual response ETag

Never synthesize ETag from list `version`.

POST `/read`.

After success:
- refetch/invalidate notification list/detail
- do not modify alert status

READ has no action.
PENDING/FAILED/CANCELLED have no mark-read action.

No polling/websocket/background notification mechanism in F2E. Provide an explicit refresh control instead.

## 19. Conflict/source-authority behavior

No mutation auto-retry.

On OPTIMISTIC_LOCK_CONFLICT / 428:
- preserve form draft
- refetch authoritative detail
- require explicit review/resubmission

On SOURCE_AUTHORITY_CONFLICT:
- show existing externally-controlled/read-only warning
- lock repeated monitoring save action for that mounted plan/event form
- reads remain available

On MONITORING_STATE_CONFLICT:
- show safe Indonesian state-change feedback
- refetch plan/event/alert/notification as relevant
- never render arbitrary backend detail prose

Alert/notification state conflicts similarly refetch without replay.

## 20. Privacy

No monitoring/alert/notification clinical data in:
- localStorage
- sessionStorage
- indexedDB
- console logs
- document metadata
- URL query/history filter state
- global chrome

Allowed route UUIDs:
- treatment/TPT target
- monitoring plan
- alert

Do not place:
- patient names
- plan notes
- alert messages
- event descriptions
- notification identifiers/status text beyond route IDs

into logs or URL query state.

No raw API response/problem logging.

## 21. Accessibility/responsive UX

Maintain F1–F2D standards.

Monitoring:
- event editors are semantic fieldsets
- event type and timestamps labeled
- plan cancellation consequence explicit

Alerts:
- severity/state always includes text/icon, never color alone
- filters keyboard accessible
- queue has mobile card fallback

Notifications:
- unread/read state includes textual label
- mark-read button has explicit accessible name

Use aria-live safe feedback and focus restoration after dialogs.

## 22. Tests

Continue Vitest + RTL + user-event.

At minimum:

Authorization/navigation:
- contextual monitoring links require TB_OFFICER + MONITORING_READ + corresponding target read
- monitoring manage actions independently gated
- alert nav requires TB_OFFICER + ALERT_READ
- ack/resolve independently gated
- notification nav requires TB_OFFICER + NOTIFICATION_READ_SELF
- wrong role with artificial permission does not enter staff UI

Session isolation:
- all F2E query keys include user ID
- every query consumes AbortSignal
- late old-user monitoring GET ignored
- late old-user alert command ignored
- late old-user notification read ignored
- no F2E persistence

References:
- strict ten-group schema
- treatment/TPT event lists use live values
- TPT excludes bacteriology/safety
- only IN_APP presented
- no schedule-generation logic

Plan creation:
- target ACTIVE + no ACTIVE plan UX gate
- correct target-specific event types
- 1..100 manual events
- no auto-generated events/dates
- structural date validation
- no ETag on create

Plan management:
- actual GET ETag for PATCH/cancel/add-event
- dirty-only patch
- add-event success refetches plan because version advances
- cancel confirmation
- no pause/resume/complete controls invented

Event actions:
- detail GET performed before mutation
- actual event GET ETag used
- list version never used as If-Match
- reschedule only SCHEDULED/DUE
- complete/cancel open statuses
- explicit dueAt null clear
- blank completion means server-now
- alert invalidation after relevant event actions
- DST/timestamp preservation

Alerts:
- memory-only filters
- safe projection only
- actual detail ETag for acknowledge/resolve
- acknowledge OPEN only
- resolve OPEN/ACKNOWLEDGED only
- no DISMISS control
- target links independently permission-gated
- no patient enrichment

Notifications:
- safe list projection
- no payload/failure reason
- actual notification detail GET before read
- list version never synthesized into ETag
- mark-read only SENT/DELIVERED
- read does not alter alert state
- no background polling

Conflicts/privacy:
- no mutation replay
- authority conflict locks relevant form
- stale drafts retained
- no raw backend prose
- no storage/log/history/metadata leakage

## 23. Build gates

From `frontend/`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Backend source/tests/migrations must remain unchanged.

A real-backend smoke test is strongly recommended with an already provisioned TB_OFFICER and representative monitoring/alert fixtures. Do not weaken authentication or invent production credentials.

## 24. Documentation

Add:
- `docs/FRONTEND_F2E_MONITORING.md`
- `docs/FRONTEND_F2E_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.5_F2E_Monitoring.md`

Update:
- `frontend/README.md`
- root README frontend section

## 25. Deferred

F3:
- PATIENT self monitoring/alerts/notifications
- TREATMENT_SUPPORTER monitoring/alerts/notifications
- patient/supporter treatment/adherence portal views

F4:
- administration
- integration-boundary read UI

Do not begin F3/F4 in F2E.
