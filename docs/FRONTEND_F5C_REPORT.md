# F5C implementation report

## Scope

- Base: `a7e4233576f3e89e5a19f5146b60bd4c18829029`.
- Branch: `feat/frontend-f5c-account-linking`; commit SHA is supplied in the delivery message and repository history.
- Frontend account linking only, following [approved v1.8](architecture/TBCall_Frontend_v1.8_F5C_Account_Linking.md) and the supplied F5C task brief.
- Operational details and all eleven endpoint contracts: [FRONTEND_F5C_ACCOUNT_LINKING.md](FRONTEND_F5C_ACCOUNT_LINKING.md).

## Implemented behavior

Patient detail independently requires PATIENT_READ; its account section requires TB_OFFICER + PATIENT_LINK_VERIFY. Case detail independently requires CASE_READ; its supporter section requires TB_OFFICER + SUPPORTER_LINK_MANAGE. Existing clinical queries and editors are preserved. Mixed roles require the exact officer/grant combination. Backend remains authoritative for facility/historical scope, role lifecycle and source authority.

Exact email/phone lookup is an explicit contextual POST with only `{identity}`. Input is local/transient and cleared after attempt/cancel/context change. Matched masked channel review requires an initially unchecked acknowledgement and a separate confirmation. It records no legal consent or identity proof. No global account directory, manual UUID input or admin lookup/role API is used.

Patient preparation and final confirmation each obtain current state and exact resolved-candidate pair. Existing VERIFIED owner prevents replacement. Null pair omits If-Match; PENDING/REVOKED use true pair GET ETag; REJECTED/VERIFIED block. Revoke uses fresh GET link ID plus ETag at the bound `/account-links/{linkId}` path. Fresh identity/state/header comparison prevents equal-version owner replacement from consuming an earlier confirmation. Backend 409 re-reads state and requires another acknowledgement/confirmation, without replay.

Case roster is scoped and paginated in local state. Minimal creation sends only PMO/COMPANION, trimmed name and optional contact phone; confirmed creation selects an independent detail GET. Contact phone is not a login claim. Active supporters on ACTIVE/REFERRED cases have separate resolver/link controls. Replacement requires an additional unchecked explicit acknowledgement of possible loss of previous-account access. Link/replace/unlink re-read and compare authoritative detail GET state and header before writing. Terminal cases allow read and authorized active-supporter unlink only; inactive records have no account writes. Unsupported supporter record mutations are absent.

SOURCE_AUTHORITY_CONFLICT locks repeated creation across form changes/cancel/selection until meaningful case/session context change. Uncertain create outcomes require explicit successful roster refresh/check before another create. No command automatically retries, replays or polls.

Strict Zod projections reject extra/nested fields and unmasked identities. Actual quoted numeric GET headers supply preconditions; DTO/list versions and mutation headers are never synthesized/reused. Safe local errors cover resolver 404, resource 404, 409, 428, 429, CSRF, authority, invalid responses and uncertain/network outcomes. Backend prose is never rendered.

Full `/me` snapshot changes remount workspaces and immediately invalidate pending command guards; resource and supporter-selection changes abort old work. Between dependent GETs/writes and callbacks, live session-cache equality and mounted/abort checks prevent late success/error/refetch/navigation. Reads use AbortSignal and their context caches are cancelled/removed. Read keys contain user ID, opaque mount context and resource IDs, without actor login PII or resolver input. Commands never enter mutation cache. No new browser persistence/history/logging/metadata/global navigation output carries identity data.

Self-target link changes refresh the acting session. Other tabs acquire current backend state on their next request; no push refresh is claimed. Browser abort cannot undo a request already committed by the server; a newly authorized context must use fresh reads.

## Critical review and fixes

Self-review regressions found and fixed: withdrawing acknowledgement must cancel preparation; replacement Cancel must remain available before its extra acknowledgement. A fresh independent read-only reviewer checked actual F5B backend and both F5C specifications, with no Critical/Important findings and no behaviors declined to judge. Its Minor resource-404 wording finding was reproduced and fixed with action-aware local feedback, retaining the exact required neutral resolver copy. Affected tests were rerun before the full gates.

## Test coverage and final gates

Baseline: 962 tests. F5C adds 170 regressions, covering strict contracts/masks/bodies/GET headers; independent host and role gates; no search on typing; pair states and owner races; bound revoke/stale conflicts; withdrawn/replacement confirmations; roster/create/uncertainty/source lock; inactive/terminal gates; every command's old-account and same-user role/permission/facility races; route/selection races and old detail reads; caches/storage/history/logs/metadata/privacy; self refresh; safe CSRF/404/429/invalid responses. Existing F1–F4 tests are retained.

