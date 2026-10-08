# Frontend F4 — administration and integration metadata

Approved backend base: `48536ab6b26815fb2708b8f4d06eff9791335da6`. Implementation follows [the supplied architecture](architecture/TBCall_Frontend_v1.7_F4_Admin_Integration.md). F4 uses existing APIs through the native same-origin proxy. No backend, authentication, administration write semantics, Phase 5A behavior, migrations or dependencies change.

## Routes and gates

| Route | Required current `/me` context |
| --- | --- |
| `/admin/facilities` | SYSTEM_ADMIN + FACILITY_MANAGE |
| `/admin/facilities/new` | SYSTEM_ADMIN + FACILITY_MANAGE |
| `/admin/facilities/[facilityId]` | SYSTEM_ADMIN + FACILITY_MANAGE |
| `/admin/users` | USER_MANAGE_FACILITY + SYSTEM_ADMIN, or FACILITY_ADMIN with an active facility |
| `/integrations` | SYSTEM_ADMIN + INTEGRATION_MANAGE |
| `/integrations/[code]` | SYSTEM_ADMIN + INTEGRATION_MANAGE |
| `/integrations/[code]/sync-runs/[runId]` | SYSTEM_ADMIN + INTEGRATION_MANAGE |

Navigation adds Fasyankes, Administrasi Pengguna and Integrasi independently of staff/portal entries. Grants are never inferred from roles. Role commands separately require SYSTEM_ADMIN + ROLE_MANAGE; status commands require SYSTEM_ADMIN + USER_ACCOUNT_MANAGE. Backend authorization remains final.

## Facility workflows

The paginated list renders safe summaries without per-row detail enrichment. Name, active and page filters live only in component memory. Nonempty names require at least two trimmed characters before submitting a request.

Create uses RHF/Zod and precisely the eleven FacilityInput fields, with no active flag or invented defaults. Active type labels come from `/admin/reference-data`. Optional blank values are null. Text constraints match the bounded backend fields; address remains unbounded as in the contract. Coordinates accept the documented ranges and up to six decimals. Creation sends no If-Match, then navigates to the returned facility's authoritative GET.

Parent search uses the active facility list, explicit submit and two trimmed characters. Edit excludes the current facility; no hierarchy/cycle model is invented. Parent UUID fallback is sufficient when a name is not loaded. Search Enter and pagination cannot submit the containing facility form.

Detail keeps the actual GET ETag separate from its numeric version. PATCH sends only dirty fields, with explicit null for optional clears. Missing ETag blocks commands; there is no version fallback. A current type absent from active references remains visible as its code and can remain unchanged.

409/428 refetches the authoritative detail while preserving the draft. All current server fields appear for review. The administrator must explicitly acknowledge review and submit again; no request is replayed. Successful commands refetch detail and cached facility lists, including inactive list caches, before later browsing. The old tag is discarded.

Deactivation requires an active facility, current actual ETag and an accessible confirmation explaining that data remains and active assignments can prevent deactivation. No facility reactivation is offered.

## Exact user administration

No user read occurs until explicit lookup submission. The approved request is `GET /admin/users/lookup?identity=...`; the request itself contains the exact identity, while page URLs/history, titles, global chrome, storage and logs do not. Input clears on submission. The submitted identity is retained only in a transient ref for deliberate relookup after a command, and clears on explicit clear, replacement, unmount or context change. Lookup bypasses query/mutation caches; it is never polled or automatically retried. Superseded requests are aborted and their responses suppressed.

Only the masked UserLookupResponse is displayed. A 404 says `Pengguna dengan identitas terverifikasi tersebut tidak ditemukan.` without distinguishing unverified accounts. Clear aborts a pending lookup. New commands remain blocked until a fresh exact result exists.

