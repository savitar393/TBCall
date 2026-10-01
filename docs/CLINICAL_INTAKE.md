# Clinical intake and case confirmation — Phase 2

Contract: [approved Application/API v1.2](architecture/TBCall_Application_API_v1.2_Phase2_Clinical_Intake.md). This slice records patient identity, Terduga TBC registrations, explicit diagnoses and confirmed cases. It does not create laboratory requests/results, treatments, referrals/transfers, contact/TPT workflows or clinical automation. Codes and JSON names are TBCall canonical identifiers; the SITB manual is a workflow reference.

## Endpoints and authorization

All staff endpoints require TB_OFFICER, the stated permission and an active facility assignment. Authentication uses the existing opaque session and CSRF contract. SYSTEM_ADMIN, FACILITY_ADMIN, LAB_STAFF and PROGRAM_MONITOR have no clinical bypass.

| Method/path under `/api/v1` | Permission | Scope / precondition |
|---|---|---|
| POST `/patients/resolve` | PATIENT_IDENTITY_RESOLVE | Exact authoritative identity plus secondary confirmation |
| POST `/registrations` | PATIENT_CREATE + REGISTRATION_WRITE | Active assigned selected facility; exactly one patient mode |
| GET `/patients` | PATIENT_READ | Current clinical patient scope |
| GET `/patients/{patientId}` | PATIENT_READ | Current clinical patient scope |
| PATCH `/patients/{patientId}` | PATIENT_UPDATE | Current clinical scope; patient If-Match |
| GET `/registrations/{registrationId}` | REGISTRATION_READ | Registration facility; historical reads permitted |
| PATCH `/registrations/{registrationId}` | REGISTRATION_WRITE | Registration facility; OPEN; registration If-Match |
| POST `/registrations/{registrationId}/diagnoses` | DIAGNOSIS_WRITE | Registration facility; OPEN/DIAGNOSED; registration If-Match |
| PATCH `/diagnoses/{diagnosisId}` | DIAGNOSIS_WRITE | Parent facility; DIAGNOSED, unused by case; diagnosis If-Match |
| POST `/registrations/{registrationId}/cases` | CASE_WRITE | Registration facility; DIAGNOSED; registration If-Match |
| GET `/cases/{caseId}` | CASE_READ | Case currentFacility |
| PATCH `/cases/{caseId}` | CASE_WRITE | Case currentFacility; ACTIVE/REFERRED; case If-Match |
| GET `/me/patient` | PATIENT_READ | PATIENT role and verified SELF link |

Current clinical scope requires an OPEN/DIAGNOSED registration at an assigned active facility or an ACTIVE/REFERRED case whose currentFacility is assigned and active. A historical association sufficient for Phase 1 identity linking does not grant current patient detail. Each resource has its own scope check; a current case does not expose its foreign-facility registration/diagnosis endpoint.

## Identity and registration

WNI requires trimmed fullName, citizenship=WNI, exactly 16-digit NIK, active sexCode, and birthDate or birthDateUnknown=true. WNA requires otherIdentityNumber instead of mandatory NIK. A provided NIK still must be valid. Known birthDate and birthDateUnknown=true are mutually exclusive; future birth dates are rejected. BPJS is optional; phone uses the existing normalizer. Demographics are never inferred.

Resolution requires exact NIK (WNI) or exact otherIdentityNumber (WNA), plus birthDate and/or fullName. Name comparison trims, collapses whitespace and ignores case; it does not perform substring/fuzzy matching. All supplied confirmations must match. BPJS is only an additional check. No match returns 404; multiple WNA matches after confirmation return 409 PATIENT_IDENTITY_AMBIGUOUS.

```json
{
  "citizenship": "WNI",
  "nik": "1234567890123456",
  "birthDate": "1990-01-01"
}
```

New-patient registration example (replace facilityId with an active assigned UUID and choose a non-future registrationDate):

```json
{
  "facilityId": "11111111-1111-1111-1111-111111111111",
  "registrationDate": "2026-10-01",
  "suspectTypeCode": "TB_SO",
  "previousTreatmentCategoryCode": "BARU",
  "newPatient": {
    "fullName": "Pasien Contoh",
    "citizenship": "WNI",
    "nik": "1234567890123456",
    "sexCode": "PEREMPUAN",
    "birthDate": "1990-01-01"
  }
}
```

For an existing patient, replace newPatient with existingPatient containing patientId and the same exact identity/secondary confirmation fields. Confirmation may be omitted only if the officer already has current clinical scope. Supplied confirmation is always checked. Confirmation validation and ambiguity resolution precede UUID lookup; demographics are rechecked after locking and refreshing the matched patient. Error differences therefore cannot reveal an unrelated UUID's existence. The lookup response itself grants no detail access.

New patient, OPEN registration and their audits are committed atomically. NIK/BPJS duplicates return 409 PATIENT_IDENTITY_DUPLICATE, including concurrent unique-constraint collisions and demographic PATCH. Existing PostgreSQL unique constraints remain authoritative. WNA identity is not made artificially unique; ambiguity is explicitly handled. Registration requires a non-future date and active suspect/previous-treatment codes. Optional HIV/DM references must also be active. Inactive legacy treatment-history codes are rejected. Positive weight/height values must fit the existing numeric columns.

