# TBCall Application/API v1.2 — Phase 2 Clinical Intake & Case Confirmation

Status: approved architecture baseline after Phase 1.1 commit `dbb659fdbf48f9333ecfc819c1f814e69a6de5fc`.

Phase 2 implements the first clinical vertical slice:

`Patient identity -> Terduga TBC registration -> Diagnosis -> Confirmed TB case`

It stops before laboratory workflow implementation and before treatment creation.

## 1. Source alignment

The 2021 SITB manual is used for workflow/data-shape alignment:
- every patient passes through `Terduga TBC` before becoming a TB case;
- new and repeat terduga registrations are distinct;
- duplicate-person checking is part of registration;
- identity data include name, citizenship, NIK/identity number, BPJS, place/date of birth, sex, address and phone;
- registration data include registration date, facility registration number, medical-record number, specimen identity, referral source, weight, DM history and HIV status;
- case data include anatomical site, bacteriological vs clinical diagnosis, previous-treatment history, HIV/DM, ICD-10 and referral/treatment disposition.

Current Kemenkes guidance governs clinical terminology. Phase 2 does not implement treatment decisions, laboratory result interpretation, or automated diagnosis inference.

TBCall codes and JSON fields are canonical TBCall identifiers, not claims about the SITB physical database/API.

## 2. Main application rules

1. `Patient` is the person.
2. `TBRegistration` is one Terduga TBC episode.
3. One person may have multiple registrations over time.
4. Creating a new Terduga episode creates or reuses patient identity in the same use case.
5. Diagnosis is explicit; lab results do not automatically confirm a case in Phase 2.
6. `TBCase` is created only through an explicit case-confirmation command.
7. Historical facility association does not grant blanket access to every patient resource.
8. Every clinical command calls `ClinicalSourceAuthorityPolicy`.
9. JPA entities are never returned directly.
10. User-facing terminology/messages are Indonesian.

## 3. V11

Create `V11__clinical_intake_support.sql`.

Do not modify V1–V10.

Add permission:
- `PATIENT_IDENTITY_RESOLVE` — `Mencocokkan identitas pasien untuk registrasi`

Grant only to `TB_OFFICER`.

Add exact-search support:

```sql
CREATE INDEX idx_patients_other_identity
    ON patients(other_identity_number)
    WHERE other_identity_number IS NOT NULL;
```

No global patient-directory endpoint.

## 4. Patient identity validation

Canonical citizenship values:
- `WNI`
- `WNA`

WNI requires:
- fullName
- citizenship=WNI
- NIK exactly 16 digits
- sexCode
- either birthDate or birthDateUnknown=true

WNA requires:
- fullName
- citizenship=WNA
- otherIdentityNumber
- sexCode
- either birthDate or birthDateUnknown=true

General:
- BPJS optional
- normalize phone using existing utility
- future birth date invalid
- birthDateUnknown=false requires birthDate
- active sexCode only
- trim text
- do not infer demographics

## 5. Controlled identity resolution

Endpoint:
`POST /api/v1/patients/resolve`

Authorization:
- TB_OFFICER
- PATIENT_IDENTITY_RESOLVE
- at least one active facility assignment

This is not a patient directory.

Require exact authoritative identity:
- WNI: exact NIK
- WNA: exact otherIdentityNumber

Also require one secondary confirmation:
- exact birthDate, or
- normalized fullName

BPJS can be an additional check but not the sole key.

Behavior:
- exact only
- no fuzzy/global list
- 404 no match
- 409 `PATIENT_IDENTITY_AMBIGUOUS` if non-unique WNA identity remains ambiguous
- audit `PATIENT_IDENTITY_RESOLVED`

Minimal response:
- patientId
- fullName
- citizenship
- masked NIK/other identity/BPJS
- birthDate or birthDateUnknown
- sex display

Do not include registration history, diagnosis, HIV/DM or facility history.

## 6. Create Terduga TBC registration

Endpoint:
`POST /api/v1/registrations`

Authorization:
- TB_OFFICER
- PATIENT_CREATE
- REGISTRATION_WRITE
- selected facility active and in actor scope

Request chooses exactly one mode:

### New patient
`newPatient` demographic object.

### Existing patient
`existingPatient`:
- patientId
- authoritative identity value
- secondary confirmation

Do not trust patientId alone for an out-of-scope historical patient.

If actor already has current clinical scope for the patient, identity reconfirmation may be omitted.

Registration fields:
- facilityId
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

Rules:
- registrationDate not future
- status always OPEN
- active reference codes only
- inactive legacy treatment-history codes rejected for new writes
- weight positive
- patient + registration created atomically in new-patient mode
- duplicate NIK/BPJS conflict is explicit; never silently create duplicate

