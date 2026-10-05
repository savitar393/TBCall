# Frontend F1 foundation

## Contract and scope

Approved base: `b6a71636cdc0c5ea214617613a5ead5c0646b754`. [Frontend architecture v1.0](architecture/TBCall_Frontend_v1.0_F1_Foundation.md) defines this checkpoint. Backend Java, security contracts and V1–V17 migrations remain unchanged. The browser foundation lives under `frontend/` and serves only `/login`, `/` and `/forbidden`.

## Boundary map

| Boundary | Implementation | Contract |
| --- | --- | --- |
| Browser → Next | `frontend/lib/api/client.ts` | Same-origin `/api/tbcall/v1/...`, native fetch, no-store, per-request UUID |
| Next → Spring Boot | `frontend/app/api/tbcall/[...path]/route.ts`, `lib/server/backend-proxy.ts` | Fixed server-only origin, `/api/v1/...`, GET/POST/PATCH/DELETE, normalized segments, no redirect following |
| Identity → UI | `frontend/lib/auth/session.tsx`, `types.ts` | Validated `/me` shape only; login response discarded |
| Authorization → navigation | `frontend/lib/navigation.ts` | Actual `/me.permissions`; role names display only |
| Runtime → browser security | `frontend/proxy.ts`, `next.config.ts`, `lib/security/headers.ts` | Fresh page nonce, no-store, restrictive headers and separate sandboxed API CSP |

### Proxy

Only Cookie, Content-Type, Accept, X-XSRF-TOKEN, If-Match and X-Request-ID travel upstream. The configured origin must be HTTP(S) without credentials/path/query/fragment. Empty/dot/traversal segments, encoded separators, control characters and malformed encodings are rejected. The original query is forwarded as a query, including a parameter resembling a target URL; it cannot select the host.

The proxy preserves response status/body, Content-Type, ETag and X-Request-ID. `Headers.getSetCookie()` forwards each cookie independently, including cookies with an Expires comma and logout deletion cookies. Bodies are streamed back and never inspected/logged. The upstream timeout is 15 seconds; connection/configuration failure yields safe `503 BACKEND_UNAVAILABLE` problem JSON and a request ID. No upstream redirect is followed.

### Authentication and memory lifecycle

Bootstrap is a GET `/me`, with an expected anonymous 401 accepted as null user. The browser receives the existing JS-readable XSRF cookie through the proxy even on that response. Each mutation reads that specific cookie afresh, decodes its value once, and sends `X-XSRF-TOKEN`. No `TBCALL_SESSION` parsing, token object, browser storage or session reconstruction exists.

Login sends the exact backend `{identity,password}` shape, discards the login response, clears previous protected query state and refreshes `/me`. Logout sends CSRF, refreshes `/me` after cookie rotation, then cancels/removes protected queries, clears the mutation cache, sets the session anonymous and navigates to login. Failed post-logout GET still clears authenticated state. Login/logout share a duplicate-submit guard and the login form clears its submitted password.

The provider owns one memory-only QueryClient per browser application instance. Queries and mutations have retries disabled. Re-fetching `/me` clears protected state before publishing a changed account/context or lost session. Invalid `/me` shapes fail closed. The dashboard exposes email/phone, account status, role names, active facilities, SELF link presence and supporter count; linked IDs stay unrendered. F1 performs no clinical query.

### Error handling and concurrency foundation

| Failure | User-visible behavior / action |
| --- | --- |
| 401 AUTHENTICATION_REQUIRED | Clear/cancel authenticated query state; `/login` |
| 401 INVALID_CREDENTIALS | Safe credential guidance; password cleared; no raw server detail |
| 403 | `/forbidden` and safe access-denied wording |
| 403 CSRF_INVALID or missing XSRF | Refresh `/me`; ask for manual resubmission; no mutation replay |
| 409 OPTIMISTIC_LOCK_CONFLICT | Safe stale-data wording; invalidate/refetch active queries after a command error |
| Failed GET with optimistic 409 | Mark queries stale without automatic re-fetch loops |
| 409 SOURCE_AUTHORITY_CONFLICT | Safe externally controlled/read-only wording |
| 428 | Safe request for a fresh server version |
| Network/5xx or invalid response | Generic unavailable message and request ID; private bodies hidden |

