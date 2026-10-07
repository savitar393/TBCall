# Frontend F2A Clinical Intake Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with test-driven development and one independent final read-only review.

**Goal:** Deliver the approved TB officer patient → registration → diagnosis → case UI with existing backend contracts.

**Architecture:** Focused frontend/features/clinical-intake module: strict response schemas, explicit input mappers, user-scoped abortable queries, RHF forms, and six protected routes. Existing F1 session, native API transport and shadcn controls remain the foundation.

**Tech Stack:** Next App Router, React, TypeScript, TanStack Query, RHF, Zod, Vitest/RTL/user-event; Node24/pnpm11.19.0.

**Spec:** docs/architecture/TBCall_Frontend_v1.1_F2A_Clinical_Intake.md.

## Global constraints

- Approved base863ca8c23b15dd57f3fc85db9618a75537212609; prepared feature branch feat/frontend-f2a-clinical-intake.
- No Java/backend tests/security changes, V1–V17 changes or V18; stop for a genuinely missing backend contract. No F2B UI or SITB networking.
- TB_OFFICER is an explicit actor gate; all permissions come independently from /me. All routes use SessionBoundary.
- Clinical query keys begin [clinical,userId]; every query consumes AbortSignal. No clinical browser persistence, logging, sensitive page URL state or metadata.
- Use live active catalogs, assigned registration facilities, backend-masked worklist/resolve identities. No catalog/clinical inference.
- ETags are server headers only. PATCH explicit dirty inputs; omit unchanged, null clears. Conflicts refetch without replay, preserve form values; authority conflict locks that form.
- Existing-patient exact confirmation exists only in wizard memory, reused on final creation and cleared on success/path switch/account change/unmount.
- Required final gates from frontend: pnpm run lint; pnpm run typecheck; pnpm test; pnpm run build. Commit/push only relevant frontend/docs files, excluding existing untracked logo.

## Review focus

- Account/context changes while GET or POST remains pending must not publish prior-account data, navigation or form errors.
- Refetched state after conflict must not reset dirty input, resurrect stale destination fields or replay a mutation.
- Historical inactive reference values remain visible in read projections but cannot be offered as active options or sent unchanged in a dirty PATCH.
- Permission combinations must gate actual requests and forms as well as navigation, with no hidden fallback ID discovery.
- Wizard path changes must erase exact confirmation even if an earlier resolve completes later; facility assignment is never derived from global search.

## Task 1: Typed contracts, permissions and query isolation

**Files:** features/clinical-intake/{schemas,types,api,queries,permissions}.ts; forms/{values,mappers}.ts; tests/clinical-contracts.test.ts; tests/clinical-session.test.tsx; components/app-shell.tsx.
**Interfaces:** clinicalKeys(userId), query factories(userId,id/filters), clinicalApi.{patients,patient,registration,diagnoses,diagnosis,tbCase,references,facilities,resolve,createRegistration,createDiagnosis,confirmCase,patchPatient,patchRegistration,patchDiagnosis,patchCase}; canClinical(user,...permissions); patient/registration/diagnosis/case defaults, validated input and dirty patch mappers.

- [x] Add failing behavior tests for exact schemas, dirty/null mappings, permissions, aborted user-scoped GET and late old-account response isolation.
- [x] Implement explicit schemas/transport/mappers/query options and role+permission navigation; no mutation caching of sensitive inputs.
- [x] Verify focused tests then pnpm test; record RED/GREEN and baseline counts.

## Task 2: Worklist and registration wizard

**Files:** components/{clinical-boundary,query-state,patient-worklist,registration-wizard}.tsx; forms/{fields,patient-fields,registration-fields}.tsx; app/patients/page.tsx; app/intake/new/page.tsx; tests/clinical-worklist.test.tsx; tests/clinical-wizard.test.tsx.
**Interfaces:** PatientWorklist(), RegistrationWizard(); ClinicalBoundary(permission[],children) remounts on session context; safe memory-only command hook manages pending/errors/current actor guards.

- [x] Add failing UI tests for masked worklist/filter bounds/mobile/pagination; new registration and exact resolve/reconfirmation/clearing/assigned facilities.
- [x] Implement validated in-memory worklist filters and semantic three-step wizard, using live catalogs and explicit creation mappers.
- [x] Verify focused tests and full frontend suite; record outcomes.

## Task 3: Versioned details, diagnoses and cases

