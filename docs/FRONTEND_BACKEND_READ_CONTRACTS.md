# Backend v1.5A.1 — F2A read contracts

This backend checkpoint adds four read-only contracts to the existing clinical-intake workflow. The [approved architecture](architecture/TBCall_Backend_v1.5A.1_Frontend_F2A_Read_Contracts.md) is authoritative. V1–V17, clinical command validation, source-authority policy and frontend F1 remain unchanged; no V18 is added.

## Endpoints and authorization

| Method/path | Required authorization | Response |
| --- | --- | --- |
| GET `/api/v1/registrations/{registrationId}/diagnoses` | TB_OFFICER, DIAGNOSIS_READ, active registration facility in actor scope | JSON array of existing DiagnosisView, diagnosisDate ascending then id |
| GET `/api/v1/diagnoses/{diagnosisId}` | Same role/permission/registration-facility scope | Existing DiagnosisView plus normal quoted numeric server ETag |
| GET `/api/v1/clinical-reference-data` | TB_OFFICER, PATIENT_READ, existing ClinicalAccess officer semantics | Eleven active canonical code/name lists and four fixed workflow lists |
| GET `/api/v1/clinical-facilities` | TB_OFFICER, PATIENT_READ, at least one active assigned facility | Safe paginated directory of all active facilities |

Role names alone are insufficient. Patient, supporter, laboratory, administrative and program roles cannot bypass officer requirements even if they have the same permission codes. Authenticated actors' facility IDs come from the existing resolver, which includes only active memberships of active facilities.

Diagnosis scope follows the **registration facility**, not the current facility of any confirmed case or a referral destination. Out-of-scope/missing/retired-registration-facility resources return the same `404 RESOURCE_NOT_FOUND`. Officers without an active assignment are denied by existing officer semantics. The dedicated diagnosis read method requires DIAGNOSIS_READ and does not use DIAGNOSIS_WRITE access. Reads do not impose new registration-state restrictions.

Successful reads do not append audit rows, alter clinical versions/timestamps, or evaluate mutation source-authority checks. Existing authentication/CSRF behavior and denial auditing remain in force. These endpoints confer no write permission.

## Stateless diagnosis recovery

After creating a diagnosis, a refreshed browser can:

1. GET the existing registration detail to recover its state and ETag.
2. GET its diagnosis list to recover diagnosis IDs and safe views; no transient-only ID storage is needed.
3. GET the selected diagnosis detail to obtain the current server ETag.
4. Send that exact ETag in If-Match to the existing PATCH endpoint, if authorization, scope, source authority and clinical state permit the command.

An empty registration list is `[]`. Detail/list use the existing fields: id, version, registrationId, registrationVersion, diagnosisDate, anatomicalSite, diagnosisType, diagnosisResult, chestXrayResult/date/serial/impression, icd10Code, treatmentDisposition, referredToFacility and notes. Existing code/name labels for inactive historical values remain available in historical diagnosis views; they are excluded from selectable reference lists. The detail ETag is `"<version>"`; it must not be synthesized from a client-side guess. List responses do not introduce a collection ETag.

## Clinical reference data

Each entry is exactly `{ "code": "...", "name": "..." }`. Database catalogs include only `active=true` rows, ordered by canonical code:

| Response group | Existing catalog |
| --- | --- |
| sexCodes | sex_codes |
| suspectTypes | tb_suspect_types |
| previousTreatmentCategories | previous_treatment_categories |
| hivStatuses | hiv_statuses |
| dmStatuses | dm_statuses |
| anatomicalSites | anatomical_sites |
| diagnosisTypes | diagnosis_types |
| caseCategories | tb_case_categories |
| drugResistancePatterns | drug_resistance_patterns |
| pregnancyStatuses | pregnancy_statuses |
| bcgStatuses | bcg_statuses |

Inactive historical previous-treatment categories, descriptions, database internals, patient data and external/SITB mappings are not returned. Catalog entity names are fixed server constants, never request-controlled.

The four fixed lists preserve the approved order and exact TBCall labels:

| Group | Code | Name |
| --- | --- | --- |
| citizenships | WNI | Warga Negara Indonesia |
| citizenships | WNA | Warga Negara Asing |
| treatmentDispositions | TREAT_HERE | Diobati di fasyankes ini |
| treatmentDispositions | REFERRED | Dirujuk ke fasyankes lain |
| treatmentDispositions | NOT_TREATED | Tidak diobati |
| treatmentDispositions | UNKNOWN | Belum ditentukan |
| registrationStatusFilters | OPEN | Terbuka |
| registrationStatusFilters | DIAGNOSED | Sudah didiagnosis |
| caseStatusFilters | ACTIVE | Aktif |
| caseStatusFilters | REFERRED | Dirujuk |

These are TBCall application contract options, not claims about SITB physical fields, codes or APIs. Clinical writes continue to validate the current catalog and workflow rules independently.

## Active facility directory

Parameters:

- `page`: integer, default 0, non-negative.
- `size`: integer, default 20, range 1–50.
- `query`: optional case-insensitive name substring; supplied values are stripped and must contain 2–255 characters. Empty/blank supplied values are invalid.
- Unknown directory filters are rejected; Spring Security's existing `_csrf` parameter is tolerated but is not a directory filter.
- Offsets beyond Integer.MAX_VALUE are rejected before multiplication can overflow.

Response shape:

```json
{
  "content": [{
    "id": "<TBCall facility UUID>",
    "name": "<facility name>",
    "facilityTypeCode": "<code or null>",
    "provinceCode": "<code or null>",
    "regencyCode": "<code or null>"
  }],
  "page": 0,
  "size": 20,
  "totalElements": 1
}
```

Results are ordered by name ascending then UUID, include only active facilities, and can include facilities outside the officer's assigned write scope. Literal `%`, `_` and the escape character `!` are escaped in a bound SQL LIKE parameter. Count and content use the same active/search predicate. A page beyond available results has empty content and the normal total.

No addresses, coordinates, parent hierarchy, assignment/user details, versions or audit metadata appear. A visible facility remains subject to the existing diagnosis/referral command's destination validity and write-scope rules. Directory visibility never authorizes editing a foreign registration/diagnosis.

## Verification and F2A handoff

The authenticated Spring/PostgreSQL integration suite covers stateless reload/edit with a server ETag, deterministic diagnosis ordering, role/permission/facility isolation, historical labels, all active reference groups/exact workflow options, safe directory projections, search/pagination bounds, literal wildcard handling and successful-read side effects. Existing tests run unchanged with `.\mvnw.cmd clean test`; see [PHASE5A_1_REPORT.md](PHASE5A_1_REPORT.md) for the exact result and manifest.

After this checkpoint, separately approved F2A work can consume these contracts through the existing F1 proxy. No F2A UI, new write endpoints or SITB networking are implemented here.
