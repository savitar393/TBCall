# TBCall Application/API v1.3B — Phase 3B Treatment & Monitoring

Base commit: `fe780347fa6e12362f7d2cbc1587ae47959c96e8`

Status: SUPERSEDED — do not implement this draft. Use [schema-reconciled v1.3B.1](TBCall_Application_API_v1.3B.1_Phase3B_Treatment_Monitoring_Schema_Reconciled.md), including the approved reuse of the existing V1 open-treatment index. Detailed unchanged field/date/projection requirements below are incorporated only where consistent with that replacement.

Phase 3B implements:
- treatment initiation;
- treatment-plan metadata;
- explicit drug snapshot;
- adherence/dose-event recording;
- follow-up scheduling/completion;
- adverse-event recording;
- final treatment outcome;
- patient treatment/follow-up projection;
- supporter treatment/adherence projection.

It does not implement automatic regimen eligibility, automatic dose calculation, automatic treatment outcomes, referral/transfer, contact/TPT, alert automation or SITB network integration.

## 1. Clinical/source principles

Current Kemenkes treatment guides govern clinical terminology. The SITB manual is used for treatment-recording workflow shape.

Key principles:
- treatment start records date, selected regimen and service location;
- treatment response, adherence and adverse effects require ongoing monitoring;
- TB SO monitoring includes clinical review/weight and bacteriological follow-up;
- TB RO monitoring is generally monthly and includes physical, microbiological and safety monitoring;
- final treatment outcome is an explicit program/clinical classification;
- outcome is not inferred automatically from free-text laboratory values;
- clinician-entered doses are recorded; TBCall does not calculate doses in this phase.

TBCall regimen/drug codes remain canonical TBCall identifiers, not official SITB API/database codes.

## 2. V12 migration

Create `V12__treatment_monitoring_support.sql`.

Do not modify V1–V11.

Add:

```sql
CREATE UNIQUE INDEX uq_treatments_one_open_per_case
ON treatments(case_id)
WHERE status IN ('ACTIVE', 'PAUSED');
```

Add to `follow_ups`:

```sql
weight_kg numeric(6,2),
symptom_summary text,
adherence_assessment varchar(80)
```

Add a positive CHECK for non-null weight.

Update only the FollowUp JPA mapping required for these new columns.

## 3. Authorization/scope

### TB_OFFICER
Requires the relevant V7 permission and active facility scope.
May start/update treatment, record staff adherence, schedule/complete follow-up, manage adverse events and record outcome.

### PATIENT
Verified SELF scope only.
May view approved own treatment/follow-up data and record own adherence.

### TREATMENT_SUPPORTER
Active linked supporter scope to the exact case.
May view limited support-relevant treatment/adherence data and record adherence.

Supporter projection must exclude HIV/DM, NIK/BPJS, labs, diagnosis narrative, adverse-event details, internal notes, audit/sync.

LAB_STAFF, FACILITY_ADMIN, PROGRAM_MONITOR and SYSTEM_ADMIN receive no treatment-clinical bypass.

## 4. Start treatment

Endpoint:

`POST /api/v1/cases/{caseId}/treatments`

Require:
- TB_OFFICER
- TREATMENT_WRITE
- case current-facility scope
- ClinicalSourceAuthorityPolicy create check

Lock TBCase with PESSIMISTIC_WRITE.

Preconditions:
- case status = ACTIVE;
- no treatment status ACTIVE/PAUSED for case;
- no final TreatmentOutcome on case;
- current facility active.

Request:
- regimenCode
- startDate
- plannedEndDate optional
- initialWeightKg optional
- oatForm optional
- drugSource optional
- intensiveStartDate/intensiveEndDate optional
- continuationStartDate/continuationEndDate optional
- regimenDescription optional
- notes optional
- drugs: 1..20 explicit snapshot lines

