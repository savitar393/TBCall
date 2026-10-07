# TBCall Frontend v1.1 — F2A Clinical Intake

Approved base: `863ca8c23b15dd57f3fc85db9618a75537212609`

## Scope

Implement only the TB Officer intake path:

Patient worklist → registration → diagnosis → case confirmation/edit.

Do not implement lab, treatment, referral-transfer, contact/TPT, monitoring, patient/supporter or admin UI.

## Routes

- `/patients`
- `/intake/new`
- `/patients/[patientId]`
- `/registrations/[registrationId]`
- `/diagnoses/[diagnosisId]`
- `/cases/[caseId]`

All routes use the existing F1 SessionBoundary.

## Backend contracts

Use only current APIs.

Patient:
- GET `/api/v1/patients`
- GET/PATCH `/api/v1/patients/{patientId}`
- POST `/api/v1/patients/resolve`

Registration:
- POST `/api/v1/registrations`
- GET/PATCH `/api/v1/registrations/{registrationId}`

Diagnosis:
- GET/POST `/api/v1/registrations/{registrationId}/diagnoses`
- GET/PATCH `/api/v1/diagnoses/{diagnosisId}`

Case:
- POST `/api/v1/registrations/{registrationId}/cases`
- GET/PATCH `/api/v1/cases/{caseId}`

Directories:
- GET `/api/v1/clinical-reference-data`
- GET `/api/v1/clinical-facilities`

No backend changes are authorized.

## Authorization UX

Backend clinical endpoints explicitly require `TB_OFFICER` in addition to permission codes.

Frontend may therefore use the explicit backend role contract plus permissions:
- module/worklist: TB_OFFICER + PATIENT_READ
- registration create: PATIENT_CREATE + REGISTRATION_WRITE
- existing-patient resolve: PATIENT_IDENTITY_RESOLVE
- patient edit: PATIENT_UPDATE
- registration read/write: REGISTRATION_READ / REGISTRATION_WRITE
- diagnosis read/write: DIAGNOSIS_READ / DIAGNOSIS_WRITE
- case read/write: CASE_READ / CASE_WRITE

Never infer permissions from role names. Backend remains authoritative.

A PATIENT account with PATIENT_READ must not see TB Officer navigation.

## Feature organization

Create a focused module such as:

```text
frontend/features/clinical-intake/
  api.ts
  types.ts
  schemas.ts
  queries.ts
  permissions.ts
  components/
  forms/
```

Use existing F1 native `apiRequest`, TanStack Query, SessionProvider, shadcn, RHF and Zod.

Do not create a generic all-domain CRUD framework.

## Response validation

Create strict Zod schemas for:
- patient page/detail
- identity confirmation
- registration
- diagnosis
- case
- reference data
- facility page

Malformed responses use the existing safe INVALID_RESPONSE handling.

## Session/query isolation

Every protected clinical query key includes current user ID:

```text
["clinical", userId, ...]
```

Every queryFn passes TanStack's AbortSignal to `apiRequest`.

Never copy mutation responses across user-scoped caches.

Add the deferred F1 race regression:
1. old user starts a clinical GET;
2. `/me` changes to another account;
3. old GET resolves late;
4. old clinical data is never rendered by, or cached under, the new account.

## Patient worklist

Route `/patients`.

Display:
- full name
- sex
- birth date/unknown
- backend-masked NIK
- backend-masked BPJS
- current registration summaries
- current case summaries

Filters:
- name: blank or 3..255
- NIK: blank or exactly 16 digits
- BPJS: max 50
- registration status
- case status
- assigned facility from `/me.activeFacilities`
- pagination size 1..50

Use status labels from `/clinical-reference-data`.

Do not put name/NIK/BPJS filters into page URL/history. Keep filters in memory.

Provide loading, error, empty, pagination and clear-filter states.

## Patient detail/edit

Route `/patients/[patientId]`.

GET detail + server ETag.

