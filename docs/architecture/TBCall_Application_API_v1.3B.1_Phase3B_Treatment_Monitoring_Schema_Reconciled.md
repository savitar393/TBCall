# TBCall Application/API v1.3B.1 — Phase 3B Treatment & Monitoring (Schema-Reconciled)

Base commit: `fe780347fa6e12362f7d2cbc1587ae47959c96e8`

Status: approved replacement for the blocked v1.3B specification.

The previous v1.3B task is superseded. No Phase 3B implementation has occurred yet.

## 1. Reconciliation decision

The existing V1 `dose_events` model is authoritative and already contains richer canonical values than the first Phase 3B draft.

Existing status values:
- `TAKEN_OBSERVED`
- `TAKEN_SELF_REPORTED`
- `DISPENSED_HOME`
- `MISSED`
- `UNKNOWN`

Existing source values:
- `SITB`
- `PATIENT`
- `HEALTH_WORKER`
- `TBCALL`
- `IMPORT`

Therefore:
- do **not** add redundant `TAKEN`;
- preserve all existing status values;
- use `HEALTH_WORKER` for TB-officer entries;
- use `PATIENT` for patient-self entries;
- add `TREATMENT_SUPPORTER` as a new source value for linked supporter/PMO entries.

A second V1 conflict also exists: `UNIQUE (treatment_id, scheduled_date)` prevents the approved append-only multi-actor evidence model. V12 must reconcile that constraint too.

## 2. V12 migration

Create:

`V12__treatment_monitoring_support.sql`

Do not modify V1–V11.

### 2.1 One open treatment per case

Reuse the pre-existing V1 `uq_treatments_one_open_per_case` index exactly as-is:

```sql
WHERE status IN ('PLANNED', 'ACTIVE', 'PAUSED')
```

PLANNED is also an open episode. V12 must not drop, recreate or duplicate this index.
Terminal historical treatments do not block a new treatment where all other preconditions hold.

### 2.2 Structured follow-up observations

Add to `follow_ups`:
- `weight_kg numeric(6,2)`
- `symptom_summary text`
- `adherence_assessment varchar(80)`

Add a positive CHECK for non-null weight.

Update FollowUp JPA mapping.

### 2.3 Dose-event multi-actor evidence

Drop the V1 table constraint:

`dose_events_treatment_id_scheduled_date_key`

which currently enforces one row per treatment/day.

Replace it with:

```sql
CREATE UNIQUE INDEX uq_dose_events_actor_day
ON dose_events(treatment_id, scheduled_date, recorded_by_user_id)
WHERE recorded_by_user_id IS NOT NULL;
```

Semantics:
- one report per application user per treatment/day;
- different actors may record independent evidence for the same treatment/day;
- import/SITB rows with no recorded_by_user_id are not constrained by this application-user index;
- dose events remain append-only in Phase 3B.

### 2.4 Supporter provenance

Replace the existing generated `dose_events.source` CHECK with a named CHECK that retains all old values and adds:

- `TREATMENT_SUPPORTER`

Approved values become:
- `SITB`
- `PATIENT`
- `HEALTH_WORKER`
- `TREATMENT_SUPPORTER`
- `TBCALL`
- `IMPORT`

Do not remove or rename existing values.

No status CHECK change is required.

## 3. Treatment scope

Phase 3B implements treatment initiation, treatment-plan metadata, explicit drug snapshots, dose-event/adherence evidence, follow-up scheduling/completion, adverse events, final outcome, patient treatment/follow-up projection, and supporter treatment/adherence projection.

No automatic regimen eligibility, dose calculation, outcome inference, referral/transfer, contact/TPT, alert automation or SITB integration.

## 4. Authorization

TB_OFFICER: relevant V7 permission + active facility scope + source-authority policy for clinical writes.

PATIENT: VERIFIED SELF scope only; may view approved own treatment/follow-up and record own adherence evidence.

TREATMENT_SUPPORTER: active supporter link to exact case; may view limited treatment/adherence and record adherence evidence.

Supporter projection excludes HIV/DM, NIK/BPJS, labs, diagnosis narrative, adverse-event details, internal clinical notes, audit/sync.

Other roles have no treatment-clinical bypass.

## 5. Start treatment

