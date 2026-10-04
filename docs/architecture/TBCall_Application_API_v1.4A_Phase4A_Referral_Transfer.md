# TBCall Application/API v1.4A — Phase 4A Referral & Transfer Continuity

Base commit: `d148b13a52c13d58c9cab332cb31ecb820347903`

Status: approved referral/transfer slice before contact investigation, TPT, monitoring and alerts.

Phase 4 is split into:
- Phase 4A: referral / treatment-transfer continuity
- Phase 4B: contact investigation + TPT
- Phase 4C: monitoring plans + alerts + notifications

## 1. Continuity model

TBCall keeps one TBCase row across facility transfer.

For treatment transfer, TBCall also keeps one Treatment row and moves its current facility only when the patient reports at the destination.

Referral history records source/destination continuity.

Accepted transfer state:
- case.status = ACTIVE
- case.currentFacility = destination
- treatment.status = ACTIVE
- treatment.facility = destination

Phase 4A does not use TBCase.status=`TRANSFERRED` or Treatment.status=`TRANSFERRED` as the normal accepted-continuation state.

## 2. V13

Create `V13__referral_continuity_support.sql`.

Do not modify V1–V12.

Add:

```sql
CREATE UNIQUE INDEX uq_referrals_one_inflight_per_case
ON referrals(case_id)
WHERE status IN ('SENT','RECEIVED');

CREATE INDEX idx_referrals_source_status
ON referrals(source_facility_id, status, sent_at DESC);

ALTER TABLE referrals ADD COLUMN return_reason text;
```

Update Referral JPA mapping.

## 3. Authorization

Use existing:
- REFERRAL_READ
- REFERRAL_WRITE

Source TB officer:
- active source facility assignment
- may send/cancel/read outgoing

Destination TB officer:
- active destination facility assignment
- may receive/return/report/read incoming

No admin/lab/program/patient/supporter write bypass.

## 4. Referral source authority

Add `ReferralSourceAuthorityPolicy` with prototype-local implementation.

Suggested methods:
- requireLocalCreate(...)
- requireLocalTransition(...)

Do not weaken ClinicalSourceAuthorityPolicy or LaboratorySourceAuthorityPolicy.

## 5. Send referral

POST `/api/v1/cases/{caseId}/referrals`

Request:
- referralType
- destinationFacilityId
- treatmentId optional
- notes optional

Server:
- sourceFacility = case.currentFacility
- sentAt = Clock now
- status = SENT

Lock order:
1. TBCase PESSIMISTIC_WRITE
2. Treatment PESSIMISTIC_WRITE when relevant
3. check no SENT/RECEIVED referral
4. persist Referral

### PRE_TREATMENT_REFERRAL

Require:
- case.status = REFERRED
- no open treatment
- treatmentId absent
- confirming diagnosis exists
- diagnosis.treatmentDisposition = REFERRED
- diagnosis.referredToFacility = requested destination
- destination active and different from source

Sending does not change case status/facility.

### TREATMENT_TRANSFER

Require:
- case.status = ACTIVE
- treatmentId present
- treatment belongs to case
- treatment.status = ACTIVE
- treatment.facility = case.currentFacility
- no TreatmentOutcome
- destination active and different from source

On send:
- case.status = REFERRED
- case.currentFacility remains source
- treatment remains ACTIVE at source

Audit: `REFERRAL_SENT`

## 6. Queries

Implement:
- GET `/api/v1/referrals/incoming`
- GET `/api/v1/referrals/outgoing`
- GET `/api/v1/referrals/{referralId}`

Pagination max 50.

Incoming scope uses destinationFacility assignments.
Outgoing scope uses sourceFacility assignments.

Referral detail remains readable to source/destination after ownership moves.

Projection:
- referral id/version/type/status/timestamps
- source/destination facility
- minimal patient identity for handoff
- case category/status
- treatment summary for transfer
- notes only for authorized source/destination officers

Exclude HIV/DM, labs, account data, audit/sync.

## 7. Receive

POST `/api/v1/referrals/{referralId}/receive`

Destination TB officer + REFERRAL_WRITE.
Require Referral If-Match.

Input:
- receivedAt optional, default Clock now
- notes optional

Lock:
TBCase -> Treatment if any -> Referral.

Require:
- status SENT
- destination active/in scope
- sentAt <= receivedAt <= now

Set:
- status RECEIVED
- receivedAt

Do not move ownership.

Audit: `REFERRAL_RECEIVED`

## 8. Return

POST `/api/v1/referrals/{referralId}/return`

Destination officer.
Require Referral If-Match.

Input:
- returnReason required

Lock:
TBCase -> Treatment if any -> Referral.

Require status RECEIVED.

Set:
- status RETURNED
- returnReason

State:
- PRE_TREATMENT_REFERRAL: case stays REFERRED at source
- TREATMENT_TRANSFER: case returns ACTIVE at source; treatment remains ACTIVE at source

