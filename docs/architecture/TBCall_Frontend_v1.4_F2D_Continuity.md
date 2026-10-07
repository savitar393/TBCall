# TBCall Frontend v1.4 — F2D Referral, Contact Investigation and TPT

Approved backend base: `584fdea9bbe420c771593d52e2028407c6738c9c`

Status: approved staff continuity frontend slice.

F2D implements the existing TB Officer referral/transfer, contact-investigation and contact-driven TPT workflows. It adds no backend behavior, no clinical inference, no automatic TPT eligibility/regimen selection, no patient/supporter portal, no monitoring/alert UI, and no SITB networking.

## 1. Scope

Deliver:

```text
Referral continuity
  case -> referral preparation -> send
  incoming/outgoing queues -> detail -> receive/return/cancel/report

Contact investigation
  case -> contacts -> create
  contact -> detail/edit/link exact patient
  incoming/outgoing investigations -> detail -> transitions/completion

TPT
  completed eligible investigation -> explicit start
  contact -> TPT history
  TPT -> detail/edit/complete/stop/lost-to-follow-up
```

Explicitly deferred:
- staff monitoring/alerts/notifications (F2E)
- patient/supporter portal (F3)
- administration/integration UI (F4)
- SITB networking

## 2. Existing backend contracts

Use only current API contracts.

### Continuity read helpers
- GET `/api/v1/cases/{caseId}/referral-preparation`
- GET `/api/v1/continuity-facilities`
- GET `/api/v1/referral-reference-data`
- GET `/api/v1/contact-reference-data`
- GET `/api/v1/tpt-reference-data`

### Referrals
- POST `/api/v1/cases/{caseId}/referrals`
- GET `/api/v1/referrals/incoming`
- GET `/api/v1/referrals/outgoing`
- GET `/api/v1/referrals/{referralId}`
- POST `/api/v1/referrals/{referralId}/receive`
- POST `/api/v1/referrals/{referralId}/return`
- POST `/api/v1/referrals/{referralId}/cancel`
- POST `/api/v1/referrals/{referralId}/report`

### Contacts
- POST `/api/v1/cases/{caseId}/contacts`
- GET `/api/v1/cases/{caseId}/contacts`
- GET `/api/v1/contacts/{contactId}`
- PATCH `/api/v1/contacts/{contactId}`
- POST `/api/v1/contacts/{contactId}/link-patient`

### Contact investigations
- GET `/api/v1/contact-investigations/incoming`
- GET `/api/v1/contact-investigations/outgoing`
- GET `/api/v1/contact-investigations/{id}`
- POST `/api/v1/contact-investigations/{id}/receive`
- POST `/api/v1/contact-investigations/{id}/start`
- POST `/api/v1/contact-investigations/{id}/return`
- POST `/api/v1/contact-investigations/{id}/cancel`
- POST `/api/v1/contact-investigations/{id}/complete`

### TPT
- POST `/api/v1/contact-investigations/{id}/tpt`
- GET `/api/v1/contacts/{contactId}/tpt`
- GET `/api/v1/preventive-treatments/{id}`
- PATCH `/api/v1/preventive-treatments/{id}`
- POST `/api/v1/preventive-treatments/{id}/complete`
- POST `/api/v1/preventive-treatments/{id}/stop`
- POST `/api/v1/preventive-treatments/{id}/lost-to-follow-up`

### Existing supporting contracts
- GET `/api/v1/cases/{caseId}`
- POST `/api/v1/patients/resolve`
- GET `/api/v1/clinical-reference-data` only when independently authorized

Do not modify backend source, backend tests, V1–V17 or workflow semantics.

## 3. Routes

Add:

Referral:
- `/referrals`
- `/referrals/[referralId]`
- `/cases/[caseId]/referrals/new`

Contacts/investigations:
- `/cases/[caseId]/contacts`
- `/contacts/[contactId]`
- `/contact-investigations`
- `/contact-investigations/[investigationId]`

TPT:
- `/preventive-treatments/[tptId]`

No route should contain patient name, NIK/BPJS, contact name/phone/address, referral notes/reasons or TPT clinical narrative.

UUID route identifiers are allowed.

## 4. Actor and permission model

All staff routes require explicit `TB_OFFICER` plus the relevant permission.

Referral:
- read queue/detail/reference: `REFERRAL_READ`
- preparation/send/transition actions: `REFERRAL_WRITE`