## Queries and projections

Patient list accepts page≥0, size 1–50 (default 20), name of 3–255 characters, exact nik/bpjs, registrationStatus, caseStatus and an assigned facilityId. Status filters match only scoped current episodes. Unknown clinical filters are rejected. The security CSRF request parameter is not a clinical filter. Page count, patient rows, catalog labels and episode summaries are batched; query count does not grow per returned patient. Patients can have multiple current episodes, so summaries are arrays.

| DTO use | Included | Excluded |
|---|---|---|
| Identity confirmation | Patient UUID, name, citizenship, masked identities, birth date/unknown, sex display | Facilities, episodes, diagnosis, HIV/DM |
| Patient list | Version, demographics summary, masked NIK/BPJS, current scoped registration/case/facility summaries | Detailed diagnosis, HIV/DM, notes, audit/sync |
| Officer patient detail | Full identity/demographics, current scoped registrations/cases, approved episode HIV/DM, versions | Other facilities' historical resources, account secrets, audit/sync |
| Registration detail | Version, patient summary, facility and registration fields | Unrelated history and case/treatment/lab data |
| Diagnosis response | Version, parent ID/version, approved diagnosis fields | Unrelated patient history |
| Case detail | Version, profile, patient/registration/confirming-diagnosis summaries, current facility | Treatment/lab details, audit/sync |
| Patient SELF | Basic own demographics, current registration/case category/status, anatomy/diagnosis-type/facility summaries | NIK/BPJS, HIV/DM, internal/referral notes, supporter, audit/sync |

DTOs are explicit records. Requests use enumerated typed setters that distinguish omitted fields from explicit null; PATCH revalidates the merged record. Unknown fields, lineage reassignment, status mutation and timestamp mutation are rejected. No entity is serialized and no entity mapping was changed.

## Diagnosis, confirmation and versions

Diagnosis requires diagnosisDate≥registrationDate and ≤today, active anatomy/type, diagnosisResult and a V1 treatmentDisposition. REFERRED requires an active destination different from the registration facility. This records disposition only; it does not implement a referral command or infer diagnosis from laboratory results.

First diagnosis changes OPEN → DIAGNOSED. Further diagnoses may be recorded while DIAGNOSED; each advances registration.version. Diagnosis updates require the parent to remain DIAGNOSED and the diagnosis not to be used by a case. Confirmation locks registration then the chosen diagnosis, validates lineage and absence of another case, sets currentFacility to registration.facility, ACTIVE status and confirmedAt from injected Clock, then changes registration to CONVERTED_TO_CASE. Case category, previous-treatment history and resistance are explicit input. TB_SO permits null/TB_SO resistance; TB_RO permits null/TB_HR/TB_RR/TB_MDR/TB_PRE_XDR/TB_XDR. No automatic classification occurs.

Diagnosis POST and case confirmation use the registration ETag as If-Match. Diagnosis response includes registrationVersion for the next command; its own ETag identifies the diagnosis. GET the registration again to obtain its current ETag. All mutations requiring If-Match return 428 if absent and 409 OPTIMISTIC_LOCK_CONFLICT if stale. Case PATCH changes only the approved profile while ACTIVE/REFERRED; facility/status/lineage/confirmedAt/closedAt cannot be patched. READ_COMMITTED command transactions and the database one-case-per-registration constraint remain in effect; no silent retries are used.

## Source policy, errors and audit

Every clinical write invokes requireLocalCreate or requireLocalEdit after permission/scope checks. New-patient mode checks both patient and registration creation. The prototype permits authorized local data entry; it does not claim SITB ownership or enable network integration. A future adapter must use an authorized integration contract.

Errors retain problem+json, Indonesian detail and traceId. Scope queries return the same 404 for missing and unrelated resources; missing role/permission/active assignment returns 403 ACCESS_DENIED. Stable clinical codes are PATIENT_IDENTITY_AMBIGUOUS, PATIENT_IDENTITY_DUPLICATE, REFERENCE_CODE_INVALID and CLINICAL_STATE_CONFLICT; existing validation/version/security codes remain.

Audit actions: PATIENT_IDENTITY_RESOLVED, PATIENT_CREATED, PATIENT_UPDATED, TB_REGISTRATION_CREATED, TB_REGISTRATION_UPDATED, DIAGNOSIS_RECORDED, DIAGNOSIS_UPDATED, TB_CASE_CONFIRMED and TB_CASE_UPDATED. Metadata contains only traceId; NIK, BPJS, HIV/DM, notes and payloads are not copied into audit. Failed writes roll back clinical state and success audits.

## Persistence and next-phase boundary

V11 adds only the documented permission/grant and partial other_identity_number index. V1–V10 and all entities are preserved. Flyway manages schema; Hibernate validates it. Run `mvn clean test` with Java 21, Maven and Docker; committed sources require no `.tools/` generator.

There is no Phase 2 schema conflict. Negative/non-TB registration closure has no dedicated canonical reason model and remains deferred. Before future source-authority integration, obtain its official ownership/API contract. Subsequent lab/treatment/referral behavior requires the corresponding approved phase specification; none is implemented here.
