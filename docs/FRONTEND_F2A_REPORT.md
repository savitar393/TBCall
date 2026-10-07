# Frontend F2A checkpoint report

## Base and boundaries

- Approved base: `863ca8c23b15dd57f3fc85db9618a75537212609`.
- User-prepared branch: `feat/frontend-f2a-clinical-intake`.
- Frontend only. Java/backend source, backend tests/security and V1–V17 are unchanged; no V18. Backend tests were not run.
- Existing backend read contracts support the entire approved scope. No missing backend contract or schema conflict was found.
- Existing untracked `frontend/public/brand/tbcall-logo.svg` is preserved/excluded (SHA256 `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`). No prompts/PDFs/logs/screenshots/caches/secrets are committed.

## Delivered behavior

Six routes: `/patients`, `/intake/new`, `/patients/[patientId]`, `/registrations/[registrationId]`, `/diagnoses/[diagnosisId]`, `/cases/[caseId]`. Every route uses F1 SessionBoundary plus explicit TB_OFFICER and its independent permission codes. Navigation never infers grants from a role; PATIENT with PATIENT_READ does not see officer intake.

Worklist uses safe backend-masked NIK/BPJS, sex/birth date and current registration/case summaries, responsive cards, live status filters, assigned-facility filters, validated memory-only sensitive filters, pagination/loading/empty/error/clear states.

Wizard selects only active assigned `/me` facilities (preselect exactly one), validates new demographics and registration inputs, or resolves exact existing identity plus name/date confirmation. It renders masked confirmation and retains/reuses original exact input only in wizard memory. Path switches, successful registration, unmount and session/context changes clear it; pending resolves are aborted and late results ignored. Refresh requires reconfirmation. No fuzzy match or identity-only ID bypass exists.

Four detail GETs use strict response schemas and server ETag headers. Explicit request mappers send only dirty editable fields; omission means unchanged and null means clear. Citizenship/birth-date partners are consistent; decimals remain form strings until validation/conversion. Missing ETag blocks save; version is never used to invent a header. Optimistic/state conflicts refetch current-user queries, retain dirty values and require explicit review/resubmission. Source-authority conflict locks that mounted form. No write replay or raw error prose.

Registration diagnoses recover statelessly through GET list/detail. Creation uses current registration ETag and refetches its state. REFERRED searches active facilities after2characters with350ms debounce, displays region codes and excludes current registration facility. Changing away explicitly clears destination; switching back requires reselection. Backend remains final validator.

Case confirmation explicitly selects only recovered TREAT_HERE/REFERRED diagnoses, using live catalogs and current registration ETag. Category/resistance/measurements/outcomes are never inferred. Success navigates to case UUID; case edit has no status transitions/treatment UI.

Every clinical query key includes current user ID and every query consumes AbortSignal. Session context changes remount clinical drafts. Commands guard late results against the original `/me` snapshot before rendering, cache invalidation or navigation. Mutation inputs never enter TanStack mutation cache. No clinical browser persistence, logging, page query/history state, metadata or global chrome.

Partial permissions are respected: directories need PATIENT_READ; catalog-dependent forms explain its absence without issuing forbidden reads. Diagnosis referral search needs authorized REGISTRATION_READ facility context; existing non-destination edits remain available. No read permission is substituted with a write grant.

## Changed-file manifest

Frontend:

- Six new route page files under `frontend/app/{patients,intake/new,registrations,diagnoses,cases}`.
- Modified `frontend/components/app-shell.tsx` and `frontend/tests/foundation-ui.test.tsx` for actual officer navigation.
- New focused `frontend/features/clinical-intake`: `api.ts`, `schemas.ts`, `types.ts`, `queries.ts`, `permissions.ts`, `use-command.ts`; forms `values.ts`, `mappers.ts`, `fields.tsx`, `patient-fields.tsx`, `registration-fields.tsx`, `diagnosis-fields.tsx`, `case-fields.tsx`; components `clinical-boundary.tsx`, `query-state.tsx`, `clinical-feedback.tsx`, `record-form.tsx`, `record-display.tsx`, `patient-worklist.tsx`, `registration-wizard.tsx`, `patient-detail.tsx`, `registration-detail.tsx`, `diagnosis-detail.tsx`, `case-detail.tsx`, `facility-search.tsx`.
- Eight new clinical test suites plus `clinical-fixtures.ts` and `clinical-harness.tsx` support.
- Updated `frontend/README.md`.

