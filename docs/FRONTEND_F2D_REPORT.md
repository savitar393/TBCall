# Frontend F2D final report

Approved backend/repository base: `584fdea9bbe420c771593d52e2028407c6738c9c`.
Branch: `feat/frontend-f2d-continuity` (existing user branch).
Scope: frontend continuity only, using the supplied v1.4 architecture unchanged.

## Delivered routes and actor behavior

| Route | Explicit TB_OFFICER permission |
|---|---|
| `/referrals` | REFERRAL_READ |
| `/referrals/[referralId]` | REFERRAL_READ |
| `/cases/[caseId]/referrals/new` | REFERRAL_WRITE |
| `/cases/[caseId]/contacts` | CONTACT_READ |
| `/contacts/[contactId]` | CONTACT_READ |
| `/contact-investigations` | CONTACT_READ |
| `/contact-investigations/[investigationId]` | CONTACT_READ |
| `/preventive-treatments/[tptId]` | TPT_READ |

SessionBoundary protects every route. Rujukan/Investigasi kontak navigation and case-context links independently require their permissions. Writes independently require REFERRAL_WRITE, CONTACT_WRITE or TPT_WRITE; role never supplies grants. Exact resolve helper additionally requires PATIENT_IDENTITY_RESOLVE. Optional sex references require PATIENT_READ. TPT history requires TPT_READ; contextual case/treatment links require their existing independent read permissions. No global TPT queue is invented.

## Workflow, ETags and judgment

- Referral: live advisory preparation drives fixed pre-treatment destination or explicit transfer using the exact ACTIVE episode. PLANNED/PAUSED/in-flight/unsupported preparation offers no send. Directory uses a two-character minimum and 300 ms debounce, excludes known source, and requires explicit selection. Existing side/state transitions and reason/confirmation requirements are retained. Report invalidates case/treatment context without rewriting ownership locally.
- Contacts: live INTERNAL/OUTGOING_REFERRAL creation; internal omits destination, outgoing requires selection. Masked phone stays masked in projections. Dirty-only demographic PATCH omits immutable/link/child fields; null clears optional fields. New-phone input starts blank rather than copying its mask; explicit clear checkbox represents deletion.
- Exact link: WNI/WNA exact identity plus name/DOB confirmation is resolved first; masked DTO is displayed. Original values remain transient component state and are reused with resolved patientId and current contact ETag. No manually pasted UUID/fuzzy fallback. State is discarded on cancel/success/unmount/session remount.
- Investigations: outgoing recorded destination/source and internal working-side rules mirror existing backend. Completion requires two explicit booleans, enforcing only eligible=true => excluded=true. It creates no case, registration or TPT.
- TPT: completed/excluded/eligible projected state, independent TPT_WRITE and working facility gate explicit start. Live PREVENTIVE catalogs are category-filtered with no default regimen; individualized description remains supported. No clinical dose/composition/duration/end-date/eligibility inference. ACTIVE dirty PATCH cannot erase the sole regimen description. Complete/stop/lost-to-follow-up require explicit confirmation; stop requires reason. No national-outcome mapping.
- Actual GET ETags are used for all existing-resource writes. Send/contact creation/TPT start omit If-Match. Summary versions are never used to synthesize preconditions.
- Write-only referral/TPT actors receive an in-place success and disabled repeat submission when detail read is absent. Detail navigation occurs only with independent read permission, avoiding dead links without new backend contracts.
- Changed referral preparation preserves draft and disables the outdated intent rather than deleting notes or silently choosing a different episode/destination.

## Query/session, privacy, time and conflicts

All continuity keys start `["continuity", userId]`; all queries consume AbortSignal. The full `/me` snapshot keys protected screen state, and resource route IDs key dynamic screens. Commands abort on unmount and suppress old-context success/error/invalidation/navigation. Payloads are not stored in mutation cache. Account/permission and route changes discard drafts.

All responses use strict Zod schemas and safe INVALID_RESPONSE handling. Drafts remain on 409/428/known workflow errors; authoritative resources refetch and explicit review is required before a new submission. Destination-invalid also refreshes directory/preparation. Known domain codes receive locally defined Indonesian workflow feedback. Raw backend prose is never shown. SOURCE_AUTHORITY_CONFLICT locks saves in the mounted form while reads/navigation remain available.

No continuity data in browser storage, indexedDB, logs, URL query/history, metadata or global chrome. UUID route identifiers are permitted; queue state stays in memory. Local datetime inputs show browser timezone and reuse DST-safe ISO conversion; optional blank times mean backend now. LocalDate remains YYYY-MM-DD; blank TPT closure date means backend today. Responsive cards and accessible confirmations include explicit consequences and tested dialog focus restoration.

## Review and scope verification

Independent read-only final review found a P2 workflow-feedback/400-refetch gap. The fix was independently re-reviewed with no remaining actionable concern. A draft-loss regression and dialog-trigger focus regression were also fixed during testing.

Java source, backend tests, Maven files and V1–V17 have no diff against approved base. No migration/backend contract was added. No dependency/lockfile changes. The supplied F2D architecture is tracked unchanged. The unrelated backend Category Guard architecture and `frontend/public/brand/tbcall-logo.svg` are excluded; logo SHA256 remains `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`. Local prompts, logs, caches and PDFs remain excluded/ignored.

## Tests and exact gates

All four commands ran from `D:\TBCall\frontend` and exited **0**:

