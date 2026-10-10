# TBCall F5A — Account-Linking Contract Review

**Repository:** `savitar393/TBCall`  
**Baseline:** `main` at `1b86f89f7b03784da9296139011d272d6c2bb616` (F4 merged).  
**Status:** Design/audit checkpoint only; **do not implement, migrate, or merge**.

## Objective

Make TB Officer-driven **PATIENT** and **TREATMENT_SUPPORTER** account onboarding genuinely usable without exposing a global user directory, arbitrary clinical resources, or unsupported SITB behavior.

The existing backend already implements these mutations:

- `POST/DELETE /api/v1/patients/{patientId}/account-link`
- `POST/DELETE /api/v1/cases/{caseId}/supporters/{supporterId}/account-link`

`AccountLinkService` already enforces: `TB_OFFICER` role, independently held `PATIENT_LINK_VERIFY` or `SUPPORTER_LINK_MANAGE` permission, patient/case facility scope, active login-verified target users, explicit `If-Match` for existing patient-link rows and all supporter-link updates, audit logging, and appropriate PATIENT/TREATMENT_SUPPORTER role lifecycle.

### Verified gaps in current code

1. `/api/v1/admin/users/lookup` is restricted to administrator roles; **do not reuse or broaden it** for TB Officers.
2. No officer-safe, context-scoped **exact account resolution** endpoint exists. A form accepting arbitrary user UUID is not acceptable.
3. There is no matching **current patient-link or supporter-link GET** returning authoritative ETags. Avoid synthesizing ETags from versions.
4. No TB Officer application API appears to **list/create `patient_supporters` records**. Existing account-link tests provision these records with direct SQL inserts. A supporter UUID must not be manually sourced from a database or URL guess.
5. The F3 patient/supporter portals require links to have already been established; F4 deliberately deferred this provisioning UI.

## Proposed review deliverables

Produce a technical decision document that resolves each question below against actual backend code and database constraints, not assumptions.

### A. Exact verified-account identification

Propose a context-bound operation taking **exact verified email or phone** as an explicitly submitted value and returning only the minimum needed to confirm the candidate (`userId` plus masked login hints). The clinical patient/case scope and matching permission must be checked **before** any account matching. Non-matches, unverified accounts and ineligible accounts must not become a staff-visible directory or enumeration oracle. Audit/limit the lookup as appropriate. Do not accept NIK, BPJS, name search, fuzzy search, or expose account roles, unrelated memberships, login sessions or passwords.

Compare two possible endpoint shapes (context-specific POST vs shared context-bearing POST) and choose the safer one. Do not put login identity in browser navigation/history/storage. An API request payload may contain exact identity transiently if needed.

A successful account lookup does **not** prove patient identity, supporter relationship or consent. Propose an explicit officer confirmation step grounded in the existing verification workflow; do not invent a verified consent record or medical identity matching mechanism.

### B. Current link state + ETag

Define a read for:

- current verified SELF link on a facility-scoped patient (including a safe 'no verified link' state);
- current supporter linked user on a scoped case's selected active `patient_supporters` row.

Return safe masked display when appropriate, and the actual response ETag for mutations that require it. Distinguish **new patient link** (POST without `If-Match`) from a **previously PENDING/REVOKED same patient-user pair** (POST requires matching existing link version). Propose an authoritative preflight/read path for that historical pair without exposing another patient's relationships or allowing version guessing.

Account ownership can change after a read: backend mutations remain final authority; stale conflicts require manual review and never automatic replay.

### C. Supporter-record onboarding

Verify the absence of existing application endpoints for `patient_supporters`, and inspect table constraints, allowed types/statuses and ownership relationships.

Propose the **minimum** case-scoped supporter list/detail/create API needed for officer onboarding, including:

- TB_OFFICER + appropriate explicit permission and active assigned case facility;
- safe list/detail projection (name, minimal relationship/type, active, masked phone, linked indicator); no sensitive free-text notes or other patient records;
- supporter detail GET with actual row ETag;
- explicit create with only fields supported by the schema/domain; no invented PMO type/consent semantics;
- audit of new writes; no schema change unless proved unavoidable and separately approved;
- safeguards on foreign/deactivated cases/supporters and duplicate/mismatched case ownership.

Do not create patient or supporter accounts on behalf of users; accounts must exist and have a verified login identity.

### D. Auth, session and role lifecycle

Inspect how `CurrentActor` and `/me` refresh roles, `selfPatientId`, and `supporterCaseIds` following linking and revocation. Identify whether existing sessions need server-side invalidation/re-authentication or whether session refresh is sufficient. Do not silently change auth/session semantics.

Confirm `PATIENT` removal on revoke and `TREATMENT_SUPPORTER` retention until the last active supporter link, along with concurrent operation behavior.

### E. F5 frontend handoff

Describe where the UI should live (patient detail; case detail/supporter section), navigation/permissions, confirmation/undo semantics, exact lookup handling, link-state GET ETags, and safe empty/conflict states. Use current client query/session patterns, strict Zod schemas and AbortSignal; no clinical browser persistence, logging or PII in URL/history/global shell.

## Boundaries

- **No V18** and no modification of V1–V17 without a separate explicit decision.
- No change to existing account-link writes, role rules, facility access, session semantics, clinical rules, or F1–F4 code during this audit.
- No admin user-directory expansion, NIK/BPJS identity lookup, automatic role assignment outside the existing link flow, patient/supporter clinical record editing, or SITB integration.
- Preserve the backend's authoritative ETag and optimistic-lock design.
- Use dummy accounts and synthetic data in examples; no production identities.

## Required output

Create a review document in `docs/architecture/` (or return a draft without committing) with:

1. verified endpoint/schema/security inventory and code references;
2. exact gaps and whether new supporter-record create is genuinely required;
3. the smallest proposed endpoint and DTO set, with request/response examples;
4. per-endpoint authorization and visibility matrix;
5. patient re-link/history version handling;
6. audit/privacy/session/rate-limiting risks;
7. PostgreSQL integration-test matrix and test data setup;
8. decision points explicitly requiring approval before F5B implementation.

**Stop after the review. Do not implement F5B or frontend F5C.**
