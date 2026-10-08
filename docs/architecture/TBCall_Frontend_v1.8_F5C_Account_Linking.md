# TBCall Frontend v1.8 — F5C Officer-Controlled Account Linking

**Approved backend:** `a7e4233576f3e89e5a19f5146b60bd4c18829029` (F5B / backend v1.5A.8).  
**Implementation branch:** `feat/frontend-f5c-account-linking` after fast-forwarding F5B to `main`.  
**Scope:** frontend only. Integrate account linking into the existing staff patient and case detail views. This document is TBCall-specific, not an official SITB contract.

## 1. Goal and boundaries

Allow a qualified `TB_OFFICER` to (a) resolve an existing verified TBCall login by an exact email/phone, (b) explicitly review and link it to a patient SELF record or an existing/just-created case supporter, and (c) revoke/unlink an existing account. The new supporter-create API is an authorized clinical-domain write, not a SITB sync operation.

Do not introduce: signup-on-behalf, NIK/BPJS/name search, global user directory, role management, patient identity auto-match, account/password changes, consent recording, invented supporter deactivation/edit, SITB networking or clinical treatment advice. Do not change backend/auth/migrations or old staff/portal workflows.

## 2. Exact F5B backend contracts

All routes below are relative to `/api/v1`, and existing same-origin `apiRequest` maps them to `/api/tbcall/v1/...`.

| Action | Endpoint | Body / precondition | Response |
|---|---|---|---|
| Resolve patient candidate | POST `/patients/{patientId}/account-link/resolve-user` | `{identity}` (exact verified login, not URL query) | `{userId,matchedLogin:{kind,maskedValue}}` |
| Current patient owner | GET `/patients/{patientId}/account-link` | — | `{link:null}` with no ETag, or `{link:{id,patientId,userId,relationshipType,verificationStatus,maskedAccount:{maskedEmail,maskedPhone}}}` with actual link-row ETag |
| Existing pair precondition | GET `/patients/{patientId}/account-link/precondition?userId={candidateId}` | ID from successful resolver only | `{patientId,userId,pair:null\|{id,verificationStatus}}`, real pair ETag if row exists |
| Link patient | POST `/patients/{patientId}/account-link` | `{userId}`, `If-Match` **only if historical pair exists** | existing `PatientLinkResponse` |
| Revoke patient | DELETE `/patients/{patientId}/account-links/{linkId}` | actual current link ETag | existing `PatientLinkResponse` |
| List case supporters | GET `/cases/{caseId}/supporters?page=0&size=20` | — | `{content:[SupporterSummary],page,size,totalElements}` |
| Create case supporter | POST `/cases/{caseId}/supporters` | `{supporterType:"PMO"\|"COMPANION",fullName,phone?}` | `201 SupporterDetail` with row ETag |
| Supporter detail | GET `/cases/{caseId}/supporters/{supporterId}` | — | `SupporterDetail` plus real row ETag |
| Resolve supporter candidate | POST `/cases/{caseId}/supporters/{supporterId}/account-link/resolve-user` | `{identity}` | minimal `Candidate` |
| Link/replace supporter user | POST `/cases/{caseId}/supporters/{supporterId}/account-link` | `{userId}` plus current supporter detail ETag | existing `SupporterLinkResponse` |
| Unlink supporter user | DELETE `/cases/{caseId}/supporters/{supporterId}/account-link` | current supporter detail ETag | existing `SupporterLinkResponse` |

**Do not use** the legacy patient DELETE. In particular, never create `If-Match` from numeric list/detail versions or from `Patient.version`/`Case.version`. In the patient pair GET, `userId` must be a previously resolved candidate ID: the endpoint is not a global account search. The raw exact identity appears only inside an explicit resolve POST body, never query keys, URL/search parameters, logs, browser history or storage.

## 3. Authorization and host pages

- Embed `PatientAccountLinkSection` on `frontend/features/clinical-intake/components/patient-detail.tsx` when the actor also has `TB_OFFICER + PATIENT_LINK_VERIFY`. Existing host route `/patients/[patientId]` independently requires `PATIENT_READ`. Do not infer the linking permission from PATIENT_READ.
- Embed `CaseSupporterSection` on `frontend/features/clinical-intake/components/case-detail.tsx` when `TB_OFFICER + SUPPORTER_LINK_MANAGE`. Existing host route `/cases/[caseId]` independently requires `CASE_READ`. Do not infer it from SUPPORTER_LINK_MANAGE.
- Keep `clinical-intake` queries and clinical record editing unchanged. Add focused `features/account-linking` modules; host components should only import the new child sections and permission helper.
- Do not add a global account/user search route, admin menu item or patient/supporter portal mutation control.
- Backend remains final authority for current facility scope, historical patient link scope, case lifecycle, active supporter and role lifecycle; frontend gating is only an additional privacy layer.
- A mixed-role account gets account-link controls only if it actually satisfies the explicit officer gate; staff/admin role names alone do not imply permissions.

