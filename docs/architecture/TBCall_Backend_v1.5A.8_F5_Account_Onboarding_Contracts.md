# TBCall Backend v1.5A.8 — F5 Account-Onboarding Contracts

**Reviewed base:** `1b86f89f7b03784da9296139011d272d6c2bb616` (`main` after F4).

**Purpose:** close the missing clinician-controlled onboarding path for PATIENT and TREATMENT_SUPPORTER accounts, without inventing SITB API contracts or introducing new migrations. The new **F5B backend** name is unrelated to the reserved **Phase 5B SITB interoperability** effort.

This is an implementation contract following the F5A design audit. Perform a narrow backend-only checkpoint, do not begin F5C UI, and stop for review if the specified safeguards cannot be met without additional schema or workflow changes.

## 1. Scope and invariants

- Retain V1–V17 byte-for-byte; no V18.
- Preserve Spring Boot/Java 21/PostgreSQL/Flyway, existing authentication, permissions, and session resolution.
- The new account resolver is **not** a global user directory; it is contextual, exact-match, audited and throttled.
- No NIK, BPJS, patient name, fuzzy matching, email/phone autocomplete, bulk account lookup, credential issuance, consent claims or patient auto-registration.
- New supporter record creation is a deliberately authorized TBCall-local domain write, **not** a SITB record/API/sync operation.
- Existing verified SELF uniqueness, supporter last-unlink role cleanup and role assignment lifecycle remain intact.
- All new GETs are safe, read-only, and generate no successful-read audit. Resolution is POST because it deliberately records lookup attempts.
- Never include exact submitted identities in audit metadata, logs, URL query strings, error details, tracking IDs, or telemetry.

## 2. Proposed seven endpoints (all under `/api/v1`)

| Method and route | Purpose | Response |
|---|---|---|
| `POST /patients/{patientId}/account-link/resolve-user` | Exact verified account selection for patient SELF link | `Candidate {userId, matchedLogin:{kind,maskedValue}}` |
| `GET /patients/{patientId}/account-link` | Current VERIFIED SELF state | `{link:null}` without ETag, or minimal `link` plus real link-row ETag |
| `GET /patients/{patientId}/account-link/precondition?userId=...` | Status/version of exact patient/user/SELF historical pair | `{patientId,userId,pair:null|{id,verificationStatus}}`; actual pair ETag iff present |
| `GET /cases/{caseId}/supporters?page=&size=` | Case-scoped supporter roster | Safe paginated supporter summaries, without version or ETag |
| `POST /cases/{caseId}/supporters` | Minimal supporter record creation | 201, safe supporter detail and actual supporter-row ETag |
| `GET /cases/{caseId}/supporters/{supporterId}` | Safe selected supporter and current link state | Safe detail and actual supporter-row ETag |
| `POST /cases/{caseId}/supporters/{supporterId}/account-link/resolve-user` | Exact verified account selection for one active case supporter | `Candidate` only |

Use new focused DTOs with strict request validation and exact documented response projections. No persistence entity is returned directly.

### 2.1 Authorization, scope, and ordering

Patient routes: `TB_OFFICER` + `PATIENT_LINK_VERIFY` + `requireOfficerPatientLinkScope` semantics. Retain the current historical patient-registration/current-case scope used by existing link write endpoints, including the ability to revoke historical links. Resolve the patient scope **before** any account matching.

Supporter routes: `TB_OFFICER` + `SUPPORTER_LINK_MANAGE` + current case-facility scope. The selected supporter must belong to that case. For resolver and create, the case must be `ACTIVE` or `REFERRED` and the current facility active. For existing supporter GET, link cleanup and unlink, allow authorized terminal-case access, using the existing facility scope. A new/replacement supporter link should be restricted to ACTIVE/REFERRED; an unlink remains available for cleanup. Explicitly update regression expectations for this approved narrow tightening. A missing/foreign supporter must not disclose its existence.

Do not assume PATIENT_READ or CASE_READ can be inferred from the link permission. Host F5C UI may independently require these permissions to display the existing clinical record. No administrator role bypass with artificial grants.

### 2.2 Account resolution

Body: `{ "identity": "exact verified email or phone" }`.

- Reuse `IdentityNormalizer.login`; only email and phone are accepted.
- `ACTIVE` target required, with the **submitted matching** login channel verified. A verified email does not justify selecting the account using its unverified phone number.
- For patient candidates, a user already owning a VERIFIED SELF link is unavailable (including if it is the current patient; the current-link GET supplies that information). Do not disclose the other patient.
- Supporter candidates may already support another case or have a PATIENT role, as current backend lifecycle permits.
- The response contains only `userId` plus the masked **matching** channel kind/value. Never return password, roles, privileges, other verified channels, account status, patient details, other relationships, or unmasked identity.
- The same neutral `404 RESOURCE_NOT_FOUND` body must cover nonexistent, inactive, channel-unverified and ineligible targets. Scope permission failure remains authorization failure, evaluated first.
- Success confirms eligibility only at lookup time; linking rechecks eligibility atomically in the write transaction.
- This operation does **not** prove identity, consent, guardianship, patient authority or supporter relationship. Officer confirmation is a separate human procedure.