All four required gates ran from `D:\TBCall\frontend` after the final review fix and exited **0**:

| Command | Exact result |
|---|---|
| `pnpm run lint` | `$ eslint . --max-warnings=0` — no errors or warnings, exit 0 |
| `pnpm run typecheck` | `$ next typegen && tsc --noEmit`; `Generating route types...`; `✓ Types generated successfully` — no TypeScript diagnostics, exit 0 |
| `pnpm test` | `Test Files 54 passed (54)`; `Tests 1132 passed (1132)` — 0 failures, exit 0 |
| `pnpm run build` | Next.js 16.3.8 (Turbopack); `✓ Compiled successfully in 1818ms`; TypeScript finished in 3.8s; `✓ Generating static pages using 17 workers (24/24) in 555ms`; optimization and route manifest completed, exit 0 |

Final test output:

```text
$ vitest run

 RUN  v5.0.3 D:/TBCall/frontend

 Test Files  54 passed (54)
      Tests  1132 passed (1132)
   Start at  11:35:25
   Duration  82.92s (tests 62%, environment 23%, setup 8%, import 6%, transform 1%)
```

All 1,132 tests executed successfully; none were failed or skipped. Windows sandbox worker spawning initially needed tool escalation (EPERM); all final gates used the authorized worker execution and passed. Local ignored `.env.local` was read by Next build; no environment file or secrets are included in the commit. Backend Maven tests were not run because this checkpoint is frontend-only and backend files/tests are unchanged.

## Complete changed-file manifest (27 files)

### New feature modules (10)

- `frontend/features/account-linking/api.ts`
- `frontend/features/account-linking/confirm.tsx`
- `frontend/features/account-linking/feedback.tsx`
- `frontend/features/account-linking/patient-section.tsx`
- `frontend/features/account-linking/permissions.ts`
- `frontend/features/account-linking/queries.ts`
- `frontend/features/account-linking/resolve-form.tsx`
- `frontend/features/account-linking/schemas.ts`
- `frontend/features/account-linking/supporter-section.tsx`
- `frontend/features/account-linking/use-command.ts`

### New regression tests/fixtures (10)

- `frontend/tests/account-linking-api.test.ts`
- `frontend/tests/account-linking-confirmation.test.tsx`
- `frontend/tests/account-linking-contracts.test.ts`
- `frontend/tests/account-linking-fixtures.ts`
- `frontend/tests/account-linking-harness.tsx`
- `frontend/tests/account-linking-hosts.test.tsx`
- `frontend/tests/account-linking-patient.test.tsx`
- `frontend/tests/account-linking-privacy.test.tsx`
- `frontend/tests/account-linking-session.test.tsx`
- `frontend/tests/account-linking-supporter.test.tsx`

### Host integration (2)

- `frontend/features/clinical-intake/components/patient-detail.tsx`
- `frontend/features/clinical-intake/components/case-detail.tsx`

### Documentation (5)

- `README.md` — frontend section only.
- `frontend/README.md`
- `docs/FRONTEND_F5C_ACCOUNT_LINKING.md`
- `docs/FRONTEND_F5C_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.8_F5C_Account_Linking.md` — supplied approved architecture, preserved as provided.

## Protected-scope verification

Diff against approved base is empty for `src/`, backend tests, `pom.xml`, Maven wrapper/configuration, Flyway V1–V17, frontend dependency manifests/lockfile/workspace, authentication/session/provider/proxy code and previous feature modules outside the two additive host imports/render gates. No V18, backend authorization/source-authority change, unrelated workflow or SITB network integration.

Pre-existing untracked architecture inputs and `frontend/public/brand/tbcall-logo.svg` are preserved and excluded. Logo SHA256 remains `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`. Local task prompts/PDFs and `.tools/` helpers/logs stay ignored and uncommitted. No `.tools/` script is required for compilation, tests or build. Normal ignored Next/node_modules/incremental artifacts are build outputs only.

## Remaining boundaries

No missing F5B contract or schema/security conflict was found. F6 real-backend end-to-end/security/deployment readiness remains a separate checkpoint with provisioned seven-role synthetic actors; this Vitest/RTL checkpoint does not replace that live verification. Facility identity/consent SOP approval remains necessary before real-person deployment. No merge, F6 work or SITB networking is included.
