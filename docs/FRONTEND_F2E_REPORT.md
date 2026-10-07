# Frontend F2E checkpoint report

Approved base: `24a922a067191f0788de444a054b2334355aac5e`.

Branch: `feat/frontend-f2e-monitoring`. Scope: frontend staff monitoring, alerts and current-user IN_APP notifications only. See the [approved architecture](architecture/TBCall_Frontend_v1.5_F2E_Monitoring.md) and [implementation guide](FRONTEND_F2E_MONITORING.md). The final commit SHA is returned with delivery; this report is part of that commit.

## Delivered routes and permissions

All six routes require the explicit TB_OFFICER role and the independent permissions below. No role implies a permission. The backend remains authoritative for resource/facility scope, state, source authority and concurrency.

| Route | Read permission |
|---|---|
| `/treatments/[treatmentId]/monitoring` | MONITORING_READ + TREATMENT_READ |
| `/preventive-treatments/[tptId]/monitoring` | MONITORING_READ + TPT_READ |
| `/monitoring-plans/[planId]` | MONITORING_READ |
| `/alerts` | ALERT_READ |
| `/alerts/[alertId]` | ALERT_READ |
| `/notifications` | NOTIFICATION_READ_SELF |

Global `Peringatan` and `Notifikasi` entries have independent read gates. Contextual `Pemantauan` links require officer + MONITORING_READ + the corresponding target read. There is no global monitoring-plan queue. MONITORING_MANAGE independently controls plan/event writes; ALERT_ACKNOWLEDGE and ALERT_RESOLVE independently control their alert actions. Optional target/related-alert links independently check their read grants. Artificial grants on PATIENT/TREATMENT_SUPPORTER do not admit staff UI; write grants do not admit read routes.

## Query and session isolation

Every F2E query factory begins with `["monitoring", userId, ...]`, including existing treatment/TPT context reads, history availability checks and notification detail. All consume AbortSignal. References have a five-minute memory cache. Focus/reconnect refetch is disabled for F2E reads; refresh follows explicit user input or a current actor's successful command. No polling, sockets or background notification mechanism was added.

Keyed boundaries use the full `/me` snapshot and route context. Commands snapshot that actor, abort on unmount/context change and suppress previous-account success, error, invalidation, cache writes and navigation. Protected state uses the existing session cancellation/removal lifecycle. Drafts, filters and query data stay in memory; there is no persisted clinical state or mutation-variable retention.

## Monitoring workflows and ETags

Contextual pages show target type/status/start/planned end and paginated history with live labels, dates, neutral MANUAL_V1 metadata, counts and plan links. History keeps backend ordering. Creation requires manage, ACTIVE target and no ACTIVE plan; an abortable scan of the existing history pages also checks plans outside the visible page. Failed/incomplete history keeps creation unavailable with safe retry feedback. This advisory check adds no backend contract or global queue; backend uniqueness remains final.

Create starts with blank dates/types and one blank event row. The person explicitly enters 1–100 events using target-specific live options, schedule and optional due time. No events, dates, frequencies, intervals, schedules or clinical decisions are inferred. TPT never offers BACTERIOLOGY_FOLLOW_UP or SAFETY_MONITORING. All ten reference groups use server code/name values; only IN_APP is presented as a supported channel.

ACTIVE/manage plan controls are dirty-only endDate/notes edit, manual event addition and confirmed cancellation. Explicit null clears optional fields. Cancellation shows the approved consequence for open events and related alerts. There are no pause/resume/complete-plan controls.

| Command | Actual ETag source |
|---|---|
| Create plan | No If-Match |
| PATCH/cancel plan; add event | Observed plan-detail GET response header |
| Reschedule/complete/cancel event | Authoritative event-detail GET response header |
| Acknowledge/resolve alert | Alert-detail GET response header |
| Read notification | Authoritative self-notification detail GET response header |

No F2E ETag is synthesized from list or body versions. A missing header disables/rejects a command safely. A draft retains its observed tag through ordinary refresh; after a conflict, explicit review rebinds it to the refreshed header while retaining dirty fields and refreshing pristine fields. No mutation is automatically replayed.

Add-event advances the parent version; its command awaits authoritative plan refetch before another parent command can proceed. Relevant event/plan commands refresh detail/events/history/counts/alerts. Failed authoritative refresh keeps dependent commands unavailable.

Event reschedule is limited to SCHEDULED/DUE; complete/cancel is limited to SCHEDULED/DUE/OVERDUE in an ACTIVE parent. Due clear sends null. Blank completion sends an empty body for server-now. The browser performs only obvious structural/time checks; backend clock, calendar and workflow validation remain authoritative.

