# Frontend F2C checkpoint report

## Base and scope

- Approved base: `6afcfe697ceebfe2ebfd2edbd6030815e005a2bd`.
- Branch: `feat/frontend-f2c-treatment`, already present at the approved base when work began.
- Frontend-only: Java source, backend tests, Maven configuration and V1–V17 unchanged; no V18. No changes to treatment semantics, patient/supporter endpoints, clinical automation or SITB networking.
- No dependency/package/lockfile changes. Compilation does not execute `.tools/` helpers.
- Preserved/excluded unrelated untracked `frontend/public/brand/tbcall-logo.svg`, SHA256 `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`, and the untracked backend correction architecture. Local prompts, logs, screenshots, PDFs, caches and secrets excluded.

## Delivered workflow

Two SessionBoundary routes: `/cases/[caseId]/treatments` and `/treatments/[treatmentId]`. F2A case detail gains the contextual `Pengobatan` link. No global treatment queue.

Explicit TB_OFFICER + TREATMENT_READ gates both routes. All action/read permissions are independent: TREATMENT_WRITE, ADHERENCE_READ/ADHERENCE_RECORD, FOLLOW_UP_READ/FOLLOW_UP_WRITE, ADVERSE_EVENT_READ/ADVERSE_EVENT_WRITE and OUTCOME_READ/OUTCOME_WRITE. LAB_REQUEST_READ controls neutral laboratory links. CASE_READ controls the existing case request and link; without that scope the treatment route still opens, while case-dependent start/outcome are unavailable because status/category cannot be safely inferred. Child edit/completion and outcome require their readable projections, not artificial enriched response data.

Episode start requires ACTIVE case and no visible PLANNED/ACTIVE/PAUSED treatment. Live regimen choices match the actual case category, live drug/outcome catalogs are never hard-coded, and a missing matching catalog has no invented fallback. The user explicitly fills 1–20 numbered drug groups. No regimen auto-composition, dose/frequency/phase/duration/eligibility recommendations. Structural decimal, date, ordering and trimmed duplicate-tuple validation mirrors the backend; case-sensitive free-text phases are retained. Start has no ETag and navigates to the returned treatment ID after invalidation.

Detail displays backend drug snapshots, metadata and independently gated evidence/children/outcome. Metadata PATCH is dirty-only with explicit null clears and the actual treatment GET ETag. Immutable regimen/start/status/drugs/owner fields are never sent. Dose recording uses no ETag, live staff options and explicit dates. Paginated evidence remains separate, including contradictory same-day reports; counts are counts of reports. Duplicate actor/day conflicts refetch and require review without overwrite/replay.

Follow-up schedule uses the actual treatment ETag and active assigned facility options (blank delegates default to backend); success awaits detail refetch because the parent version advances. Completion requires SCHEDULED, ACTIVE treatment and the assigned facility in current active assignments; it uses quoted followUp.version and explicit time/weight/narrative. Adverse creation requires ACTIVE and no ETag, with explicit serious boolean. Adverse updates remain available after closure, use quoted adverse.version, send only dirty mutable fields and preserve unchanged timestamp precision/offset. No causality/regimen inference.

Outcome requires ACTIVE treatment/case, no existing outcome, read/write permissions, live code/date and explicit closure confirmation. It uses the actual treatment ETag, refetches detail/context and invalidates case detail/episode lists. No outcome is inferred and a second action is suppressed. Laboratory links use neutral sequence labels and existing routes without interpretation.

## Isolation, safety and implementation judgments

All treatment keys begin `["treatment", userId, ...]`, including case context; queryFns consume AbortSignal. Commands live outside the generic mutation cache, snapshot the full actor, abort on unmount and ignore late previous-account successes/errors/refetch/navigation. Browser abort is not a claim of server rollback. SessionBoundary actor changes clear/remount editors using the existing F1 session machinery.

Conflict drafts are retained through authoritative refetch and cannot submit again until explicit review. SOURCE_AUTHORITY_CONFLICT locks the mounted save while reads/navigation remain available. Errors show safe Indonesian messages only, never arbitrary backend prose. No clinical storage, logs, history/query state, document metadata, extra patient requests or patient data in global chrome.

The treatment-local datetime serializer follows the established F2B implementation, tested independently against invalid calendars and nonexistent/ambiguous DST times. Browser timezone is explicit and not assumed to be facility timezone. Local dates stay YYYY-MM-DD, explicit timestamps become ISO instants; unchanged adverse timestamps stay exact or are omitted in dirty-only patches.

The approved architecture supplied the design and scope. Native implementation followed contract tests, workflow tests, session/conflict/privacy regressions and full gates. No general CRUD framework, workflow redesign or backend contract workaround was introduced.

## Tests and exact gate results

Baseline: 298 tests in 19 files passed. New contract RED: 13 failures for missing treatment modules; workflow RED: 30 failures for missing screens. Initial focused GREEN: 71/71. The final matrix has **82 added tests in four test files**, plus two fixture/harness files:

