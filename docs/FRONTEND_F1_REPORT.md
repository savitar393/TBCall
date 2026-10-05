# Frontend F1 checkpoint report

## Scope and base

- Branch: `feat/frontend-foundation`.
- Approved base: `b6a71636cdc0c5ea214617613a5ead5c0646b754`.
- Implementation is frontend F1 only. Backend source, Maven configuration and V1–V17 are unchanged.
- Approved architecture is included unchanged. Local task briefs, PDFs, screenshots, logs, generated caches and secrets are excluded.
- No schema/specification conflict was found.

## Selected versions

| Package/tool | Version |
| --- | --- |
| Node.js / pnpm | 24.19.0 / 11.19.0 |
| Next.js / React / React DOM | 16.3.8 / 19.3.0 / 19.3.0 |
| TypeScript / ESLint / eslint-config-next | 6.0.3 / 9.39.5 / 16.3.8 |
| Tailwind CSS / Tailwind PostCSS | 4.3.3 / 4.3.3 |
| TanStack Query | 5.104.1 |
| React Hook Form / resolvers | 7.89.0 / 5.9.1 |
| Zod / Lucide | 4.6.5 / 1.52.0 |
| Radix Dialog / Label / Slot | 1.1.23 / 2.1.15 / 1.3.3 |
| Radix stylesheet nonce helper (get-nonce) | 1.0.1 |
| shadcn/ui | Checked-in New York Button/Input/Label/Card/Sheet; MIT license retained |
| Vitest / React Vite plugin / jsdom | 5.0.3 / 6.1.2 / 30.1.2 |
| Testing Library React / user-event / jest-dom | 16.3.3 / 14.6.7 / 7.0.1 |

All direct versions are pinned in `frontend/package.json`; `pnpm-lock.yaml` locks the full dependency graph. The peer-dependency check reports no issues. No package generator is required to compile the checked-in sources.

## Changed-file manifest

51 new frontend files and five repository documentation files (56 total):

```text
README.md (modified)
docs/FRONTEND_FOUNDATION.md
docs/FRONTEND_F1_REPORT.md
docs/architecture/TBCall_Frontend_v1.0_F1_Foundation.md
docs/superpowers/plans/2026-10-05-frontend-f1.md
frontend/.env.example
frontend/.gitignore
frontend/README.md
frontend/app/api/tbcall/[...path]/route.ts
frontend/app/forbidden/page.tsx
frontend/app/globals.css
frontend/app/icon.svg
frontend/app/layout.tsx
frontend/app/login/page.tsx
frontend/app/page.tsx
frontend/app/providers.tsx
frontend/components.json
frontend/components/api-feedback.tsx
frontend/components/app-shell.tsx
frontend/components/brand.tsx
frontend/components/identity-dashboard.tsx
frontend/components/login-form.tsx
frontend/components/session-boundary.tsx
frontend/components/ui/LICENSE.shadcn
frontend/components/ui/button.tsx
frontend/components/ui/card.tsx
frontend/components/ui/input.tsx
frontend/components/ui/label.tsx
frontend/components/ui/sheet.tsx
frontend/eslint.config.mjs
frontend/lib/api/client.ts
frontend/lib/api/csrf.ts
frontend/lib/api/problem.ts
frontend/lib/auth/session.tsx
frontend/lib/auth/types.ts
frontend/lib/navigation.ts
frontend/lib/security/headers.ts
frontend/lib/server/backend-proxy.ts
frontend/lib/utils.ts
frontend/lib/validation.ts
frontend/next-env.d.ts
frontend/next.config.ts
frontend/package.json
frontend/pnpm-lock.yaml
frontend/pnpm-workspace.yaml
frontend/postcss.config.mjs
frontend/proxy.ts
frontend/tests/api-client.test.ts
frontend/tests/fixtures.ts
frontend/tests/foundation-ui.test.tsx
frontend/tests/proxy.test.ts
frontend/tests/security-headers.test.ts
frontend/tests/session.test.tsx
frontend/tests/setup.ts
frontend/tsconfig.json
frontend/vitest.config.ts
```

## Design and behavior

### Proxy

Browser `/api/tbcall/v1/...` maps to configured server-only `TBCALL_BACKEND_URL/api/v1/...`. Only GET/POST/PATCH/DELETE and the six approved request headers are accepted. URL segment validation, encoded normalization, a fixed configured origin and manual redirect handling prevent arbitrary host selection. Status/body, Content-Type, ETag, X-Request-ID and every independent Set-Cookie survive forwarding. All API responses are no-store; connection failure becomes safe `503 BACKEND_UNAVAILABLE` problem JSON. There is no private payload logging.

