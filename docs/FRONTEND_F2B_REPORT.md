# Frontend F2B checkpoint report

## Base and scope

- Approved base `e13e3e3c934298d9a76827b40f2d934d21eb6bfe`; prepared branch `feat/frontend-f2b-laboratory`.
- Frontend/docs only; Java, backend tests, V1–V17, build/wrapper files and laboratory semantics unchanged. No V18, F2C or SITB networking.
- All approved flows use existing contracts. No missing backend contract or schema conflict discovered.
- Unrelated untracked logo preserved/excluded: SHA256 `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`.
- Local task prompts, Kemenkes PDFs, `.tools/` test logs, caches, dependencies, secrets and screenshots excluded.

## Delivered contracts and workflow

Four routes: `/laboratory`, `/laboratory/requests/[requestId]`, `/laboratory/requests/new/registration/[registrationId]`, `/laboratory/requests/new/case/[caseId]`. All use F1 SessionBoundary. Navigation/read requires (TB_OFFICER or LAB_STAFF)+LAB_REQUEST_READ+active facility. Source writes require officer+LAB_REQUEST_WRITE and requesting assignment; testing writes require LAB_STAFF+LAB_RESULT_WRITE and testing assignment. Dual actors independently receive permitted actions. LAB_RESULT_READ controls result rendering/correction; clinical owner links independently require officer clinical read.

Queue filters are memory-only, use live reference options and assigned facilities, validate size1–50 and page≥0, and provide pagination/loading/empty/safe error/clear. Only backend minimum patient projection is displayed; no NIK/BPJS enrichment.

Creation fetches its owner and uses registration OPEN/DIAGNOSED→DIAGNOSIS or ACTIVE case→FOLLOW_UP. Plain F2A links avoid reverse imports. Testing facility is explicit and initially empty; active owner/assigned choices are safe conveniences. Authorized PATIENT_READ adds active directory search with minimum2characters/350ms debounce/region codes/pagination. Exactly one owner, live1–10distinct test codes and optional logistics are sent; derived facility/referral/status/time/patient fields are omitted.

Request specimen/cancel use the actual request-detail ETag header. Receive uses quoted specimen.version; first result uses test.version; correction uses result.version. Safe-integer helper is laboratory-only. Source actions have prescribed request-state gates and cancellation confirmation. Receipt requires explicit boolean, false rejection and true clears stale rejection. Specimen type/result code stay free text.

First result offers only usable, currently unrepresented exact specimen lineages plus independent null lineage. Correction targets a projected latest FINAL/CORRECTED result, fixes lineage and sends only timestamp/code/value/text. Success refetches authoritative request/queue; no local replacement/history fabrication or clinical inference.

One browser-local serializer sends validated ISO instants, rejects invalid/nonexistent/ambiguous repeated local times for new/edited inputs, displays browser timezone and never fabricates clinical timestamps. Unchanged correction time is sent verbatim from the original result, preserving offset/DST occurrence/sub-millisecond precision. Conflict/428 refresh retains drafts, requires manual review and never replays. Source-authority locks persist on the mounted form through read failures; vanished eligibility blocks obsolete commands. Action disposal requires explicit inline confirmation. Safe read retries remain available.

All laboratory GETs are user-scoped/abortable and responses strict Zod. Snapshot/abort checks suppress old-account command success and errors, invalidation and navigation. Forms and commands are transient, with no mutation-cache input or patient/result/note/courier storage/logs/history/metadata/global chrome. Raw backend problem prose is never displayed.

## Changed-file manifest

- Four new laboratory route files under `frontend/app/laboratory/`.
- Modified `frontend/components/app-shell.tsx` and existing clinical `components/{registration-detail,case-detail}.tsx` for navigation/plain contextual links.
- New `frontend/features/laboratory`: `api.ts`, `schemas.ts`, `types.ts`, `queries.ts`, `permissions.ts`, `time.ts`, `etag.ts`, `use-command.ts`; forms `values.ts`, `mappers.ts`, `request-fields.tsx`, `specimen-fields.tsx`, `receive-fields.tsx`, `result-fields.tsx`; components `laboratory-boundary.tsx`, `request-queue.tsx`, `request-create.tsx`, `request-detail.tsx`, `testing-facility.tsx`, `request-display.tsx`, `lab-form.tsx`, `lab-feedback.tsx`.
- Six new test suites: laboratory contracts, queue, create, workflow, session and hardening; `laboratory-fixtures.ts` and `laboratory-harness.tsx` support.
- New this report, `docs/FRONTEND_F2B_LABORATORY.md`, supplied approved architecture and implementation ledger `docs/superpowers/plans/2026-10-07-frontend-f2b.md`; updated root/frontend README.
- No dependency/lockfile changes.

## Test matrix

| Area | Permanent evidence |
| --- | --- |
| Strict DTOs / responses / safe versions / timestamps | laboratory-contracts; hardening |
| Actor+permission navigation / disjoint assignments / dual actors | queue; workflow |
| Live labels / assigned filters / pagination / projection / errors | queue |
| Owner reason mapping / exactly one ID / explicit facilities / directory gates / body omissions | create; contracts; hardening |
| Actual request and nested child If-Match | workflow; contracts |
| Receipt boolean / rejection reset / specimen chronology | workflow; contracts; hardening |
| Usable/null/existing lineage / fixed correction / nonblank free text / no inference | workflow; contracts; session |
| No replay / conflict review / authority lock / failed refresh / obsolete result or specimen / draft disposal | workflow; hardening |
| User-key signals / late GET / late specimen+result success and authentication error / memory-only privacy | session |