`Versioned<T>` carries `data` and optional `etag`. Callers must supply the received server ETag explicitly for a future versioned mutation; the client sends it unchanged in If-Match. It never infers a version from IDs, DTO fields or timestamps. Cache failures are observed centrally; components can use the same handler for direct commands. Query cancellation signals propagate to fetch.

## Routes and accessibility

| Route/link | F1 behavior |
| --- | --- |
| `/login` | Indonesian RHF/Zod credential form, bootstrap state, safe errors, duplicate prevention |
| `/` / Beranda | Authenticated identity/context dashboard |
| `/#akun` / Akun/context | Working account/context anchor on the dashboard |
| `/forbidden` | Authenticated access-denied message and home link |

There is no dedicated permission for the backend `/me` endpoint. Accordingly, both F1 context links are available to all authenticated users. The navigation filter accepts explicitly declared permission codes and requires all of them; it makes no role-name inference. Later clinical entries require separate approved permissions and screens. Spring Boot remains the enforcement authority.

Desktop navigation collapses without losing labels; a Radix modal drawer traps mobile focus and restores the trigger on Escape/close. The shell includes landmarks, a skip link, labels, safe `role=alert` errors, visible focus, reduced-motion CSS and minimum 44×44 button targets. Styling uses local system fonts and a calm teal palette. No registration/recovery or dead clinical links are exposed.

## Privacy and deployment decisions

- No localStorage/sessionStorage/indexedDB writes, persisted Query cache, service worker, offline cache or session-cookie decoding.
- No raw body, cookie, token, password or clinical logging. Query errors are retained only in memory and rendered using local safe wording.
- Proxy and page responses are no-store. Production nonce CSP permits Next hydration without broad wildcards or unsafe script execution. The initial document nonce configures Radix's injected scroll-lock stylesheet through `get-nonce` before the drawer mounts and remains stable across client navigation. Zod uses interpreted validation without Function/eval probes. API responses use sandbox/default-src none, independent of page policy.
- Production permits inline **style attributes** for Radix overlays/scroll locking, but forbids inline script attributes. Development alone adds script unsafe-eval, inline style elements and WebSocket schemes.
- Deployed browser origin must use HTTPS with the backend's secure cookies. Local HTTP requires its existing explicit development settings. No CORS contract is changed by F1's same-origin proxy.

See [frontend setup](../frontend/README.md) for pinned Node/pnpm, installation and all four gates. Generated Next/type caches and local verification artifacts are ignored and are not prerequisites for a fresh clone.

## Verification and next checkpoint

The checked-in test matrix covers proxy headers/hosts/paths/cookies, error categories and ETags, auth bootstrap/login/logout/cache clearing/CSRF, permissions, forms/privacy, and accessible shell behavior, including the drawer's nonce-bearing scroll-lock stylesheet. A separate ignored production browser check verified actual cookie jar behavior, nonce hydration, zero CSP violations, no browser storage/service workers, drawer body scroll locking/focus and 44px touch targets, CSRF recovery without replay and manual logout. Its backend fixture implements only existing auth response shapes; no SITB behavior is simulated.

Exact command results, versions, manifest and review decisions are recorded in [FRONTEND_F1_REPORT.md](FRONTEND_F1_REPORT.md).

Before F2, approve the clinical screen scope and select each existing backend endpoint, safe projection, permission/facility scope and ETag lifecycle. Verify HTTPS/cookie settings and provision test accounts against a real local backend for clinical end-to-end coverage. Patient/supporter/adherence, recovery, administration and integration views remain separate later checkpoints. Real SITB networking still needs authorized interface material; F1 does not change that boundary.
