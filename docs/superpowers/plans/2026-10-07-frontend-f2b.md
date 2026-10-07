# Frontend F2B Laboratory Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with TDD and one independent final read-only reviewer.

**Goal:** Deliver the approved shared laboratory queue and contextual source/testing workflows using existing contracts.
**Architecture:** Focused features/laboratory module with strict schemas, explicit inputs, abortable user-scoped queries and mounted memory-only forms. Reuse F1 session/API and existing clinical owner/directory queries without reverse feature dependencies.
**Tech Stack:** Next/React/TypeScript, TanStack Query, RHF/Zod, shadcn, Vitest/RTL/user-event; Node24/pnpm11.19.0.
**Spec:** docs/architecture/TBCall_Frontend_v1.2_F2B_Laboratory.md.

## Global constraints

- Approved base e13e3e3c934298d9a76827b40f2d934d21eb6bfe; prepared branch feat/frontend-f2b-laboratory.
- Frontend/docs only; preserve all Java, backend tests, V1–V17 and laboratory semantics. No F2C or SITB networking; stop for genuinely missing contracts.
- Actor roles plus independently granted permissions; facility scope uses /me and request projections; no role-derived grants.
- Laboratory keys [laboratory,userId,...], AbortSignal on every GET, original /me snapshot guards every command; no mutation cache or clinical persistence/logs/history/metadata/global chrome.
- Live laboratory references; exact owner→reason relationship; explicit testing facility; no specimen/result catalog or clinical inference.
- Actual request response ETag for specimen/cancel; lab-only safe integer quoted child versions for receive/result/correction.
- Browser-local datetime serialization, visible timezone, no fabricated timestamps; correction omits test/specimen IDs.
- Conflict refetch retains mounted drafts, manual review, no replay; authority lock persists across background errors.
- Preserve/exclude existing untracked logo. Four exact pnpm gates, relevant commit/push only.

## Review focus

- Background reference/detail errors must preserve drafts, locks and successful command cleanup/navigation.
- Conflict refetch removing/replacing an eligible specimen/result must retain draft but block obsolete commands rather than resetting authority.
- Null lineage must remain distinguishable from no selection; hidden result content must never be recovered or inferred.
- Dual actors and disjoint requesting/testing facility assignments must show only independently scoped actions.
- Timezone/DST invalid local times and unsafe child numeric versions must never produce incorrect serialized commands.

## Task 1: Contracts, inputs and transport

**Files:** features/laboratory/{schemas,types,api,queries,permissions,time,etag}.ts; forms/{values,mappers}.ts; tests/laboratory-{fixtures,contracts}.ts.
**Interfaces:** labApi references/requests/request/create/specimen/cancel/receive/result/correct; labQueries references/requests/request; canLabRead/canLabSource/canLabTesting; labEtagFromVersion; localDateTimeToIso/isoToLocalDateTime; strict DTOs and explicit input mappers.
- [x] Write failing schema/mapper/version/time/permission/transport tests.
- [x] Implement contracts and inputs; focused GREEN and full suite.

## Task 2: Queue, navigation and contextual creation

**Files:** components/{laboratory-boundary,request-queue,request-create,testing-facility}.tsx; forms/request-fields.tsx; app four routes; app-shell; clinical registration/case plain action links; tests/laboratory-{queue,create,navigation}.test.tsx.
**Interfaces:** LaboratoryBoundary(mode,children), RequestQueue(), RequestCreate({ownerType,id}); consume task1 and existing clinical queries, no clinical imports of lab internals.
- [x] RED real UI navigation/filter/owner/facility payload tests.
- [x] Implement queue/create and exact gates; verify focused/full suites.

## Task 3: Request detail and source/testing commands

**Files:** use-command.ts; components/{request-detail,lab-form,lab-feedback,request-display}.tsx; forms/{specimen,receive,result}-fields.tsx; tests/laboratory-{workflow,session,safety}.test.tsx.
**Interfaces:** useLabCommand(requestId?) with snapshot/abort/conflict lock; LabForm(initial,schema,save,available) retains dirty inputs; RequestDetail({id}) with stable action editors.
- [x] RED request/child If-Match, receipt, exact lineage, corrections, conflicts, late-account and privacy tests.
- [x] Implement source/testing flows with state/facility gates; verify focused/full suites.

## Task 4: Delivery

**Files:** guide/report/approved architecture/root+frontend README/this ledger.
- [x] Complete requirement matrix; run one independent review, fix material findings with RED/GREEN.
- [x] Run exact pnpm lint/typecheck/test/build, verify protected boundaries and manifest, commit/push/remote SHA.

## Ledger

- Preflight: HEAD matches base, prepared feature branch; supplied architecture untracked, unrelated logo preserved. No backend contract gap found in supplied DTOs.
- Ruling: implement the supplied approved design on the prepared Windows checkout with a native durable ledger; no repeated design/worktree authorization. Cost if wrong: process evidence requires manual checking.
- Ruling: retain one final independent review and native command logs rather than Unix-only orchestration helpers; user explicitly requests commit/push. Cost if wrong: evidence must be audited from the ledger and logs.
- Interface preflight: Task1→Task2 strict labApi/query/reference/input DTOs match queue/create consumers; Task1→Task3 versions/inputs/permission helper signatures match source/testing commands; Task2→Task3 shared LabForm/useLabCommand retain mounted drafts across request refresh. No contract conflict.
- Task1 complete: schema/mapper/time/version RED26, transport RED1; GREEN27; full `pnpm test`214/214. Native proxy prefix corrected from transport evidence.
- Task2 complete: queue RED15/create RED13; GREEN28. Remote-choice regression exposed DOM option insertion ordering, fixed by selection after render. Typecheck passed. Integrated full suite293/293.
- Task3 complete: workflow RED33; GREEN33+session7. Hardening RED4 (invalid local dates2/catalog removal1/discard1), GREEN11; full suite293/293; additional late-command error coverage included in final full gate. Lint/typecheck pass. All source/testing contract actions use existing endpoints.
- Task4: documentation matrix/manifest complete; independent review/fix and exact final gates completed; publication verified in final response.
- Final review: one independent gpt-6-astra read-only reviewer; Critical0/Important1/Minor0. DST fall-back/precision finding verified by three failing tests; one fix pass preserves unchanged original testedAt and rejects newly entered ambiguous local times. No repeat review.
- Final: Ruling: live-backend operation was set aside by reviewer — no provisioned live accounts/backend; contract-shaped UI/transport regressions are the available acceptance gate — cost if wrong: deployment behavior still requires a real smoke test.
- Final: Ruling: new backend behavior/F2C were set aside by reviewer — existing contracts inspected, authorized frontend-only scope remains binding — cost if wrong: later UI/integration requires separate approval and verification.
- Deferred minors: none.
- Final: fixed unchanged-correction DST/precision issue — narrative-only correction2variants and newly entered ambiguous-local-time regression RED3→GREEN3; focused47/47; full suite298/298 (19files,22.70s). Exact final lint/typecheck/build exit0. Java/backend tests/V1–V17 untouched. No new backend contract needed.
