# TBCall Frontend v1.7 — F4 Administration & Integration Boundary

Approved backend base: `48536ab6b26815fb2708b8f4d06eff9791335da6`

Status: frontend-only F4 administration and integration-boundary slice.

F4 implements the currently approved administrative browser workflows and read-only Phase 5A integration metadata. It must not invent unsupported SITB connector behavior.

## 1. Existing backend contracts

Administration reads:
- GET `/api/v1/admin/facilities?page=&size=&query=&active=`
- GET `/api/v1/admin/facilities/{facilityId}` -> authoritative facility ETag
- GET `/api/v1/admin/reference-data`

Administration commands:
- POST `/api/v1/admin/facilities`
- PATCH `/api/v1/admin/facilities/{facilityId}` with If-Match
- POST `/api/v1/admin/facilities/{facilityId}/deactivate` with If-Match
- GET `/api/v1/admin/users/lookup?identity=...`
- POST `/api/v1/admin/facilities/{facilityId}/users/{userId}`
- DELETE `/api/v1/admin/facilities/{facilityId}/users/{userId}`
- POST/DELETE `/api/v1/admin/users/{userId}/roles/{roleCode}`
- POST `/api/v1/admin/users/{userId}/suspend` with If-Match
- POST `/api/v1/admin/users/{userId}/reactivate` with If-Match
- POST `/api/v1/admin/users/{userId}/disable` with If-Match

Integration reads:
- GET `/api/v1/integrations?page=&size=`
- GET `/api/v1/integrations/{code}`
- GET `/api/v1/integrations/{code}/external-identifiers?page=&size=`
- GET `/api/v1/integrations/{code}/authorities?page=&size=`
- GET `/api/v1/integrations/{code}/sync-runs?page=&size=`
- GET `/api/v1/integrations/{code}/sync-runs/{runId}?page=&size=`
- GET `/api/v1/integrations/{code}/conflicts?page=&size=`

Do not modify backend source/tests/migrations.

## 2. Routes

Add:
- `/admin/facilities`
- `/admin/facilities/new`
- `/admin/facilities/[facilityId]`
- `/admin/users`
- `/integrations`
- `/integrations/[code]`
- `/integrations/[code]/sync-runs/[runId]`

Do not create user-ID detail routes, integration configuration routes or conflict-resolution routes.

## 3. Authorization

Facility routes:
- SYSTEM_ADMIN + FACILITY_MANAGE

User administration workspace:
- USER_MANAGE_FACILITY
- plus SYSTEM_ADMIN, or FACILITY_ADMIN with at least one current active facility.

Membership:
- preserve existing backend scope.

Role actions:
- SYSTEM_ADMIN + ROLE_MANAGE

Account status:
- SYSTEM_ADMIN + USER_ACCOUNT_MANAGE

Integration:
- SYSTEM_ADMIN + INTEGRATION_MANAGE

Never infer permission from role.

## 4. Navigation

Add:
- `Fasyankes` -> `/admin/facilities` only for SYSTEM_ADMIN + FACILITY_MANAGE
- `Administrasi Pengguna` -> `/admin/users` only when the exact user-lookup gate is satisfied
- `Integrasi` -> `/integrations` only for SYSTEM_ADMIN + INTEGRATION_MANAGE

Mixed-role users retain independently authorized existing navigation.

## 5. Feature organization

Create focused modules:

```text
frontend/features/administration/
  api.ts
  schemas.ts
  types.ts
  permissions.ts
  queries.ts
  use-command.ts
  references.ts
  facilities/
  users/

frontend/features/integration/
  api.ts
  schemas.ts
  types.ts
  permissions.ts
  queries.ts
  list/
  detail/
  run/
```

Reuse the existing native API client, SessionProvider, TanStack Query, RHF/Zod, safe feedback and shadcn primitives. No new dependency or generic CRUD framework.

## 6. Strict schemas

Administration:
- FacilitySummary
- FacilityPage
- FacilityResponse
- admin reference data
- UserLookupResponse
- MembershipResponse
- RoleResponse
- StatusResponse

Mirror backend fields exactly and reject extra fields.