| Exact command | Result |
|---|---|
| `pnpm run lint` | `$ eslint . --max-warnings=0`; no errors/warnings |
| `pnpm run typecheck` | `$ next typegen && tsc --noEmit`; Types generated successfully, no TypeScript errors |
| `pnpm test` | **28 files passed; 536 tests passed; 0 failed, 0 skipped** |
| `pnpm run build` | `$ next build`; compiled successfully; TypeScript/page generation completed; all eight new routes included |

The suite consists of 380 existing + **156 new F2D tests** in five new test files. Exact final test excerpt:

```text
Test Files  28 passed (28)
     Tests  536 passed (536)
  Start at  21:17:09
  Duration  40.81s (tests 67%, environment 19%, setup 7%, import 6%, transform 1%)
```

Final production build excerpt:

```text
$ next build
Next.js 16.3.8 (Turbopack)
Compiled successfully in 2.4s
Finished TypeScript in 6.2s
Generating static pages using 17 workers (11/11) in 360ms
Finalizing page optimization ...
```

Build emitted the eight expected dynamic F2D routes. Ignored `.env.local` was present during the production build; no setting/secret was committed. Build caches/types are standard ignored `.next` outputs; application compilation requires no `.tools` script. Git diff checks and protected-source comparison passed. Maven was not run because this checkpoint is frontend-only.

New regression coverage: five continuity test files, plus fixtures/harness. Covers strict DTO/page/catalog contracts; independent role/action gates; all 15 query AbortSignals/keys; old-account GET and success/error commands; permission/route changes; exact send and transition payloads/GET ETags; report invalidation/no ownership rewrite; masked contact edit/clear; live optional sex/workflows; WNI/WNA original exact confirmation; explicit completion choices; category-filtered/individualized TPT; dirty patches/sole-description guard; closures/stop reason; conflict draft retention/manual review/source locks; privacy/no raw prose; dialog focus.

The first expanded full run saturated Windows with 28 jsdom workers and hit existing 5 s timeouts. The affected existing files passed separately (29/29). Vitest now limits workers to four; timeouts/assertions are unchanged. The final gates use the exact requested commands with no extra CLI test options.

## Blockers and next checkpoint

No additional backend contract or architecture/schema conflict was required. Live-backend source/destination smoke testing remains recommended using separately provisioned TB_OFFICER accounts; no live-account smoke test was performed and no credentials were invented. An approved F2E architecture/task and appropriate test accounts are needed for the next frontend scope. Monitoring/alerts/notifications UI, portals, administration and SITB networking remain deferred.

## Changed-file manifest

54 files: 31 continuity implementation files, eight routes, seven test/fixture files, five documentation files, two navigation/context files and one test configuration file.

- `README.md`
- `docs/FRONTEND_F2D_CONTINUITY.md`
- `docs/FRONTEND_F2D_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.4_F2D_Continuity.md`
- `frontend/README.md`
- `frontend/app/cases/[caseId]/contacts/page.tsx`
- `frontend/app/cases/[caseId]/referrals/new/page.tsx`
- `frontend/app/contact-investigations/[investigationId]/page.tsx`
- `frontend/app/contact-investigations/page.tsx`
- `frontend/app/contacts/[contactId]/page.tsx`
- `frontend/app/preventive-treatments/[tptId]/page.tsx`
- `frontend/app/referrals/[referralId]/page.tsx`
- `frontend/app/referrals/page.tsx`
- `frontend/components/app-shell.tsx`
- `frontend/features/clinical-intake/components/case-detail.tsx`
- `frontend/features/continuity/api.ts`
- `frontend/features/continuity/boundary.tsx`
- `frontend/features/continuity/confirmation.tsx`
- `frontend/features/continuity/contacts/case-contacts.tsx`
- `frontend/features/continuity/contacts/contact-fields.tsx`
- `frontend/features/continuity/contacts/detail.tsx`
- `frontend/features/continuity/contacts/forms.ts`
- `frontend/features/continuity/contacts/investigation.tsx`
- `frontend/features/continuity/contacts/link.tsx`
- `frontend/features/continuity/contacts/queue.tsx`
- `frontend/features/continuity/display.tsx`
- `frontend/features/continuity/errors.ts`
- `frontend/features/continuity/facilities.tsx`
- `frontend/features/continuity/feedback.tsx`
- `frontend/features/continuity/fields.tsx`
- `frontend/features/continuity/form.tsx`
- `frontend/features/continuity/permissions.ts`
- `frontend/features/continuity/queries.ts`
- `frontend/features/continuity/referrals/create.tsx`
- `frontend/features/continuity/referrals/detail.tsx`
- `frontend/features/continuity/referrals/forms.ts`
- `frontend/features/continuity/referrals/queue.tsx`
- `frontend/features/continuity/schemas.ts`
- `frontend/features/continuity/time.ts`
- `frontend/features/continuity/tpt/detail.tsx`
- `frontend/features/continuity/tpt/fields.tsx`
- `frontend/features/continuity/tpt/forms.ts`
- `frontend/features/continuity/tpt/history.tsx`
- `frontend/features/continuity/tpt/start.tsx`
- `frontend/features/continuity/types.ts`
- `frontend/features/continuity/use-command.ts`
- `frontend/tests/continuity-actions.test.tsx`
- `frontend/tests/continuity-contracts.test.ts`
- `frontend/tests/continuity-fixtures.ts`
- `frontend/tests/continuity-harness.tsx`
- `frontend/tests/continuity-permissions.test.ts`
- `frontend/tests/continuity-session.test.tsx`
- `frontend/tests/continuity-workflow.test.tsx`
- `frontend/vitest.config.ts`
