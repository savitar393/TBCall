# Backend v1.5A.8 — F5B account onboarding report

## Base and scope

Approved base: `1b86f89f7b03784da9296139011d272d6c2bb616`.
Branch: `feat/frontend-f5b-linking-contracts`.
Architecture: [F5B account onboarding](architecture/TBCall_Backend_v1.5A.8_F5_Account_Onboarding.md).
Contract/handoff: [account linking contracts](FRONTEND_ACCOUNT_LINKING_READ_CONTRACTS.md).

F5B is local clinician-controlled account onboarding, not Phase 5B SITB interoperability. Exactly seven additive routes and the authorized identity-bound revocation correction were implemented. No frontend, authentication/session lifecycle, unrelated clinical workflow, role vocabulary, source-authority scope or migration was changed.

## Complete changed-file manifest

| Path | Change |
| --- | --- |
| `src/main/java/id/tbcall/application/common/AuditService.java` | Add transaction-mandatory timestamp-aware recording; existing callers retain their original clock behavior |
| `src/main/java/id/tbcall/application/identity/AccountLinkService.java` | Bind patient revoke to current row ID; case lock and prospective lifecycle gating for supporter writes |
| `src/main/java/id/tbcall/application/identity/AccountResolutionService.java` | Nontransactional orchestration throws failures after committed lookup outcome |
| `src/main/java/id/tbcall/application/identity/AccountResolutionTransaction.java` | Scoped exact matching, PostgreSQL shared budget, independently committed safe outcome audit |
| `src/main/java/id/tbcall/application/identity/OnboardingAccess.java` | Shared case scope, case lock, lifecycle and selected-supporter association checks |
| `src/main/java/id/tbcall/application/identity/OnboardingDtos.java` | Strict allowlisted inputs and focused safe projections |
| `src/main/java/id/tbcall/application/identity/OnboardingQueryService.java` | Read-only patient current/pair state and supporter roster/detail |
| `src/main/java/id/tbcall/application/identity/OnboardingViews.java` | Minimal account/contact masks and supporter projections |
| `src/main/java/id/tbcall/application/identity/SupporterOnboardingService.java` | Minimal local supporter creation, source-authority check and transactional creation audit |
| `src/main/java/id/tbcall/security/SecurityConfiguration.java` | Allow authorized legacy `X-Expected-Link-Id` CORS request header only |
| `src/main/java/id/tbcall/web/AccountLinkController.java` | Identity-bound DELETE; strict legacy UUID header requirement and common revoke path |
| `src/main/java/id/tbcall/web/AccountOnboardingController.java` | Seven additive onboarding route mappings and authoritative ETags |
| `src/test/java/id/tbcall/application/AccountOnboardingIntegrationTest.java` | 65 new PostgreSQL/Spring security, workflow, concurrency and query-plan cases |
| `src/test/java/id/tbcall/application/IdentityAuthorizationIntegrationTest.java` | Four existing intended legacy-revoke calls now supply expected link ID; no tests removed |
| `docs/FRONTEND_ACCOUNT_LINKING_READ_CONTRACTS.md` | Exact endpoint/DTO/precondition contracts and separate F5C handoff |
| `docs/architecture/TBCall_Backend_v1.5A.8_F5_Account_Onboarding.md` | Approved architecture with concrete implementation decisions |
| `docs/PHASE5A_8_REPORT.md` | This report |

## Implemented endpoint contracts

All routes are under `/api/v1`.

| Method and route | Contract |
| --- | --- |
| POST `/patients/{patientId}/account-link/resolve-user` | Exact body `{identity}`; 200 `{userId,matchedLogin:{kind,maskedValue}}`; neutral unavailable 404 |
| GET `/patients/{patientId}/account-link` | 200 `{link:null}` without ETag, or minimal current VERIFIED SELF link with real row ETag |
| GET `/patients/{patientId}/account-link/precondition?userId=...` | Only specified patient/user/SELF pair; nullable `{id,verificationStatus}` with real pair ETag iff present |
| GET `/cases/{caseId}/supporters` | UUID-ascending safe summaries; page 0/size 20 defaults, size 1..50; no version or ETag |
| POST `/cases/{caseId}/supporters` | Strict `{supporterType,fullName,phone?}`; PMO/COMPANION; trimmed name 1..255, optional contact phone up to 30; 201 minimal detail and created-row ETag |
| GET `/cases/{caseId}/supporters/{supporterId}` | Safe selected detail/current masked account plus actual supporter version/ETag |
| POST `/cases/{caseId}/supporters/{supporterId}/account-link/resolve-user` | Exact body `{identity}`; minimal matched-channel candidate only |
| DELETE `/patients/{patientId}/account-links/{linkId}` | Actual row ETag, exact current owner ID required; 200 existing updated link response; stale identity/version 409 |