- 18 contract tests: strict DTO/reference validation, nullable projections, forbidden extra payload, child versions, dirty-only/null-clear mapping, exact unchanged adverse timestamps, 0/1/20/21 drug bounds, duplicate/date/dose/frequency rules, phase dates/case-sensitive text, adverse structure and explicit closure.
- 30 workflow tests: contextual list/start, open-state suppression, no auto-composition, actual parent ETags, independent actor/action/read gates, schedule version refetch, child completion facility/ETag, post-closure adverse updates, creation without ETags, dose conflict/pagination, explicit outcome, source lock and neutral lab links.
- 12 session tests: all five query types use actor keys/signals, late old GET, late metadata/start success/error commands, clinical privacy/mutation-cache checks and malformed null-category reference response.
- 22 hardening tests: contextual link isolation, missing case/read scopes, terminal treatment states, existing outcome, missing catalog/parent ETag, 20 accessible drug groups, conflict review/draft retention, DST/calendar handling separate contradictory evidence and unnecessary historical case-request suppression.

An initial full run had 378 passes and one five-second timeout in the 20-group drug-editor accessibility test under concurrent Windows load. That test alone now has a 15-second allowance, retaining every assertion; the final full run passes. A temporary invalid fixture actor ID was corrected to a real UUID rather than weakening response validation. Final inspection also added a RED/GREEN regression ensuring historical treatment detail does not request unnecessary case context: detail now fetches case status only for ACTIVE treatments with CASE_READ and outcome read/write permissions. Its simulated case 403 checks resilience, without claiming transfer alone always causes that response. No failing test remains.

All commands below ran from `frontend/`:

```text
pnpm run lint
$ eslint . --max-warnings=0
Exit code: 0 (0 errors, 0 warnings)

pnpm run typecheck
$ next typegen && tsc --noEmit
Types generated successfully
Exit code: 0

pnpm test
Test Files  23 passed (23)
Tests       380 passed (380)
Start at    18:15:15
Duration    26.11s
Exit code: 0

pnpm run build
Next.js production build completed successfully
Routes include /cases/[caseId]/treatments and /treatments/[treatmentId]
Exit code: 0
```

Verification date: 2026-10-07, Asia/Jakarta. Exact test total is 298 existing + 82 new = 380, all passing.

Independent read-only review: no actionable findings. Reviewed contracts, permissions, parent/child ETags, dirty patches, timestamp precision, session races, conflicts/privacy, state eligibility and protected backend scope. Reviewer also reviewed the historical-request correction and documentation drafts. Reviewer did not execute gates, perform live-backend/browser smoke testing or publish commits; the executor verified the gates and final manifest. Live-backend smoke testing was not performed because no provisioned accounts were supplied. No auth weakening or invented credentials.

## Changed-file manifest

1. `README.md`
2. `frontend/README.md`
3. `docs/FRONTEND_F2C_TREATMENT.md`
4. `docs/FRONTEND_F2C_REPORT.md`
5. `docs/architecture/TBCall_Frontend_v1.3_F2C_Treatment.md`
6. `frontend/features/clinical-intake/components/case-detail.tsx`
7. `frontend/app/cases/[caseId]/treatments/page.tsx`
8. `frontend/app/treatments/[treatmentId]/page.tsx`
9. `frontend/features/treatment/api.ts`
10. `frontend/features/treatment/schemas.ts`
11. `frontend/features/treatment/types.ts`
12. `frontend/features/treatment/queries.ts`
13. `frontend/features/treatment/permissions.ts`
14. `frontend/features/treatment/etag.ts`
15. `frontend/features/treatment/time.ts`
16. `frontend/features/treatment/use-command.ts`
17. `frontend/features/treatment/forms/values.ts`
18. `frontend/features/treatment/forms/mappers.ts`
19. `frontend/features/treatment/forms/fields.tsx`
20. `frontend/features/treatment/components/treatment-boundary.tsx`
21. `frontend/features/treatment/components/treatment-feedback.tsx`
22. `frontend/features/treatment/components/treatment-form.tsx`
23. `frontend/features/treatment/components/case-treatments.tsx`
24. `frontend/features/treatment/components/treatment-detail.tsx`
25. `frontend/features/treatment/components/treatment-editor.tsx`
26. `frontend/features/treatment/components/dose-evidence.tsx`
27. `frontend/tests/treatment-fixtures.ts`
28. `frontend/tests/treatment-harness.tsx`
29. `frontend/tests/treatment-contracts.test.ts`
30. `frontend/tests/treatment-workflow.test.tsx`
31. `frontend/tests/treatment-session.test.tsx`
32. `frontend/tests/treatment-hardening.test.tsx`

## F2D handoff

No missing treatment backend contract or architectural blocker was found. Provisioned-account smoke testing remains an operational verification step. F2D referral/contact/TPT and later monitoring, portals, administration and SITB integration require separate tasks; none began in F2C.
