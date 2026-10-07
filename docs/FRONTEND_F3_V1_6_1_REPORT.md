# F3 v1.6.1 portal correction report

Branch: `feat/frontend-f3-portal`.
Approved base: `a156a4a5583ddd0576168166357ebfdc07f234a9`.
Specification: [F3 v1.6.1 hardening](architecture/TBCall_Frontend_v1.6.1_F3_Portal_Hardening.md).

## Changes

1. Dose forms use the live actor-specific patientDoseStatuses/supporterDoseStatuses and administrationModes arrays directly. Frontend code allowlists were removed; current live selections remain revalidated before submission.
2. `canSupportCases` requires TREATMENT_SUPPORTER plus any of TREATMENT_READ, ADHERENCE_READ, ADHERENCE_RECORD, MONITORING_READ or ALERT_READ. Navigation and the shared boundary for both supporter routes use it. The detail case-ID allowlist remains enforced. Notification-only supporters retain their notification route; ALERT_ACKNOWLEDGE alone cannot grant the workspace.
3. A tested local-calendar helper supplies each dose input's maximum. Both actors' forms independently reject future dates before POST, show safe local feedback and preserve every draft field. Correction to today allows explicit submission. No UTC date slicing is used.

## Changed-file manifest

| Path | Change |
| --- | --- |
| `frontend/features/portal/references.ts` | Direct live actor choices |
| `frontend/features/portal/permissions.ts` | Shared workspace authorization helper/navigation |
| `frontend/features/portal/boundary.tsx` | Workspace gate for list/detail |
| `frontend/features/portal/local-date.ts` | New browser-local calendar helper |
| `frontend/features/portal/patient/dose-evidence.tsx` | Direct live administration choices; date maximum and submit guard |
| `frontend/tests/portal-v1.6.1.test.tsx` | 25 new regression cases |
| `frontend/tests/portal-hardening.test.tsx` | Align existing no-grant navigation assertion with corrected contract |
| `docs/FRONTEND_F3_PORTAL.md` | Updated access/choice/date guide |
| `docs/architecture/TBCall_Frontend_v1.6.1_F3_Portal_Hardening.md` | Supplied approved corrective architecture, unchanged |
| `docs/FRONTEND_F3_V1_6_1_REPORT.md` | This report |

## Regression coverage

The new test file adds 25 cases:

- Both actors render and submit changed live dose/admin codes without local filters (2).
- No-grant, notification-only and acknowledgement-only navigation denial (3).
- Notification-only and acknowledgement-only direct list/detail denial, without resource calls (4).
- Notification-only route remains accessible (1).
- Each of the five workspace grants permits navigation and both linked routes (5).
- Each grant retains role and case-ID guards (5).
- Both actors' date inputs expose local-today maximum with no default (2).
- Both actors reject future submissions, send no POST, preserve the draft and accept corrected today (2).
- Calendar helper covers midnight/year boundaries and never calls UTC serialization (1).

Before production changes, the new regression run returned **15 failed, 10 passed** (exit 1), reproducing all three findings. After the corrections, the focused new/hardening/workflow run returned **95 passed in 3 files** (exit 0). Existing patient/server-list TAKEN_OBSERVED/DISPENSED_HOME exclusions, supporter DISPENSED_HOME exclusion, stale-choice rejection, context isolation and safe API behavior remain covered.

## Final frontend gates

Executed from `D:\TBCall\frontend` on Windows using Node 24.15.0 and pnpm 11.19.0:

| Exact command | Result |
| --- | --- |
| `pnpm run lint` | `eslint . --max-warnings=0`, exit 0 |
| `pnpm run typecheck` | `next typegen && tsc --noEmit`; route types generated successfully, exit 0 |
| `pnpm test` | `Test Files 40 passed (40)`; `Tests 816 passed (816)`; duration 64.40s, exit 0 |
| `pnpm run build` | Next.js 16.3.8 production build; compiled in 1043ms, TypeScript finished in 4.1s, static pages 20/20, exit 0 |

All existing 791 tests plus 25 new regressions passed. All eight existing portal/supporter routes remain dynamic, and route inventory is unchanged. No code/test changes followed the final gates. Frontend worker commands needed Windows process access outside the restricted sandbox; no dependencies, configuration or worker settings were changed to run them.

## Scope and review

All 453 snapshotted protected tracked files were unchanged, including Java/backend source and tests, V1–V17, Maven configuration, authentication/session code, staff features, existing route files and frontend dependency/configuration files. Route inventory and existing API/session behavior are unchanged. No backend contract, new dependency, migration, F4 workflow or SITB networking was introduced. No merge was performed.

An independent read-only review found no actionable issues. Local test logs and snapshots are ignored under `.tools/`; application compilation does not execute them. Local task briefs/Kemenkes PDFs are excluded. The pre-existing untracked backend category-guard architecture and brand logo are left outside this patch. The historical F3 report retains its original 791-test checkpoint result.
