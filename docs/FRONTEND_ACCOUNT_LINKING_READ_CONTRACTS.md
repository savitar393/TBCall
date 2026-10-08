# F5B account onboarding contracts for the future F5C frontend

Backend v1.5A.8; base `1b86f89f7b03784da9296139011d272d6c2bb616`. All routes below are under `/api/v1`. Authentication remains the existing opaque session cookie, with CSRF protection on writes. This checkpoint implements backend contracts only.

## Permissions and scope

Patient routes require **TB_OFFICER + PATIENT_LINK_VERIFY**, using the existing historical registration/current-case patient-link facility scope. They do not require PATIENT_READ. Supporter routes require **TB_OFFICER + SUPPORTER_LINK_MANAGE** and the case's current active facility in the officer's active assignments. They do not require CASE_READ. Administrator or other roles cannot bypass the officer gate with artificial grants.

Supporter create, resolve and new/replacement link require ACTIVE/REFERRED cases and an active selected supporter for resolve/link. Authorized existing roster/detail reads and unlink retain terminal-case cleanup access. Existing inactive-supporter write restrictions remain. Missing/foreign supporters return the same 404 after case authorization. F5C may independently need existing clinical read permissions to host these tools.

## Endpoint contracts

| Method and route | Success and response | ETag |
| --- | --- | --- |
| POST `/patients/{patientId}/account-link/resolve-user` | 200 `Candidate` | None |
| GET `/patients/{patientId}/account-link` | 200 `{link:null}` or `{link:PatientLinkState}` | Actual link row iff present |
| GET `/patients/{patientId}/account-link/precondition?userId={uuid}` | 200 `{patientId,userId,pair:null}` or `pair:{id,verificationStatus}` | Actual exact SELF pair iff present |
| GET `/cases/{caseId}/supporters?page=0&size=20` | 200 `{content:SupporterSummary[],page,size,totalElements}` | None |
| POST `/cases/{caseId}/supporters` | 201 `SupporterDetail` | Actual created supporter row |
| GET `/cases/{caseId}/supporters/{supporterId}` | 200 `SupporterDetail` | Actual selected supporter row |
| POST `/cases/{caseId}/supporters/{supporterId}/account-link/resolve-user` | 200 `Candidate` | None |
| DELETE `/patients/{patientId}/account-links/{linkId}` | 200 existing `PatientLinkResponse` after exact-current-row revoke | Updated revoked row |

### Exact DTO projections

```text
Candidate = {userId, matchedLogin:{kind:EMAIL|PHONE,maskedValue}}
PatientLinkState = {id,patientId,userId,relationshipType,verificationStatus,
                    maskedAccount:{maskedEmail,maskedPhone}}
SupporterSummary = {id,supporterType,fullName,active,maskedPhone,linked}
SupporterDetail = {id,caseId,supporterType,fullName,active,maskedPhone,
                  linkedUser:null|{userId,maskedEmail,maskedPhone},version}
PatientLinkResponse = {id,patientId,userId,relationshipType,verificationStatus,version}
SupporterLinkResponse = {id,caseId,linkedUserId,version}
```

Email masks retain the first character and domain (`t***@example.org`). Phone masks retain only the final four characters (`***7890`); values of four characters or fewer become `***`. Null contact/login fields remain null. Supporter list/detail omit address, notes, organization/status metadata and clinical data; linked-account views omit roles, memberships, status and other relationships. List order is UUID ascending, includes active/inactive rows, and permits size 1..50, nonnegative page and an integer-safe offset.

### Exact account resolution

POST body is exactly `{"identity":"exact email or phone"}`. Normalize using existing IdentityNormalizer; require an ACTIVE account and verification of the submitted matching channel. Patient resolver excludes every existing VERIFIED SELF owner, including the current patient owner. Supporter resolver permits existing PATIENT/supporter roles and other case links. Candidate eligibility is rechecked by the existing link write transaction; lookup does not reserve ownership or prove consent/identity.