### Auth, CSRF and session

Bootstrap GET `/me` accepts anonymous 401 while forwarding the XSRF cookie. Login POST sends freshly read CSRF and refreshes `/me`; the login response is discarded. Logout POST refreshes `/me`, clears protected queries/mutation cache and navigates to login. A failed post-logout refresh still clears identity. Session loss/account-context changes clear stale protected queries before new identity is published. Login/logout have duplicate-submit guards. Opaque HttpOnly session cookies are never inspected. Passwords stay in transient form/request state and are cleared after submission.

`CSRF_INVALID` refreshes `/me` once without mutation replay. Browser storage, persisted Query cache, service workers and offline caching are absent.

### Native client

Native fetch carries same-origin credentials, a fresh UUID correlation header, optional explicit server ETag in If-Match, and fresh mutation CSRF. It extracts ETag and parses problem JSON without displaying raw server prose. 401 clears/routes to login; 403 routes to forbidden; optimistic 409 refetches active queries after a command; authority 409 shows read-only guidance; 428/network/5xx show safe messages with request IDs. Failed GET optimistic conflicts mark data stale without a refetch loop. No synthetic ETags or transparent mutation retries exist.

### Routes, shell and permissions

Only `/login`, `/`, and `/forbidden` are implemented. Beranda and Akun/context (`/#akun`) work in the collapsible desktop sidebar/mobile modal drawer. User identity, role names, active facilities and logout are visible. Dashboard data is confined to `/me`; SELF link state and supporter count are shown without linked patient/case IDs or clinical queries/KPIs.

The filter uses actual backend permissions; role names never grant links. Both F1 context links require authentication because backend `/me` has no separate permission gate. Later workflow entries must declare their actual grants. Spring Boot remains authoritative.

### Security and accessibility

Pages use fresh nonce CSP and no-store, with no production script unsafe-inline/unsafe-eval or broad wildcard. The initial document nonce configures Radix's injected scroll-lock style through get-nonce and remains stable during client navigation. Zod uses interpreted validation, avoiding its optional Function/eval capability probe. API responses have a sandbox/default-src none policy. Common protections include nosniff, no-referrer, frame denial and restrictive Permissions-Policy. Inline style attributes are allowed for Radix; inline script attributes are denied. Development-only CSP relaxations are documented.

Indonesian labels, semantic landmarks, skip link, visible focus, associated form errors, reduced motion, 44×44 button targets and drawer focus restoration are implemented. No remote fonts/CDN, browser persistence, cookie decoding or raw logging is present.

## Verification

### Checked-in tests

| File | Tests | Main coverage |
| --- | ---: | --- |
| proxy.test.ts | 22 | Real local HTTP upstream; four methods; normalized fixed host/path; request allowlist; independent cookies/deletions/Expires; ETag/correlation/status; redirect/no-store; safe 503 |
| security-headers.test.ts | 3 | Production nonce restrictions, development-only relaxations, common protections |
| api-client.test.ts | 26 | XSRF parsing/fresh headers, GET, If-Match/ETag, problem categories, malformed bodies, no write retry, network/privacy/cancellation |
| session.test.tsx | 15 | Anonymous bootstrap; login/me; logout/cache; expiry/account changes; CSRF no replay; error navigation/refetch; duplicate submission; no storage/session decoding |
| foundation-ui.test.tsx | 19 | Permissions, labels/validation/login failure/password clearing, three routes, metadata-only dashboard, navigation, drawer nonce/scroll lock/focus, safe errors |
| **Total** | **85** | **Five passing test files** |

Tests use production functions/providers/components, controlling HTTP transport and Next navigation where needed. The proxy suite uses a real temporary HTTP server. Test fixtures represent current backend auth contracts, not SITB behavior.

A separate ignored production browser check with headless Edge verified HTTP headers/nonces, Next hydration, multiple proxy Set-Cookie/ETag/correlation, actual HttpOnly/JS cookie behavior, no browser storage/service workers, desktop collapse/mobile drawer/44px targets/Escape focus, nonce-bearing body scroll-lock styles, zero securitypolicyviolation events, CSRF recovery without replay and manual logout. No clinical/SITB request was made. Its fixture server, helper, logs and screenshots are local diagnostics and are not committed.

### Exact required gates