### 2.3 Patient state GETs and link creation

`GET /patients/{id}/account-link` selects VERIFIED SELF only. If there is no current verified owner return 200 `{link:null}`, no ETag. Otherwise return minimal link state `{id,patientId,userId,relationshipType,verificationStatus,maskedAccount...}` and actual `IfMatch.etag(link.version)`.

`GET /patients/{id}/account-link/precondition?userId=...` inspects only the specified patient/user/SELF pair **after scope authorization**. A missing pair returns `pair:null` and no ETag. Existing PENDING, REVOKED or REJECTED pair returns its actual ETag and minimal state. Never enumerate all relationships of the user or search users globally through this endpoint.

Retain existing `POST /patients/{id}/account-link`: new pair => no `If-Match`; existing PENDING/REVOKED pair => actual pair GET ETag; REJECTED => no supported verify operation; already VERIFIED owner => explicit conflict, never automatic replacement.

### 2.4 Identity-bound patient revocation: mandatory security correction

Add:

`DELETE /api/v1/patients/{patientId}/account-links/{linkId}`

with **actual current-link GET ETag**.

Within the existing patient row lock, verify that the supplied `linkId` still identifies the **current VERIFIED SELF owner**. If it differs, return 409, regardless of coincidentally equal numeric versions. Then require the supplied numeric version and revoke exactly that row with existing PATIENT role/audit semantics.

**Do not leave legacy DELETE exploitable:** retain `DELETE /patients/{patientId}/account-link` only if it additionally requires a strict `X-Expected-Link-Id` UUID header (428 if missing; 400 if malformed), and dispatches to the **same identity-bound revoke logic** with `If-Match`. This is an approved security hardening of the legacy write contract. Never accept a version-only legacy revoke. Update prior integration tests to pass the expected ID when they intend a successful revoke.

Reproduce the X->Y replacement with equal versions in PostgreSQL tests: a stale DELETE for X must never revoke Y on either route.

### 2.5 Case supporter roster and creation

`GET /cases/{caseId}/supporters` page 0, size 20, max 50; stable order by creation-time then UUID or UUID alone (document the chosen stable order); return `id,supporterType,fullName,active,maskedPhone,linked` only, without version.

`POST /cases/{caseId}/supporters` body with an **exact allowlist**:

```json
{"supporterType":"COMPANION","fullName":"Pendamping Contoh","phone":null}
```

- `supporterType`: PMO or COMPANION only (existing TBCall table/check codes).
- `fullName`: trimmed, nonblank, up to 255.
- `phone`: optional contact-only value, up to 30, never treated as verified login identity.
- Reject client-supplied caseId, ID, linkedUserId, active, version, address, notes, organizationName, supporterStatus or other properties.
- Derive case only from authorized route; case ACTIVE/REFERRED, active current facility. Lock/recheck case ownership/state before persisting.
- New row active, not linked, no automatic account/role creation. Respond 201 with actual supporter-row ETag.
- No name/type deduplication or fabricated one-PMO-per-case invariant (schema has no such constraint). After an uncertain POST, frontend refreshes roster and reviews instead of auto-retrying.
- Audited creation; never persist the name/phone in audit metadata or application logs.

`GET /cases/{caseId}/supporters/{supporterId}` returns minimal `{id,caseId,supporterType,fullName,active,maskedPhone,linkedUser:{userId,maskedEmail,maskedPhone}|null,version}` and actual row ETag. Do not expose address, notes, clinical details, global account roles or memberships. A missing/foreign supporter receives 404. This GET is authoritative for current linked-user state and linker/unlinker preconditions.

Supporter resolver must first check case + selected supporter ownership and active state; the same lifecycle gate applies to prospective link creation.

### 2.6 Existing supporter writes

Keep existing `POST/DELETE /cases/{caseId}/supporters/{supporterId}/account-link`, body and correct case association. Use the **real supporter detail ETag**, not Case.version or a fabricated version. Recheck status/ownership under lock to avoid concurrent case transfers between scope check and write; avoid new speculative reassignments. A terminal case may unlink existing associations but may not add/replace an account under this checkpoint. Preserve the existing last-active-supporter role cleanup across cases.

### 2.7 Source ownership

`patient_supporters` creation here is **TBCall-local onboarding data**, not a claim of official SITB record ownership or mapping. The account-to-user linking operation remains locally owned identity metadata. No SITB outbound events/import/sync, new source-authority enum/scope, or external-identifier mutation. If existing configured external source authority explicitly prevents the requested local domain write under an existing policy, respect that conflict; do not bypass or fabricate new authority contracts. Escalate any ambiguous real externally authoritative case instead of silently changing rules.

## 3. Brute-force control and durable audit: must be real