Audit:
- PATIENT_CREATED when applicable
- TB_REGISTRATION_CREATED

## 7. Patient list/search

Endpoint:
`GET /api/v1/patients`

Authorization:
- TB_OFFICER + PATIENT_READ

Scope:
only current clinical patient scope:
- OPEN/DIAGNOSED registration at assigned facility, or
- ACTIVE/REFERRED case whose currentFacility is assigned

Pagination:
- page
- size max 50

Optional filters:
- name min 3 chars
- exact nik
- exact bpjs
- registrationStatus
- caseStatus
- facilityId constrained to actor scope

List projection:
- patientId
- version
- fullName
- sex
- birthDate/birthDateUnknown
- masked NIK/BPJS
- current registration/case summary
- current facility

No HIV/DM, detailed diagnosis, notes, audit or integration metadata in list projection.

## 8. Patient detail/update

### GET `/api/v1/patients/{patientId}`

TB_OFFICER + PATIENT_READ + current clinical patient scope.

Projection:
- demographics
- full NIK/BPJS/other identity for authorized clinical officer
- current/open scoped registrations
- active/referred scoped case summary
- approved HIV/DM fields from those scoped records
- versions

Do not expose unrelated historical resources from other facilities, audit, sync payloads or user-account secrets.

### PATCH `/api/v1/patients/{patientId}`

TB_OFFICER + PATIENT_UPDATE + current clinical scope + source-authority policy + If-Match.

Mutable demographic fields only.

Re-run full identity validation after patch merge.

Audit `PATIENT_UPDATED`.

## 9. Registration read/update

### GET `/api/v1/registrations/{registrationId}`

TB_OFFICER + REGISTRATION_READ.

Resource scope:
registration.facility is an active facility assignment of actor.

Historical registration at that facility may be read. This does not grant access to unrelated patient resources.

### PATCH `/api/v1/registrations/{registrationId}`

TB_OFFICER + REGISTRATION_WRITE + same facility scope + If-Match + source-authority policy.

Only `OPEN` registrations are editable through generic PATCH.

Editable:
- facilityRegistrationNumber
- medicalRecordNumber
- specimenIdentityNumber
- suspectTypeCode
- previousTreatmentCategoryCode
- referredByType
- referredByReference
- referralNotes
- initialWeightKg
- hivStatusCode
- dmStatusCode
- registrationDate

Do not permit patient reassignment, facility reassignment or direct status mutation.

Audit `TB_REGISTRATION_UPDATED`.

## 10. Diagnosis recording/update

### POST `/api/v1/registrations/{registrationId}/diagnoses`

TB_OFFICER + DIAGNOSIS_WRITE + registration facility scope + source policy.

Require registration If-Match and lock registration.

Allowed registration states:
- OPEN
- DIAGNOSED

Input:
- diagnosisDate
- anatomicalSiteCode
- diagnosisTypeCode
- diagnosisResult
- chestXrayResult optional
- chestXrayDate optional
- chestXraySerial optional
- chestXrayImpression optional
- icd10Code optional
- treatmentDisposition
- referredToFacilityId when disposition=REFERRED
- notes optional

Rules:
- diagnosisDate >= registrationDate
- diagnosisDate <= today
- active anatomy/type codes
- referred facility active and different from current facility
- Phase 2 does not infer diagnosis from laboratory data

First recorded diagnosis transitions:
`OPEN -> DIAGNOSED`

Additional diagnosis records are allowed while registration remains DIAGNOSED.

Audit `DIAGNOSIS_RECORDED`.

### PATCH `/api/v1/diagnoses/{diagnosisId}`

TB_OFFICER + DIAGNOSIS_WRITE + parent registration facility scope + If-Match + source policy.

Allowed only when:
- registration status = DIAGNOSED
- diagnosis is not referenced by a TBCase

Audit `DIAGNOSIS_UPDATED`.

Once used to confirm a case, diagnosis is immutable in Phase 2.

Phase 2 does not implement negative/non-TB closure because the canonical schema has no dedicated closure-reason model. Do not misuse referral notes or invent closure codes.

## 11. Confirm TB case

Endpoint:
`POST /api/v1/registrations/{registrationId}/cases`

Authorization:
- TB_OFFICER + CASE_WRITE
- registration facility scope
- source-authority policy
- registration If-Match

Require diagnosisId.

Lock registration and chosen diagnosis.

Preconditions:
- registration DIAGNOSED
- diagnosis belongs to registration
- no case already exists
- diagnosis type and anatomical site present

Case input:
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

