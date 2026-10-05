# TBCall Frontend Architecture v1.0 — F1 Foundation

Backend base: `b6a71636cdc0c5ea214617613a5ead5c0646b754`

## Goal

Build the browser foundation only: authentication/session bootstrap, same-origin proxy, CSRF-safe API client, role/permission-aware shell, responsive navigation, and frontend test/build infrastructure.

Clinical workflows are deferred to F2+.

## Stack

- Next.js App Router
- React
- TypeScript strict
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form
- Zod
- Lucide
- native `fetch`

Frontend lives in `frontend/` inside the existing TBCall repository. Do not restructure the Spring Boot backend.

## Browser/backend topology

Use a same-origin proxy:

```text
Browser
  -> /api/tbcall/*
Next.js route handler
  -> TBCALL_BACKEND_URL
Spring Boot /api/*
```

Example:

```text
Browser: /api/tbcall/v1/me
Backend: /api/v1/me
```

`TBCALL_BACKEND_URL` is server-only. Never expose it as `NEXT_PUBLIC_*`.

Implement `frontend/app/api/tbcall/[...path]/route.ts`.

Support GET/POST/PATCH/DELETE. Construct the backend URL only from the fixed environment base plus normalized path/query. Never accept a browser-controlled target host.

Forward only required request headers:
- Cookie
- Content-Type
- Accept
- X-XSRF-TOKEN
- If-Match
- X-Request-ID

Preserve response:
- status/body
- Content-Type
- ETag
- X-Request-ID
- all Set-Cookie headers

Do not log cookies, Set-Cookie, bodies, passwords, tokens, or clinical payloads.

If backend is unreachable, return safe `application/problem+json` 503 with code `BACKEND_UNAVAILABLE`.

## Authentication and CSRF

Backend contract:
- `TBCALL_SESSION`: HttpOnly opaque session cookie
- `XSRF-TOKEN`: JS-readable CSRF cookie
- mutation header: `X-XSRF-TOKEN`
- GET `/api/v1/me` emits/refreshed CSRF cookie even on 401
- after login/logout, fetch `/me` again for a fresh CSRF token

Flow:

```text
GET /api/tbcall/v1/me
  200 -> authenticated
  401 -> unauthenticated, CSRF cookie available

POST /api/tbcall/v1/auth/login
  with X-XSRF-TOKEN

success -> GET /api/tbcall/v1/me again
```

For every POST/PATCH/DELETE, read `XSRF-TOKEN` from `document.cookie` and send `X-XSRF-TOKEN`.

Do not store session or CSRF tokens in localStorage/sessionStorage/indexedDB.

Do not transparently retry a mutation after `CSRF_INVALID`.

Logout:
1. POST `/api/tbcall/v1/auth/logout`
2. refetch `/me`
3. clear authenticated query state
4. navigate to `/login`

## Session state

Use `/api/tbcall/v1/me` as the only current-user source.

It supplies:
- user identity
- roles
- permission codes
- active facilities
- verified SELF patient link
- supporter case IDs

Build frontend navigation from permissions, not role names.

Frontend gating is UX only. Spring Boot remains the authorization authority.

Never inspect/decode `TBCALL_SESSION`.

TanStack Query cache must be memory-only; do not persist clinical/auth query data.

## API client

Create `frontend/lib/api`.

Responsibilities:
- same-origin `/api/tbcall`
- JSON requests/responses
- CSRF header on mutations
- `X-Request-ID: crypto.randomUUID()`
- If-Match request support
- ETag response extraction
- `application/problem+json` parsing

Problem model:

```ts
type ApiProblem = {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  instance?: string;
  traceId?: string;
};
```

Required behavior:
- 401 `AUTHENTICATION_REQUIRED`: clear session query and route to login
- 403: show access denied
- 403 `CSRF_INVALID`: refresh `/me`, but never auto-retry mutation
- 409 `OPTIMISTIC_LOCK_CONFLICT`: show stale-data message and refetch
- 409 `SOURCE_AUTHORITY_CONFLICT`: show externally-controlled/read-only message
- 428: surface safe precondition error
- network/5xx: generic unavailable UI plus request ID when present

Use native fetch; no Axios.

## Routes

Implement F1 only:
- `/login`
- `/`
- `/forbidden`

Do not implement registration/recovery UI yet.

Authenticated shell:
- desktop collapsible sidebar
- mobile drawer
- top bar
- TBCall branding
- user identity
- role summaries
- active facility summary
- logout

F1 navigation exposes only:
- Beranda
- Akun/context

Do not show dead clinical links.

## Dashboard

F1 dashboard is identity/context only:
- greeting
- role names
- active facilities
- SELF-link state
- supporter case count

No clinical KPIs or patient/treatment queries in F1.

## Design/accessibility

UI language: Indonesian.

Use calm, professional public-health styling.

Requirements:
- keyboard navigable
- visible focus
- semantic headings/landmarks
- associated labels
- accessible error announcements
- mobile-friendly touch targets
- no status meaning by color alone
- respect reduced motion

No service worker/offline cache.

## ETag foundation

Represent versioned fetches as:

```ts
type Versioned<T> = {
  data: T;
  etag?: string;
};
```

Future mutations that require optimistic concurrency must accept the server ETag explicitly and send `If-Match`.

Do not synthesize ETag values in the frontend.

## Forms

Use React Hook Form + Zod for UX validation only.

Backend remains authoritative.

Do not parse Indonesian error prose to infer fields.

Prevent duplicate submissions.

## Security headers

Add conservative Next.js security headers:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- restrictive `Permissions-Policy`
- frame protection via CSP `frame-ancestors 'none'` or equivalent
- production CSP without broad wildcards

Document any development-only CSP relaxation.

## Tests

Use Vitest + React Testing Library + user-event.

At minimum test:
- XSRF cookie parsing
- mutation adds X-XSRF-TOKEN
- GET does not require CSRF header
- If-Match forwarding
- ETag extraction
- problem+json parsing
- 401 session handling
- CSRF_INVALID has no mutation auto-retry
- SOURCE_AUTHORITY_CONFLICT rendering
- unauthenticated `/me` bootstrap
- login: bootstrap -> login -> `/me` refresh
- logout clears auth query state
- navigation is permission-driven
- session token is never read by browser code
- no localStorage auth/query persistence
- proxy cannot choose arbitrary host
- proxy forwards multiple Set-Cookie values
- proxy preserves ETag/X-Request-ID

## Build gates

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Define `typecheck` in package.json.

Do not modify backend migrations/source in F1.

## Documentation

Add:
- `frontend/README.md`
- `docs/FRONTEND_FOUNDATION.md`
- root README frontend section
- `docs/architecture/TBCall_Frontend_v1.0_F1_Foundation.md`

Document local development, proxy topology, CSRF bootstrap, opaque-session model, authorization separation, and commands.

## Deferred

F2:
- TB officer intake/case/lab/treatment/referral/contact/TPT workflows

F3:
- patient/supporter treatment/adherence/monitoring/alerts/notifications

F4:
- administration and integration-boundary read UI

Real SITB networking remains blocked until authorized interface material exists.