FACILITY_ADMIN membership candidates come only from current `/me.activeFacilities`; visible assignments are scope-filtered. Other assignments produce only the approved boolean notice. SYSTEM_ADMIN can see returned memberships, but discovering new active facilities additionally requires FACILITY_MANAGE. There is no alternative directory. Membership POST always sends explicit `{primary: true|false}`; DELETE acts on a visible assignment. These commands carry no ETag. Choosing primary may replace another primary.

Role choices use the live adminManagedRoles catalog. PATIENT/TREATMENT_SUPPORTER controls are excluded. Non-ACTIVE targets have a read-only role section. Operational role assignment requirements are advisory; no clinical/eligibility rules are recreated. Role commands carry no ETag.

Status actions follow ACTIVE → suspend/disable and SUSPENDED → reactivate/disable. Other statuses have no action. Only this backend contract explicitly allows the freshly looked-up `version` to form the quoted If-Match, e.g. `"12"`. Role/membership responses never supply that version. Disable and suspend require confirmation. A stale status response blocks commands and requires explicit relookup/action selection, without replay.

After membership/role/status success the target is re-looked-up once. Self-target commands first await `session.refresh()` immediately. Changed account/scope/grants remount and abort the old workspace; self suspension/disable may legitimately redirect to login, without a later obsolete relookup.

## Integration boundary

List/detail/run pages display only the approved local IntegrationSummary, IdentifierSummary, AuthoritySummary, RunSummary/RunDetail/ItemSummary and ConflictSummary contracts. Strict schemas reject extra fields, including raw payload/error fields. Error summaries are the safe backend projection; raw API problem prose is never rendered.

The list shows active as a metadata flag, configuration status, counts and latest run. The detail sections (identifiers, authorities, runs, conflicts) maintain independent pages in memory and fetch only the selected section. Run items show approved metadata, including hashes/cursors/external IDs in page content, with no clinical enrichment or entity deep links. Links contain only integration code and run UUID; facility links contain only facility UUID. Entity IDs, external IDs, hashes, cursors and conflict IDs never enter navigation/history/title/global chrome.

Every integration page displays the approved local-only boundary notice and warns that active does not mean configured or connected. There are no mutations, credentials/configuration forms, connector controls, sync execution, import/export, write-back or conflict-resolution actions. No polling, focus/reconnect refresh or external-system network call is added. Refresh is explicit.

## Session isolation, privacy and accessibility

Queries begin `["administration", userId, ...]` or `["integration", userId, ...]` and include the full current `/me` context in memory. Every query consumes AbortSignal and disables retry and automatic focus/reconnect/mount refetch. References have a five-minute in-memory stale time. Including context prevents reuse of an old query briefly recreated during the shared session refresh; the boundary removes obsolete inactive F4 entries after remount.

Commands and audited lookup check actual cached `/me` before issuing a request. Commands subscribe to changes, abort on unmount/context replacement, and check context after each asynchronous step before publishing feedback, invalidating queries or navigating. Command callbacks guard post-refetch state too. Identity lookup uses an additional generation guard. No failed write is replayed.

F4 adds no persistence, offline cache, service worker, raw response logging or sensitive metadata. Existing SessionProvider/authentication remains untouched. Labeled forms, text statuses, aria-live feedback, responsive metadata cards, and Radix keyboard/focus-restoring confirmations support accessibility.

## Verification and deferred work

Run from `frontend/`: `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`. No `.tools/` helper is needed to compile, test or build. See [the final report](FRONTEND_F4_REPORT.md) for exact results and manifest.

Deferred: authorized SITB networking/Phase 5B; credentials/configuration; sync/write-back/conflict resolution; generic permission editor; facility reactivation; user directory; TB Officer PATIENT/TREATMENT_SUPPORTER account-link provisioning. The latter still needs an approved safe account-discovery UI contract. No F4 backend contract blocker was encountered. A live smoke with separately provisioned SYSTEM_ADMIN/FACILITY_ADMIN accounts remains recommended; this checkpoint does not create accounts or weaken authentication.