Each drug line:
- drugCode
- treatmentPhase optional
- doseValue optional positive
- doseUnit required if doseValue present
- frequencyPerWeek optional 1..7
- startDate
- endDate optional
- batchNumber optional
- drugSource optional
- notes optional

Server derives:
- facility = case.currentFacility
- status = ACTIVE
- drugNameSnapshot from active drug catalog

Validate:
- regimen active and regimenKind=TB_TREATMENT
- regimen case category matches case category
- startDate <= today and >= confirming diagnosis date
- plannedEndDate >= startDate when present
- phase/date ranges internally valid
- initialWeightKg > 0 when present
- all drugs active
- drug schedule dates valid
- no exact duplicate `(drugCode,treatmentPhase,startDate)` inside request

Do not automatically infer regimen composition, eligibility, duration or dose.

Audit: `TREATMENT_STARTED`

## 5. Treatment reads/update

Implement:
- GET `/api/v1/cases/{caseId}/treatments`
- GET `/api/v1/treatments/{treatmentId}`
- PATCH `/api/v1/treatments/{treatmentId}`

Staff detail includes:
- treatment/version/status
- case/patient minimum context
- regimen
- drug snapshot
- plan dates/metadata
- adherence summary/recent events
- follow-ups
- adverse events
- outcome if present
- case-owned FOLLOW_UP lab request IDs/statuses only, without clinical interpretation

PATCH:
- TB_OFFICER + TREATMENT_WRITE
- treatment facility/current case scope
- If-Match
- ClinicalSourceAuthorityPolicy edit check
- ACTIVE only

Mutable:
- plannedEndDate
- initialWeightKg
- oatForm
- drugSource
- intensive/continuation dates
- regimenDescription
- notes

Immutable through PATCH:
- case
- facility
- regimen
- startDate
- status
- actualEndDate
- treatment-drug rows

Drug-schedule adjustment after start is deferred to a later auditable command.

## 6. Adherence / dose events

Dose events are append-only evidence. No medical adherence score is automatically computed.

Allowed status:
- TAKEN
- MISSED

No future scheduledDate.

### TB officer
POST `/api/v1/treatments/{treatmentId}/dose-events`
Requires TB_OFFICER + ADHERENCE_RECORD + facility scope.
Server source=`TB_OFFICER`.

### Patient
POST `/api/v1/me/treatment/dose-events`
Requires PATIENT + ADHERENCE_RECORD + VERIFIED SELF scope.
Server source=`PATIENT_SELF`.

### Supporter
POST `/api/v1/me/supporting-cases/{caseId}/dose-events`
Requires TREATMENT_SUPPORTER + ADHERENCE_RECORD + active supporter link.
Server source=`TREATMENT_SUPPORTER`.

Input:
- scheduledDate
- status
- administrationMode optional
- notes optional

Rules:
- treatment ACTIVE
- treatment.startDate <= scheduledDate <= today
- recordedAt = Clock now
- recordedByUser = current actor
- no dedupe/overwrite; multiple evidence reports may coexist
- no automatic treatment/outcome mutation

Audit: `DOSE_EVENT_RECORDED`

Reads:
- GET `/api/v1/treatments/{treatmentId}/dose-events`
- GET `/api/v1/me/treatment/dose-events`
- GET `/api/v1/me/supporting-cases/{caseId}/dose-events`

Max page size 100.

## 7. Follow-up

### Schedule
POST `/api/v1/treatments/{treatmentId}/follow-ups`

TB_OFFICER + FOLLOW_UP_WRITE.
Treatment must be ACTIVE.
Require Treatment If-Match.

Input:
- followUpType
- scheduledAt
- facilityId optional, default treatment.facility
- notes optional

Set status=SCHEDULED.
Target facility active and in actor scope.

Audit: `FOLLOW_UP_SCHEDULED`

### Complete
POST `/api/v1/follow-ups/{followUpId}/complete`

TB_OFFICER + FOLLOW_UP_WRITE.
Require FollowUp If-Match.

