# TBCall Application/API v1.4B — Phase 4B Contact Investigation & TPT

Base commit: `e57009842d0cac6ebcc9c7e980c9dfdc6675dde4`

Status: approved contact-investigation and contact-driven TPT slice after Phase 4A.

Phase 4 remains split into:
- Phase 4A: referral / treatment-transfer continuity — implemented
- Phase 4B: contact investigation + contact-driven TPT — this specification
- Phase 4C: monitoring plans + alerts + notifications — deferred

## 1. Source-aligned principles

The workflow must support internal contact investigation and inter-facility investigation requests with source/destination ownership, acceptance/return, completion, explicit exclusion of active TB, and explicit TPT eligibility. TPT is started only after an authorized officer records that active TB has been excluded and the contact is eligible.

TBCall must not infer active-TB diagnosis, infection status, TPT eligibility, regimen, dose, duration, or outcome from generic screening/lab values.

Phase 4B supports contact-driven TPT only. Non-contact risk-group TPT enrollment is deferred because it needs a separate scope/enrollment model.

## 2. V14 migration

Create `V14__contact_investigation_tpt_support.sql`. Do not modify V1–V13.

### 2.1 Contact-investigation eligibility fields

Add to `contact_investigations`:

```sql
active_tb_excluded boolean,
tpt_eligible boolean,
eligibility_assessed_at timestamptz
```

Add a CHECK so `tpt_eligible=true` is possible only when `active_tb_excluded=true`.

### 2.2 One open investigation per contact

```sql
CREATE UNIQUE INDEX uq_contact_investigation_one_open
ON contact_investigations(contact_id)
WHERE status IN ('NEW','SENT','RECEIVED','IN_PROGRESS');
```

Add:

```sql
CREATE INDEX idx_contact_investigation_source_status
ON contact_investigations(source_facility_id, status, requested_at DESC);
```

### 2.3 Preventive-treatment support

Add to `preventive_treatments`:

```sql
regimen_description text,
closure_reason text
```

Add:

```sql
CREATE UNIQUE INDEX uq_preventive_treatment_open_contact
ON preventive_treatments(contact_id)
WHERE contact_id IS NOT NULL
  AND status IN ('PLANNED','ACTIVE');
```

### 2.4 Preventive regimen catalog concepts

Seed these TBCall canonical PREVENTIVE regimen concepts without dose/composition automation:

- `TPT_SO_6H` — TPT 6H
- `TPT_SO_3HP` — TPT 3HP
- `TPT_SO_3HR` — TPT 3HR
- `TPT_SO_4R` — TPT 4R
- `TPT_SO_1HP` — TPT 1HP
- `TPT_RO_6LFX` — TPT RO 6Lfx

Use `regimen_kind='PREVENTIVE'`. SO concepts use `tb_case_category_code='TB_SO'`; 6Lfx uses `TB_RO`. Descriptions must say eligibility/dose selection follows current national guidance and clinician assessment.

Do not insert fixed `regimen_drugs` or dosing rules.

For individualized TPT (especially RO contexts where 6Lfx is not appropriate), use `regimen_description` rather than inventing another catalog code.

Update JPA mappings for `ContactInvestigation` and `PreventiveTreatment`.

## 3. Authorization

Use existing V7 permissions:
- CONTACT_READ
- CONTACT_WRITE
- TPT_READ
- TPT_WRITE

TB_OFFICER may manage contacts/investigations/TPT only inside relevant active facility scope.

PATIENT + TPT_READ + VERIFIED SELF may see only their own TPT when the contact is linked to that patient (or a future patient-owned TPT exists).

TREATMENT_SUPPORTER, LAB_STAFF, FACILITY_ADMIN, PROGRAM_MONITOR and SYSTEM_ADMIN have no CONTACT/TPT operational bypass.

## 4. Source authority

Add `ContactSourceAuthorityPolicy` with prototype-local implementation. Suggested operations:
- `requireLocalContactWrite(...)`
- `requireLocalInvestigationTransition(...)`
- `requireLocalTptWrite(...)`

