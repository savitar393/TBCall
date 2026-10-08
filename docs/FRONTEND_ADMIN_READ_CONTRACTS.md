# F4 administration read contracts — backend v1.5A.7

Approved base: `d1c0cdd15a7eb4a3fd9a51dd633a75cfae6c5425`.
Specification: [approved architecture](architecture/TBCall_Backend_v1.5A.7_F4_Admin_Read_Contracts.md).

## Facility list

`GET /api/v1/admin/facilities`

Requires an authenticated active session, SYSTEM_ADMIN and the actually-held FACILITY_MANAGE permission. No facility assignment is required. A different role with an artificial FACILITY_MANAGE grant is denied.

| Parameter | Contract |
| --- | --- |
| `page` | Integer, default 0, nonnegative; offset must fit a Java integer |
| `size` | Integer, default 20, 1..50 |
| `query` | Optional, trimmed, 2..255 characters when supplied |
| `active` | Optional boolean; omission includes both active and inactive facilities |

Returns exactly `content`, `page`, `size`, `totalElements`. Each summary contains only `id`, `name`, `facilityTypeCode`, `parentFacilityId`, `provinceCode`, `regencyCode`, `active`. Optional values may be null. Facility-name search is a case-insensitive substring with literal `%`, `_` and `!` escaping. Active and query filters combine. Results are ordered by name then ID, including across pages; a page beyond available results has empty content with the filtered total preserved.

The summary omits version, address, district/village, postal code, coordinates and memberships. There is no list ETag contract; never construct a facility write precondition from this response. Invalid paging, supplied query length or malformed typed parameters return 400. A valid unauthorized request returns 403.

## Authoritative facility detail

`GET /api/v1/admin/facilities/{facilityId}`

Same SYSTEM_ADMIN + FACILITY_MANAGE gate. Missing facilities return 404 after authorization. Active and inactive facilities are readable. The response reuses the existing FacilityResponse, containing exactly:

`id`, `version`, `name`, `facilityTypeCode`, `parentFacilityId`, `address`, `provinceCode`, `regencyCode`, `districtCode`, `villageCode`, `postalCode`, `latitude`, `longitude`, `active`.

The response header is the actual quoted ETag from that facility version, for example `ETag: "7"`. Read detail before the existing PATCH `/api/v1/admin/facilities/{facilityId}` or POST `/api/v1/admin/facilities/{facilityId}/deactivate`, then send that returned header in If-Match. Existing write validation and preconditions remain authoritative: missing If-Match is 428, and a stale version is 409. After PATCH increments the version, rereading detail supplies the new ETag. No facility reactivation command is added.

## Administration references

`GET /api/v1/admin/reference-data`

Either authorization branch permits this global vocabulary:

- SYSTEM_ADMIN with at least one actually-held FACILITY_MANAGE, USER_MANAGE_FACILITY, ROLE_MANAGE or USER_ACCOUNT_MANAGE. No facility assignment required.
- FACILITY_ADMIN with USER_MANAGE_FACILITY and at least one active user assignment to an active facility, as supplied by existing current-actor resolution.

Role alone or unrelated grants are insufficient. Other roles cannot bypass the role requirement with artificial administration grants. Reference visibility does not grant administrative write permissions or expand facility scope. A facility administrator still cannot mutate facility masters, global roles or account statuses, even with artificial grants for those commands.

Returns exactly two groups, each sorted by code, with database-backed `code` and `name` only:

| Group | Included values |
| --- | --- |
| `facilityTypes` | Active facility_types rows only; current database labels |
| `adminManagedRoles` | Exactly FACILITY_ADMIN, LAB_STAFF, PROGRAM_MONITOR, SYSTEM_ADMIN, TB_OFFICER; membership from the existing UserAdministrationService.ADMIN_MANAGED set |

No role IDs, descriptions, permission catalog, PATIENT or TREATMENT_SUPPORTER are exposed. Both groups are returned independently of which permitted grant authorizes reading. These are TBCall administration terms, not official SITB user/group mappings. There is no reference ETag or write precondition.

## Read and workflow boundaries

All three GETs use read-only transactions. Successful reads create no audit rows or domain writes. Existing authorization-denied audit behavior remains. Anonymous/invalid-session requests remain 401 under existing authentication; current roles, grants and active assignments are resolved by the unchanged session machinery.

Facility create/PATCH/deactivate, exact normalized masked user lookup and its audit, membership/primary assignment, managed role assignment/removal, account statuses, session revocation, last usable system-admin protection and identity-link workflows are unchanged. No fuzzy user directory, patient/NIK/BPJS lookup, generic permission mutation or new write is added.

Phase 5A integration routes and persistence are unchanged. Existing integration metadata browsing needs no new route. No connector configuration, credentials, activation, sync/import/export/write-back, conflict resolution or SITB network request is introduced. SITB metadata remains governed by existing persistence and makes no external API-contract claim.

The [checkpoint report](PHASE5A_7_REPORT.md) records the manifest and exact PostgreSQL/Spring clean build. No frontend files or migrations are changed. F4 UI remains subject to its own approved implementation brief.