An authenticated, scoped exact resolver leaks limited account-existence information. Therefore require server-enforced, deployment-wide lookup limiting and persistent audit before F5C/public exposure.

Proposed conservative prototype budgets (document as **TBCall policy defaults**, not Kemenkes rules): at most **10 account-resolution attempts per actor per rolling 15 minutes** and **5 per patient/supporter context per actor per 15 minutes**; exceed => `429` with a safe, non-enumerating response. Both successful and unavailable lookups count. Exact identities never become counters/keys exposed in logs.

A per-JVM map/cache-only limiter is **not** acceptable as a deployment-wide claim. Prefer a race-safe PostgreSQL implementation using existing transactional/audit infrastructure and no new tables: independently committed reservation/audit of each request plus serialization (for example, lock the requesting User row in a `REQUIRES_NEW` transaction before counting/reserving). Verify against concurrent requests and multiple service instances using the same PostgreSQL. Guard performance, transaction boundaries and denial-path audit. If this cannot be implemented safely without migrations or unacceptable table scans, **stop and report the architecture blocker** instead of omitting limiting or claiming a local limiter is sufficient.

Audit resolution attempts and outcomes (available/unavailable/throttled) in a transaction that survives a subsequent 404/429/validation rollback. `AuditService.record()` alone is `MANDATORY` and rolls back with the caller, so use an explicitly separate proxied `REQUIRES_NEW` path. Persist only actor ID, allowed patient/supporter context ID, outcome/action, timestamp, and correlation ID. Do not store exact lookup identity, request body, phone/name, inferred consent or external IDs.

No automatic retries for resolver or linking writes.

## 4. Officer attestation/consent boundary

F5C must require explicit human review of the masked candidate and a confirmation such as:

> Saya telah memeriksa identitas akun tujuan dan kewenangan orang tersebut untuk mengakses informasi pasien/pendamping yang terkait.

This is a **manual staff attestation**, not a consent document or proof of medical/legal identity verification. An operational consent/identity-verification SOP must be approved by participating healthcare organizations before real-person use. No automatic consent assertion in database/audit is authorized.

## 5. Integration regression matrix

Backend baseline after F4: **1,310 reported passing tests**. Test counts may rise; do not promise a predetermined final count.

Required Spring/PostgreSQL integration cases:

1. All seven new routes: correct role+permission+scope; wrong role with artificial grant; unauthorized foreign case/supporter; inactive facility assignment; account matching never starts before authorization.
2. Resolver: exact normalized email/phone, matching-channel verified only, ACTIVE only, neutral same 404 for ineligible classes, no fuzzy/NIK/name/bulk, minimal masked payload.
3. Resolver attempt logs persist for unavailable/throttled paths; no sensitive metadata; simultaneous lookups obey **shared DB** limits and yield 429.
4. Patient GET: link-null no ETag; current verified link actual row ETag; scoped pair PENDING/REVOKED/REJECTED; never cross-patient enumerations.
5. Patient POST: absent pair no ETag; historical PENDING/REVOKED pair actual ETag; REJECTED rejected; stale 409; competitor ownership remains exclusive.
6. Revoke X->Y same numeric versions: both new and legacy routes reject stale X; legacy lacks expected ID => 428, invalid UUID => 400; current authorized revocation works and removes role.
7. Supporter list/detail: safe projection/pagination/masking, actual detail ETag, own-case-only, inactive/foreign handling.
8. Supporter create: API-created row with correct defaults/type/field allowlist; actual ETag; case lock and scope recheck on transfer; terminal create denied; no automatic role.
9. Supporter link/replace/unlink: real detail ETag; missing 428, malformed 400, stale 409; ownership changes, current case-scope check, terminal unlink permitted, last-supporter role cleanup preserved.
10. No snapshot leaks after link/unlink/revoke: sessions obtained before changes see updated `/me` and protected resource permissions on next request without re-login.
11. End-to-end test: verified user created using existing auth flows => API-created supporter => exact resolver => verified link => supporter portal backend read => unlink => read denied.
12. No V18, V1–V17 unchanged, old staff/admin/F1–F4 frontend untouched; current 1,310 baseline tests remain green.

## 6. Docs, gates and handoff

Create:
- `docs/FRONTEND_ACCOUNT_LINKING_READ_CONTRACTS.md`
- `docs/PHASE5A_8_REPORT.md`
- `docs/architecture/TBCall_Backend_v1.5A.8_F5_Account_Onboarding.md`

Run `./mvnw.cmd clean test` on Windows PowerShell as ` .\mvnw.cmd clean test ` (Java 21, PostgreSQL Testcontainers). Commit/push only approved backend + tests + docs on `feat/frontend-f5b-linking-contracts`.

Do not begin F5C frontend until reviewed. A separate F5C task will add UI to existing patient/case detail using the safe server contracts, real ETags, transient exact login identity, manual attestation, no global directory, no automatic write replay, user-session isolation, and no browser-persisted PII.