Do not weaken ClinicalSourceAuthorityPolicy, LaboratorySourceAuthorityPolicy or ReferralSourceAuthorityPolicy.

## 5. Create contact + initial investigation atomically

Endpoint:

`POST /api/v1/cases/{caseId}/contacts`

TB_OFFICER + CONTACT_WRITE. Lock TBCase PESSIMISTIC_WRITE.

Input contact:
- fullName required
- birthDate optional/not future
- sexCode optional/active if supplied
- phone optional/normalized
- address optional
- relationshipToIndexCase optional
- householdContact optional

Input investigation:
- workflowType = INTERNAL | OUTGOING_REFERRAL
- destinationFacilityId required only for OUTGOING_REFERRAL
- notes optional

Client must not supply indexCase, linkedPatient, source facility, status or timestamps.

Server derives sourceFacility from case.currentFacility and requestedAt from Clock.

INTERNAL:
- destination null
- status IN_PROGRESS

OUTGOING_REFERRAL:
- destination active/different from source
- status SENT

Persist Contact + ContactInvestigation in one transaction.

Audit:
- CONTACT_CREATED
- CONTACT_INVESTIGATION_STARTED for INTERNAL
- CONTACT_INVESTIGATION_SENT for OUTGOING_REFERRAL

## 6. Contact read/update/link

Implement:
- GET `/api/v1/cases/{caseId}/contacts`
- GET `/api/v1/contacts/{contactId}`
- PATCH `/api/v1/contacts/{contactId}`
- POST `/api/v1/contacts/{contactId}/link-patient`

List/detail expose contact demographics, masked phone, relationship/household flag, linked-patient boolean, investigation summary and TPT summary. Do not expose linked patient identifiers or unrelated patient record.

PATCH requires If-Match and may change only contact demographics. `indexCase` and `linkedPatient` are immutable through generic PATCH.

`link-patient` must reuse Phase 2 exact WNI/WNA identity reconfirmation. No fuzzy identity matching. Linking must not overwrite Patient or Contact demographic snapshots. No unlink in Phase 4B.

Audits:
- CONTACT_UPDATED
- CONTACT_LINKED_PATIENT

## 7. Investigation reads

Implement:
- GET `/api/v1/contact-investigations/incoming`
- GET `/api/v1/contact-investigations/outgoing`
- GET `/api/v1/contact-investigations/{id}`

Pagination max 50.

Incoming scope = destination facility assignment.
Outgoing scope = source assignment + workflow OUTGOING_REFERRAL.
INTERNAL detail scope = source.
OUTGOING detail scope = source or destination.

Projection may contain investigation state/timestamps/facilities, minimum contact handoff data, index-case id/category, resultCode, eligibility booleans and notes for authorized officers. Exclude index-patient identity, HIV/DM, labs, diagnosis prose, account/audit/sync.

## 8. Investigation transitions

### Receive

`POST /api/v1/contact-investigations/{id}/receive`

Destination officer + CONTACT_WRITE + If-Match.

Require OUTGOING_REFERRAL + SENT. Lock Contact then Investigation. Set RECEIVED and `receivedAt` (input optional/default now), validating requestedAt <= receivedAt <= now.

Audit `CONTACT_INVESTIGATION_RECEIVED`.

### Start

`POST /api/v1/contact-investigations/{id}/start`

Destination officer + CONTACT_WRITE + If-Match.
Require OUTGOING_REFERRAL + RECEIVED. Set IN_PROGRESS.

Audit `CONTACT_INVESTIGATION_STARTED`.

### Return

`POST /api/v1/contact-investigations/{id}/return`

Destination officer + If-Match. Require OUTGOING_REFERRAL and status RECEIVED or IN_PROGRESS. Nonblank returnReason. Set RETURNED.

Audit `CONTACT_INVESTIGATION_RETURNED`.

### Cancel

`POST /api/v1/contact-investigations/{id}/cancel`