Input:
- completedAt
- weightKg optional >0
- symptomSummary optional
- adherenceAssessment optional
- notes optional

Rules:
- follow-up SCHEDULED
- parent treatment ACTIVE
- completedAt not future
- facility in actor scope

Set:
- status=COMPLETED
- healthWorker=current user

No automatic lab request, dose adjustment or outcome.

Audit: `FOLLOW_UP_COMPLETED`

Patient read:
GET `/api/v1/me/follow-ups`

PATIENT + FOLLOW_UP_READ + SELF scope.
Return scheduling/status and patient-safe summary only.
Do not expose clinician notes, adherenceAssessment or internal symptom narrative.

No supporter follow-up access in this phase because current RBAC does not grant FOLLOW_UP_READ.

## 8. Adverse events

### Create
POST `/api/v1/treatments/{treatmentId}/adverse-events`

TB_OFFICER + ADVERSE_EVENT_WRITE + treatment facility scope.

Input:
- eventType required
- severity optional
- serious optional
- startedAt optional
- endedAt optional
- description optional
- actionTaken optional
- outcome optional

Server reportedAt=Clock now.

Validate:
- treatment ACTIVE for new event
- endedAt >= startedAt when both present
- no future event timestamps
- no automatic seriousness or causality inference
- no automatic regimen change

Audit: `ADVERSE_EVENT_RECORDED`

### Update
PATCH `/api/v1/adverse-events/{eventId}`

TB_OFFICER + ADVERSE_EVENT_WRITE + treatment facility scope.
Require If-Match and ClinicalSourceAuthorityPolicy edit check.

Mutable:
- severity
- serious
- startedAt
- endedAt
- description
- actionTaken
- outcome

Allow follow-up update after treatment closure.

Audit: `ADVERSE_EVENT_UPDATED`

## 9. Final treatment outcome

Endpoint:

`POST /api/v1/treatments/{treatmentId}/outcome`

TB_OFFICER + OUTCOME_WRITE + source-authority edit check.
Require Treatment If-Match.

Mandatory lock order:
1. TBCase PESSIMISTIC_WRITE
2. Treatment PESSIMISTIC_WRITE
3. verify no TreatmentOutcome
4. insert TreatmentOutcome

Preconditions:
- treatment status ACTIVE
- case status ACTIVE
- actor facility scope
- outcome code active
- outcomeDate between treatment start and today
- no existing outcome

Input:
- outcomeCode
- outcomeDate
- notes optional

Do not derive outcome from lab/adherence.

On success:
- create immutable outcome
- treatment.actualEndDate=outcomeDate
- treatment.status=COMPLETED
- case.status=COMPLETED
- case.closedAt=Clock now

`COMPLETED` means lifecycle closed; clinical success/failure is represented by outcomeCode.

No outcome PATCH/DELETE in Phase 3B.

Audit: `TREATMENT_OUTCOME_RECORDED`

This lock order must serialize with Phase 3A follow-up-result corrections.

## 10. Patient projection

GET `/api/v1/me/treatment`

PATIENT + TREATMENT_READ + VERIFIED SELF scope.

Return:
- own treatment status
- regimen display
- start/planned/actual end
- drug names/phases and clinician-recorded dose/frequency when present
- recent adherence
- outcome if present
- patient-safe adverse-event summary

Exclude:
- HIV/DM
- lab results
- clinician free-text notes
- batch/drug-source operational details
- audit/sync
- other user identity

GET `/api/v1/me/treatment/dose-events`
GET `/api/v1/me/follow-ups`

use the same self scope.

## 11. Supporter / PMO projection

GET `/api/v1/me/supporting-cases/{caseId}/treatment`

Requires TREATMENT_SUPPORTER + TREATMENT_READ + active supporter link.

Return:
- caseId
- patient display name
- treatment status
- regimen
- drug name/phase/dose/frequency when recorded
- start/planned end
- adherence summary/recent events