Existing patient link POST and supporter link/unlink bodies, response DTOs and lifecycle of PATIENT/TREATMENT_SUPPORTER assignments remain. Legacy patient DELETE now additionally requires strict canonical UUID `X-Expected-Link-Id`: absent/blank 428, malformed 400. Both revoke routes invoke the same identity-bound logic. All mutation versions remain strict quoted numeric ETags; missing 428, malformed/weak/wildcard/multiple 400, stale 409. No Patient/Case version is substituted.

Exact projection definitions are in the linked contract document. Patient state has `maskedAccount:{maskedEmail,maskedPhone}`; pair omits user directory data; supporter list contains only `id,supporterType,fullName,active,maskedPhone,linked`; detail contains only `id,caseId,supporterType,fullName,active,maskedPhone,linkedUser,version`. No entities are returned.

## Authorization, privacy and source authority

- Patient routes require TB_OFFICER + PATIENT_LINK_VERIFY + unchanged historical patient-link facility scope; supporter routes require TB_OFFICER + SUPPORTER_LINK_MANAGE + current active case facility/assignment. PATIENT_READ/CASE_READ are independently controlled and not inferred.
- Administrator/LAB_STAFF/PATIENT/TREATMENT_SUPPORTER artificial permission grants cannot bypass the officer role. Foreign/missing selected supporters do not disclose relationship existence. Scope runs before account matching.
- Exact normalization reuses IdentityNormalizer. ACTIVE and verification of the matched channel are required. Patient candidates exclude all existing verified SELF owners; supporter candidates may retain patient/other-supporter relationships.
- All unavailable target categories use the same safe 404. Candidate contains only target UUID and matched masked channel. No raw identity, other channels, role/membership, other patient, secret, consent assertion or clinical details enter lookup audit metadata or logs. No successful-read audits are emitted by the new GETs.
- Supporter creation is explicit TBCall-local domain data, active/unlinked, with no account/role creation, no name/type deduplication, and no singleton PMO rule. The existing TB_CASE / CLINICAL explicit source-authority policy is respected; configured external authority causes SOURCE_AUTHORITY_CONFLICT. Identity metadata linking/cleanup remains locally owned. No new source enum, external identifier mutation, sync or network call was added.

## Concurrency, shared throttling and durable audit

- Patient revoke takes the existing patient row lock and compares **row identity before row version**. Equal-version X-to-Y replacement cannot revoke Y via either route. Existing uniqueness indexes and patient/target-user locks continue to enforce exclusive VERIFIED SELF ownership.
- Supporter create/resolve/link/unlink acquire the case lock before hydration and recheck facility/state. Actual transfer waits are tested for all four operations; a transfer completed while the request waits causes denial without supporter mutation. New/replacement linking requires ACTIVE/REFERRED, while terminal cleanup unlink stays available under existing active-supporter semantics.
- Sorted target-user locks, supporter optimistic versions and last-active-supporter counting retain cross-case role cleanup. Existing sessions use fresh authorization on the next request; no forced re-login or automatic session revocation was introduced.
- TBCall policy defaults are **10 attempts per actor and 5 per actor+context per rolling 15 minutes**. The existing actor User row serializes all instances and contexts; existing audit rows are the shared durable counters. Available, unavailable, invalid and throttled parsed/authorized attempts count. Repeated denied attempts can extend the rolling window. Malformed structure and denied contexts never match accounts or reserve lookup attempts.
- Separate Spring-proxied REQUIRES_NEW lookup transaction returns an outcome; the NOT_SUPPORTED orchestration throws 400/404/429 only after commit. No local map/cache limiter or new table exists. PostgreSQL time supplies cutoff and outcome timestamps after acquiring the actor lock.
- The timestamp cutoff is bound, making the existing `idx_audit_logs_actor(actor_user_id,occurred_at DESC)` usable as an actor/time range. Each count caps qualifying rows at its budget. The PostgreSQL plan regression captures actual emitted SQL, seeds 25,000 historical rows, and verifies the timestamp in the index condition.
- New audit actions: ACCOUNT_RESOLUTION_AVAILABLE, ACCOUNT_RESOLUTION_UNAVAILABLE, ACCOUNT_RESOLUTION_INVALID, ACCOUNT_RESOLUTION_THROTTLED and SUPPORTER_CREATED. Existing PATIENT_LINK_VERIFIED/REVOKED, SUPPORTER_LINKED/UNLINKED, ROLE_ASSIGNED/REMOVED and AUTHORIZATION_DENIED remain. Lookup events contain allowed actor/context IDs, action, DB timestamp and safe UUID correlation only. Creation and link role/audit changes remain transactional with domain writes.

