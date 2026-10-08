# Frontend F4 completion report

Approved base: `48536ab6b26815fb2708b8f4d06eff9791335da6`.
Branch: `feat/frontend-f4-admin-integration`.
Scope: frontend administration and read-only local Phase 5A integration metadata.
The commit containing this report is the F4 implementation commit; its exact SHA is returned in the task completion response. No merge or PR is part of this task.

## Delivered routes and authorization

| Route | Exact workspace gate |
| --- | --- |
| `/admin/facilities` | SYSTEM_ADMIN + FACILITY_MANAGE |
| `/admin/facilities/new` | SYSTEM_ADMIN + FACILITY_MANAGE |
| `/admin/facilities/[facilityId]` | SYSTEM_ADMIN + FACILITY_MANAGE |
| `/admin/users` | USER_MANAGE_FACILITY + SYSTEM_ADMIN, or FACILITY_ADMIN with current active facility assignment |
| `/integrations` | SYSTEM_ADMIN + INTEGRATION_MANAGE |
| `/integrations/[code]` | SYSTEM_ADMIN + INTEGRATION_MANAGE |
| `/integrations/[code]/sync-runs/[runId]` | SYSTEM_ADMIN + INTEGRATION_MANAGE |

Navigation adds Fasyankes, Administrasi Pengguna and Integrasi independently. Role actions require SYSTEM_ADMIN + ROLE_MANAGE; account status requires SYSTEM_ADMIN + USER_ACCOUNT_MANAGE. Existing mixed staff/portal navigation remains independent. No role grants are inferred and no user-ID detail route is created.

## Facility workflows

- Safe paginated summaries and memory-only name/active/page filters; explicit trimmed two-character search; no N+1 detail enrichment or list version synthesis.
- Exact FacilityInput create fields, live active type labels, optional active parent search, structural text/coordinate validation, no active field or invented defaults. Address is unbounded, matching the backend. POST has no If-Match and navigates to the returned detail GET.
- Edit uses actual authoritative detail GET ETag, dirty fields only and explicit null clears. Inactive current types remain code fallbacks. Parent replacement excludes self without inventing hierarchy rules. Parent pagination and Enter never submit the enclosing form.
- Missing ETag blocks commands. 409/428 preserves the draft, refetches all current fields and requires explicit review/resubmit, without replay. Success refetches authoritative detail and cached facility lists, including inactive caches.
- Active-only deactivation uses the real tag and the approved keyboard-accessible confirmation/focus restoration. No reactivation UI.

## Exact lookup, membership, role and account status

- Audited exact lookup occurs only after explicit submit. Input clears on submission. Exact identity is retained transiently only for relookup and clears on replacement/clear/unmount/context change. It never enters query/mutation caches, page URL/history, title, global chrome, storage or logs. Only the approved API request carries its query parameter.
- Masked returned data only; 404 has the approved neutral text. No fuzzy search, autocomplete, directory, patient/NIK/BPJS lookup or account-link provisioning.
- FACILITY_ADMIN candidates come solely from current `/me.activeFacilities`; other assignments expose only the approved boolean notice. SYSTEM_ADMIN discovery additionally requires FACILITY_MANAGE. Membership sends explicit primary true/false or visible-assignment DELETE, with no ETag; primary replacement is explained.
- Roles use live adminManagedRoles and independent ROLE_MANAGE gating. PATIENT/TREATMENT_SUPPORTER are never assignable. Non-ACTIVE targets are read-only; operational assignment prerequisites remain advisory and backend-authoritative. Role commands have no ETag.
- Status supports ACTIVE → suspend/disable, SUSPENDED → reactivate/disable, and no unsupported action for DISABLED/other. Only the explicitly approved fresh lookup version supplies quoted status If-Match. Stale status requires explicit relookup and a new action choice, without replay. Suspend/disable require confirmation.
- Successful membership/role/status relookup the target once before further commands. Self-target commands await `/me` refresh immediately before any relookup; changed authority aborts/remounts the workspace. Self disable/suspend may redirect legitimately to login.

## Read-only integration and isolation

List/detail/run show strictly parsed approved local metadata, independent in-memory section pages, run counters/cursors and safe item/error summaries. No clinical enrichment or external-record deep links. Active is explicitly a metadata flag, not connector readiness. Every page displays the approved local-only integration notice.

No connector/configuration/credentials/sync/import/export/write-back/conflict-resolution controls or SITB networking are added. Integration makes same-origin GETs only, without polling or focus/reconnect refresh.

Query namespaces start `["administration", userId, ...]` and `["integration", userId, ...]`. They include the full current `/me` snapshot in memory, consume AbortSignal and use explicit refresh/no retries. References have a five-minute stale time. The boundary removes obsolete inactive F4 caches after context remount, preventing reuse of old entries briefly recreated during the unchanged shared session refresh.

Commands and audited lookup preflight actual cached `/me`. Commands abort on unmount/account/role/grant/scope change and suppress late feedback, invalidation and navigation. Callbacks guard post-refetch state; lookup also guards supersession. No automatic mutation replay. No F4 persistence, logs or sensitive page metadata. Allowed route IDs are only facility UUID, integration code and run UUID; external/entity/conflict IDs, hashes and cursors stay out of browser navigation/history/global chrome.

## Regression coverage and review

146 new tests in six F4 test files; two separate fixture/harness helpers. Existing baseline: 816 tests in 40 files. Final completed suite: 962 tests in 46 files; exact gate evidence follows.