Contact investigation:
- list/detail/reference: `CONTACT_READ`
- create/edit/link/investigation transitions: `CONTACT_WRITE`

TPT:
- TPT detail/history: `TPT_READ`
- start/edit/closure: `TPT_WRITE`

Exact patient-link helper:
- UI patient resolution requires `PATIENT_IDENTITY_RESOLVE`
- linking itself also requires `CONTACT_WRITE`

Optional contact sex labels:
- `/clinical-reference-data` may be used only when `PATIENT_READ` is independently present
- lack of PATIENT_READ must not block the overall contact workflow; sex is optional

Never infer a permission from TB_OFFICER role.

Frontend checks are UX only; backend facility/state/source-authority checks remain authoritative.

## 5. Navigation

Add two main entries:

`Rujukan`
- TB_OFFICER + REFERRAL_READ
- route `/referrals`

`Investigasi kontak`
- TB_OFFICER + CONTACT_READ
- route `/contact-investigations`

TPT remains contextual through contacts/investigations rather than inventing a global TPT queue that the backend does not provide.

F2A case detail gains:
- `Buat rujukan` when REFERRAL_WRITE
- `Kontak` when CONTACT_READ
- optional `Tambah kontak` shortcut only when CONTACT_READ + CONTACT_WRITE

Do not create dead links.

## 6. Feature organization

Create focused modules:

```text
frontend/features/continuity/
  api.ts
  schemas.ts
  types.ts
  permissions.ts
  time.ts
  use-command.ts
  facilities.ts
  referrals/
  contacts/
  tpt/
```

Reuse:
- native `apiRequest`
- SessionProvider
- TanStack Query
- RHF + Zod
- shadcn
- F1/F2A safe problem handling
- existing exact patient-resolution patterns where useful

Do not create a generic cross-domain CRUD framework.

## 7. Strict runtime contracts

Define strict Zod schemas for:
- referral preparation
- continuity facility page
- referral references
- contact references
- TPT references
- referral page/detail
- contact page/detail
- investigation page/detail
- TPT page/detail
- identity confirmation used during contact linking

No `any`.

Malformed backend response -> safe `INVALID_RESPONSE`.

## 8. Query/session isolation

All protected continuity query keys begin:

```text
["continuity", userId, ...]
```

Examples:
- referrals incoming/outgoing
- referral detail/preparation/references
- facilities
- case contacts/contact detail
- investigation queues/detail/references
- contact TPT history/TPT detail/references

Every query consumes TanStack AbortSignal.

Every command snapshots current `/me`, aborts on unmount/context change, and ignores late prior-account:
- success
- error
- invalidation
- navigation

Add regressions for late old-account referral/contact/TPT GET and command completion.

No continuity clinical data persistence.

## 9. Referral queue

Route `/referrals`.

Require TB_OFFICER + REFERRAL_READ.

Two tabs:
- Masuk -> `/referrals/incoming`
- Keluar -> `/referrals/outgoing`

Memory-only page state.

Display backend safe projection:
- patient display name
- case category/status
- referral type/status
- source/destination facility
- sent/received/reported/cancelled timestamps
- optional treatment summary
- do not show notes/reasons in queue unless needed; detail page is preferred

Use live labels from `/referral-reference-data`.

Provide loading/error/empty/pagination states.

No patient identity enrichment query.

## 10. Referral creation

Route `/cases/[caseId]/referrals/new`.

Require TB_OFFICER + REFERRAL_WRITE.

Fetch `/cases/{id}/referral-preparation`.

The preparation response is advisory only. The POST remains final authority.

### Pre-treatment referral

Offer only when current preparation structurally supports it:
- caseStatus = REFERRED
- preTreatmentDestination != null
- openTreatment == null
- inFlightReferral = false

Destination is fixed to `preTreatmentDestination.id`.

Do not allow the user to replace it with another facility.

Payload:
- referralType = `PRE_TREATMENT_REFERRAL`
- destinationFacilityId = recorded destination
- treatmentId omitted
- notes optional

This is workflow-state handling, not diagnostic inference.

### Treatment transfer

Offer only when:
- caseStatus = ACTIVE
- openTreatment.status = ACTIVE
- inFlightReferral = false

Use exact `openTreatment.id`.

Destination:
- search `/continuity-facilities`
- minimum 2 typed chars for remote search
- debounce
- exclude source facility in UI
- backend final validator

