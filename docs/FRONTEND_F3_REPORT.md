# F3 portal checkpoint report

## Base and scope

Approved base `f1023b4c459983c8f1edbd01bcc6fca55b1138ef`, existing `feat/frontend-f3-portal` branch. Frontend-only, eight routes, focused features/portal. Existing backend/tests/V1–V17/Maven/authentication/session/staff modules remain unchanged. No V18/F4/SITB networking. Shell changes only add independent portal links and hide empty facility boxes. No dependency/lockfile/configuration change or build/runtime dependence on `.tools/`.

Unrelated untracked category-guard architecture and frontend logo are preserved/excluded. Prompts, logs, formatter helpers, PDFs, screenshots, caches and secrets are excluded.

## Routes, access and safe APIs

Routes: `/portal`, `/portal/treatment`, `/portal/tpt`, `/portal/monitoring`, `/portal/alerts`, `/portal/notifications`, `/supporting-cases`, `/supporting-cases/[caseId]`. [The guide](FRONTEND_F3_PORTAL.md) records the complete access matrix and exact safe self/supporter API inventory.

PATIENT role plus independent read permissions protect sections; missing patientLink suppresses self resources. Supporter IDs come only from current `/me.supporterCaseIds`; unlinked/empty supplied IDs deny before resource calls. Staff-only artificial grants cannot bypass portal roles. Mixed-role actors retain authorized staff and portal links. Portal notifications require either portal role plus NOTIFICATION_READ_SELF, separate from staff notifications.

## Workflow and privacy decisions

- Strict nested safe DTOs reject extra fields with INVALID_RESPONSE; nullable fields match existing projections. No staff API/catalog fallback.
- Patient treatment/TPT and linked supporter treatment 404s are neutral; linked cases remain. ACTIVE_TPT_AMBIGUOUS receives safe guidance, never client selection.
- Dose recording is explicit and ACTIVE-only with independent grants, live actor choices and optional mode/notes; no ETag, default date/status, expected-dose generation, missed-dose/adherence/outcome inference or replay. Selected live options are revalidated; failed drafts remain.
- Supporter raw counts use `Jumlah laporan bukti dosis, bukan skor kepatuhan.` Names stay in authorized case content.
- Follow-up/TPT/monitoring are read-only; recorded event dates/statuses imply no clinical schedule/assessment.
- `Tandai sudah diketahui` records a personal receipt without ETag or claimed staff alert transition.
- IN_APP notification detail supplies the actual ETag after actor/context/ID/channel/status checks. No list-version synthesis, non-readable-state action, staff alert link or polling.
- Portal keys/signals, complete `/me` context remount and command preflight/subscription/abort prevent late old-context feedback/invalidation/navigation. Auth/session code unchanged.
- No clinical storage/logging/URL query-history/metadata/global-shell leakage; pagination stays in component memory. Existing same-origin/no-store/CSRF client reused.

## Tests and independent review

Baseline **695 tests across 34 files**. Added **96 tests across five files**, plus three fixture/harness files: strict safe schemas, live actor labels/options, independent gates/artificial grants, no-link/no-case suppression, mixed navigation, expected 404s, ACTIVE-only payloads/no ETag/no replay, read-only views, personal receipts, authoritative notification ETags, stale query/command/context races and privacy.

Navigation/schema/screen regressions failed before implementation. Empty supplied case-ID regression failed before its guard correction. Independent read-only review found stale rendered handlers could issue a command after `/me` cache change before observer rerender, and retained administration modes could disappear from live references. Both were reproduced RED then fixed GREEN; combined session/hardening verification passed 35 tests after fixes. A new mixed-navigation fixture initially asserted `Pasien` instead of the existing `Daftar pasien`; corrected without changing staff behavior. No additional backend contract/schema conflict was found.

## Required gates

Run from `frontend/` on Windows with Node.js 24.15.0 and pnpm 11.19.0:

| Command | Exact final result |
| --- | --- |
| `pnpm run lint` | `eslint . --max-warnings=0`; exit 0; no errors/warnings |
| `pnpm run typecheck` | `next typegen && tsc --noEmit`; types generated successfully; exit 0 |
| `pnpm test` | 39 passed files, 791 passed tests, zero failures/skips; exit 0 |
| `pnpm run build` | Next.js 16.3.8 production compilation, TypeScript, page generation and optimization passed; exit 0; all eight portal routes present as dynamic routes |

Exact final test output:

```text
Test Files  39 passed (39)
     Tests  791 passed (791)
  Start at  06:24:52
  Duration  63.08s (tests 67%, environment 19%, setup 7%, import 6%, transform 1%)
EXIT_CODE=0
```

All previous 695 tests and 96 new tests pass. The final run supersedes the initial expanded run's fixture assertion failures. Initial default-sandbox Vitest could not spawn Windows workers (`spawn EPERM`); approved process access was used for verification, with no dependency/configuration bypass or disabled tests. Production build preserves all existing staff routes and adds only the eight approved portal routes.

## Protected/generated files and limitations

SHA-256 comparison of **287 tracked backend/Maven files** shows **zero mismatches**. Exactly 17 migration files exist; V1–V17 are unchanged and no V18 was created. Git comparisons show no frontend authentication/session or staff-feature changes, nor dependency/lockfile/configuration changes. Normal ignored `.next/`, node_modules and incremental cache are generated outputs; all portal source/tests physically reside under frontend and compile without helper execution. The unrelated logo retains SHA-256 `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696` and remains excluded.

No live provisioned-backend browser smoke was performed. Permanent tests exercise actual frontend client/session/query/command code with controlled safe fetch responses, including cancellation/error/state changes. Deployment smoke needs already authorized accounts; no provisioning/credential/auth bypass introduced.

No additional backend read contract or architecture change was required. F4/SITB networking remain separate approved work.

## Changed-file manifest

All 40 files below are included; unrelated assets remain excluded.

```text
docs/architecture/TBCall_Frontend_v1.6_F3_Portal.md
docs/FRONTEND_F3_PORTAL.md
docs/FRONTEND_F3_REPORT.md
frontend/app/portal/alerts/page.tsx
frontend/app/portal/monitoring/page.tsx
frontend/app/portal/notifications/page.tsx
frontend/app/portal/page.tsx
frontend/app/portal/tpt/page.tsx
frontend/app/portal/treatment/page.tsx
frontend/app/supporting-cases/[caseId]/page.tsx
frontend/app/supporting-cases/page.tsx
frontend/components/app-shell.tsx
frontend/features/portal/api.ts
frontend/features/portal/boundary.tsx
frontend/features/portal/display.tsx
frontend/features/portal/notifications/list.tsx
frontend/features/portal/patient/alerts.tsx
frontend/features/portal/patient/dose-evidence.tsx
frontend/features/portal/patient/home.tsx
frontend/features/portal/patient/monitoring.tsx
frontend/features/portal/patient/tpt.tsx
frontend/features/portal/patient/treatment.tsx
frontend/features/portal/permissions.ts
frontend/features/portal/queries.ts
frontend/features/portal/references.ts
frontend/features/portal/schemas.ts
frontend/features/portal/supporter/detail.tsx
frontend/features/portal/supporter/list.tsx
frontend/features/portal/types.ts
frontend/features/portal/use-command.ts
frontend/README.md
frontend/tests/portal-contracts.test.ts
frontend/tests/portal-fixtures.ts
frontend/tests/portal-hardening.test.tsx
frontend/tests/portal-harness.tsx
frontend/tests/portal-navigation.test.tsx
frontend/tests/portal-reference-fixture.ts
frontend/tests/portal-session.test.tsx
frontend/tests/portal-workflow.test.tsx
README.md
```