SOURCE_AUTHORITY_CONFLICT locks the relevant mounted monitoring save action while reads remain usable. Stale/428/state failures preserve drafts, refresh authoritative state and require manual review. State feedback is safe Indonesian text; raw backend problem prose is not rendered.

## Alerts and notifications

Alerts use memory-only status/target/page/size filters, safe projections and mobile-compatible cards with textual severity/state. No patient/event enrichment occurs. OPEN acknowledgement requires its separate grant. OPEN/ACKNOWLEDGED resolution requires its separate grant; direct OPEN resolution is confirmed. Success awaits detail/queue refresh before the next command. There is no dismiss control.

Notifications display only the safe self projection, never payload or failure reason. Only SENT/DELIVERED IN_APP items offer read. Each action first GETs authoritative detail, rechecks status/channel and uses its real header for POST read. A selected detail observer stays mounted through the POST so list/detail refresh is awaited even under forced zero query GC in a regression. READ/PENDING/FAILED/CANCELLED do not offer read. A read does not mutate alerts. Read/refetch errors have safe feedback and explicit recovery.

## Privacy, time and implementation judgments

- No clinical browser storage, logging, filter/history URL state, document metadata or global chrome content was added. Resource links use the approved UUID paths.
- Existing strict treatment/TPT schemas are reused, but contextual monitoring displays only target type/status/dates. Alert/notification projections have no patient enrichment.
- Strict schemas match nullable alert event context and nullable notification alert context. Event counts require exactly the five backend status groups. Malformed responses produce INVALID_RESPONSE.
- Browser-local input reuses the existing tested ISO serializer, timezone explanation and DST ambiguity/nonexistence rejection. Dirty-only event patches omit untouched timestamps, preserving their original offset and precision. A small precise instant comparator retains original fractional seconds for due/completion boundaries; the existing serializer is unchanged.
- Forms use labeled fields, semantic event fieldsets, safe live feedback and the established confirmation/focus-restoration primitive. Severity/read state has text labels.
- The existing foundation shell regression fixture already grants NOTIFICATION_READ_SELF. Its obsolete link allowlist was updated to positively assert Notifikasi and negatively assert Peringatan without ALERT_READ. No backend test was changed.

## Tests and exact final gates

Runtime: Windows, Node.js **24.15.0**, pnpm **11.19.0**. Commands ran from `D:\TBCall\frontend`.

Added **159 tests** in six files, plus two fixtures/harness helpers. Existing baseline: 536 tests in 28 files. Final total: **695 tests in 34 files**.

| New test file | Cases | Coverage |
|---|---:|---|
| monitoring-contracts.test.ts | 53 | Strict schemas/references/counts/nulls, malformed API, query keys/signals, missing headers, manual input/date/cardinality, dirty/null PATCH, DST/precise instant checks |
| monitoring-workflow.test.tsx | 14 | Empty manual forms, actual GET tags, command bodies, confirmation, server-now, draft/authority/state handling, terminal notification gates |
| monitoring-authorization.test.tsx | 35 | All six actual routes, artificial-role denial, contextual links, independent reads/nav/actions, write-only denial |
| monitoring-session.test.tsx | 8 | Old-account GET and alert/read command success/error races, grant/route changes, privacy boundaries |
| monitoring-actions.test.tsx | 40 | Cross-page ACTIVE plan, target/plan/event/alert states, 100 rendered rows, parent refetch, stale draft tags, filters, notification recheck/refresh/forced GC, failed refresh, no polling/focus/reconnect |
| monitoring-hardening.test.tsx | 9 | Dirty/pristine refresh, optional links, no enrichment, history order, safe history/read retry, reader guidance, reference cache, no invented controls |

Test-first failures were observed for absent screens/navigation and the corrected nullable projection, history gate, preserved ambiguous/precise timestamps and background-refetch cases. The final focused matrix passed all 159 cases. After the existing navigation expectation update, all 19 affected foundation tests passed.

| Required command | Exact final result |
|---|---|
| `pnpm run lint` | `eslint . --max-warnings=0`; exit **0**, no warnings/errors |
| `pnpm run typecheck` | `next typegen && tsc --noEmit`; types generated successfully; exit **0** |
| `pnpm test` | **34 passed files; 695 passed tests; 0 failed; 0 skipped; exit 0** |
| `pnpm run build` | Next.js **16.3.8 (Turbopack)**; compilation, TypeScript, page collection/generation and optimization completed; exit **0** |