Set:
- currentFacility = registration.facility
- confirmedAt = injected Clock now
- status = ACTIVE

Transition registration:
`DIAGNOSED -> CONVERTED_TO_CASE`

Resistance consistency:
- TB_SO => null or TB_SO
- TB_RO => null or TB_HR/TB_RR/TB_MDR/TB_PRE_XDR/TB_XDR

No automatic resistance inference.

Audit `TB_CASE_CONFIRMED`.

## 12. Case read/update

### GET `/api/v1/cases/{caseId}`

TB_OFFICER + CASE_READ.
Resource scope: currentFacility in actor facility scope.

Projection includes case fields, patient summary, confirming diagnosis summary, registration summary.
No treatment/lab detail yet.

### PATCH `/api/v1/cases/{caseId}`

TB_OFFICER + CASE_WRITE + current facility scope + If-Match + source policy.

Allowed only status ACTIVE or REFERRED.

Mutable:
- caseCategoryCode
- drugResistancePatternCode
- healthWorker
- pregnancyStatusCode
- heightCm
- weightKg
- bcgStatusCode
- previousTreatmentCategoryCode
- hivStatusCode
- dmStatusCode
- icd10Code

Do not permit generic changes to:
- registration
- confirming diagnosis
- current facility
- status
- confirmedAt
- closedAt

Audit `TB_CASE_UPDATED`.

Referral/transfer/status-transition commands are deferred to Phase 4.

## 13. Patient self view

Endpoint:
`GET /api/v1/me/patient`

Authorization:
- PATIENT + PATIENT_READ
- verified SELF scope

Projection:
- own basic demographics
- current registration status summary
- current case category/status
- anatomical site and diagnosis type summary
- current facility display

Do not include:
- internal notes
- referral-source notes
- audit/integration metadata
- supporter data
- HIV/DM in the initial patient portal projection

## 14. Source authority

Evolve `ClinicalSourceAuthorityPolicy`:

```java
void requireLocalCreate(CurrentActor actor, String permission, UUID facilityId, String resourceType);
void requireLocalEdit(CurrentActor actor, String permission, UUID facilityId, String resourceType, UUID resourceId);
```

Prototype implementation allows authorized local operations.

Every Phase 2 clinical write must invoke it.

Do not invent SITB ownership rules.

## 15. HTTP/version

Versioned updates use If-Match.

Diagnosis creation and case confirmation require registration If-Match because registration state is part of the command.

- missing: 428
- malformed: 400
- stale: 409
- no silent retry

## 16. Audit

Add:
- PATIENT_IDENTITY_RESOLVED
- PATIENT_CREATED
- PATIENT_UPDATED
- TB_REGISTRATION_CREATED
- TB_REGISTRATION_UPDATED
- DIAGNOSIS_RECORDED
- DIAGNOSIS_UPDATED
- TB_CASE_CONFIRMED
- TB_CASE_UPDATED

Do not audit NIK/BPJS/HIV/DM/free-text notes in metadata.

## 17. Data access

No controller-level unrestricted repository access.

Use dedicated query/application services.

Avoid N+1 list/detail queries.

Maximum page size 50.

No generic export endpoint.

## 18. Tests

Use PostgreSQL Testcontainers + Spring Security HTTP tests.

At minimum verify:
- V1–V11 migrate + Hibernate validate
- PATIENT_IDENTITY_RESOLVE only TB_OFFICER
- exact resolver is not fuzzy/global
- WNI/WNA validation
- atomic patient+registration creation
- existing-patient registration with identity reconfirmation
- duplicate NIK/BPJS conflicts
- inactive legacy references rejected
- facility scope on registration create/read/update
- patient list/detail current-scope restrictions
- historical-only association does not grant current patient detail
- patient PATCH If-Match/409
- registration PATCH only OPEN
- diagnosis creation transitions OPEN->DIAGNOSED
- diagnosis validation
- diagnosis update blocked after case confirmation
- case confirmation transitions DIAGNOSED->CONVERTED_TO_CASE
- duplicate case blocked
- case/diagnosis lineage
- SO/RO resistance consistency
- case PATCH restrictions
- patient-self projection field restrictions
- admin/lab/program roles do not gain Phase 2 clinical access
- source policy invoked for all writes
- audit metadata excludes sensitive values
- existing 152 tests remain green

Run `mvn clean test`.

## 19. Out of scope

Do not implement yet:
- lab request/result APIs
- treatment creation
- adherence/follow-up
- PMO treatment views
- referral/transfer commands
- contact investigation/TPT
- clinical alert/notification logic
- negative/non-TB registration closure model
- automatic diagnosis from lab
- automatic case classification
- SITB network integration