Display demographics, current registrations and current cases.

Full identity values intentionally returned to authorized staff may be shown on this detail page, but never in URL, document metadata, logs or global chrome.

Edit only with PATIENT_UPDATE.

PATCH rules:
- send only changed input fields
- omitted = unchanged
- explicit null = clear
- use server ETag in If-Match
- never synthesize ETag from version

Identity consistency:
- WNI => clear otherIdentityNumber
- WNA => clear nik
- known birth date => birthDate + birthDateUnknown=false
- unknown => birthDate=null + birthDateUnknown=true

Do not invent region catalogs. F2A may omit region-code editing.

## New registration wizard

Route `/intake/new`.

Requires TB_OFFICER + PATIENT_CREATE + REGISTRATION_WRITE.

Step 1: select registration facility only from `/me.activeFacilities`.
Preselect only when exactly one facility exists.

Step 2: choose `Pasien baru` or `Pasien sudah terdaftar`.

### New patient fields
- fullName
- citizenship
- NIK OR other identity
- BPJS optional
- birthPlace optional
- birthDate OR unknown
- sexCode
- phone optional
- address optional

Use live reference data.

### Existing patient

Requires PATIENT_IDENTITY_RESOLVE.

Collect:
- citizenship
- NIK for WNI or otherIdentityNumber for WNA
- at least fullName or birthDate confirmation
- BPJS optional

POST `/patients/resolve`.

Display only returned masked confirmation.

Keep the original exact confirmation only in wizard memory, and reuse it in the final `existingPatient` registration payload.

Never persist or fuzzy-match it.

Refresh before final submission intentionally requires reconfirmation.

Clear this sensitive state after:
- successful registration
- switching patient path
- logout/account change
- leaving wizard

### Registration fields
- registrationDate
- facilityRegistrationNumber optional
- medicalRecordNumber optional
- specimenIdentityNumber optional
- suspectTypeCode
- previousTreatmentCategoryCode
- referredByType optional
- referredByReference optional
- referralNotes optional
- initialWeightKg optional
- hivStatusCode optional
- dmStatusCode optional

On success navigate to `/registrations/{id}`.

## Registration detail/edit

Route `/registrations/[registrationId]`.

GET registration + ETag.
If DIAGNOSIS_READ, also GET diagnosis list.

Display patient summary, facility, status, registration data and diagnosis cards.

Edit only with REGISTRATION_WRITE and UI status OPEN.
Backend remains final authority.

PATCH dirty fields only with current ETag.

After update invalidate registration, patient detail and worklist.

## Diagnosis workflow

Registration page offers `Tambah diagnosis` with DIAGNOSIS_WRITE when status is OPEN or DIAGNOSED.

Create uses current registration ETag.

Fields:
- diagnosisDate
- anatomicalSiteCode
- diagnosisTypeCode
- diagnosisResult
- chestXrayResult/date/serial/impression optional
- icd10Code optional
- treatmentDisposition
- referredToFacilityId conditional
- notes optional

No diagnostic inference.

### Referral destination

If disposition = REFERRED:
- search `/clinical-facilities`
- require at least 2 typed characters before request
- reasonable debounce
- show facility name and region codes
- exclude current registration facility in UI
- backend is final validator

If editing from REFERRED to another disposition, PATCH must explicitly send:

`referredToFacilityId: null`

### Diagnosis detail/edit

Route `/diagnoses/[diagnosisId]`.

GET detail + ETag.
Edit with DIAGNOSIS_WRITE.

Backend may reject edits after state transition or case confirmation; show state conflict and refetch, do not override.

After create/edit invalidate diagnosis list/detail, registration, patient detail and worklist.

Creation can change registration OPEN → DIAGNOSED, so always refetch registration.

## Case confirmation

On DIAGNOSED registration, with CASE_WRITE, show `Konfirmasi kasus`.

User explicitly selects a diagnosis from the recovered list.