## 4. Feature structure and schemas

Suggested:

```text
frontend/features/account-linking/
  api.ts
  schemas.ts
  permissions.ts
  queries.ts
  use-command.ts
  feedback.tsx
  patient-section.tsx
  supporter-section.tsx
  resolve-form.tsx
  confirm.tsx
```

Follow existing `apiRequest`, `ApiError`, `useSession`, TanStack Query, React Hook Form/Zod, established UI primitives. Validate all responses with **strict Zod schemas** (reject unknown fields and map to `INVALID_RESPONSE`): Candidate, MatchedLogin, MaskedAccount, PatientState/PatientLinkState, PairState, SupporterSummary/Page/Detail, PatientLinkResponse, SupporterLinkResponse. The validated ETag must be read from the HTTP response, not a DTO field. Accepted supporter types are the exact backend allowlist `PMO`, `COMPANION`; do not assert that these are official SITB codes.

Read-only query keys begin `['account-linking', userId, ...]`, include patient/case/supporter ID and context, and all queryFns **consume AbortSignal**. Do not use a query for resolve POST: resolution is an explicit audited, rate-limited command with no automatic retries. Never store raw identities in TanStack cache keys or mutation variables/cache. Numeric paging remains component state only.

## 5. Patient workflow

1. GET current scoped patient-link state. If none, explain there is no verified account link; show exact-account resolve action only when the actor is authorized.
2. Officer explicitly enters exact email or phone and clicks `Cari akun terverifikasi`. Store exact input **only in mounted local React state** for this one submission; never submit while typing. Clear it after resolution or on context change, close/cancel, unmount or account/permission change.
3. POST resolver. For neutral 404 show `Tidak ditemukan akun aktif yang memenuhi syarat untuk ditautkan.` Avoid claiming whether an unverified account exists. For 429 show a safe rate-limit message and **do not automatically retry or poll**.
4. Present only the returned matched masked channel (plus minimal ID if needed internally). The officer must tick an initially unchecked acknowledgement such as `Saya telah memeriksa identitas akun tujuan dan kewenangan orang tersebut untuk mengakses informasi pasien yang terkait.` This is a manual attestation UI step, **not** proof or storage of legal consent. A participating facility must approve its real-person identity/consent SOP separately.
5. Immediately before linking, fetch current patient-link state and exact pair GET using the resolved candidate ID. If a VERIFIED owner exists, stop for manual review; no auto replacement. If pair status is REJECTED, disable linking; if PENDING/REVOKED, require pair GET ETag; if pair null, do not send If-Match. The backend may still reject a raced write.
6. POST `{userId}` once only after confirmation. On success refetch current link state; clear transient candidate, checkbox and input. If current user ID is the linked target, call `session.refresh()`; otherwise do not claim to force-refresh the target's browser.
7. Revoke uses the **current GET link ID and ETag**, asks explicit confirmation, calls identity-bound DELETE, refetches. On 409 preserve any relevant review context but **do not replay**; obtain new current link and require a new confirmation. Never invoke legacy patient DELETE.

The patient `PATIENT` role is assigned/removed by the backend. The frontend must not call admin role-assignment APIs for it.

## 6. Case supporter workflow

1. GET paginated roster for the current authorized case. Show safe summary fields; `fullName` is displayed **only inside authorized case content**, never global chrome, page metadata or URL.
2. Officer selects an existing supporter; fetch its independent detail GET to obtain **actual supporter-row ETag**. Display safe current masked linked account. Inactive supporters remain visible but have **no prospective resolve/link controls**.
3. If new supporter is needed, an explicit create dialog uses only `supporterType` (`PMO` or `COMPANION`), trimmed required name and optional contact phone (max 30). No `caseId`, `linkedUserId`, `active`, roles, address/notes/organization/status or account creation. The phone is supporter contact information, **not** a verified login claim.
4. Create once; after confirmed 201 refresh roster and select the created supporter. If the result is uncertain (network interruption), instruct officer to refresh/check roster first; never auto-replay creation because duplicate supporters are allowed.
5. For an active selected supporter on an ACTIVE/REFERRED case, submit a **separate** exact login in an explicit resolver POST. Same masked review + independent unchecked officer acknowledgement as the patient flow.
6. Before link or replacement, refetch selected supporter detail/ETag and review if the linked user changed. Replacements require an additional explicit confirmation naming the effect: the previous account may lose supporter access if it has no other active links. Submit POST `{userId}` with the selected **current detail GET ETag**, not a list version. Refetch detail and roster after success.
7. Existing link removal is explicit with confirmation, actual detail ETag and no auto replay. The backend handles last-supporter-role cleanup. Supporter record deletion/deactivation/edit is **not** supported and must not be fabricated.
8. For terminal cases, backend allows read and unlink cleanup, but no create/resolve/new/replacement link. Present an explanatory read-only/cleanup state; do not infer which other clinical actions remain allowed.
9. Treat `SOURCE_AUTHORITY_CONFLICT` on supporter creation as locked for repeated local create action until a meaningful context change; do not retry or bypass with a different API.

