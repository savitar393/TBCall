# TBCall Backend v1.5A.1 — Frontend F2A Read-Contract Enablement

Base commit: `5731ddcad3e5a24c897d81c15a170152de534968`

Status: narrow backend enablement checkpoint required before TB Officer clinical-intake frontend F2A.

This checkpoint adds read-only contracts that the existing clinical intake workflow already needs. It does not add new clinical state, change workflow semantics, or modify the database schema.

## 1. Why this checkpoint exists

The current backend already supports:
- patient worklist/detail;
- patient resolve;
- registration create/update;
- diagnosis create/update;
- case confirmation/update.

However, a browser client cannot safely resume the workflow after refresh because:

1. there is no GET/list endpoint for diagnoses attached to a registration;
2. there is no safe clinical reference-data endpoint for active canonical code/name catalogs;
3. there is no safe active-facility directory for choosing a referral destination.

Without these contracts the frontend would have to retain diagnosis IDs only in transient client state, hard-code mutable reference catalogs, or ask users to paste facility UUIDs. F2A must not do any of those.

## 2. Migration policy

Do not modify V1–V17.
Do not add V18.
No schema change is authorized.

## 3. Diagnosis read contracts

Add:
- `GET /api/v1/registrations/{registrationId}/diagnoses`
- `GET /api/v1/diagnoses/{diagnosisId}`

Registration diagnosis list authorization:
- TB_OFFICER
- DIAGNOSIS_READ
- registration facility active and in actor facility scope

Return all diagnoses for that registration ordered by diagnosisDate then id using the existing safe `DiagnosisView`.

Diagnosis detail:
- same authorization/scope
- return existing `DiagnosisView`
- return normal server ETag using existing IfMatch formatting

Add a dedicated diagnosis-read access method. Do not abuse the write-only access path.

Out-of-scope resources remain non-enumerating 404.

No success audit row for reads.

## 4. Clinical reference-data endpoint

Add:

`GET /api/v1/clinical-reference-data`

Authorization:
- TB_OFFICER
- PATIENT_READ
- existing ClinicalAccess officer semantics

Return only active code/name entries, deterministically sorted.

Required groups:
- sexCodes
- suspectTypes
- previousTreatmentCategories
- hivStatuses
- dmStatuses
- anatomicalSites
- diagnosisTypes
- caseCategories
- drugResistancePatterns
- pregnancyStatuses
- bcgStatuses

Also return application workflow options:

citizenships:
- WNI — Warga Negara Indonesia
- WNA — Warga Negara Asing

treatmentDispositions:
- TREAT_HERE — Diobati di fasyankes ini
- REFERRED — Dirujuk ke fasyankes lain
- NOT_TREATED — Tidak diobati
- UNKNOWN — Belum ditentukan

registrationStatusFilters:
- OPEN — Terbuka
- DIAGNOSED — Sudah didiagnosis

caseStatusFilters:
- ACTIVE — Aktif
- REFERRED — Dirujuk

These are TBCall application contract labels, not SITB physical codes.

Do not return inactive historical rows, descriptions, internal DB IDs beyond canonical codes, or SITB mappings.

## 5. Active clinical facility directory

Add:

`GET /api/v1/clinical-facilities`

Authorization:
- TB_OFFICER
- PATIENT_READ
- at least one active assigned facility

Parameters:
- page default 0
- size default 20, max 50
- query optional; trimmed; when supplied length 2..255

Return only active facilities.

Projection:
- id
- name
- facilityTypeCode
- provinceCode
- regencyCode

Do not return address, coordinates, parent internals, user assignments, or audit data.

Search by case-insensitive name substring with wildcard escaping. Order by name then id.

Directory visibility does not grant write scope. Existing diagnosis/referral commands remain authoritative for destination validity.

## 6. Existing behavior unchanged

Do not alter:
- patient resolve;
- exact WNI/WNA confirmation;
- patient/registration/diagnosis/case write validation;
- If-Match semantics;
- ClinicalSourceAuthorityPolicy;
- current-patient scope;
- referral ownership;
- SITB integration boundary;
- frontend code.

No new write endpoints.

## 7. Tests

Backend baseline: 886 tests.

Add authenticated PostgreSQL/Spring tests covering:

Diagnosis reads:
- zero diagnoses -> empty list
- multiple diagnoses deterministic order
- detail returns ETag
- TB_OFFICER + DIAGNOSIS_READ required
- out-of-scope -> 404
- patient/supporter/lab/admin/program roles do not bypass
- no read audit/write side effect
- after diagnosis create, fresh GET recovers its ID
- DIAGNOSED registration can resume after stateless reload

Reference data:
- all required groups
- active-only
- inactive historical previous-treatment rows absent
- deterministic sorting
- workflow codes exactly as current backend contract
- non-TB-officer denied

Facility directory:
- active-only
- query and wildcard escaping
- bounded pagination
- deterministic ordering
- safe projection only
- non-TB-officer denied
- directory visibility does not grant mutation scope

Regression:
- all previous 886 backend tests green
- frontend F1 files byte-for-byte unchanged

Run on Windows:

```powershell
.\mvnw.cmd clean test
```

## 8. Documentation

Add:
- `docs/FRONTEND_BACKEND_READ_CONTRACTS.md`
- `docs/PHASE5A_1_REPORT.md`

Update root README only if needed.

Commit architecture:
- `docs/architecture/TBCall_Backend_v1.5A.1_Frontend_F2A_Read_Contracts.md`

## 9. After this checkpoint

F2A frontend may implement:
- TB Officer patient worklist
- exact patient resolve
- registration creation
- patient/registration edit
- diagnosis create/edit
- case confirmation/edit

F2A must use these backend contracts instead of hard-coded catalogs, transient diagnosis IDs, or manual facility UUID entry.
