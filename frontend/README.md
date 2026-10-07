# TBCall frontend - F1 foundation and F2A-F2E staff workflows

Next.js App Router frontend for the existing Spring Boot backend. F1 routes: `/login`, `/`, `/forbidden`. The dashboard shows the signed-in account's identity and access context from `/me`. F2A adds officer patient → registration → diagnosis → case intake using backend read contracts at commit `863ca8c23b15dd57f3fc85db9618a75537212609`.

## F2A clinical intake

Routes: `/patients`, `/intake/new`, `/patients/[patientId]`, `/registrations/[registrationId]`, `/diagnoses/[diagnosisId]`, `/cases/[caseId]`. Navigation/routes require the backend's explicit TB_OFFICER actor gate and independent permissions from `/me`; role names never imply grants. Forms use live catalogs, assigned registration facilities, exact transient identity confirmation, server ETags, dirty-only PATCH and explicit conflict review without replay. Queries are user-scoped, abortable and memory-only; no clinical browser persistence or sensitive page query/history/metadata/log state.

See [F2A guide](../docs/FRONTEND_F2A_CLINICAL_INTAKE.md), [architecture](../docs/architecture/TBCall_Frontend_v1.1_F2A_Clinical_Intake.md) and [checkpoint report](../docs/FRONTEND_F2A_REPORT.md). Java source, backend tests and V1–V17 are untouched.

## F2B laboratory

Routes: `/laboratory`, `/laboratory/requests/[requestId]`, `/laboratory/requests/new/registration/[registrationId]`, `/laboratory/requests/new/case/[caseId]`. The shared queue requires officer/lab staff plus LAB_REQUEST_READ. Officer source actions and lab testing actions independently check permissions and assigned requesting/testing facilities. Result rendering requires LAB_RESULT_READ. Creation uses the existing contextual owner, live reasons/test types and explicit testing facility selection. Specimen/cancel use actual request ETags; child receive/result/correction use the laboratory-only published numeric versions. Writes refetch authoritative state, preserve drafts on conflicts, require manual review and never replay.

See [F2B guide](../docs/FRONTEND_F2B_LABORATORY.md), [architecture](../docs/architecture/TBCall_Frontend_v1.2_F2B_Laboratory.md) and [report](../docs/FRONTEND_F2B_REPORT.md). Contracts use backend base `e13e3e3c934298d9a76827b40f2d934d21eb6bfe`; strict schemas, per-user abortable queries and snapshot-guarded memory-only commands preserve privacy. Browser timezone is explicit. Backend/tests/V1–V17 remain unchanged. Later UI require separate approval.

## F2C staff treatment

Routes: `/cases/[caseId]/treatments` and `/treatments/[treatmentId]`, with a contextual `Pengobatan` link from case detail. Explicit TB_OFFICER + TREATMENT_READ and independent action permissions protect live-catalog start, metadata editing, separate dose evidence, follow-up schedule/complete, adverse create/edit and explicitly confirmed final outcome. Actual treatment ETags and published child versions are kept separate; commands await refetch and never retry or infer clinical decisions. Backend base: `6afcfe697ceebfe2ebfd2edbd6030815e005a2bd`.

See [F2C guide](../docs/FRONTEND_F2C_TREATMENT.md), [architecture](../docs/architecture/TBCall_Frontend_v1.3_F2C_Treatment.md) and [report](../docs/FRONTEND_F2C_REPORT.md). All treatment queries are per-user and abortable; clinical drafts remain memory-only. Backend/tests/V1–V17 remain unchanged. F2D continuity is documented below; later workflows remain deferred.

## F2D staff continuity

Routes: `/referrals`, `/referrals/[referralId]`, `/cases/[caseId]/referrals/new`, `/cases/[caseId]/contacts`, `/contacts/[contactId]`, `/contact-investigations`, `/contact-investigations/[investigationId]`, `/preventive-treatments/[tptId]`. Explicit TB_OFFICER and independent referral/contact/TPT permissions protect live preparation, fixed pre-treatment destination, exact ACTIVE episode transfer, contact snapshots/exact identity linking, explicit investigation completion and clinician-controlled TPT start/edit/closure. Actual GET ETags, session-scoped abortable queries and guarded commands preserve concurrency/privacy; no clinical inference or automatic write replay.

