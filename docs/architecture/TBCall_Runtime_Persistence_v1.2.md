# TBCall Runtime Persistence v1.2

Status: approved architecture specification for the final persistence hardening checkpoint before application services/API work.

Repository baseline: `savitar393/TBCall`, commit `a2f158ce75a8de9783efb2f2a8fcd0856c3748fa`.

## Purpose

Resolve three persistence-runtime concerns before the service layer:
1. Correct one overly restrictive TB-SO reference description.
2. Make deterministic database defaults visible immediately in new JPA entities.
3. Add optimistic concurrency control to mutable business records.

V1–V7 are immutable historical migrations and must not be edited.

## Clinical wording correction

Keep code `TB_SO`. Replace its description with:

`TBC Sensitif Obat sesuai klasifikasi program; interpretasi rinci mengikuti hasil uji kepekaan dan pedoman nasional.`

Do not infer resistance automatically from laboratory results in this phase.

## V8 migration

Create `V8__persistence_runtime_hardening.sql`.

Add `version bigint NOT NULL DEFAULT 0` to:
- facilities
- users
- patients
- patient_user_links
- tb_registrations
- diagnoses
- tb_cases
- lab_requests
- lab_request_tests
- lab_specimens
- lab_results
- treatments
- treatment_drugs
- dose_events
- follow_ups
- treatment_outcomes
- patient_supporters
- referrals
- contacts
- contact_investigations
- preventive_treatments
- adverse_events
- monitoring_plans
- monitoring_events
- alerts
- notifications

Do not add version columns to append-only audit logs, migration-managed reference catalogs, RBAC catalog/join tables, or sync bookkeeping in this checkpoint. No version index is required.

## JPA optimistic locking

For every V8-versioned entity add:

```java
@Version
@Column(name = "version", nullable = false)
private long version;
```

`@Version` is the concurrency mechanism. `@DynamicUpdate` may remain on `TBCase`, but is not concurrency protection.

Runtime writes to versioned entities must use JPA/Hibernate or explicitly honor/increment the version. Normal direct SQL updates are prohibited.

## Deterministic Java defaults

Mirror deterministic PostgreSQL defaults as Java field initializers while retaining the DB defaults.

Reference/config defaults:
- FacilityType.active = true
- SexCode.active = true
- TBSuspectType.active = true
- AnatomicalSite.active = true
- DiagnosisType.active = true
- PreviousTreatmentCategory.active = true
- HivStatus.active = true
- DmStatus.active = true
- PregnancyStatus.active = true
- BcgStatus.active = true
- TBCaseCategory.active = true
- LabTestType.active = true
- LabRequestReason.active = true
- TreatmentOutcomeCode.active = true
- Facility.active = true
- Role.systemRole = false
- UserFacility.isPrimary = false
- UserFacility.active = true
- Patient.birthDateUnknown = false
- Regimen.active = true
- Drug.active = true
- PatientSupporter.active = true
- ExternalSystem.active = true
- DrugResistancePattern.active = true
- AdditionalConditionType.active = true

Workflow/business defaults:
- User.status = "PENDING"
- PatientUserLink.relationshipType = "SELF"
- PatientUserLink.verificationStatus = "PENDING"
- TBRegistration.status = "OPEN"
- TBCase.status = "ACTIVE"
- LabRequest.status = "REQUESTED"
- LabRequestTest.status = "REQUESTED"
- LabResult.sequenceNo = 1
- LabResult.status = "FINAL"
- RegimenDrug.sequenceNo = 1
- Treatment.status = "ACTIVE"
- DoseEvent.source = "TBCALL"
- FollowUp.status = "SCHEDULED"
- Referral.status = "SENT"
- ContactInvestigation.status = "NEW"
- PreventiveTreatment.status = "ACTIVE"
- AdverseEvent.serious = false
- MonitoringPlan.status = "ACTIVE"
- MonitoringEvent.status = "SCHEDULED"
- Alert.severity = "INFO"
- Alert.status = "OPEN"
- Notification.status = "PENDING"

Map defaults:
- MonitoringEvent.metadata = new HashMap<>()
- Alert.details = new HashMap<>()
- Notification.payload = new HashMap<>()
- AuditLog.metadata = new HashMap<>()

Integration defaults:
- SyncRun.direction = "INBOUND"
- SyncRun.status = "RUNNING"
- SyncRun.recordsReceived = 0
- SyncRun.recordsCreated = 0
- SyncRun.recordsUpdated = 0
- SyncRun.recordsFailed = 0

Use existing Java field types. Do not create enums merely for defaults.

## Timestamp policy

Do not initialize clock-dependent timestamps with `OffsetDateTime.now()` in entity fields/callbacks.

Database-generated audit timestamps remain database-owned. Business timestamps will later be set explicitly by services using an injected `Clock`. If an immediate DB-generated timestamp is needed after insert, reload/refresh the entity.

## Future transaction/concurrency policy

- Default isolation: PostgreSQL/Spring `READ_COMMITTED`.
- Command/use-case service methods own transactions.
- Query services may use `@Transactional(readOnly = true)`.
- Optimistic locking is the default concurrency strategy.
- User-originated clinical conflicts are never silently retried.
- Later API mapping: optimistic conflict -> HTTP 409 with Indonesian message: `Data telah berubah sejak terakhir dibuka. Muat ulang data sebelum menyimpan kembali.`
- Background retries are allowed only when bounded, idempotent, and explicitly reviewed.
- Pessimistic locking is reserved for narrow one-at-a-time workflows such as one-time token consumption, referral acceptance, or unique external identity binding.
- V6 database invariants remain authoritative.

## Future source authority policy

No new source-authority table in V8.

Prototype mode: local/synthetic clinical records are editable by authorized users.

Future SITB-connected mode:
- SITB-authoritative fields become locally read-only unless the real integration contract permits write-back.
- TBCall-owned user, monitoring, adherence, alert, notification, and audit data remain TBCall-owned.
- Do not guess per-field SITB write-back behavior before the real API/data dictionary exists.

## Scope model for next service phase

- Patient: verified SELF `patient_user_links`.
- PMO/supporter: active `patient_supporters.linked_user_id`, limited to the supported case/patient.
- TB officer: active `user_facilities` assignments; facility-scoped clinical access.
- Lab staff: assigned facility/lab plus minimum necessary patient/case context.
- Facility admin: facility administration only, no automatic clinical access.
- Program monitor: aggregate/report scope only until a regional scope model exists.
- System admin: system administration only, no automatic clinical access.

Authorization = permission + scope + field projection.

## Field projection principles

- Never serialize JPA entities directly from REST controllers.
- Use explicit DTO/projection models.
- PMO/supporter views exclude HIV/DM and unrelated diagnostics/laboratory details unless explicitly approved.
- Lab staff get only minimum identity/context required.
- Admin/report roles do not get raw clinical data through generic endpoints.
- Audit payloads must be filtered/redacted before exposure.

## Tests

Verify:
1. V1–V8 migrate from empty PostgreSQL.
2. Hibernate validate passes.
3. TB_SO description is corrected.
4. Every V8-versioned entity has `@Version` and starts at version 0.
5. Deterministic Java defaults are visible before reload and match DB state after reload.
6. Real concurrent updates using separate transactions/entity managers cause optimistic-lock failure.
7. Winning update increments version.
8. Test at least Patient, TBCase, Treatment.
9. Existing tests continue to pass.

## Out of scope

No services, controllers, Spring Security, REST APIs, frontend, SITB network integration, clinical decision support, automated dosing/regimen selection, automatic user-update retries, regional program scope, or guessed source-authority behavior.