Payload:
- referralType = `TREATMENT_TRANSFER`
- destinationFacilityId
- treatmentId = exact openTreatment.id
- notes optional

Do not offer PLANNED/PAUSED episodes as transfer treatment.

If preparation cannot support either flow, show a state explanation and no send button.

Send has no If-Match.

On success navigate `/referrals/{id}` and invalidate referral queues/preparation/case/treatment context.

## 11. Referral detail and transitions

Route `/referrals/[referralId]`.

Require REFERRAL_READ.

Fetch actual detail + response ETag.

Display handoff-safe data returned by backend.

Action UX requires REFERRAL_WRITE plus current assigned side derived from `/me.activeFacilities` and referral source/destination.

Allowed UI transitions mirror backend exactly:

Source:
- SENT -> cancel

Destination:
- SENT -> receive
- RECEIVED -> return
- RECEIVED -> report

### Receive
Input:
- receivedAt optional
- notes optional

Blank timestamp means backend server-now behavior; label this clearly.

### Return
- returnReason required

### Cancel
- cancelReason required
- explicit confirmation

### Report
- patientReportedAt optional
- explicit confirmation because clinical ownership moves on success

All transitions use actual referral-detail ETag.

No automatic retry after 409/428.

After transition refetch detail and both queues. On REPORTED also invalidate known case/treatment queries because facility ownership may move.

Do not locally move case/treatment cache to another facility; refetch authoritative state.

## 12. Case contacts

Route `/cases/[caseId]/contacts`.

Require CONTACT_READ.

GET paginated contacts.

Display:
- fullName
- birthDate
- sex code/label when available
- masked phone from backend
- relationship
- household flag
- linked-patient boolean
- latest investigation/TPT summary as returned

No attempt to recover linked patient identity.

### Create contact

Show only with CONTACT_WRITE.

Input:
- fullName required
- birthDate optional
- sexCode optional
- phone optional
- address optional
- relationshipToIndexCase optional
- householdContact optional
- workflowType from live `creatableWorkflowTypes`
- destinationFacilityId only for OUTGOING_REFERRAL
- notes optional

For OUTGOING_REFERRAL:
- explicit destination using `/continuity-facilities`
- exclude current case facility when known from F2A case detail
- backend final validator

For INTERNAL:
- never send destinationFacilityId

Sex:
- if PATIENT_READ and clinical references are available, offer active sex catalog
- otherwise omit sex selection rather than hard-code codes
- existing raw sexCode may still be displayed

Creation has no ETag.

On success navigate `/contacts/{id}` and invalidate case-contact list + investigation queues.

## 13. Contact detail/edit

Route `/contacts/[contactId]`.

Require CONTACT_READ.

Fetch detail + actual ETag.

Display snapshot demographics, linked boolean, investigation summaries and TPT summaries returned by backend.

### Edit

Show with CONTACT_WRITE.

PATCH dirty fields only:
- fullName
- birthDate
- sexCode
- phone
- address
- relationshipToIndexCase
- householdContact

Use actual contact ETag.

Explicit null clears optional field; omission leaves unchanged.

Do not send index case, linked patient, investigation/TPT summaries, ID or version.

After success refetch detail/list.

## 14. Exact patient linking

Offer only when:
- CONTACT_WRITE
- PATIENT_IDENTITY_RESOLVE
- contact is not already linked

Do not ask for/paste a patient UUID.

Flow:
1. collect exact identity:
   - citizenship
   - WNI NIK OR WNA otherIdentityNumber
   - at least fullName or birthDate confirmation
   - optional BPJS
2. POST `/patients/resolve`
3. show only backend masked confirmation
4. retain original exact confirmation only in transient form memory
5. on explicit confirm, POST `/contacts/{id}/link-patient` with:
   - patientId from resolver
   - original exact confirmation
   - current contact ETag

Never send masked resolver values as confirmation.

No fuzzy matching.

Clear sensitive identity state on:
- success
- cancel
- unmount
- account change

If PATIENT_IDENTITY_RESOLVE is absent, do not expose a manual UUID fallback.

## 15. Contact investigation queues

Route `/contact-investigations`.

Require CONTACT_READ.

Tabs:
- Masuk -> `/contact-investigations/incoming`
- Keluar -> `/contact-investigations/outgoing`

Memory-only pagination.

Display:
- contact safe display
- index case ID/category
- workflow type/status
- source/destination
- requested/received/investigated timestamps