Nonexistent, inactive, unmatched-channel-unverified and ineligible accounts receive identical neutral **404 RESOURCE_NOT_FOUND** title/detail; only correlation IDs vary. Invalid login format returns safe 400. Scope gates run before normalization/matching. No NIK/name/fuzzy/directory/bulk matching; identity is submitted only in the POST body, never in query strings or telemetry. Unknown body properties are rejected.

**TBCall defaults:** shared PostgreSQL limit of 10 attempts per actor and 5 per actor+patient/supporter context per rolling 15 minutes. Authorized parsed attempts include success, unavailable, invalid identity and throttled outcomes. Exceeded budget returns **429 ACCOUNT_RESOLUTION_LIMIT** before matching. Repeated rejected requests can extend the rolling window; do not automatically retry. Malformed request structure and denied contexts never match accounts. Lookup outcomes commit independently and carry only actor/context/action/timestamp/UUID correlation metadata.

### Patient link writes and safe revocation

Existing POST `/patients/{patientId}/account-link` retains `{userId}`: absent pair gives 201 without requiring If-Match; PENDING/REVOKED pair requires its real pair GET ETag and gives 200; REJECTED cannot verify. An existing verified owner requires explicit revoke first, never automatic replacement. Existing uniqueness/role rules remain.

For revocation, retain the **link ID together with its GET ETag** and call the identity-bound DELETE. The backend checks both within the patient row lock. Coincidentally equal versions on a replacement row never authorize deleting it. Identity mismatch is **409 OPTIMISTIC_LOCK_CONFLICT**. Legacy DELETE `/patients/{patientId}/account-link` requires the additional strict UUID `X-Expected-Link-Id` header (missing/blank 428; malformed 400) plus If-Match and delegates to the same implementation. Version-only legacy requests fail. This header is CORS-allowed for configured origins.

Numeric ETags are quoted row versions. Missing If-Match is 428, malformed/weak/wildcard/multiple tags 400, stale version 409. Do not synthesize versions or use Patient.version/Case.version as link preconditions.

### Supporter creation and account writes

Creation body allows exactly `supporterType` (PMO/COMPANION), `fullName` (trimmed, nonblank, maximum 255), `phone` (nullable optional contact-only text, maximum 30). No supplied ID/caseId/link/active/version/address/notes/organizationName/supporterStatus/other fields. Route case is locked and rechecked; new row is active and unlinked, without user or role creation. No deduplication/single-PMO invariant. Do not replay uncertain creation automatically; refresh and review the roster.

Existing POST `/cases/{caseId}/supporters/{supporterId}/account-link` retains `{userId}`; DELETE same route unlinks. Use the **supporter detail ETag**. New/replacement linking is limited to ACTIVE/REFERRED; terminal unlink stays allowed. Case lock prevents transfer races; target-user locks and existing optimistic versions/last-active-link counting preserve role cleanup across cases. New domain creation respects explicit existing case CLINICAL source authority (409 SOURCE_AUTHORITY_CONFLICT); identity metadata stays locally owned. No SITB networking/source-scope changes.

## Workflow and F5C handoff

1. Officer opens an authorized patient/case and reads current state or roster.
2. Patient: exact POST resolution; pair precondition GET; review masked candidate; manual staff confirmation; existing link POST with actual pair ETag where present.
3. Supporter: explicitly create/select local supporter; detail GET; exact POST resolution; review and manual confirmation; existing link POST with actual detail ETag.
4. To clean up, use current link ID + ETag or supporter detail ETag. Refresh after conflict; do not retry writes/resolution automatically.
5. Existing sessions see current `/me`, self/supporter scopes and protected-read permissions on the next request after link/unlink/revoke; re-login is not required and sessions are not automatically revoked.

F5C is separately authorized work. Require transient identity/candidate state, session isolation, no browser-persisted PII and explicit human attestation. The attestation is not consent or proof of medical/legal identity. Participating organizations must approve an operational identity/consent SOP before real-person use. No production consent assertion was added.
