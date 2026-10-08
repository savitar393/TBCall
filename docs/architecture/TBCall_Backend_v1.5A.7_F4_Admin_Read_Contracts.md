# TBCall Backend v1.5A.7 — F4 Administration Read Contracts

Base commit after approved F3 frontend: `d1c0cdd15a7eb4a3fd9a51dd633a75cfae6c5425`

Status: narrow backend read-contract checkpoint required before F4 administration + integration-boundary frontend.

The existing Phase 1.1 administration backend already supports facility create/update/deactivate, exact user lookup, facility memberships, global admin-managed roles, and user status transitions. Phase 5A already provides complete read-only integration metadata.

The remaining F4 browser blockers are:

1. no facility list/detail read path for SYSTEM_ADMIN to recover existing facility state and an authoritative ETag before PATCH/deactivate;
2. no server-owned active facility-type / admin-managed-role reference catalog for safe selects.

No schema or administrative write change is authorized.

## 1. Migration policy

Do not modify V1–V17.
Do not add V18.
No schema change.

## 2. Facility list

Add:

`GET /api/v1/admin/facilities`

Authorization:
- SYSTEM_ADMIN
- FACILITY_MANAGE

Reuse `AdministrativePolicies.requireSystem(actor, "FACILITY_MANAGE")`.

Parameters:
- page default 0
- size default 20, max 50
- query optional; trim; when present length 2..255
- active optional boolean

Return page:

```text
content
page
size
totalElements
```

Facility summary projection:
- id
- name
- facilityTypeCode
- parentFacilityId
- provinceCode
- regencyCode
- active

Do not include version in list summary. F4 must not synthesize facility ETags from a list.

Search:
- case-insensitive facility-name substring
- literal wildcard escaping
- stable order by name then id

The list includes active and inactive facilities unless `active` is explicitly supplied.

Do not return address, district/village, postal code, coordinates or memberships in list summary.

No successful-read audit row.

## 3. Facility detail with ETag

Add:

`GET /api/v1/admin/facilities/{facilityId}`

Authorization:
- SYSTEM_ADMIN
- FACILITY_MANAGE

Missing resource -> 404 after authorization.

Response:
- existing `AdminDtos.FacilityResponse`
- actual quoted ETag from `version`

This is the authoritative read for:
- PATCH facility
- deactivate facility

Do not create a new detail DTO if `FacilityResponse` already matches the approved master-data fields.

GET must not mutate or audit.

## 4. Administration reference data

Add:

`GET /api/v1/admin/reference-data`

Purpose:
- safe facility-type selects for facility create/update;
- safe global admin-managed role choices for role assignment/removal.

Authorization permits either:

A. SYSTEM_ADMIN with at least one actually-held administration permission:
- FACILITY_MANAGE
- USER_MANAGE_FACILITY
- ROLE_MANAGE
- USER_ACCOUNT_MANAGE

OR

B. FACILITY_ADMIN + USER_MANAGE_FACILITY + at least one active assigned facility.

Do not permit unrelated roles through artificial grants.

No facility assignment is required for SYSTEM_ADMIN.

Return one explicit DTO:

### facilityTypes

Active `facility_types` only:
- code
- name

Sorted by code.

Exclude:
- inactive rows
- descriptions

### adminManagedRoles

Only role codes already managed by `UserAdministrationService.ADMIN_MANAGED`:
- SYSTEM_ADMIN
- PROGRAM_MONITOR
- TB_OFFICER
- LAB_STAFF
- FACILITY_ADMIN

Return database-backed:
- code
- name

Sorted by code.

Do not return:
- PATIENT
- TREATMENT_SUPPORTER
- permission lists
- role descriptions
- role IDs

This endpoint does not grant role-management permission. FACILITY_ADMIN may receive the vocabulary but still cannot call role-management commands.

All values are TBCall administration vocabulary, not SITB user/group mappings.

No successful-read audit row.

