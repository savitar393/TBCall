# TBCall Database Schema v1

## Status

**Architecture baseline for implementation.**

This schema is intentionally **SITB-aligned, not a claimed copy of the SITB physical database**. The available SITB document is an operational/technical manual, not an official SQL schema or API contract. TBCall therefore uses a canonical domain model that mirrors the documented workflow as closely as practical while preserving an integration boundary for future authorized SITB access.

## System statement

**TBCall is a Tuberculosis Monitoring System designed around a SITB-aligned clinical data model. SITB is intended to become the primary authoritative source for TB patient and program data once formal integration is approved. TBCall independently owns authentication, user-account management, patient-user linking, monitoring, adherence, follow-up, alerts, notifications, and audit functionality. During the prototype phase, locally entered or synthetic data use the same canonical schema intended for future SITB synchronization.**

## Main architectural rule

Do not model:

```text
SITB database = TBCall database
```

Model:

```text
SITB / future external source
            |
            v
integration + mapping + validation
            |
            v
TBCall canonical domain database
            |
            +--> monitoring
            +--> adherence
            +--> follow-up
            +--> alerts / notification
```

## Source ownership

| Domain | Intended authority |
|---|---|
| Patient demographics | SITB / authorized external source |
| Terduga / TB registration | SITB |
| Diagnosis | SITB |
| Laboratory requests/results | SITB |
| TB case | SITB |
| TB treatment/regimen | SITB |
| Treatment outcome | SITB |
| Referral/transfer | SITB |
| Contact investigation | SITB |
| Preventive treatment | SITB |
| User credentials | TBCall |
| Roles / permissions | TBCall |
| User-patient links | TBCall |
| Monitoring plan/events | TBCall |
| Adherence confirmation recorded in TBCall | TBCall |
| Alerts | TBCall |
| Notifications | TBCall |
| Integration state | TBCall |
| Audit logs | TBCall |

## Core domains

### 1. Identity and access

- `users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `user_facilities`
- `user_sessions`
- `user_verification_tokens`
- `patient_user_links`

A patient record and a login account are separate lifecycles. User registration never automatically creates a TB case.

### 2. Facilities

- `facilities`
- `facility_types`

Facility relationships are explicit because TB workflows can involve registration facilities, testing laboratories, referral destinations, and treatment facilities.

### 3. Patient and episode identity

- `patients`
- `tb_registrations`

`patients` represents the person.

`tb_registrations` represents a specific terduga / registration episode. One patient can have multiple registration episodes over time.

### 4. Diagnosis and case

- `diagnoses`
- `tb_cases`

A registration can undergo diagnostic evaluation before becoming a confirmed TB case.

### 5. Laboratory

- `lab_requests`
- `lab_request_tests`
- `lab_specimens`
- `lab_results`

The design allows one request to ask for multiple tests and supports internal/external testing, specimen transport/receipt, repeated tests, and corrected results.

### 6. Treatment

- `regimens`
- `drugs`
- `regimen_drugs`
- `treatments`
- `treatment_drugs`
- `dose_events`
- `follow_ups`
- `treatment_outcomes`

Clinical regimen codes are stored in reference tables rather than compiled Java enums so program changes can be introduced as data.

### 7. Continuity of care

- `patient_supporters`
- `referrals`

`patient_supporters` supports PMO and companion data.

`referrals` retains transfer/referral history rather than simply overwriting a patient's facility.

### 8. Contact investigation and TPT

- `contacts`
- `contact_investigations`
- `preventive_treatments`

The schema supports internal, incoming-referral, and outgoing-referral contact-investigation workflows.

### 9. Adverse events

- `adverse_events`

This provides a normalized location for MESO/adverse-event monitoring without forcing those fields into the patient or treatment row.

### 10. TBCall monitoring

- `monitoring_plans`
- `monitoring_events`
- `alerts`
- `notifications`

These are TBCall-owned derived/application data.

### 11. Future SITB integration

- `external_systems`
- `external_identifiers`
- `sync_runs`
- `sync_items`

TBCall UUIDs remain internal primary keys. Future SITB identifiers are external identifiers and never become TBCall primary keys.

`sync_items.raw_payload` preserves the received external payload for debugging/reconciliation while the real SITB contract is still unknown.

### 12. Audit

- `audit_logs`

Clinical records are not designed around hard deletion. Business status changes plus audit history are preferred.

## Important database decisions

### UUID primary keys

Application/domain tables use UUIDs. This prevents future external identifiers from defining internal identity.

### No hard-coded PostgreSQL clinical enums

Clinical values such as diagnosis types, TB categories, lab-test types, HIV/DM status, previous-treatment categories, and treatment outcomes use reference tables. Stable application workflow states may use `CHECK` constraints.

### Multiple TB episodes per patient

`patients -> tb_registrations -> tb_cases` preserves repeat registrations and future episodes.

### Multiple laboratory tests per request

`lab_requests -> lab_request_tests -> lab_results` supports requests containing more than one examination.

### SITB data does not own TBCall authentication

`users` and `patients` are intentionally independent and linked only through `patient_user_links`.

### Prototype data uses the real canonical model

Synthetic/local prototype data should be inserted into these same domain tables. Do not build a separate fake-SITB database at the center of the application.

## Migration plan

- `V1__initial_schema.sql` — tables, constraints, indexes, triggers.
- `V2__reference_data.sql` — roles, permissions, clinical/reference codes documented from SITB/manuals.
- `V3__development_seed.sql` — synthetic patients/cases/treatments for non-production profiles only.
- Later migrations — additive schema changes as real integration/API details become available.

## Recommended implementation boundary for Work mode

Treat this schema as the implementation contract.

Work should derive:

1. Flyway migration placement and validation.
2. Spring/JPA entities.
3. Repository interfaces.
4. service/domain layer.
5. DTO/API layer.
6. reference-data migration.
7. realistic synthetic seed data.
8. database integration tests.
9. authorization tests.
10. future `SITBAdapter` / mapper boundary.

Do not let the implementation agent silently collapse `Patient`, `TBRegistration`, `TBCase`, and `Treatment` into a single object.