POST `/api/v1/cases/{caseId}/treatments`

Require:
- TB_OFFICER + TREATMENT_WRITE
- case current-facility scope
- ClinicalSourceAuthorityPolicy create
- TBCase PESSIMISTIC_WRITE
- case status ACTIVE
- no PLANNED/ACTIVE/PAUSED treatment
- no final TreatmentOutcome for case
- active current facility

Request:
- regimenCode
- startDate
- plannedEndDate optional
- initialWeightKg optional
- oatForm optional
- drugSource optional
- intensive/continuation date fields optional
- regimenDescription optional
- notes optional
- 1..20 explicit drug snapshot lines

Each drug line:
- drugCode
- treatmentPhase optional
- doseValue optional positive
- doseUnit required when doseValue exists
- frequencyPerWeek optional 1..7
- startDate
- endDate optional
- batchNumber optional
- drugSource optional
- notes optional

Derive treatment.facility from case and status ACTIVE.
Snapshot active Drug.name.

Validate active TB_TREATMENT regimen matching case category, dates, weights, active drugs and duplicate request lines.

No automatic regimen composition, eligibility, dose or duration.

Audit `TREATMENT_STARTED`.

## 6. Treatment reads/update

Implement:
- GET `/api/v1/cases/{caseId}/treatments`
- GET `/api/v1/treatments/{treatmentId}`
- PATCH `/api/v1/treatments/{treatmentId}`

PATCH requires TB_OFFICER + TREATMENT_WRITE + scope + If-Match + source policy and ACTIVE treatment.

Mutable metadata only: plannedEndDate, initialWeightKg, oatForm, drugSource, phase dates, regimenDescription, notes.

Do not generic-change case/facility/regimen/start/status/actualEndDate/drug rows.

## 7. Dose-event / adherence evidence

Dose events use the existing V1 canonical status model.

### Staff route
POST `/api/v1/treatments/{treatmentId}/dose-events`

Allowed status:
- TAKEN_OBSERVED
- TAKEN_SELF_REPORTED
- DISPENSED_HOME
- MISSED
- UNKNOWN

Server:
- source = `HEALTH_WORKER`
- recordedByUser = actor
- recordedAt = Clock now

### Patient route
POST `/api/v1/me/treatment/dose-events`

Allowed status:
- TAKEN_SELF_REPORTED
- MISSED
- UNKNOWN

Server:
- source = `PATIENT`
- recordedByUser = actor
- recordedAt = Clock now

### Supporter route
POST `/api/v1/me/supporting-cases/{caseId}/dose-events`

Allowed status:
- TAKEN_OBSERVED
- TAKEN_SELF_REPORTED
- MISSED
- UNKNOWN

Server:
- source = `TREATMENT_SUPPORTER`
- recordedByUser = actor
- recordedAt = Clock now

### Common rules

Input:
- scheduledDate
- status
- administrationMode optional
- notes optional

Existing administration modes only:
- DIRECTLY_OBSERVED
- SELF_ADMINISTERED
- OTHER

Rules:
- treatment ACTIVE
- startDate <= scheduledDate <= today
- one row per actor per treatment/day
- duplicate same actor/day -> 409 `DOSE_EVENT_ALREADY_RECORDED`
- different actors may coexist
- append-only; no update/delete
- no outcome/adherence classification inferred

Reads:
- GET `/api/v1/treatments/{treatmentId}/dose-events`
- GET `/api/v1/me/treatment/dose-events`
- GET `/api/v1/me/supporting-cases/{caseId}/dose-events`

Max page size 100.

Audit `DOSE_EVENT_RECORDED` without sensitive payload.

## 8. Follow-up

Schedule:
POST `/api/v1/treatments/{treatmentId}/follow-ups`

TB_OFFICER + FOLLOW_UP_WRITE, treatment ACTIVE, scope, Treatment If-Match, source policy.

Input: followUpType, scheduledAt, facilityId optional, notes optional.

Complete:
POST `/api/v1/follow-ups/{followUpId}/complete`

TB_OFFICER + FOLLOW_UP_WRITE, FollowUp If-Match.

Input: completedAt, weightKg optional >0, symptomSummary optional, adherenceAssessment optional, notes optional.