## 7. Failure/ETag/session safeguards

- **Read ETags from authoritative GET response headers**, not mutations, list summary `version`, or numeric DTO `version` guesses. For already-created record, refetch detail before subsequent writes.
- Missing If-Match (428), stale/identity mismatch (409), wrong-state (409), source authority conflict, neutral lookup 404, throttling 429 and CSRF failures have safe local Indonesian text. Do not render raw backend error `detail` or log payloads.
- **No automatic replay** of create, resolve, link, revoke or unlink. On stale edits re-read state, preserve relevant unsent input safely in mounted memory and require manual review/reconfirmation.
- On old-account, permission/role, facility-assignment, patient/case route or supporter-selection change: abort in-flight queries/commands, suppress late success/error/invalidation/navigation, reset transient exact identity/candidate/attestation and remove related cached data as appropriate.
- Commands snapshot the full current `/me` context, and do not trust only user ID or a stale React closure. Make mounted UI reset on same-account scope changes before old callbacks can run.
- Never persist raw identity, matched candidates, patient/supporter link data to localStorage, sessionStorage, IndexedDB, service workers or the browser history. No clinical or identity data in console logs, analytics, document title/metadata, global navbar, links or React Query mutation history.
- Keep case/patient resource UUIDs in approved path segments only. Do not put account candidate/user UUIDs in frontend routes; the backend's specific pair GET query uses the candidate ID solely as part of the approved API call.
- Page refresh of an authorized linked PATIENT or TREATMENT_SUPPORTER sees latest backend `/me` on the next request; it does not require login again. Do not claim immediate push updates to another person's existing tab.

## 8. Test matrix

Continue Vitest + React Testing Library. Add tests for:

- Independent TB_OFFICER + PATIENT_LINK_VERIFY / SUPPORTER_LINK_MANAGE; separate PATIENT_READ/CASE_READ host checks; mixed roles; wrong role with synthetic grants.
- No account search until explicit resolve submission; resolver uses **POST body**; no retry/poll/search-on-change; neutral 404/429; strict masked candidate response.
- No raw identity in URL, React Query key, mutation cache, storage, logs, document metadata, global nav or history; input cleared after attempt/cancel/account change.
- Current patient state with/without ETag; missing pair no If-Match; PENDING/REVOKED pair actual ETag; REJECTED blocked; existing VERIFIED owner blocks relink.
- Identity-bound patient DELETE uses current **link ID plus ETag**; legacy DELETE never called; equal-version replacement/stale 409 does not result in replay.
- Unchecked manual officer confirmation required; candidate changes clear confirmation; separate explicit replacement/revocation confirmation.
- Supporter paginated roster; inactive visible but cannot resolve/link; no unsupported create/edit/delete/reactivation.
- Supporter create exact minimal body and no auto retry; uncertain response causes roster review; source authority conflict locked.
- Selected supporter detail GET ETag for link/replace/unlink; no list-version synthesis; same-account route/selection/context changes abort late operations.
- Terminal case read/unlink permitted and prospective create/link/resolution absent.
- Existing PATIENT/TREATMENT_SUPPORTER role lifecycle delegated to backend, not admin role API.
- In-flight resolution/link/revoke/create/unlink old-user responses have no current UI effect; role/permission/facility change within the same user also clears drafts and prevents stale writes.
- All API responses validated strictly; malformed responses produce `INVALID_RESPONSE`; no raw problem prose; CSRF fails safely.
- Existing F1–F4 clinical/admin/portal tests remain green.

## 9. Build, docs and handoff

From `frontend/` run:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Baseline before F5C: **962 frontend tests**. Add:
- `docs/FRONTEND_F5C_ACCOUNT_LINKING.md`
- `docs/FRONTEND_F5C_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.8_F5C_Account_Linking.md`

Update `frontend/README.md` and root README frontend section only where appropriate. Backend Java/tests, Flyway V1–V17 and previous frontend feature behavior must remain unchanged. Do not commit prompts, PDFs, logs, screenshots, caches, local `.tools`, credentials or unrelated assets.

**After F5C:** do not start the reserved SITB interoperability Phase 5B. The next checkpoint is F6 real-backend end-to-end verification/security/deployment readiness with provisioned seven-role test actors and synthetic data. Real-person deployment requires an approved facility identity/consent procedure.