See [F2D guide](../docs/FRONTEND_F2D_CONTINUITY.md), [architecture](../docs/architecture/TBCall_Frontend_v1.4_F2D_Continuity.md) and [report](../docs/FRONTEND_F2D_REPORT.md). Approved backend base: `584fdea9bbe420c771593d52e2028407c6738c9c`. Backend/tests/V1-V17 remain unchanged. F2E is documented below; portals, administration and SITB networking remain deferred.

## F2E staff monitoring, alerts and notifications

Routes: `/treatments/[treatmentId]/monitoring`, `/preventive-treatments/[tptId]/monitoring`, `/monitoring-plans/[planId]`, `/alerts`, `/alerts/[alertId]`, `/notifications`. Explicit TB_OFFICER and independent read/manage/acknowledge/resolve permissions protect manually entered plans/events, staff alerts and current-user IN_APP notifications. Live references, actual detail GET ETags, awaited refetches and manual conflict review preserve backend state and source authority. No schedule, due date or clinical decision is inferred. Queries and commands are isolated by account/context and stay in memory; notification refresh is explicit.

See [F2E guide](../docs/FRONTEND_F2E_MONITORING.md), [architecture](../docs/architecture/TBCall_Frontend_v1.5_F2E_Monitoring.md) and [report](../docs/FRONTEND_F2E_REPORT.md). Approved backend base: `24a922a067191f0788de444a054b2334355aac5e`. Backend/tests/V1–V17, scheduler/fanout and source-authority rules remain unchanged. F3/F4 and SITB networking remain deferred.

## Requirements and commands

Use Node.js 24.15–24.x and **pnpm 11.19.0**. The F2E verification runtime is Node.js 24.15.0. Use pnpm consistently; commit `pnpm-lock.yaml` when changing dependencies.

From the repository root on Windows:

```powershell
cd frontend
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. `.env.local` is ignored. The sole application setting is the **server-only** `TBCALL_BACKEND_URL`, an HTTP(S) origin such as `http://127.0.0.1:8080`, without credentials, a path, query or fragment. It must never be a `NEXT_PUBLIC_*` setting. Missing/invalid configuration or an unreachable backend produces safe problem JSON with HTTP 503.

Start the existing backend separately using its root README configuration. F1 does not start PostgreSQL or provision accounts. For local HTTP development, use the backend's existing `TBCALL_PRODUCTION=false` and `TBCALL_COOKIE_SECURE=false` settings; production requires HTTPS and secure cookies. Use a separately provisioned active account. Verification delivery/recovery and registration have no F1 screens.

Required checks, all from `frontend/`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Production:

```powershell
pnpm run build
pnpm start
```

`typecheck` runs Next route type generation before strict TypeScript checking, so a fresh clone needs no generated files or `.tools/` scripts. `build` also generates Next types. `next-env.d.ts` is Next's standard checked-in declaration entry; its generated `.next/types` imports are fulfilled by those commands. `.next/`, `node_modules/`, coverage, logs and TypeScript incremental caches are ignored.

`pnpm-workspace.yaml` explicitly allows only the pinned `unrs-resolver` native resolver's install bootstrap. Its age exception is limited to the pinned React/Vite plugin; it does not allow arbitrary package build scripts. All direct dependency versions are pinned in `package.json`; transitive versions are locked.

## Proxy and authentication

```text
Browser /api/tbcall/v1/...
  -> Next route handler
  -> TBCALL_BACKEND_URL/api/v1/...
```

The route handler accepts GET, POST, PATCH and DELETE, validates/encodes path segments and passes the original query to the fixed configured origin. It never follows upstream redirects. Only Cookie, Content-Type, Accept, X-XSRF-TOKEN, If-Match and X-Request-ID are forwarded. Status/body, Content-Type, ETag, X-Request-ID and independent Set-Cookie headers are preserved. Responses are `no-store`; cookies and bodies are never logged.