Docs: updated root `README.md`; this report; `docs/FRONTEND_F2A_CLINICAL_INTAKE.md`; supplied `docs/architecture/TBCall_Frontend_v1.1_F2A_Clinical_Intake.md`; `docs/superpowers/plans/2026-10-07-frontend-f2a.md`.

Exact paths (49 files):

```text
README.md
docs/FRONTEND_F2A_CLINICAL_INTAKE.md
docs/FRONTEND_F2A_REPORT.md
docs/architecture/TBCall_Frontend_v1.1_F2A_Clinical_Intake.md
docs/superpowers/plans/2026-10-07-frontend-f2a.md
frontend/README.md
frontend/app/cases/[caseId]/page.tsx
frontend/app/diagnoses/[diagnosisId]/page.tsx
frontend/app/intake/new/page.tsx
frontend/app/patients/[patientId]/page.tsx
frontend/app/patients/page.tsx
frontend/app/registrations/[registrationId]/page.tsx
frontend/components/app-shell.tsx
frontend/features/clinical-intake/api.ts
frontend/features/clinical-intake/components/case-detail.tsx
frontend/features/clinical-intake/components/clinical-boundary.tsx
frontend/features/clinical-intake/components/clinical-feedback.tsx
frontend/features/clinical-intake/components/diagnosis-detail.tsx
frontend/features/clinical-intake/components/facility-search.tsx
frontend/features/clinical-intake/components/patient-detail.tsx
frontend/features/clinical-intake/components/patient-worklist.tsx
frontend/features/clinical-intake/components/query-state.tsx
frontend/features/clinical-intake/components/record-display.tsx
frontend/features/clinical-intake/components/record-form.tsx
frontend/features/clinical-intake/components/registration-detail.tsx
frontend/features/clinical-intake/components/registration-wizard.tsx
frontend/features/clinical-intake/forms/case-fields.tsx
frontend/features/clinical-intake/forms/diagnosis-fields.tsx
frontend/features/clinical-intake/forms/fields.tsx
frontend/features/clinical-intake/forms/mappers.ts
frontend/features/clinical-intake/forms/patient-fields.tsx
frontend/features/clinical-intake/forms/registration-fields.tsx
frontend/features/clinical-intake/forms/values.ts
frontend/features/clinical-intake/permissions.ts
frontend/features/clinical-intake/queries.ts
frontend/features/clinical-intake/schemas.ts
frontend/features/clinical-intake/types.ts
frontend/features/clinical-intake/use-command.ts
frontend/tests/clinical-contracts.test.ts
frontend/tests/clinical-details.test.tsx
frontend/tests/clinical-fixtures.ts
frontend/tests/clinical-harness.tsx
frontend/tests/clinical-navigation.test.tsx
frontend/tests/clinical-safety.test.tsx
frontend/tests/clinical-session.test.tsx
frontend/tests/clinical-transitions.test.tsx
frontend/tests/clinical-wizard.test.tsx
frontend/tests/clinical-worklist.test.tsx
frontend/tests/foundation-ui.test.tsx
```

No dependency/package/lockfile changes or source generators are required. Ignored Next types/build output, node_modules, incremental caches and `.tools/` diagnostic logs remain development artifacts.

## Tests and verification

Baseline: **85 tests** passed. Added **102 tests** across eight suites, totaling **187**. Existing foundation navigation test now recognizes the implemented authorized `/patients` link.

| Suite | Added count | Regression coverage |
| --- | ---: | --- |
| clinical-contracts | 26 | Eight strict full/nested response schemas, masking, dates, dirty/null identity/date/decimal/diagnosis/case mappings, exact confirmation, actor gate, signal/ETag/no replay |
| clinical-navigation | 9 | Officer navigation, missing creation grants, six non-officer role isolations |
| clinical-session | 9 | Actual deferred GET/account race plus all eight query factories' user keys/signals |
| clinical-worklist | 7 | Masked cards, summaries, in-memory filter/clear, bounds, direct actor denial, empty/pagination |
| clinical-wizard | 15 | New/existing payloads, exact reuse, path/reset/reconfirmation, assigned facilities, missing grants, safe errors, late resolve, unmount/account clearing, manually corrected ambiguity, draft back/forward preservation, successful creation despite catalog failure, actual path-change draft clearing |
| clinical-details | 21 | Four ETag/dirty edits, identity/date null pairs, stateless recovery, stale refetch/preservation/manual review, source lock, clinical state, edit permissions/status, detail privacy, missing ETag, all four catalog-error conflict recovery paths, authority lock across independent catalog failure |
| clinical-transitions | 6 | Diagnosis creation/state refetch, referral search/exclusion/clear, explicit eligible case selection, no inference, missing read permission |
| clinical-safety | 9 | Actual storage/log/history/metadata spies, late PATCH/account result, inactive historical labels, partial permissions, read-only scope, safe retry, destination reselection, no clinical defaults |