## Tests and critical review

The new class covers all seven route role/permission/facility gates, artificial wrong-role grants, permission independence, historical patient scope, exact email/phone normalization, channel verification mismatch, ACTIVE/ineligible target neutral 404, durable unavailable/invalid/429 outcomes, concurrent context limits, independent Spring-proxied service instances sharing PostgreSQL, rolling expiry, live indexed query plans, all patient state/pair statuses and real ETags, equal-version replacement on both revoke routes, strict legacy header, selected-supporter association, safe projections, pagination, allowlist/minimal-field validation, defaults/no roles/no singleton rule, terminal/referred lifecycle, transfer lock rechecks, real supporter ETags/replacement/stale failures, source-authority protection, and preexisting-session self/supporter portal link/read/unlink E2E. Existing identity tests retain uniqueness, race and last-link role cleanup coverage.

Initial RED: **35 tests, 35 failures, 0 errors, 0 skipped** against missing routes/old contracts. The first sandboxed attempt could not access Docker; authorized Docker-enabled verification ran successfully thereafter. Two added fixture errors (treatment required start date and duplicated registration case) were corrected without production changes.

Critical self-review and independent read-only review found the original volatile clock expression could prevent the audit time index range. A live regression reproduced a sequential scan filtering 25,003 rows. Binding the database cutoff fixed it; the regression and expanded suite passed.

Final self-review also found that the shared supporter helper checked inactive state before If-Match, changing an existing missing-precondition response from 428 to 409. An added assertion reproduced **1 test, 1 failure, 0 errors, 0 skipped**, with expected 428 but actual 409 (28.217 s; finished 2026-10-08T10:38:59+07:00). Existing supporter writes now select the row without the helper's activity guard, validate their real row version first, then retain the original inactive guard. Resolver activity checks remain in place. The affected identity/onboarding tests and full clean suite are rerun after this correction. No other confirmed review finding remains.

Final targeted command:

```powershell
.\mvnw.cmd '-Dtest=AccountOnboardingIntegrationTest,IdentityAuthorizationIntegrationTest' test
```

Exact targeted result:

```text
Tests run: 111, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 02:04 min
Finished at: 2026-10-08T10:41:45+07:00
```

Exit code 0; 65 new cases + all 46 existing identity cases.

## Required full clean build

The first `.\mvnw.cmd clean test` completed before the final precondition-order correction:

```text
Tests run: 1375, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 15:06 min
Finished at: 2026-10-08T10:38:19+07:00
```

Exit code 0. This earlier build is not the final signoff after the correction.

After the final precondition-order correction and the passing 111-case affected suite, the exact command `.\mvnw.cmd clean test` was rerun on Windows with Java 21.0.12.1 and Maven wrapper 3.9.16. Final Maven output:

```text
Tests run: 1375, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 16:33 min
Finished at: 2026-10-08T10:59:13+07:00
```

Exit code **0**. Surefire XML independently totals **31 classes / 1375 tests / 0 failures / 0 errors / 0 skipped**: all 1310 baseline tests plus 65 new F5B cases. Fresh PostgreSQL Testcontainers migrations through V17, Hibernate validation and application startup passed. No code or test changes followed this final clean build.

Existing test contexts/pools logged reconnect/connection-validation warnings after their Testcontainers were terminated. Surefire also logged its 30-second fork shutdown timeout after System.exit(0); Maven nevertheless exited 0 with all tests passing. No production pooling/authentication/clinical behavior was changed to suppress these test-infrastructure messages.

## Protected scope and F5C blockers

V1–V17 remain unchanged, with no V18 or schema/entity changes. `git diff --exit-code 1b86f89f7b03784da9296139011d272d6c2bb616 -- frontend src/main/resources/db/migration` produced no diff. All 17 physical migration files match the approved Git content (13 exact blob byte matches; four have the existing Windows CRLF checkout endings; no other differences and no migration rewrite). Tracked frontend/backend clinical/authentication/session/source-authority code outside the manifest is unchanged. Existing untracked architecture inputs and the personal frontend logo remain outside the commit; the logo SHA-256 remains `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`. Local prompts, Kemenkes PDFs, logs and `.tools` helpers are not staged. Logs reside under ignored `.tools/`; generated Maven `target/` is ignored and no generated sources are required.

No unresolved schema/security-contract conflict was encountered. F5C requires separate approval/review and the documented transient candidate/manual staff attestation flow. Participating healthcare organizations still need an approved operational consent/identity-verification SOP before real-person use. No automatic consent or identity-proof claim was added. Stop at F5B; no F5C or SITB interoperability work was started.