1. Bootstrap GET `/me` establishes the browser's XSRF cookie, including on an expected anonymous 401.
2. Login POST reads `XSRF-TOKEN` immediately before sending `X-XSRF-TOKEN`. Its response does not establish frontend identity; a new `/me` response does.
3. Logout POST sends fresh CSRF, then GET `/me` refreshes the cookie. Protected in-memory queries are canceled/removed and the browser returns to `/login`, including when that final GET fails.
4. `CSRF_INVALID` refreshes `/me` once and asks the person to submit manually. No failed mutation is replayed.

`TBCALL_SESSION` is opaque and HttpOnly. Browser code never reads/decodes it. No session/CSRF token is stored by application code. TanStack Query is memory-only; protected query state is cleared on session loss, account/context change and logout. Login credentials stay in transient form/request state rather than TanStack mutation variables.

## Client and authorization

`lib/api/client.ts` uses native fetch with same-origin credentials, a fresh UUID request ID, safe problem handling and optional **explicit server ETag** (`If-Match`). It never synthesizes ETags or automatically retries writes. 401 clears session/navigates to login; 403 routes to forbidden; optimistic 409 refetches active queries after a failed mutation; authority 409 displays read-only guidance; 428 and network/5xx errors show safe Indonesian messages with correlation IDs. Raw server prose is not displayed.

Navigation consumes the exact permission codes supplied by `/me`, with no role-name assumptions. F1's Beranda and Akun/context both expose the authenticated `/me` context and have no separate backend permission gate. Future entries must declare their actual required permission codes. UI gating is convenience; Spring Boot enforces authorization.

## UI, privacy and security

The Indonesian shell has a collapsible desktop sidebar, modal mobile drawer, identity/role/facility summaries and logout. Associated labels, visible focus, skip link, announced errors, reduced motion and 44px button/input touch targets are included. Only SELF link state and the supporter-case **count** are displayed; linked patient/case IDs are not rendered.

There is no browser persistence, offline cache or service worker. F1 itself has no clinical workflows; F2A-F2E add only their approved workflows. KPIs, patient/supporter portals, administration and SITB networking are deferred.

Each page response receives a fresh CSP nonce and `no-store`. Next applies the nonce to its scripts; dynamic rendering supports this [documented Next.js CSP approach](https://nextjs.org/docs/app/guides/content-security-policy). The initial document nonce also configures `get-nonce` for Radix's injected scroll-lock stylesheet and is retained across client navigation. Zod uses interpreted (`jitless`) validation so it never attempts a Function/eval capability probe. Production scripts have no unsafe-inline/unsafe-eval permission or broad wildcard. Same-origin connections, frame denial, nosniff, no-referrer and restrictive Permissions-Policy apply. API responses have a separate `default-src 'none'` sandbox CSP so an upstream HTML error cannot run scripts.

Development alone permits script `unsafe-eval`, inline style elements and WebSocket schemes for Next's dev server. Production allows **inline style attributes only** for Radix overlay/scroll management; script attributes remain forbidden. No external font/CDN is used. HTTPS, edge limits and an appropriate deployed origin remain deployment responsibilities.

`components/ui/` contains the checked-in shadcn/ui New York Button, Input, Label, Card and Sheet sources, adapted for Indonesian drawer labels, Tailwind 4 and touch targets. `LICENSE.shadcn` retains the upstream MIT license. See [shadcn's manual installation](https://ui.shadcn.com/docs/installation/manual); application compilation does not invoke a UI generator.

## Tests and scope

Vitest + React Testing Library/user-event cover the native client, real HTTP proxy boundary, session lifecycle/cache clearing, forms, permission filtering, safe errors and drawer focus. Fixtures model existing backend responses; they are not a SITB service/database. See [the implementation guide](../docs/FRONTEND_FOUNDATION.md) and [checkpoint report](../docs/FRONTEND_F1_REPORT.md).

Later UI need separately approved workflows, projections and permission/scope/ETag integration. Account registration/recovery, patient/supporter workflows, administration and real SITB networking remain later scopes.