Integration:
- generic Page<T>
- IntegrationSummary
- IdentifierSummary
- AuthoritySummary
- RunSummary
- RunDetail
- ItemSummary
- ConflictSummary

Malformed responses map to `INVALID_RESPONSE`.

## 7. Query/session isolation

Administration query keys start:

```text
["administration", userId, ...]
```

Integration keys start:

```text
["integration", userId, ...]
```

Every query consumes AbortSignal.

Every command snapshots current `/me` and suppresses late stale-account/stale-scope success, error, invalidation and navigation.

Abort or clear mounted state when account, role, permissions or relevant activeFacilities change.

No F4 persistence.

## 8. Administration reference data

Use `/admin/reference-data`.

Memory-only cache; reasonable stale time such as five minutes.

Use server labels for active facility types and admin-managed roles. Do not hard-code substitute labels. PATIENT and TREATMENT_SUPPORTER must never become assignable admin roles.

## 9. Facility list

`/admin/facilities` requires SYSTEM_ADMIN + FACILITY_MANAGE.

Use the paginated safe summary.

Filters:
- name query
- active: all/active/inactive
- page

Keep filter/page state in memory, not browser URL/history.

Do not send a non-empty query until trimmed length is at least 2.

Display safe summary only. Do not issue one detail request per row.

The list contains no version contract. Never synthesize an ETag from list data.

## 10. Create facility

`/admin/facilities/new`.

Fields mirror FacilityInput:
- name required
- facilityTypeCode
- parentFacilityId
- address
- provinceCode
- regencyCode
- districtCode
- villageCode
- postalCode
- latitude
- longitude

No active field.

Use live active facility types.

Client structural checks may mirror safe backend constraints: text lengths, latitude/longitude ranges and max six decimal places. Backend remains authoritative.

Blank optional values may be omitted or normalized to null; never invent defaults.

Parent facility selection uses the facility list, with active=true and query length >=2. Do not invent a hierarchy or SITB facility organization.

Create requires no If-Match.

On success navigate to detail and obtain authoritative state/ETag through GET.

## 11. Facility detail/edit

`/admin/facilities/[facilityId]`.

Fetch facility detail + actual ETag + references.

If current facility type is not in active references:
- preserve/display the current code;
- do not invent a name;
- do not force a change;
- only active reference values are offered as new choices.

If a parent exists, an authorized one-off parent detail GET may obtain its name. Failure to load that label must not block the child form.

Parent replacement search uses active facilities and excludes the current facility itself. Do not invent cycle rules beyond obvious self-exclusion.

PATCH dirty fields only.

Explicit null clears optional fields. Name cannot be cleared.

Use the actual detail GET ETag. Never synthesize ETag from `version`.

On stale/precondition:
- preserve draft;
- refetch authoritative detail;
- require explicit review/resubmit;
- no automatic replay.

After success refetch detail and discard the old ETag.

## 12. Facility deactivation

Only for active facilities.

Use actual current detail ETag.

Require confirmation:

`Menonaktifkan fasyankes tidak menghapus data. Tindakan akan ditolak bila masih ada penugasan pengguna aktif.`

No reactivation UI.

After success refetch detail/list.

## 13. Exact user lookup

`/admin/users`.

Do not fetch any user until explicit submit.

Use exact:
`GET /admin/users/lookup?identity=...`

Privacy:
- identity stays in component memory only;
- no Next page query/search params/history;
- no persistence;
- no logging;
- clear on unmount/account change/explicit clear/new lookup.

The approved API request itself necessarily contains the identity query parameter.

Do not implement autocomplete, fuzzy lookup, directory browsing, NIK/BPJS or patient search.

Display only the masked lookup response.

404 text:
`Pengguna dengan identitas terverifikasi tersebut tidak ditemukan.`

Do not reveal whether an unverified account exists.

The lookup is intentionally audited by the backend. Do not poll or auto-search on keystrokes.

Keep the exact submitted identity transiently only so the result can be explicitly re-looked-up after mutation.

## 14. Facility membership management

Available only when USER_MANAGE_FACILITY and role/scope allow it.

FACILITY_ADMIN:
- candidate facilities only from current `/me.activeFacilities`;
- no global facility list discovery;
- if `hasOtherFacilityAssignments=true`, show only `Pengguna memiliki penugasan aktif lain di luar lingkup Anda.`