Set status COMPLETED and healthWorker current user.

No automatic lab request, dose adjustment or outcome.

Patient:
GET `/api/v1/me/follow-ups`

Patient-safe schedule/status only; no clinician notes, adherenceAssessment or internal symptom narrative.

No supporter follow-up endpoint in this phase.

## 9. Adverse events

Create:
POST `/api/v1/treatments/{treatmentId}/adverse-events`

Update:
PATCH `/api/v1/adverse-events/{eventId}`

TB_OFFICER + ADVERSE_EVENT_WRITE + treatment facility scope + source policy.

No automatic seriousness/causality or regimen change.

Allow adverse-event follow-up update after treatment closure.

Audit:
- ADVERSE_EVENT_RECORDED
- ADVERSE_EVENT_UPDATED

## 10. Final treatment outcome

POST `/api/v1/treatments/{treatmentId}/outcome`

TB_OFFICER + OUTCOME_WRITE + source policy.
Require Treatment If-Match.

Mandatory lock order:
1. TBCase PESSIMISTIC_WRITE
2. Treatment PESSIMISTIC_WRITE
3. verify no TreatmentOutcome
4. insert TreatmentOutcome

Require:
- treatment ACTIVE
- case ACTIVE
- actor facility scope
- active outcome code
- startDate <= outcomeDate <= today
- no existing outcome

Do not derive outcome from lab/adherence.

On success:
- treatment.actualEndDate = outcomeDate
- treatment.status = COMPLETED
- case.status = COMPLETED
- case.closedAt = Clock now

No outcome PATCH/DELETE.

Audit `TREATMENT_OUTCOME_RECORDED`.

## 11. Patient projection

GET `/api/v1/me/treatment`

Return approved self data:
- treatment status/regimen
- dates
- drug names/phases and recorded dose/frequency
- recent adherence evidence
- outcome
- patient-safe adverse-event summary

Exclude labs, HIV/DM, clinician free text, batch/source operational detail, audit/sync and other-user identity.

## 12. Supporter projection

GET `/api/v1/me/supporting-cases/{caseId}/treatment`

Return caseId, patient display name, treatment status/regimen, drug name/phase/dose/frequency, dates, adherence summary/recent evidence.

Exclude HIV/DM, NIK/BPJS, labs, diagnosis narrative, adverse events, clinical follow-up notes, outcome notes, audit/sync.

## 13. Source authority

ClinicalSourceAuthorityPolicy applies to staff clinical writes:
- treatment start/update
- follow-up schedule/complete
- adverse-event create/update
- outcome

Patient/supporter adherence is TBCall monitoring evidence and does not use clinical source authority.

LaboratorySourceAuthorityPolicy remains unchanged.

## 14. Concurrency

- READ_COMMITTED
- treatment start locks case before open-treatment check
- existing V1 open-treatment index (PLANNED/ACTIVE/PAUSED) is the final guard, reused unchanged by V12
- dose-event actor/day unique index is final duplicate guard
- outcome locks TBCase then Treatment
- no retries
- If-Match -> 428 missing / 409 stale

## 15. Tests

Use PostgreSQL Testcontainers + authenticated HTTP tests.

Add all treatment/follow-up/adverse-event/outcome/projection tests from v1.3B plus:

- V1–V12 clean migration + Hibernate validate
- all five legacy dose-event statuses still accepted at DB level
- old source values remain valid
- TREATMENT_SUPPORTER source accepted
- redundant TAKEN is not introduced
- officer source HEALTH_WORKER
- patient source PATIENT
- supporter source TREATMENT_SUPPORTER
- route-specific status restrictions
- same actor + same treatment/day duplicate rejected
- different actors can record same treatment/day
- concurrent same-actor daily submissions -> one winner
- no weakening of existing Phase 3A.1 tests

All existing 283 tests must remain green.

Run `mvn clean test`.

## 16. Out of scope

Do not implement:
- dose-event correction/update
- treatment pause/resume/stop/cancel
- post-start TreatmentDrug adjustment
- automatic dose/regimen decisions
- automatic follow-up/lab scheduling
- automatic outcome classification
- referral/transfer
- contact/TPT
- alert/notification automation
- patient lab-result portal
- SITB network integration