Exclude HIV/DM, NIK/BPJS, labs, diagnosis narrative, adverse-event details, follow-up clinical notes, outcome notes, audit/sync.

Supporter dose-event read/write uses the endpoints in section 6.

## 12. Source authority

Use existing ClinicalSourceAuthorityPolicy for staff clinical writes:
- treatment start/update
- follow-up schedule/complete
- adverse-event create/update
- outcome

Patient/supporter adherence is TBCall-owned monitoring evidence and does not consult SITB clinical source authority.

Do not modify LaboratorySourceAuthorityPolicy.

## 13. Concurrency

- normal transaction isolation READ_COMMITTED
- treatment start locks TBCase before open-treatment check
- V12 partial unique index is final open-treatment guard
- outcome lock order TBCase -> Treatment is mandatory
- no silent retry
- If-Match required for existing versioned mutations
- missing If-Match -> 428
- stale version -> 409

## 14. Audit privacy

Actions:
- TREATMENT_STARTED
- TREATMENT_UPDATED
- DOSE_EVENT_RECORDED
- FOLLOW_UP_SCHEDULED
- FOLLOW_UP_COMPLETED
- ADVERSE_EVENT_RECORDED
- ADVERSE_EVENT_UPDATED
- TREATMENT_OUTCOME_RECORDED

Audit only actor/action/target/correlation information.
Do not copy treatment notes, adherence notes/status, symptoms, adverse-event narrative, outcome notes or patient identifiers into audit metadata.

## 15. Tests

Use PostgreSQL Testcontainers + authenticated HTTP tests.

At minimum verify:

### V12
- V1–V12 clean migration + Hibernate validate
- open-treatment partial unique index
- FollowUp structured fields

### Treatment
- ACTIVE case in own scope can start
- REFERRED/COMPLETED/CANCELLED case cannot start
- concurrent starts -> one winner
- regimen active/category match
- inactive/wrong-category regimen rejected
- active drug catalog only
- explicit drug snapshot stored
- no automatic dose/regimen composition
- dates/weight validated
- other roles cannot start

### Update/read
- facility scope
- If-Match/409
- immutable treatment fields protected
- closed treatment not generic-PATCHable

### Adherence
- officer/patient/supporter exact scopes
- outsider supporter denied
- patient cannot write another patient's record
- TAKEN/MISSED only
- future/pre-treatment date rejected
- source/recordedBy derived correctly
- append-only evidence allowed
- no clinical state mutation

### Follow-up
- schedule/complete permissions, scope and If-Match
- weight/symptom/adherence fields persist
- no automatic lab/dose/outcome
- patient projection hides internal notes
- supporter has no follow-up endpoint access

### Adverse events
- create/update
- timeline validation
- no automatic regimen change
- patient-safe projection
- supporter projection excludes events

### Outcome
- TBCase -> Treatment lock order
- concurrent duplicate outcome -> one winner
- outcome vs lab-correction race serializes correctly
- active outcome code/date validation
- treatment/case closed as specified
- outcome immutable
- no automatic outcome inference
- late first lab result after outcome still allowed
- lab correction after outcome still blocked

### Projections/security
- patient projection safe
- supporter projection safe
- no HIV/DM/lab/NIK/BPJS/internal notes leakage to supporter
- admin/lab/program roles do not bypass
- audit metadata excludes sensitive payload

All existing 283 tests must remain green.

Run `mvn clean test`.

## 16. Out of scope

Do not implement:
- treatment pause/resume/stop/cancel
- post-start drug-schedule adjustment
- automatic dose calculation
- automatic regimen eligibility
- automatic follow-up schedule generation
- automatic lab request scheduling
- automatic outcome classification
- referral/transfer continuation
- contact investigation/TPT
- alert/notification automation
- patient lab-result portal
- supporter follow-up clinical detail
- SITB network integration

Future drug/dose changes must be modeled as auditable history-preserving commands, not generic in-place TreatmentDrug mutation.