SYSTEM_ADMIN:
- current lookup assignments are fully visible;
- if actor also has FACILITY_MANAGE, allow searchable active facility discovery;
- without FACILITY_MANAGE, do not invent a directory for new assignments.

Assign/set primary:
- POST explicit `{ "primary": true|false }`
- explain that selecting primary may clear another primary assignment
- no ETag

Remove:
- DELETE visible/actionable assignment

After success:
- explicitly re-run exact lookup;
- if target user is current actor, call `session.refresh()` because scope may have changed.

No automatic replay.

## 15. Global role management

SYSTEM_ADMIN + ROLE_MANAGE only.

Use live `adminManagedRoles`.

Never show PATIENT/TREATMENT_SUPPORTER controls.

Assign/remove only current managed roles.

Operational roles TB_OFFICER, LAB_STAFF and FACILITY_ADMIN require at least one active facility assignment; use current lookup state for advisory UX only and keep backend final.

Existing backend role commands require target account ACTIVE/verified. If target is not ACTIVE, show role section read-only.

No role ETag.

After mutation relookup target; if self-target, refresh `/me`.

## 16. Account status management

SYSTEM_ADMIN + USER_ACCOUNT_MANAGE only.

Actions:
- ACTIVE -> suspend, disable
- SUSPENDED -> reactivate, disable
- DISABLED -> no action
- other unsupported states -> no action

The existing backend explicitly documents exact UserLookupResponse.version as the precondition source for these status commands.

F4 may construct:

```text
If-Match: "<lookup.version>"
```

from the freshly submitted exact lookup result.

This is an explicit backend contract and is not a list-version shortcut.

Do not use role/membership responses as a user-version source.

After successful status mutation:
- relookup if session remains authorized;
- use refetched/current state before any later mutation.

Suspend/disable revoke target sessions.

If target user is the current actor:
- call `session.refresh()` immediately after membership/role/status changes;
- self suspend/disable may legitimately send the caller to login.

Disable requires confirmation; suspend confirmation is recommended.

On stale 409:
- explicit relookup;
- no replay;
- administrator chooses the action again.

## 17. Administration error behavior

Never render raw backend problem detail.

Use safe local handling:
- stale/precondition -> reload/review
- invalid state -> state/assignment may have changed; lookup again
- lookup 404 -> neutral not-found
- 403/401/network -> existing safe handling

Do not automatically retry audited user lookup or mutations.

## 18. Integration list

`/integrations` requires SYSTEM_ADMIN + INTEGRATION_MANAGE.

Display:
- code
- name
- active metadata flag
- configurationStatus
- description
- identifier count
- active-authority count
- latest run when present

Memory-only pagination.

Show:

`Status "aktif" adalah metadata TBCall dan tidak berarti konektor sudah dikonfigurasi atau terhubung.`

No Connect/Configure/Activate/Sync buttons.

No polling; explicit refresh only.

## 19. Integration detail

`/integrations/[code]`.

Fetch summary plus independently paginated sections:
- external identifiers
- source authorities
- sync runs
- conflicts

Use in-page tab/section state kept in memory, not browser query params.

External identifiers display only approved metadata; no clinical enrichment/deep links.

Authorities: releasedAt null may be labeled active authority; no mutation.

Sync runs: show approved run summary, counters, cursorValue and safe errorSummary; link only to run detail.

Conflicts: read-only metadata; no resolve/ignore action.

Do not put externalId, entityId, cursorValue, hashes or conflictId into browser URL/history.

## 20. Sync run detail

`/integrations/[code]/sync-runs/[runId]`.

Display run summary and safe paginated items:
- entityType
- externalId
- resolvedEntityId
- operation
- status
- sourceUpdatedAt
- contentHash
- localContentHash
- conflictId
- processedAt
- safe errorSummary

No raw payload/error text, clinical deep links or mutations.

Pagination memory-only.

## 21. Integration boundary text

Display clearly:

`Integrasi pada tahap ini hanya menampilkan metadata lokal TBCall. Belum ada konektor, kredensial, sinkronisasi aktif, impor, write-back, atau resolusi konflik melalui antarmuka ini.`

