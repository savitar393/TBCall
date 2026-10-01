# TBCall Application/API v1.2.1 — Phase 2.1 Clinical Transition Hardening

Base commit: `d6d02e75e0fb2ce0d1f1026d455702121c8342a2`

Status: required hardening checkpoint before Phase 3 laboratory/treatment APIs.

No schema migration is required. V1–V11 remain immutable.

## 1. Reason for this checkpoint

Phase 2 correctly separates Patient, Terduga TBC registration, Diagnosis and TBCase. Review of the actual implementation found one semantic gap at case confirmation:

`CaseService.confirm()` currently accepts any diagnosis with anatomy/type and always creates an `ACTIVE` TB case, regardless of `treatmentDisposition`.

That allows a diagnosis marked:
- `NOT_TREATED`
- `UNKNOWN`
- `REFERRED`

to become an ACTIVE local case.

The existing model already contains the semantics needed to fix this without inventing new SITB fields:
- diagnosis.treatmentDisposition
- diagnosis.referredToFacility
- TBCase status `ACTIVE` / `REFERRED`
- later referral table type `PRE_TREATMENT_REFERRAL`

The intended behavior is therefore:

- `TREAT_HERE` -> create ACTIVE case at registration facility.
- `REFERRED` -> create REFERRED case at registration facility, retaining the diagnosis destination for the later referral workflow.
- `NOT_TREATED` / `UNKNOWN` -> case confirmation is rejected.

The registration still transitions `DIAGNOSED -> CONVERTED_TO_CASE` when an ACTIVE or REFERRED case is created.

No referral row is created in Phase 2.1; that remains Phase 4.

## 2. Diagnosis result semantics

Do not turn free-text `diagnosisResult` into an invented catalog in this checkpoint.

For Phase 2.1:
- `diagnosisResult` remains descriptive/narrative.
- `diagnosisTypeCode` and `anatomicalSiteCode` remain required clinical classification fields.
- `treatmentDisposition` is the authoritative Phase-2 workflow gate for whether a confirmed case can be created.
- caseCategoryCode remains explicit input; do not infer TB_SO/TB_RO from narrative diagnosisResult.

Do not add guessed values such as `BUKAN_TBC`, `POSITIF`, or official-looking SITB result codes.

## 3. Case confirmation hardening

Update `CaseService.confirm()`.

After locking the registration and diagnosis and validating lineage:

### TREAT_HERE

Require:
- diagnosis.treatmentDisposition = `TREAT_HERE`

Create:
- TBCase.status = `ACTIVE`
- TBCase.currentFacility = registration.facility

### REFERRED

Require:
- diagnosis.treatmentDisposition = `REFERRED`
- diagnosis.referredToFacility is non-null, active and not the registration facility

Create:
- TBCase.status = `REFERRED`
- TBCase.currentFacility = registration.facility

Do not move currentFacility to the destination yet.
The future pre-treatment referral workflow owns transfer/acceptance.

### NOT_TREATED / UNKNOWN

Reject confirmation with:
- HTTP 409
- stable code `CLINICAL_STATE_CONFLICT`
- Indonesian detail explaining that the diagnosis is not eligible to be registered as an active/referred TB case.

Do not create a case.
Do not change registration status.
Do not write success audit.

## 4. Registration transition

For successful case creation only:

`DIAGNOSED -> CONVERTED_TO_CASE`

This applies to both:
- ACTIVE local case
- REFERRED pre-treatment case

No direct status endpoint is added.

## 5. Current patient scope

Keep current clinical patient scope unchanged:
- OPEN/DIAGNOSED registration in assigned facility, OR
- ACTIVE/REFERRED case whose currentFacility is assigned.

A REFERRED case created at the source facility therefore remains visible to the source TB officer until the later referral workflow changes ownership/currentFacility.

## 6. Patient list filter contract cleanup

The Phase 2 patient list is explicitly a current-scope list.

Change accepted values:

`registrationStatus`
- `OPEN`
- `DIAGNOSED`

`caseStatus`
- `ACTIVE`
- `REFERRED`

Reject:
- CONVERTED_TO_CASE
- CLOSED
- CANCELLED
- TRANSFERRED
- COMPLETED

with 400 validation error rather than accepting a filter that can never match the current-scope query.

Do not widen the query to historical resources.

## 7. Treatment preparation rule for Phase 3

Document now, but do not implement treatment APIs yet:

A treatment may be initiated only for a case whose current status is `ACTIVE`.

A `REFERRED` case cannot start treatment at the source facility.

Phase 4 referral acceptance will define when/how a referred case becomes active at the destination.

## 8. Tests

Add regression tests proving:

1. TREAT_HERE confirmation creates ACTIVE case.
2. REFERRED confirmation creates REFERRED case.
3. REFERRED case keeps currentFacility = source registration facility.
4. REFERRED diagnosis destination remains available through confirming diagnosis.
5. NOT_TREATED confirmation returns 409 and creates no case.
6. UNKNOWN confirmation returns 409 and creates no case.
7. failed confirmation leaves registration DIAGNOSED and audit absent.
8. ACTIVE/REFERRED cases remain in current patient scope.
9. patient list accepts only OPEN/DIAGNOSED registrationStatus filters.
10. patient list accepts only ACTIVE/REFERRED caseStatus filters.
11. historical-only list statuses return 400.
12. all 199 existing tests remain green, adjusting only tests whose expected case status is explicitly changed by this approved rule.

Run:
`mvn clean test`

## 9. Documentation

Update:
- `docs/CLINICAL_INTAKE.md`
- `docs/AUTHORIZATION.md` if needed
- Phase 2 architecture addendum / implementation report
- README only if the public behavior needs clarification

Document:
- diagnosis disposition controls initial TBCase status;
- REFERRED is a pre-treatment state;
- no referral row/transfer occurs yet;
- treatment will require ACTIVE case.

## 10. Final report

Return:
- commit SHA
- files changed
- exact behavior change
- tests added/updated
- exact `mvn clean test` result
- confirmation that V1–V11 are unchanged
- any blocker before Phase 3

Do not start Phase 3 in this checkpoint.