Exact final test output:

```text
Test Files  34 passed (34)
     Tests  695 passed (695)
  Start at  23:49:40
  Duration  55.68s (tests 68%, environment 19%, setup 6%, import 6%, transform 1%)
EXIT_CODE=0
```

The production route output includes all six F2E routes as dynamic routes. Initial sandbox test/build attempts were denied with `spawn EPERM` in required Windows child-process execution; the exact commands were rerun with approved process permissions and passed. No dependency/configuration or application behavior was changed to bypass that environment failure. The first full test run had only the obsolete foundation navigation assertion failure; the final run above supersedes it.

Independent read-only final review found no actionable issues. No real provisioned backend smoke was performed: permanent tests exercise the actual frontend client/session/query paths with controlled fetch responses. A smoke test using an already authorized officer and representative backend fixtures remains recommended; no credentials or authentication bypass was introduced.

## Protected scope and generated/local files

All **283 tracked backend/Maven files** in the captured hash manifest match the approved base byte for byte. Git comparisons show no Java/backend test/Maven/migration changes. V1–V17 remain unchanged; no V18 exists. Monitoring/alert/notification semantics, scheduler/sweep/fanout and source authority were not modified. Backend tests were not rerun for this frontend-only checkpoint.

Dependencies, lockfile, frontend configuration, existing datetime serializer and next-env.d.ts are unchanged. Normal ignored `.next/` output/types, node_modules, incremental cache and `.env.local` are local/generated files, not deliverables. Typecheck/build generate the Next types without `.tools/`; the application and tests do not depend on development helpers.

Ignored prompts, diagnostic logs, formatter/review artifacts and PDFs are excluded. The unrelated untracked backend category-guard architecture and `frontend/public/brand/tbcall-logo.svg` are excluded. The logo still has SHA-256 `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`.

## Changed-file manifest — 43 files

New feature source (20):

```text
frontend/features/monitoring/api.ts
frontend/features/monitoring/schemas.ts
frontend/features/monitoring/types.ts
frontend/features/monitoring/permissions.ts
frontend/features/monitoring/queries.ts
frontend/features/monitoring/references.ts
frontend/features/monitoring/time.ts
frontend/features/monitoring/boundary.tsx
frontend/features/monitoring/use-command.ts
frontend/features/monitoring/feedback.tsx
frontend/features/monitoring/form.tsx
frontend/features/monitoring/monitoring/target.tsx
frontend/features/monitoring/monitoring/detail.tsx
frontend/features/monitoring/monitoring/event.tsx
frontend/features/monitoring/monitoring/forms.ts
frontend/features/monitoring/monitoring/fields.tsx
frontend/features/monitoring/alerts/queue.tsx
frontend/features/monitoring/alerts/detail.tsx
frontend/features/monitoring/alerts/display.tsx
frontend/features/monitoring/notifications/list.tsx
```

New route pages (6):

```text
frontend/app/treatments/[treatmentId]/monitoring/page.tsx
frontend/app/preventive-treatments/[tptId]/monitoring/page.tsx
frontend/app/monitoring-plans/[planId]/page.tsx
frontend/app/alerts/page.tsx
frontend/app/alerts/[alertId]/page.tsx
frontend/app/notifications/page.tsx
```

Existing frontend source/test changes (4):

```text
frontend/components/app-shell.tsx
frontend/features/treatment/components/treatment-detail.tsx
frontend/features/continuity/tpt/detail.tsx
frontend/tests/foundation-ui.test.tsx
```

New permanent tests/helpers (8):

```text
frontend/tests/monitoring-fixtures.ts
frontend/tests/monitoring-harness.tsx
frontend/tests/monitoring-contracts.test.ts
frontend/tests/monitoring-workflow.test.tsx
frontend/tests/monitoring-authorization.test.tsx
frontend/tests/monitoring-session.test.tsx
frontend/tests/monitoring-actions.test.tsx
frontend/tests/monitoring-hardening.test.tsx
```

Documentation (5):

```text
README.md
frontend/README.md
docs/FRONTEND_F2E_MONITORING.md
docs/FRONTEND_F2E_REPORT.md
docs/architecture/TBCall_Frontend_v1.5_F2E_Monitoring.md
```

## Before F3

No additional backend contract was required for F2E and no schema/specification conflict remains. F3 patient/supporter workflows and F4 administration/integration UI require their separately approved architecture, permissions, safe projections and test scope. Real-backend smoke remains a verification limitation, not a new implemented feature. F3/F4 and SITB networking were not started.