Executed from `D:\TBCall\frontend` on 2026-10-05 using pnpm 11.19.0 (the brief explicitly permits equivalent package-manager commands):

| Command | Start (Asia/Jakarta) | Exact result |
| --- | --- | --- |
| `pnpm run lint` | 19:16:09 +07:00 | `eslint . --max-warnings=0`; exit 0; 0 errors, 0 warnings |
| `pnpm run typecheck` | 19:16:14 +07:00 | `next typegen && tsc --noEmit`; Types generated successfully; exit 0 |
| `pnpm test` | 19:16:17 +07:00 | `vitest run`; Test Files 5 passed (5); Tests 85 passed (85); duration 5.43s; exit 0 |
| `pnpm run build` | 19:16:24 +07:00 | Next.js 16.3.8 production build; compiled in 1235ms, TypeScript in 2.8s, page generation in 774ms; exit 0 |

Build routes: dynamic `/`, `/_not-found`, `/api/tbcall/[...path]`, `/forbidden`, `/login`; static `/icon.svg`; request Proxy. Framework not-found/favicon are infrastructure, not additional workflow screens.

Backend verification is read-only: no diff under `src/`, `pom.xml`, `.mvn/` or Maven wrappers against the approved base. Backend Maven tests were not rerun because no backend files changed and the task's gates are frontend checks.

### Review and publication

Independent final read-only review found no Critical issues, one Important production drawer stylesheet nonce issue, and one Minor pending-request cancellation coverage gap. The Important issue was reproduced by a failing stylesheet-nonce regression and production CSP events, fixed and verified with all 85 tests and all four gates. The production check also exposed Zod's optional blocked eval probe; interpreted validation eliminated it without relaxing CSP. Final production verification emitted zero CSP violations and confirmed body scroll locking. No second review was performed after the verified fix pass.

Deferred minor: add a request that remains pending across a session/account transition, then resolve it late to prove old-user data cannot repopulate the cache. Existing tests verify clearing of completed cache entries; production code cancels protected queries, but this race deserves future regression coverage.

The Git commit containing this report is the checkpoint identifier; its SHA and verified push result are returned after publication rather than embedded circularly in the report.

## Implementation rulings

1. Retain the user-created Windows feature checkout and use the native durable plan/ledger instead of Unix helper scripts. Cost if wrong: manual process evidence requires checking.
2. Use pnpm 11.19.0 with Node 24.19.0 because global npm is unavailable and the approved brief permits equivalent commands. Cost if wrong: contributors need this documented toolchain.
3. Expose both authenticated F1 context links without inventing a dedicated `/me` permission; permission filtering remains ready for actual future grants. Cost if wrong: future entries must explicitly declare their backend permissions.
4. Permit production inline style attributes for Radix overlay/scroll behavior, while retaining nonce-only script execution and forbidding script attributes. Cost if wrong: style-injection protection is weaker than a policy denying all inline attributes; safe trusted UI rendering and API sandboxing remain required.
5. Accept static backend contract checks plus the isolated production browser fixture for F1; a real Spring Boot end-to-end run was outside the review and not added to this frontend checkpoint. Cost if wrong: a deployment/runtime contract mismatch can remain until real-backend verification.
6. Leave deployed HTTPS, edge limits and secure-cookie settings to deployment, documenting the existing requirements. Cost if wrong: a misconfigured environment can prevent login or weaken deployment security.
7. Accept the pinned, locked and peer-compatible stack without a separate live vulnerability audit. Cost if wrong: an unassessed dependency vulnerability may require an update.
8. Defer clinical workflows, registration/recovery, administration and SITB integration as explicitly required. Cost if wrong: those needs require later approved checkpoints rather than extra F1 screens.
9. Accept actual production browser evidence from Edge for F1; additional browser engines were outside this review. Cost if wrong: another engine may need compatibility fixes.
10. Complete the explicitly authorized commit/push after review and verify local/remote SHA equality and clean status. Cost if wrong: publication failure remains a task blocker until reported/resolved; Git metadata and the returned SHA are the final evidence.

## Before F2

No F1 implementation blocker remains after required verification. F2 requires a separately approved clinical-screen scope, actual endpoint/projection/permission/facility/ETag mapping, provisioned test accounts and end-to-end verification against the existing backend. Confirm deployed HTTPS/secure-cookie settings. Registration/recovery, patient/supporter, administration and integration views remain later checkpoints. SITB networking continues to require authorized interface material and is not part of this frontend.