Source officer + If-Match. Require OUTGOING_REFERRAL + SENT. Set CANCELLED. Once received, source cannot cancel.

Audit `CONTACT_INVESTIGATION_CANCELLED`.

### Complete

`POST /api/v1/contact-investigations/{id}/complete`

INTERNAL: source officer. OUTGOING: destination officer. Require If-Match and IN_PROGRESS.

Input:
- investigatedAt optional/default now
- resultCode optional
- activeTbExcluded required
- tptEligible required
- notes optional

Rules:
- investigatedAt between requestedAt and now
- outgoing investigatedAt >= receivedAt
- `tptEligible=true` requires `activeTbExcluded=true`
- if activeTbExcluded=false, tptEligible=false

Set COMPLETED, investigatedAt, resultCode, booleans, and eligibilityAssessedAt=investigatedAt.

Do not auto-create patient/registration/case/TPT.

Audit `CONTACT_INVESTIGATION_COMPLETED`.

## 9. Start contact-driven TPT

Endpoint:

`POST /api/v1/contact-investigations/{id}/tpt`

TB_OFFICER + TPT_WRITE.

Lock order:
1. Contact PESSIMISTIC_WRITE
2. ContactInvestigation PESSIMISTIC_WRITE
3. check no PLANNED/ACTIVE TPT for contact
4. insert PreventiveTreatment

TPT facility:
- INTERNAL -> sourceFacility
- OUTGOING_REFERRAL -> destinationFacility

Require:
- investigation COMPLETED
- activeTbExcluded=true
- tptEligible=true
- actor assigned to derived TPT facility
- contact index case exists
- no open TPT

Input:
- regimenCode optional
- regimenDescription optional
- startDate
- plannedEndDate optional
- durationValue optional positive
- durationUnit optional DAY|WEEK|MONTH
- weightKg optional positive
- drugSource optional
- notes optional

Require at least one of regimenCode or nonblank regimenDescription.

If regimenCode supplied:
- active
- PREVENTIVE
- regimen category matches index case category

Do not infer age/weight/pregnancy/HIV/resistance eligibility or dose.

Set contact owner, patientId=null, indexCase from contact, derived facility, ACTIVE status.

Audit `TPT_STARTED`.

## 10. TPT reads/update/closure

Implement:
- GET `/api/v1/contacts/{contactId}/tpt`
- GET `/api/v1/preventive-treatments/{id}`
- PATCH `/api/v1/preventive-treatments/{id}`
- POST `/api/v1/preventive-treatments/{id}/complete`
- POST `/api/v1/preventive-treatments/{id}/stop`
- POST `/api/v1/preventive-treatments/{id}/lost-to-follow-up`

Officer scope = TPT.facility.

PATCH: TPT_WRITE + If-Match + ACTIVE + source policy. Mutable only plannedEndDate, duration, weightKg, drugSource, regimenDescription, notes. Do not change owner/facility/regimen/start/status/actualEndDate.

Complete: ACTIVE -> COMPLETED, actualEndDate default today.

Stop: ACTIVE -> STOPPED, actualEndDate default today, closureReason required.

Lost-to-follow-up: ACTIVE -> LOST_TO_FOLLOW_UP, actualEndDate default today, closureReason optional.

All closure dates must satisfy startDate <= actualEndDate <= today.

Do not populate `outcome_code` in Phase 4B; exact national TPT outcome-code mapping remains deferred.

Audits:
- TPT_UPDATED
- TPT_COMPLETED
- TPT_STOPPED
- TPT_LOST_TO_FOLLOW_UP

## 11. Patient SELF TPT view

Endpoint:

`GET /api/v1/me/tpt`

PATIENT + TPT_READ + VERIFIED SELF.

Find latest TPT where `preventiveTreatment.patient=self` or `preventiveTreatment.contact.linkedPatient=self`.

Return only status, regimen display/safe description, dates/duration and facility display.

Exclude index case identity/category, contact relationship/address/phone, eligibility fields, investigation result/notes, officer notes, drugSource, audit/sync.