Use live labels from `/contact-reference-data`.

Internal investigations are reached through contact detail; do not invent a backend global internal queue.

## 16. Investigation detail and transitions

Route `/contact-investigations/[investigationId]`.

Require CONTACT_READ.

Fetch detail + actual ETag.

Determine current side only from recorded facilities + `/me.activeFacilities`.

Action UX with CONTACT_WRITE:

Outgoing destination:
- SENT -> receive
- RECEIVED -> start
- RECEIVED/IN_PROGRESS -> return

Outgoing source:
- SENT -> cancel

Working facility:
- IN_PROGRESS -> complete
- INTERNAL uses source as working facility
- OUTGOING_REFERRAL uses destination

### Receive
- receivedAt optional; blank = backend now

### Start
- empty body
- explicit action

### Return
- returnReason required

### Cancel
- empty body
- explicit confirmation

### Complete
Inputs:
- investigatedAt optional; blank = backend now
- resultCode optional bounded free text
- activeTbExcluded required explicit boolean
- tptEligible required explicit boolean
- notes optional

UX must enforce:
- if tptEligible=true then activeTbExcluded=true

Do not derive either value from symptoms, lab results, resultCode or case history.

All transitions use actual investigation-detail ETag.

After success refetch investigation/contact/queues.

Completion creates no registration/case/TPT. Never imply that it does.

## 17. TPT history and start

Contact detail may fetch `/contacts/{contactId}/tpt` only with TPT_READ.

Show history:
- status
- start date
- facility
- link to detail

### Start TPT

On investigation detail show explicit start form only with TPT_WRITE and when backend-projected state is:
- status COMPLETED
- activeTbExcluded = true
- tptEligible = true

This is workflow gating only. Backend remains authoritative.

Use `/tpt-reference-data`.

Filter catalog regimens to:
- `caseCategoryCode === investigation.indexCase.categoryCode`

Do not auto-select a regimen.

Support two clinician-controlled modes:
- catalog regimenCode
- individualized regimenDescription

At least one must be supplied.

Especially for RO context, do not force TPT_RO_6LFX; clinician explicitly chooses catalog or individualized description.

Fields:
- regimenCode optional
- regimenDescription optional
- startDate required
- plannedEndDate optional
- durationValue optional positive integer
- durationUnit optional live reference
- weightKg optional
- drugSource optional free text
- notes optional

Do not infer:
- regimen
- composition
- dose
- duration
- planned end
- eligibility

No ETag for TPT start.

On success navigate `/preventive-treatments/{id}` and invalidate investigation/contact/TPT history.

## 18. TPT detail/edit

Route `/preventive-treatments/[tptId]`.

Require TPT_READ.

GET actual detail + response ETag.

Display:
- status
- regimen display
- dates/duration
- facility
- weight/drug source/notes/closure reason in staff context
- contact/index-case references as IDs only where useful for navigation

Do not make patient identity enrichment queries.

### Edit

Show with TPT_WRITE only when ACTIVE.

PATCH dirty fields only:
- plannedEndDate
- durationValue
- durationUnit
- weightKg
- drugSource
- regimenDescription
- notes

Use actual TPT ETag.

Do not send:
- regimenCode
- startDate
- status
- actualEndDate
- contact/indexCase/facility

If there is no catalog regimen, prevent clearing regimenDescription to empty/null.

No clinical recommendation.

## 19. TPT closure

With TPT_WRITE and ACTIVE:

### Complete
POST `/complete`
- actualEndDate optional; blank = backend today
- closureReason optional

### Stop
POST `/stop`
- actualEndDate optional
- closureReason required

### Lost to follow-up
POST `/lost-to-follow-up`
- actualEndDate optional
- closureReason optional

All use actual current TPT ETag.

Require explicit confirmation for closure.

Do not map closure to a national outcome code in frontend.

After success refetch TPT detail/history/contact.

## 20. ETag contract

Use actual response ETag for all existing-resource continuity writes:
- referral transition
- contact PATCH
- contact link-patient
- investigation transition
- TPT PATCH
- TPT closure

Do not synthesize ETags from version fields even though summaries contain numeric versions.

Create/send/start commands with no backend If-Match:
- referral send
- contact create
- TPT start

No automatic write replay.

## 21. Time handling

OffsetDateTime fields:
- referral received/report
- investigation received/investigated

Use the existing tested local datetime -> ISO serializer pattern from F2B/F2C.