## 5. Existing administrative behavior unchanged

Do not change:

- facility create/PATCH/deactivate behavior;
- exact normalized user lookup and its existing audit;
- membership assignment/removal;
- primary-facility behavior;
- role assignment/removal;
- account suspend/reactivate/disable;
- session revocation;
- last usable SYSTEM_ADMIN guard;
- verification requirements;
- PATIENT/TREATMENT_SUPPORTER identity-link workflows;
- frontend files.

Do not add user directory/fuzzy search.
Do not add patient/NIK/BPJS lookup.
Do not add generic role or permission mutation.
Do not add facility reactivation; no such existing command exists.

## 6. Integration boundary

Do not modify any Phase 5A integration endpoint or persistence.

F4 will use the existing read-only routes:

- GET `/api/v1/integrations`
- GET `/api/v1/integrations/{code}`
- GET `/api/v1/integrations/{code}/external-identifiers`
- GET `/api/v1/integrations/{code}/authorities`
- GET `/api/v1/integrations/{code}/sync-runs`
- GET `/api/v1/integrations/{code}/sync-runs/{runId}`
- GET `/api/v1/integrations/{code}/conflicts`

No new integration route is required.

Do not add:
- connect/configure
- credentials
- activate/deactivate
- start sync
- import/export
- push/write-back
- conflict resolution
- authority/identifier mutation
- SITB network calls

`SITB` remains TBCall internal metadata, inactive/unconfigured unless persistence says otherwise. No API-contract claim is introduced.

## 7. Tests

Backend baseline: 1258 tests.

Add PostgreSQL/Spring integration coverage.

### Facility list
- SYSTEM_ADMIN + FACILITY_MANAGE succeeds
- missing permission -> 403
- wrong role with artificial FACILITY_MANAGE -> 403
- no facility assignment required for system admin
- active and inactive returned by default
- active filter works
- case-insensitive name search
- literal `%`, `_`, `!` handling
- query/page/size validation
- stable name/id order
- summary projection contains only approved fields
- successful list read creates no audit

### Facility detail
- authorized 200
- existing FacilityResponse projection exactly
- actual quoted ETag
- missing -> 404
- no audit/data mutation
- PATCH with returned ETag succeeds
- old ETag becomes stale after PATCH
- list response is not used as an ETag contract

### Reference data
- SYSTEM_ADMIN succeeds independently with each relevant admin permission
- FACILITY_ADMIN + USER_MANAGE_FACILITY + active assignment succeeds
- facility admin without assignment -> 403
- wrong roles denied
- active facility types only, sorted
- inactive facility type excluded
- adminManagedRoles exactly the five current admin-managed codes
- PATIENT/TREATMENT_SUPPORTER excluded
- code/name-only items
- reading references does not grant role/facility/status mutations
- no successful-read audit

### Regression
- existing user lookup/membership/role/status behavior unchanged
- all existing integration-boundary tests unchanged
- all previous 1258 tests green
- frontend byte-for-byte unchanged
- V1–V17 unchanged/no V18

Run:

```powershell
.\mvnw.cmd clean test
```

## 8. Documentation

Add:
- `docs/FRONTEND_ADMIN_READ_CONTRACTS.md`
- `docs/PHASE5A_7_REPORT.md`
- `docs/architecture/TBCall_Backend_v1.5A.7_F4_Admin_Read_Contracts.md`

Update README only where useful.

## 9. After approval

Frontend F4 may implement:

- SYSTEM_ADMIN facility browsing/create/edit/deactivate;
- exact user lookup;
- SYSTEM_ADMIN/FACILITY_ADMIN membership management within backend scope;
- SYSTEM_ADMIN managed-role changes;
- SYSTEM_ADMIN account suspend/reactivate/disable;
- read-only Phase 5A integration-boundary browsing.

F4 must use facility detail ETags for facility PATCH/deactivate and must not invent SITB connector controls.