If multiple ACTIVE TPT episodes exist for the patient through different contacts, return 409 `ACTIVE_TPT_AMBIGUOUS` rather than choosing an arbitrary writable/current episode.

No patient TPT adherence-writing endpoint in Phase 4B.

## 12. Continuity across index-case transfer

Contact-investigation source/destination facilities and TPT facility are historical workflow ownership.

If the index case transfers under Phase 4A, do not automatically move existing contact investigations or TPT. The indexCase FK remains the same case row.

## 13. Concurrency

READ_COMMITTED.

Relevant lock order:
- create contact: TBCase -> inserts
- investigation transition: Contact -> ContactInvestigation
- TPT start: Contact -> ContactInvestigation -> open-TPT check/insert
- TPT update/close: Contact -> PreventiveTreatment

Partial indexes remain final guards. No retries.

Real concurrency tests:
- duplicate TPT start -> one winner
- receive vs cancel -> one winner
- return vs complete -> one coherent transition
- concurrent patient-link attempts cannot silently overwrite the link

## 14. Audit privacy

Actions:
- CONTACT_CREATED
- CONTACT_UPDATED
- CONTACT_LINKED_PATIENT
- CONTACT_INVESTIGATION_SENT
- CONTACT_INVESTIGATION_RECEIVED
- CONTACT_INVESTIGATION_STARTED
- CONTACT_INVESTIGATION_RETURNED
- CONTACT_INVESTIGATION_CANCELLED
- CONTACT_INVESTIGATION_COMPLETED
- TPT_STARTED
- TPT_UPDATED
- TPT_COMPLETED
- TPT_STOPPED
- TPT_LOST_TO_FOLLOW_UP

Audit metadata stays actor/action/target/correlation only. Never copy contact identity, eligibility, investigation result/notes, regimenDescription, TPT notes or closureReason.

## 15. Tests

Use PostgreSQL Testcontainers + authenticated HTTP tests.

At minimum verify:

### V14
- V1–V14 migrate + Hibernate validate
- eligibility CHECK
- one-open-investigation index
- source index
- new mappings
- one-open-contact-TPT index
- exact six PREVENTIVE regimen rows
- no fixed regimen_drugs

### Contacts
- INTERNAL atomic create -> IN_PROGRESS
- OUTGOING atomic create -> SENT
- destination validation
- scope/normalization
- PATCH cannot move index case/link
- list/detail privacy
- exact identity patient linking; no fuzzy matching
- linking does not overwrite demographics

### Investigations
- incoming/outgoing scopes
- SENT->RECEIVED->IN_PROGRESS->COMPLETED
- return/cancel rules
- explicit eligibility required
- no automatic registration/case/TPT
- role/facility isolation
- source policy invoked

### TPT
- start only from COMPLETED + excluded active TB + eligible
- correct derived facility
- PREVENTIVE regimen/category validation
- individualized regimenDescription path
- no automatic dosing/eligibility
- open uniqueness/concurrency
- If-Match updates
- immutable regimen/start/owner fields
- complete/stop/LTFU rules
- outcome_code unused
- V6 lineage preserved
- no supporter/lab/admin/program bypass

### Patient
- linked patient sees only own TPT safe projection
- unlinked/other-patient TPT hidden
- private contact/index/investigation fields excluded
- ambiguous active TPT -> 409

### Continuity/audit
- Phase 4A index-case transfer does not move IK/TPT facilities
- all audit actions present and privacy-safe

All existing 468 tests must remain green.

Run `mvn clean test`.

## 16. Deferred to Phase 4C/later

Do not implement:
- TPT adherence/dose events
- TPT adverse-event tracking
- TPT monitoring schedules
- missed-visit alerts
- auto eligibility/regimen/dose
- non-contact risk-group TPT enrollment
- automatic contact-to-TB registration promotion
- patient contact-investigation portal
- supporter TPT access
- SITB networking

Phase 4C must explicitly decide whether `monitoring_plans` becomes multi-target so treatment and TPT can share one monitoring/alert engine.