Only diagnoses with disposition:
- TREAT_HERE
- REFERRED

are offered for confirmation.

Case fields:
- diagnosisId
- caseCategoryCode
- drugResistancePatternCode optional
- healthWorker optional
- pregnancyStatusCode optional
- heightCm optional
- weightKg optional
- bcgStatusCode optional
- previousTreatmentCategoryCode
- hivStatusCode optional
- dmStatusCode optional
- icd10Code optional

Use live catalogs.

Do not infer case category or resistance from clinical/lab data.

POST uses current registration ETag.

On success navigate to `/cases/{caseId}` and invalidate related queries.

## Case detail/edit

Route `/cases/[caseId]`.

GET case + ETag.

Display status, facility, patient summary, registration, confirming diagnosis and current case fields.

Edit only with CASE_WRITE.

PATCH changed fields only with current server ETag.

No frontend status transition and no treatment/regimen UI.

## ETag/conflict behavior

For all versioned writes:
- use server ETag only
- no automatic mutation replay

OPTIMISTIC_LOCK_CONFLICT:
- show stale-data message
- refetch server state
- preserve unsaved form values
- require explicit user review/resubmission

SOURCE_AUTHORITY_CONFLICT:
- show existing external-source read-only message
- disable repeated save attempts for that mounted form
- keep reads/navigation available

Clinical state 409:
- show safe Indonesian state-change message
- refetch relevant resource
- do not parse prose into field errors

## Payload discipline

Build explicit request mappers.

Never serialize response DTOs back to PATCH.

Never send response-only fields such as:
- id
- version
- status
- nested patient/facility labels
- audit/sync data

Decimals stay strings in form state, validate before converting to JSON number.

Dates are `YYYY-MM-DD`.

## Reference data

Use `/clinical-reference-data`, memory-only.

Reasonable staleTime such as 5 minutes is allowed.

Historical inactive values may render from labels embedded in detail responses, but must not be added to active selection lists.

Do not hard-code mutable catalog rows.

## Privacy

No clinical persistence.

No patient names/NIK/BPJS/phone/address in:
- console logs
- browser page query parameters
- document metadata
- global navigation
- localStorage/sessionStorage/indexedDB

No raw backend prose rendering.

## Accessibility/responsive UX

Keep F1 accessibility standards.

Worklist must have a usable mobile representation.
Forms use semantic groups/headings.
All controls labeled.
Status meaning includes text, never color only.
Focus first invalid field when practical.

## Tests

Continue Vitest + RTL + user-event.

At minimum cover:
- role + permission navigation
- PATIENT with PATIENT_READ does not see officer module
- old-session late-request race
- abort signal passed to clinical queries
- masked worklist identities
- filter validation and no sensitive page URL state
- new-patient registration payload
- exact existing-patient resolve/reconfirmation
- confirmation state clearing
- assigned registration facilities only
- ETag on edits
- dirty-only PATCH
- explicit null clearing
- stale conflict has no auto-resubmit
- diagnosis recovery after refresh
- referral facility search and current-facility exclusion
- changing away from REFERRED clears destination
- case explicit diagnosis selection
- NOT_TREATED/UNKNOWN excluded from confirmation choices
- no frontend clinical inference
- no clinical browser persistence/logging

## Gates

From `frontend/`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Backend source/migrations/tests must remain unchanged.

A real-backend browser smoke check is recommended only with already provisioned accounts. Do not weaken security or create fake production credentials.

## Documentation

Add:
- `docs/FRONTEND_F2A_CLINICAL_INTAKE.md`
- `docs/FRONTEND_F2A_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.1_F2A_Clinical_Intake.md`

Update frontend README and root README.

## Deferred

F2B laboratory UI.
F2C treatment/adherence/follow-up/adverse event/outcome UI.
F2D referral-transfer + contacts/TPT UI.
F2E staff monitoring/alerts/notifications.
F3 patient/supporter portal.
F4 administration/integration UI.