Do not claim:
- an authorized contemporary SITB API exists;
- SITB metadata equals official database/API codes;
- active=true means connectivity;
- rows came from a live authorized connector.

No external-system network calls from the browser.

## 22. Privacy

No admin/integration data in localStorage/sessionStorage/IndexedDB/offline caches.

Do not log exact lookup identity, masked lookup data, facility address/coordinates, external IDs, hashes, cursors, conflicts or raw API responses.

Do not place exact identity, facility search text or integration metadata in page URL/history.

Allowed route identifiers:
- facility UUID
- integration system code
- sync-run UUID

No target identity or external record identifiers in global chrome/document title.

## 23. Accessibility

Use labeled searches/forms, text status in addition to color, keyboard-accessible confirmations and focus restoration.

Responsive facility/integration tables should have a mobile card fallback or accessible overflow.

Use aria-live safe feedback.

## 24. Tests

Continue Vitest + RTL + user-event.

Cover at minimum:

Authorization/navigation:
- facility routes require SYSTEM_ADMIN + FACILITY_MANAGE
- wrong-role artificial grants denied
- user admin route matches exact lookup gate
- FACILITY_ADMIN without active assignment denied
- integration requires SYSTEM_ADMIN + INTEGRATION_MANAGE
- mixed-role navigation remains independent

Session isolation:
- userId-scoped keys
- AbortSignal in every query
- stale old-account facility GET/PATCH
- stale membership command
- same-account FACILITY_ADMIN scope change
- stale integration GET
- no persistence

Facilities:
- strict schemas
- memory-only filters
- no N+1 detail enrichment
- no list ETag/version synthesis
- exact create payload
- live facility types
- dirty PATCH/null clears
- actual detail ETag
- stale draft preservation/no replay
- inactive current type preserved
- parent search self-exclusion
- deactivation confirmation/current ETag
- no reactivation UI

User lookup:
- no request before submit
- no request per keystroke
- exact identity absent from page URL/history/storage/logging
- neutral 404
- strict masked schema
- in-memory relookup only
- clear on unmount/account change

Membership:
- FACILITY_ADMIN only own activeFacilities
- no enumeration of other assignments
- SYSTEM_ADMIN global discovery only with FACILITY_MANAGE
- explicit primary request
- target relookup
- self mutation refreshes `/me`

Roles:
- live reference choices
- no PATIENT/TREATMENT_SUPPORTER
- independent ROLE_MANAGE gate
- inactive target read-only
- self-role mutation refreshes session
- no ETag invented

Account status:
- correct structural buttons
- exact lookup version quoted for If-Match
- no list-version use
- stale relookup/review/no replay
- disable confirmation
- self suspend/disable session handling

Integration:
- strict DTO schemas
- read-only list/detail/run
- no unsupported controls
- memory-only pagination/tab state
- no polling
- no raw payload/error field
- no clinical enrichment
- active metadata not rendered as connected
- external IDs/hashes/cursors absent from URL/history/logging

Error/privacy:
- no raw backend prose
- malformed response -> INVALID_RESPONSE
- no storage/log/history/metadata leakage

## 25. Build gates

From `frontend/`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Backend source/tests/migrations must remain byte-for-byte unchanged.

A live-backend smoke with already provisioned SYSTEM_ADMIN/FACILITY_ADMIN accounts is recommended, but do not weaken auth or create production credentials.

## 26. Documentation

Add:
- `docs/FRONTEND_F4_ADMIN_INTEGRATION.md`
- `docs/FRONTEND_F4_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.7_F4_Admin_Integration.md`

Update:
- `frontend/README.md`
- root README frontend section

## 27. Deferred after F4

Still deferred:
- real authorized SITB connector/networking (Phase 5B)
- connector credentials/configuration
- sync execution/write-back/conflict resolution
- generic permissions editor
- facility reactivation
- broad user directory
- TB Officer UI for PATIENT/TREATMENT_SUPPORTER account-link provisioning

The last item uses existing account-link commands but lacks an approved TB Officer-safe account-discovery UI contract. Do not improvise it inside F4.

Do not begin deferred work.
