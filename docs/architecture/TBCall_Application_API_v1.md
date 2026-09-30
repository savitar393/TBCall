# TBCall Application & API v1

Status: approved application-layer architecture baseline after persistence commit `c520d5457bd22610dcd8f495b62a354b5d1beb1e`.

## 1. Product boundary
TBCall is a Tuberculosis Monitoring System designed around a SITB-aligned clinical model.
- SITB is intended to become the primary authoritative source for TB program/clinical data after formal integration approval.
- TBCall owns authentication, application users, verified user-to-patient/supporter relationships, monitoring, adherence, alerts, notifications, and application audit behavior.
- During prototype mode, authorized staff may create and edit local/synthetic clinical records.
- TBCall canonical IDs/codes are not claimed as official SITB API/database identifiers.

## 2. API and engineering conventions
- User-facing/operational terminology: Indonesian.
- Java, SQL, JSON property names, technical logs: English unless national acronyms are meaningful.
- REST base: `/api/v1`.
- Never serialize JPA entities directly.
- Explicit DTOs only.
- ISO dates/timestamps.
- Mutable resources expose `version`.
- Versioned mutations use `If-Match`.
- Errors use `application/problem+json`, Indonesian `title/detail`, stable technical `code`.

## 3. Authentication

### Registration
Public registration creates only a TBCall `User`.
It does not create a patient, TB case, patient link, or staff/clinical role.

Input:
- email and/or phone;
- password.

Rules:
- at least one login identity;
- normalize email;
- normalize Indonesian phone numbers to E.164 where possible;
- password length 12–128;
- BCrypt hashing;
- user status starts `PENDING`;
- no role is assigned at registration.

### Contact verification
Use `user_verification_tokens`.
- high-entropy random one-time token;
- store only token hash;
- bounded expiry;
- atomic one-time consumption under lock;
- when at least one configured login identity is verified, activate user;
- outbound email/SMS behind a delivery port;
- dev/test may expose a token only behind explicit non-production configuration.

### Login/session
Use opaque server-side session tokens, not JWT.
- random high-entropy token;
- only token hash persisted in `user_sessions`;
- production delivery by HttpOnly + Secure + SameSite cookie;
- initial lifetime 8 hours;
- logout revokes session;
- non-ACTIVE users cannot authenticate;
- roles/scopes resolved from current DB state on requests.

Browser:
- same-origin preferred;
- CSRF enabled;
- explicit CORS origins, never wildcard with credentials.

### Bootstrap administrator
Environment-driven first-admin bootstrap:
- only runs when explicit credentials are configured;
- creates first `SYSTEM_ADMIN` only if none exists;
- configured identity verified and account ACTIVE;
- password hashed;
- raw secret never logged;
- idempotent/no-op once admin exists.

## 4. Identity linking

Knowing NIK/name/date-of-birth/BPJS is not sufficient to claim a patient.

### Patient self-link v1
Staff-assisted verification:
1. user registers and verifies login identity;
2. user can login but has no patient clinical scope;
3. authorized TB officer verifies identity operationally;
4. officer links account to correct patient;
5. link becomes `SELF` + `VERIFIED`, with `verified_at` and `verified_by`;
6. `PATIENT` role is assigned.

Only one verified SELF account per patient and one verified SELF patient per user. Re-linking requires explicit revocation first.

### Supporter/PMO link
TB officer may link an ACTIVE verified application user to an active `patient_supporters` record in scope.
- first active supporter link assigns `TREATMENT_SUPPORTER`;
- removing last active supporter link may remove that role;
- scope derives from supporter record, not role alone.

## 5. V9 identity-support migration
Create `V9__application_identity_constraints.sql`:
- unique partial index: one VERIFIED SELF per `patient_id`;
- unique partial index: one VERIFIED SELF per `user_id`;
- index `(user_id, verification_status)`;
- active partial index on `patient_supporters(linked_user_id)`;
- add permission `PATIENT_LINK_VERIFY`, grant to `TB_OFFICER`;
- add permission `SUPPORTER_LINK_MANAGE`, grant to `TB_OFFICER`.

Do not edit V1–V8.

## 6. Authorization
Authorization = `permission + scope + field projection`.

### Patient
Scope: exactly VERIFIED SELF-linked patient.
May view approved own data and record own adherence where allowed.
Cannot access another patient, internal staff notes, audit, or integration metadata.

### Treatment supporter / PMO
Scope: active supporter records linked to current user.
Projection includes only support-relevant identity, treatment, adherence, follow-up, alerts.
Exclude by default: HIV, DM, NIK/BPJS, unrelated labs/diagnosis, audit/integration metadata.

### TB officer
Scope: active `user_facilities`, plus narrow referral exceptions.
Clinical commands must also have required permission.

### Lab staff
Scope: assigned lab/facility and requests routed there.
Minimum patient context only. No general treatment-write authority.

### Facility admin
Facility administration only; no automatic clinical access.

### Program monitor
Aggregate/report only in v1. No raw patient list or clinical writes.

### System admin
System/integration/role administration only; no automatic clinical access.

## 7. Field projection
Use role/use-case-specific DTOs:
- `PatientSelfProfileResponse`
- `SupporterPatientSummaryResponse`
- `TbOfficerPatientDetailResponse`
- `LabPatientContextResponse`
- `ProgramAggregateResponse`