Audit: `REFERRAL_RETURNED`

## 9. Cancel

POST `/api/v1/referrals/{referralId}/cancel`

Source officer.
Require Referral If-Match.

Input:
- cancelReason required

Lock:
TBCase -> Treatment if any -> Referral.

Require status SENT.

Set:
- status CANCELLED
- cancelledAt = Clock now
- cancelReason

State:
- PRE_TREATMENT_REFERRAL: case stays REFERRED
- TREATMENT_TRANSFER: case returns ACTIVE

Once RECEIVED, source cannot cancel; destination must RETURN.

Audit: `REFERRAL_CANCELLED`

## 10. Patient report / complete transfer

POST `/api/v1/referrals/{referralId}/report`

Destination officer.
Require Referral If-Match.

Input:
- patientReportedAt optional, default Clock now

Lock:
1. TBCase PESSIMISTIC_WRITE
2. Treatment PESSIMISTIC_WRITE if present
3. Referral PESSIMISTIC_WRITE

Require:
- status RECEIVED
- destination active/in scope
- patientReportedAt >= sentAt
- patientReportedAt >= receivedAt
- patientReportedAt <= now

### PRE_TREATMENT_REFERRAL

Require:
- case REFERRED
- no open treatment

Set:
- referral REPORTED
- patientReportedAt
- case.currentFacility = destination
- case.status = ACTIVE

Destination may then start treatment through Phase 3B.

### TREATMENT_TRANSFER

Require:
- case REFERRED
- treatment ACTIVE
- no TreatmentOutcome
- treatment.facility = sourceFacility

Set:
- referral REPORTED
- patientReportedAt
- case.currentFacility = destination
- case.status = ACTIVE
- treatment.facility = destination
- treatment remains ACTIVE

Do not create a second Treatment, copy drugs, reset dates, or modify adherence/lab/history.

Audit: `REFERRAL_REPORTED`

## 11. Concurrency

All ownership-changing referral commands serialize on TBCase first.

Ordering:
`TBCase -> Treatment(if any) -> Referral`

Must remain compatible with:
- treatment start
- treatment outcome
- follow-up lab correction

Tests:
- duplicate send one winner
- receive vs cancel one winner
- outcome vs transfer send coherent
- outcome vs report coherent

No retries.

## 12. Scope after report

Destination gains ordinary current case/treatment access because currentFacility/treatment.facility move.

Source loses ordinary current clinical access but keeps outgoing referral read access through sourceFacility.

Patient SELF and supporter links are unchanged.

## 13. Continuity exclusions

Do not relocate or rewrite historical:
- DoseEvent
- FollowUp
- AdverseEvent
- LabRequest
- LabResult

They stay attached to existing case/treatment/request history.

No automatic follow-up cancellation/rescheduling.
No lab-request relocation.
No clinical inference.

## 14. Errors

Continue application/problem+json with Indonesian detail.

Useful codes:
- REFERRAL_STATE_CONFLICT
- REFERRAL_ALREADY_IN_FLIGHT
- REFERRAL_DESTINATION_INVALID
- REFERRAL_TREATMENT_MISMATCH

If-Match:
- 428 missing
- 409 stale

## 15. Audit privacy

Actions:
- REFERRAL_SENT
- REFERRAL_RECEIVED
- REFERRAL_RETURNED
- REFERRAL_CANCELLED
- REFERRAL_REPORTED

Audit actor/action/target/correlation only.

Do not copy patient identity, notes, cancelReason or returnReason into metadata.

## 16. Tests

Use PostgreSQL Testcontainers + authenticated HTTP tests.

At minimum:
- V1–V13 migrate + Hibernate validate
- one in-flight referral per case
- V13 returnReason mapping
- correct PRE_TREATMENT send rules
- correct TREATMENT_TRANSFER send rules
- transfer send sets case REFERRED without moving ownership
- incoming/outgoing facility scope
- receive does not move ownership
- return/cancel rollback rules
- received referral cannot be source-cancelled
- PRE_TREATMENT report moves case to destination ACTIVE
- destination can start treatment after report
- TREATMENT_TRANSFER report moves case.currentFacility + treatment.facility
- treatment id/start/regimen/drug/adherence history preserved
- destination can continue treatment writes
- source loses ordinary treatment access but keeps outgoing referral read
- patient/supporter links remain valid
- role/facility isolation
- ReferralSourceAuthorityPolicy invoked
- audit privacy
- concurrent duplicate send one winner
- receive/cancel race one winner
- outcome/send and outcome/report races coherent
- all existing 398 tests remain green

Run `mvn clean test`.

## 17. Out of scope

Do not implement:
- contact investigation
- TPT
- monitoring plans/events
- alerts/notifications
- follow-up cancellation/rescheduling due transfer
- lab relocation
- drug adjustment
- patient/supporter referral portal
- SITB network integration