Show browser timezone near input.

Reject ambiguous/nonexistent DST local times.

Blank values are allowed only where backend explicitly defaults to server now; explain this to the user.

LocalDate fields:
- contact birthDate
- TPT start/planned/actual end

Use YYYY-MM-DD.

## 22. Conflict/error behavior

No mutation auto-retry.

On stale/precondition/workflow conflict:
- preserve form draft
- refetch authoritative detail
- require explicit user review/resubmission

SOURCE_AUTHORITY_CONFLICT:
- show external-source read-only warning
- lock repeated relevant save action for mounted form
- reads/navigation remain available

State errors such as:
- referral state/in-flight/destination/treatment mismatch
- contact investigation state
- contact already linked
- TPT state/open-TPT conflict
must produce safe Indonesian workflow feedback and refetch relevant resources.

Never display arbitrary backend problem detail.

## 23. Privacy

No continuity clinical data in:
- localStorage
- sessionStorage
- indexedDB
- console logs
- URL query/history state
- document metadata
- global chrome

Do not put:
- patient/contact names
- phone/address
- exact identity confirmation
- referral notes/reasons
- investigation notes/result
- TPT regimenDescription/notes/closure reason

into URLs or logs.

Queue filters/pagination remain memory-only.

No raw API payload logging.

## 24. Accessibility/responsive UX

Maintain existing standards.

Queues must work on mobile using responsive tables/cards.

Transition buttons must state consequences:
- referral report moves clinical ownership
- referral cancel/return ends current handoff
- investigation completion records explicit exclusion/eligibility
- TPT closure closes the episode

Use semantic headings/fieldsets, accessible confirmation dialogs, focus restoration and aria-live feedback.

No state represented by color alone.

## 25. Tests

Continue Vitest + RTL + user-event.

At minimum cover:

Authorization/navigation:
- referral nav requires TB_OFFICER + REFERRAL_READ
- contact nav requires TB_OFFICER + CONTACT_READ
- artificial permission on wrong role does not expose module
- actions independently gated

Session isolation:
- all continuity query keys include user ID
- every query passes AbortSignal
- late prior-account GET ignored
- late referral/contact/TPT command ignored
- no persistence

Referral:
- live reference labels
- preparation drives only valid workflow
- pre-treatment destination is fixed from backend preparation
- transfer uses exact ACTIVE treatment ID
- PLANNED/PAUSED not offered as transfer
- inFlight disables send
- continuity facility search excludes source
- send payload exact
- transition side/state gates
- actual detail ETag on all transitions
- report success invalidates case/treatment caches
- no local ownership rewrite

Contacts:
- create uses live creatable workflows
- INTERNAL omits destination
- outgoing requires explicit destination
- masked phone remains masked
- dirty-only contact PATCH + actual ETag
- optional sex behavior without PATIENT_READ
- no patient identity enrichment

Exact link:
- requires PATIENT_IDENTITY_RESOLVE
- resolver masked display
- original exact confirmation reused
- contact ETag sent
- no manual UUID/fuzzy search
- sensitive state cleared

Investigations:
- incoming/outgoing queues
- internal reachable from contact detail
- side/state transition gates
- actual ETag
- completion requires explicit booleans
- eligibility consistency rule
- no automated TPT/case creation

TPT:
- live PREVENTIVE regimen references filtered by index-case category
- no auto-selected regimen
- individualized description supported
- no dose/duration inference
- start only on completed/excluded/eligible projected state
- dirty-only active PATCH + actual ETag
- cannot clear sole individualized regimen description
- closure actions and stop reason
- no outcome-code inference
- no replay on conflict

Privacy:
- no sensitive identity/contact/referral/TPT text persistence/log/history/metadata
- no raw backend prose

## 26. Build gates

From `frontend/`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Backend source/tests/migrations must remain unchanged.

Real-backend smoke testing is recommended with already provisioned source/destination TB_OFFICER accounts. Do not weaken authorization or create fake production credentials.

## 27. Documentation

Add:
- `docs/FRONTEND_F2D_CONTINUITY.md`
- `docs/FRONTEND_F2D_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.4_F2D_Continuity.md`

Update:
- `frontend/README.md`
- root README frontend section

## 28. Deferred

F2E:
- staff monitoring, alerts and notifications

F3:
- patient/supporter portal

F4:
- administration + integration-boundary UI

Do not start those in F2D.