**Files:** components/{patient-detail,registration-detail,diagnosis-detail,case-detail,facility-search,record-form}.tsx; forms/{diagnosis-fields,case-fields}.tsx; four dynamic route page.tsx files; tests/clinical-details.test.tsx; tests/clinical-transitions.test.tsx.
**Interfaces:** detail components({id}); versioned RHF forms retain dirty values when latest data refetches, use latest GET ETag only after explicit conflict review; diagnosis creation/case confirmation consume registration ETag and recovered diagnosis list.

- [x] Add failing tests for stateless list/detail recovery, server ETag/dirty PATCH/null clears/conflicts/no replay/source lock, referral search/exclusion/clear and explicit eligible diagnosis selection.
- [x] Implement all four detail/edit routes and registration create/confirm actions; invalidate current-user related clinical queries only, never copy responses between caches.
- [x] Verify focused tests and full suite, including privacy/session/permission cases.

## Task 4: Documentation, review and publication

**Files:** docs/FRONTEND_F2A_CLINICAL_INTAKE.md; docs/FRONTEND_F2A_REPORT.md; supplied architecture; README.md; frontend/README.md; this ledger.

- [x] Complete docs and full requirement matrix; independently review whole branch with the executing-plans reviewer.
- [x] Fix material findings with RED/GREEN regressions; run all four exact required commands and inspect their results.
- [x] Verify protected backend/migrations/tests unchanged and unrelated asset preserved; prepare the explicit49-file publication manifest.
- Publication: authorized commit/push follows the final gates; compare remote SHA and return it in the final report.

## Execution ledger

- Preflight: HEAD matches approved base; user-prepared feature branch. No AGENTS.md. Supplied architecture untracked. Unrelated logo preserved/excluded, SHA2565C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696.
- Ruling: implement supplied approved design directly on prepared Windows feature checkout with this native durable ledger, preserving prior workflow; no repeated design/worktree consent. Cost if wrong: process evidence requires manual checking.
- Shared interfaces: Task2/3 consume Task1 strict DTOs/query factories/mappers; both use Task2 clinical boundary and request guard; exact names above remain the contract. No conflict found.
- Baseline environment: Node24.15.0; pnpm11.19.0 pinned in frontend. Sandbox Vitest spawn EPERM; rerun with authorized child-process access, no application workaround.
- Baseline:85 frontend tests passed. Task1 navigation RED1 expected missing link; contract RED26 expected missing module assertions; GREEN35 plus9 session/query tests. Full suite129/129 passed, including actual late old-user GET cancellation/cache isolation.
- Task2: worklist RED7 → GREEN7; wizard RED8 → GREEN8; later path/unmount/account/ambiguity coverage12. Temporary Vitest import/navigation harness and required-label selectors corrected before using RED/GREEN evidence.
- Task3: details RED16 and transitions RED6 → GREEN22. Explicit server ETag/dirty/null mappings, conflict refetch/preservation/manual review, authority lock, stateless diagnosis recovery, debounced referral search and eligible manual confirmation verified.
- Additional concrete risk: identity ambiguity409 initially locked resolve as clinical-state conflict; regression failed, narrow explicit optimistic/CLINICAL_STATE_CONFLICT handling made it pass without changing backend semantics.
- Privacy/safety suite9 verifies real no-storage/no-log/no-history/no-metadata side effects, late PATCH guards, inactive-label handling and partial permissions. Full frontend179/179 across13 files passed13.27s (10:50:16); lint and typecheck also passed. No code/backend test or migration change.

- Final independent review:0 Critical,2 Important,0 Minor, no declined judgments. Catalog-error form unmount and same-patient wizard draft loss both confirmed; fixed in one pass. Six regression tests RED (28 existing focused tests passed) → GREEN34. Added2 boundary regressions for authority lock through independent catalog failure and actual patient-path draft clearing. No second review or deferred Minor item.
- Final exact gates after fixes: pnpm run lint exit0; pnpm run typecheck exit0; pnpm test exit0,13 files/187 tests passed,0 failures, start11:03:58,20.67s; pnpm run build exit0, Next16.3.8, all six F2A routes dynamic.
- Final execution rulings and costs are listed exhaustively in docs/FRONTEND_F2A_REPORT.md: native prepared checkout; both lifecycle fixes; memory-only same-patient draft retention/reset boundaries; explicit read dependencies; no provisioned-account live smoke; authorized branch push without a new menu/PR. No review finding declined.