Sensitive exposure must be explicit.

## 8. Source authority/editability
Introduce `ClinicalSourceAuthorityPolicy`.

Prototype implementation allows authorized local edits.

Future SITB implementation consults real integration metadata/contract and blocks local edits to SITB-authoritative fields unless write-back is officially supported.

Do not guess SITB field ownership now.

## 9. Transactions/concurrency
- command/use-case service owns transaction;
- ordinary isolation `READ_COMMITTED`;
- queries may use `readOnly=true`;
- V6 DB constraints remain authoritative;
- JPA `@Version` for ordinary concurrency;
- mutations require `If-Match`;
- stale writes -> HTTP 409;
- missing required precondition -> HTTP 428;
- no silent retries for human edits;
- business timestamps use injected `Clock`;
- narrow pessimistic locking only for one-time tokens/referral acceptance/etc.

## 10. State transitions
Services enforce transitions; repositories/controllers do not arbitrarily assign status.

User:
- `PENDING -> ACTIVE`
- `ACTIVE -> SUSPENDED`
- `SUSPENDED -> ACTIVE`
- `ACTIVE|SUSPENDED -> DISABLED`

Patient link:
- `PENDING -> VERIFIED|REJECTED`
- `VERIFIED -> REVOKED`

TB registration:
- `OPEN -> DIAGNOSED`
- `DIAGNOSED -> CONVERTED_TO_CASE`
- explicit close/cancel only.

TB case:
- `ACTIVE -> REFERRED|TRANSFERRED|COMPLETED|CLOSED|CANCELLED`

Treatment:
- `PLANNED -> ACTIVE`
- `ACTIVE -> PAUSED|TRANSFERRED|COMPLETED|STOPPED|CANCELLED`
- `PAUSED -> ACTIVE|STOPPED|CANCELLED`

Lab request:
- `DRAFT -> REQUESTED`
- `REQUESTED -> SENT|RECEIVED|CANCELLED`
- `SENT -> RECEIVED|CANCELLED`
- `RECEIVED -> PARTIAL|COMPLETED`
- `PARTIAL -> COMPLETED`

Referral:
- `DRAFT -> SENT`
- `SENT -> RECEIVED|RETURNED|CANCELLED`
- `RECEIVED -> REPORTED|RETURNED`

Alert:
- `OPEN -> ACKNOWLEDGED|DISMISSED`
- `ACKNOWLEDGED -> RESOLVED|DISMISSED`

## 11. REST API plan
Base: `/api/v1`.

Authentication:
- `POST /auth/register`
- `POST /auth/verify`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`

Account linking:
- `POST /patients/{patientId}/account-link`
- `DELETE /patients/{patientId}/account-link`
- `POST /cases/{caseId}/supporters/{supporterId}/account-link`
- `DELETE /cases/{caseId}/supporters/{supporterId}/account-link`

Patient self:
- `GET /me/patient`
- `GET /me/treatment`
- `GET /me/follow-ups`
- `GET /me/alerts`
- `GET /me/notifications`

Clinical plan:
- patients/registrations/diagnoses/cases
- lab requests/results
- treatments/dose events/follow-ups/outcome/adverse events
- referrals/contacts/investigations/TPT
- alerts acknowledge/resolve

No generic unrestricted CRUD endpoint.

## 12. HTTP optimistic contract
Mutable responses include `id` and `version`.

Existing versioned resource mutations require:
`If-Match: "<version>"`

- missing -> 428
- stale -> 409
- create commands -> no `If-Match`

## 13. Problem response
Use `application/problem+json`, e.g.:

```json
{
  "type": "about:blank",
  "title": "Konflik perubahan data",
  "status": 409,
  "detail": "Data telah berubah sejak terakhir dibuka. Muat ulang data sebelum menyimpan kembali.",
  "code": "OPTIMISTIC_LOCK_CONFLICT",
  "traceId": "..."
}
```

Validation uses English field names and Indonesian messages.

## 14. Audit
At minimum audit:
- registration/verification;
- successful login/logout;
- role/facility assignment;
- patient/supporter link/revoke;
- all future clinical writes/state transitions;
- source-authority denial;
- authorization-denied sensitive operations.

Never audit raw passwords or raw session/verification tokens.

## 15. Package structure
Recommended additive layout:

```text
id.tbcall
├── application
│   ├── auth
│   ├── identity
│   ├── patient
│   ├── tuberculosis
│   ├── laboratory
│   ├── treatment
│   ├── monitoring
│   └── common
├── authorization
├── security
├── web
├── persistence
└── integration
```

Do not move existing persistence classes merely for aesthetics.

## 16. Implementation phases

### Phase 1 — Identity/session/authorization foundation
- V9
- Spring Security
- registration/contact verification
- opaque DB-backed sessions
- logout
- `/me`
- bootstrap SYSTEM_ADMIN
- permission/scope resolution
- staff-assisted patient link
- supporter account link
- DTO/error foundation
- tests

### Phase 2 — Patient/registration/case
Scoped patient search/detail and commands through case confirmation.

### Phase 3 — Laboratory/treatment
Lab workflow, treatment, adherence, follow-up, outcomes, adverse events.

### Phase 4 — Referral/contact/TPT/monitoring
Continuity of care and patient/supporter monitoring.

### Phase 5 — SITB adapter
Only after authorized integration contract exists.