| F4 test file | Tests | Main coverage |
| --- | ---: | --- |
| `f4-contracts.test.ts` | 2 | Independent navigation role/grant/scope checks |
| `f4-contract-regressions.test.ts` | 80 | Strict DTOs/nesting, invalid responses, scoped abortable queries, no auto-refresh, exact command bodies/headers, structural fields |
| `f4-workflow.test.tsx` | 7 | Submit-only filters/lookup, masked/neutral errors, actual detail tag/null PATCH, read-only pages |
| `f4-administration.test.tsx` | 27 | Denied route reads, create/types/parents, stale review, missing tag, deactivation/focus, scoped membership, role/status gates/version, clear cancellation, parent browsing/Enter |
| `f4-session.test.tsx` | 16 | Old handlers/GET/PATCH/membership, same-account scope, late errors/cache preservation, self refresh/login, lookup preflight, inactive list refetch |
| `f4-integration.test.tsx` | 14 | Metadata fields/links, independent pages, no enrichment/mutations/automatic refresh, safe errors, storage/log/history/title privacy |

Independent read-only review identified unintended parent form submission, stale audited lookup preflight and inactive facility-list refresh. Each was reproduced by a failing regression, fixed and verified. Follow-up review reported no remaining actionable findings and made no edits.

## Final gates

Executed from `D:\TBCall\frontend` with Node 24.15.0 and pnpm 11.19.0. Windows worker-process tooling required sandbox escalation; no tool/config/dependency workaround was introduced.

| Exact command | Result |
| --- | --- |
| `pnpm run lint` | Exit 0; `eslint . --max-warnings=0`; no errors/warnings |
| `pnpm run typecheck` | Exit 0; `next typegen && tsc --noEmit`; route generation successful, no TypeScript errors |
| `pnpm test` | Exit 0; Vitest 5.0.3; Test Files 46 passed (46), Tests 962 passed (962), 0 failed/0 skipped; start 08:40:33, duration 78.39s |
| `pnpm run build` | Exit 0; Next.js 16.3.8 Turbopack compiled successfully in 2.4s; TypeScript finished in 5.3s; 24/24 static pages generated in 807ms; all seven F4 routes present as dynamic routes |

`git diff --check` passed. SHA-256 comparison of 440 protected existing backend/migration/frontend library/feature/configuration files found zero mismatches. No Java/backend tests, V1–V17, auth/session, existing staff/portal semantics, package or lockfile changes. No V18.

A live-backend smoke with provisioned administrator accounts was not performed. Tests exercise real frontend providers/client and mocked existing contracts; they do not claim live SITB connectivity. No Maven run is required or performed for this frontend-only checkpoint.

## Exact changed-file manifest

46 files: 43 added and 3 modified. Modified files are the root/frontend READMEs and AppShell navigation; all other listed files are added.

```text
README.md
docs/FRONTEND_F4_ADMIN_INTEGRATION.md
docs/FRONTEND_F4_REPORT.md
docs/architecture/TBCall_Frontend_v1.7_F4_Admin_Integration.md
frontend/README.md
frontend/app/admin/facilities/page.tsx
frontend/app/admin/facilities/new/page.tsx
frontend/app/admin/facilities/[facilityId]/page.tsx
frontend/app/admin/users/page.tsx
frontend/app/integrations/page.tsx
frontend/app/integrations/[code]/page.tsx
frontend/app/integrations/[code]/sync-runs/[runId]/page.tsx
frontend/components/app-shell.tsx
frontend/features/administration/api.ts
frontend/features/administration/boundary.tsx
frontend/features/administration/confirm.tsx
frontend/features/administration/display.tsx
frontend/features/administration/facilities/create.tsx
frontend/features/administration/facilities/detail.tsx
frontend/features/administration/facilities/form.tsx
frontend/features/administration/facilities/list.tsx
frontend/features/administration/facilities/parent-picker.tsx
frontend/features/administration/permissions.ts
frontend/features/administration/queries.ts
frontend/features/administration/references.ts
frontend/features/administration/schemas.ts
frontend/features/administration/types.ts
frontend/features/administration/use-command.ts
frontend/features/administration/users/workspace.tsx
frontend/features/integration/api.ts
frontend/features/integration/detail/workspace.tsx
frontend/features/integration/display.tsx
frontend/features/integration/list/workspace.tsx
frontend/features/integration/permissions.ts
frontend/features/integration/queries.ts
frontend/features/integration/run/workspace.tsx
frontend/features/integration/schemas.ts
frontend/features/integration/types.ts
frontend/tests/f4-administration.test.tsx
frontend/tests/f4-contract-regressions.test.ts
frontend/tests/f4-contracts.test.ts
frontend/tests/f4-fixtures.ts
frontend/tests/f4-harness.tsx
frontend/tests/f4-integration.test.tsx
frontend/tests/f4-session.test.tsx
frontend/tests/f4-workflow.test.tsx
```

## Excluded artifacts and deferred scope

Unrelated untracked `docs/architecture/TBCall_Backend_v1.5A.3.1_Treatment_Reference_Category_Guard.md` and `frontend/public/brand/tbcall-logo.svg` are preserved and excluded. The logo SHA-256 remains `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`.

Local task prompts/Kemenkes PDFs under ignored `docs/reference-local/`, ignored `.tools/` plans/formatting helper/hashes/logs, `.env.local`, `node_modules/`, `.next/` and incremental caches are excluded. Application builds compile the real checked-in sources directly; no `.tools/` helper or generated source directory supplies F4 implementation.

No additional backend contract was required. Deferred blockers remain: real authorized Phase 5B/SITB integration; connector credentials/configuration; execution/write-back/conflict resolution; generic permissions editor; facility reactivation; broad directory; and TB Officer PATIENT/TREATMENT_SUPPORTER account-link provisioning pending an approved safe account-discovery contract. No deferred/post-F4 work was started.