Baseline:187tests. Final suite:298tests (111new),19files; all passing, no failures/skips. Six new laboratory suites exercise real native API requests, mounted UI commands and session changes with contract-shaped fixtures.

## Exact final gates

Run after the review fix on Windows from `D:\TBCall\frontend`, Node24.15.0/pnpm11.19.0, 2026-10-07:

| Command | Exact result |
| --- | --- |
| `pnpm run lint` | `eslint . --max-warnings=0`; exit0, no errors/warnings |
| `pnpm run typecheck` | `next typegen && tsc --noEmit`; route types generated successfully, exit0 |
| `pnpm test` | Test Files19passed(19); Tests298passed(298); start13:08:31; duration22.70s; exit0 |
| `pnpm run build` | Next16.3.8/Turbopack compiled successfully778ms; TypeScript2.8s; static pages9/9; all4laboratory routes dynamic; exit0 |

Backend tests were neither modified nor executed. Protected-path diff against approved base is empty. Final index contains only the43manifest paths; unrelated logo remains untracked, and local artifacts are ignored. Git diff whitespace checks pass.

## Review, judgments and remaining scope

One independent final read-only review found no Critical or Minor issues and one Important issue: narrative-only correction could shift the second DST hour and truncate sub-millisecond precision. Three permanent regressions reproduced it; one fix pass preserves unchanged original timestamps and rejects new ambiguous local times. No repeat review. Final gates below verify the fix. The ledger records native Windows plan/log evidence and inline implementation on the user-prepared branch; no repeated worktree/design approval. Cost if wrong: process evidence requires manual auditing. Additional form disposal confirmation makes obsolete editors recoverable without surprising draft loss.

Reviewer declined to judge live-backend operation and new backend/F2C behavior. Rulings: provisioned live accounts/backend are absent, so contract/UI regressions are the available gate (cost: deployment-level behavior still needs a real smoke test); backend/F2C work remains outside the authorized slice (cost: later integration needs separate approval/verification). Deferred minors: none.

No real-backend browser smoke run performed: this checkpoint has no provisioned test accounts/live backend requirement. Frontend tests use existing contract-shaped fixtures, not a SITB API/database. No known new backend contract blocker before F2C; treatment/adherence/follow-up/adverse-event/outcome UI needs its separately approved architecture and acceptance tests.

## Exact changed paths (43 files)

```text
M	README.md
A	docs/FRONTEND_F2B_LABORATORY.md
A	docs/FRONTEND_F2B_REPORT.md
A	docs/architecture/TBCall_Frontend_v1.2_F2B_Laboratory.md
A	docs/superpowers/plans/2026-10-07-frontend-f2b.md
M	frontend/README.md
A	frontend/app/laboratory/page.tsx
A	frontend/app/laboratory/requests/[requestId]/page.tsx
A	frontend/app/laboratory/requests/new/case/[caseId]/page.tsx
A	frontend/app/laboratory/requests/new/registration/[registrationId]/page.tsx
M	frontend/components/app-shell.tsx
M	frontend/features/clinical-intake/components/case-detail.tsx
M	frontend/features/clinical-intake/components/registration-detail.tsx
A	frontend/features/laboratory/api.ts
A	frontend/features/laboratory/components/lab-feedback.tsx
A	frontend/features/laboratory/components/lab-form.tsx
A	frontend/features/laboratory/components/laboratory-boundary.tsx
A	frontend/features/laboratory/components/request-create.tsx
A	frontend/features/laboratory/components/request-detail.tsx
A	frontend/features/laboratory/components/request-display.tsx
A	frontend/features/laboratory/components/request-queue.tsx
A	frontend/features/laboratory/components/testing-facility.tsx
A	frontend/features/laboratory/etag.ts
A	frontend/features/laboratory/forms/mappers.ts
A	frontend/features/laboratory/forms/receive-fields.tsx
A	frontend/features/laboratory/forms/request-fields.tsx
A	frontend/features/laboratory/forms/result-fields.tsx
A	frontend/features/laboratory/forms/specimen-fields.tsx
A	frontend/features/laboratory/forms/values.ts
A	frontend/features/laboratory/permissions.ts
A	frontend/features/laboratory/queries.ts
A	frontend/features/laboratory/schemas.ts
A	frontend/features/laboratory/time.ts
A	frontend/features/laboratory/types.ts
A	frontend/features/laboratory/use-command.ts
A	frontend/tests/laboratory-contracts.test.ts
A	frontend/tests/laboratory-create.test.tsx
A	frontend/tests/laboratory-fixtures.ts
A	frontend/tests/laboratory-hardening.test.tsx
A	frontend/tests/laboratory-harness.tsx
A	frontend/tests/laboratory-queue.test.tsx
A	frontend/tests/laboratory-session.test.tsx
A	frontend/tests/laboratory-workflow.test.tsx
```