TDD evidence: initial navigation missing-link failure;26 contract assertions failed before implementation;7 worklist,8 initial wizard,16 detail and6 transition assertions failed before delivery. In-flight clearing regressions pass. A recoverable identity ambiguity regression failed because all409 responses initially required clinical-state review; narrowing to the explicit CLINICAL_STATE_CONFLICT/optimistic codes made it pass. Import/router/label test-harness issues were corrected before relying on regression outcomes.

Final suite: `pnpm test` **13 test files passed,187 tests passed,0 failures**, duration20.67s, start11:03:58 on2026-10-07 (Asia/Jakarta). All four exact delivery commands completed with exit0 after the lifecycle fixes.

No real-backend browser smoke was performed: no separately provisioned account was supplied. Backend DTO/controller contracts were inspected read-only; UI transport tests exercise complete contract-shaped fixtures and actual components/session/query/request mappers. No fake production credentials were created or security weakened.

## Final verification and publication

The single independent read-only review found no Critical or Minor issues and two Important lifecycle defects: catalog-error unmount discarded drafts/command state, and ordinary wizard back/forward navigation discarded registration inputs. Both were confirmed and fixed in one pass. Six initial regressions failed before the fixes (28 existing focused tests passed); all34 focused tests then passed. Two additional boundary regressions cover authority-lock survival and actual patient-path draft clearing. No review findings were declined; no Minor items were deferred. No second review was requested.

Editors now keep cached reference data and mounted forms through catalog failures, show safe retry feedback, and block relevant submission/review acknowledgement until recovery. Successful registration still clears exact confirmation and navigates after a catalog failure. Registration draft values remain in wizard memory across same-patient back/forward navigation, and are erased on actual path changes, reconfirmation/reset, success and session/unmount boundaries.

| Exact command from frontend/ | Result |
| --- | --- |
| `pnpm run lint` | Exit0; `eslint . --max-warnings=0`; no warnings/errors |
| `pnpm run typecheck` | Exit0; route types generated; `tsc --noEmit` passed |
| `pnpm test` | Exit0; **13 test files passed;187 tests passed;0 failures**; start11:03:58, duration20.67s |
| `pnpm run build` | Exit0; Next.js16.3.8; compiled705ms; TypeScript2.8s;8 pages generated; all six F2A routes included |

Verified against the approved base: Java/backend source, backend tests, security, Maven configuration and all17 migrations remain unchanged; no V18 exists. Git diff whitespace checks pass. The49-file manifest excludes the unrelated logo and ignored diagnostic/build artifacts. Publication SHA is returned after the authorized commit/push and remote verification, without a circular report self-reference.

## Execution judgments

1. Retain prepared Windows feature checkout and native durable ledger for the supplied approved implementation, without repeating design/worktree consent. Cost if wrong: process evidence requires manual checking.
2. Apply both Important review findings in one fix pass and preserve mounted editors rather than weakening conflict guards. Cost if wrong: stale reference choices could be submitted; submissions and review acknowledgement remain blocked while catalog recovery fails.
3. Keep ordinary same-patient wizard registration drafts only in React memory; clear on actual path/reconfirmation/reset/session/success boundaries. Cost if wrong: inputs could carry to another patient; regression verifies path changes erase the draft.
4. Reuse existing read contracts and respect their independent PATIENT_READ/REGISTRATION_READ dependencies. No backend contract change is needed. Cost if wrong: partial-grant accounts have fewer editable options; the UI explains the read prerequisite and never issues unauthorized reads.
5. Use supplied contract fixtures for automated UI verification; no provisioned-account live-backend smoke was available. Cost if wrong: deployed transport/configuration issues may require a separate smoke check.
6. Follow the explicit user authorization to commit and push the prepared feature branch without a new integration menu or PR. Preserve the user checkout/logo and leave development artifacts ignored. Cost if wrong: branch publication is visible at the verified user repository; manifest and remote are checked before publication.

## Before F2B

No additional backend contract was needed. F2B remains a separately approved laboratory UI checkpoint. Provisioned-account real-backend browser verification and deployed HTTPS/secure-cookie settings remain deployment checks. No laboratory/treatment/referral-transfer/contact/TPT/monitoring/patient/supporter/admin UI or SITB networking is included.
