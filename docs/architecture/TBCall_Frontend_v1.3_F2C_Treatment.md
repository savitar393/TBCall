# TBCall Frontend v1.3 — F2C Staff Treatment Workflow

Approved backend base: `6afcfe697ceebfe2ebfd2edbd6030815e005a2bd`

Status: approved staff-treatment frontend slice.

F2C implements the existing TB Officer treatment workflow only. It does not add clinical inference, treatment recommendations, patient/supporter portal behavior, referral/contact/TPT, monitoring/alerts, administration, or SITB networking.

## 1. Scope

Deliver:

```text
Case detail
    ↓
Treatment episodes
    ├─ Start treatment
    └─ Open treatment
            ↓
      Treatment detail
       ├─ Edit metadata
       ├─ Dose evidence
       ├─ Follow-up
       ├─ Adverse events
       └─ Final outcome
```

## 2. Existing backend contracts

Use only:

Reference:
- GET `/api/v1/treatment-reference-data`

Treatment:
- POST `/api/v1/cases/{caseId}/treatments`
- GET `/api/v1/cases/{caseId}/treatments`
- GET `/api/v1/treatments/{treatmentId}`
- PATCH `/api/v1/treatments/{treatmentId}`

Dose evidence:
- POST `/api/v1/treatments/{treatmentId}/dose-events`
- GET `/api/v1/treatments/{treatmentId}/dose-events`

Follow-up:
- POST `/api/v1/treatments/{treatmentId}/follow-ups`
- POST `/api/v1/follow-ups/{followUpId}/complete`

Adverse events:
- POST `/api/v1/treatments/{treatmentId}/adverse-events`
- PATCH `/api/v1/adverse-events/{eventId}`

Outcome:
- POST `/api/v1/treatments/{treatmentId}/outcome`

Context:
- GET `/api/v1/cases/{caseId}`

Do not modify Java backend, backend tests, V1–V17, or existing treatment semantics in F2C.

## 3. Routes

Add:

- `/cases/[caseId]/treatments`
- `/treatments/[treatmentId]`

Do not add a fake global treatment worklist because the backend has no global treatment-list contract.

F2A case detail gains a contextual `Pengobatan` link when the user is allowed to read treatments.

All routes use SessionBoundary.

## 4. Actor and permissions

The staff treatment backend explicitly requires TB_OFFICER for staff routes.

Frontend route/read contract:
- TB_OFFICER + TREATMENT_READ.

Actions:
- start/edit treatment: TREATMENT_WRITE
- read dose evidence: ADHERENCE_READ
- record dose evidence: ADHERENCE_RECORD
- read follow-up: FOLLOW_UP_READ
- manage follow-up: FOLLOW_UP_WRITE
- read adverse events: ADVERSE_EVENT_READ
- manage adverse events: ADVERSE_EVENT_WRITE
- read outcome: OUTCOME_READ
- record outcome: OUTCOME_WRITE

Never infer permissions from TB_OFFICER role.

Frontend checks are UX only; backend remains authoritative.

## 5. Feature organization

Create focused module:

```text
frontend/features/treatment/
  api.ts
  schemas.ts
  types.ts
  queries.ts
  permissions.ts
  etag.ts
  time.ts
  use-command.ts
  forms/
  components/
```

Reuse F1/F2A patterns:
- native apiRequest
- SessionProvider
- TanStack Query
- RHF + Zod
- shadcn
- safe problem feedback

Do not create a generic cross-domain CRUD framework.

## 6. Strict response validation

Create strict Zod schemas for:
- treatment reference data
- TreatmentDetail
- case treatment list
- DosePage / DoseView
- FollowUpView
- AdverseView
- OutcomeView

Respect permission-dependent projection fields:
- adherenceSummary may be null
- recentDoseEvents may be empty
- followUps may be empty
- adverseEvents may be empty
- outcome may be null
- followUpLabRequests may be empty

Malformed responses use safe INVALID_RESPONSE behavior.

No `any` in treatment DTOs.

## 7. Query/session isolation

All protected treatment query keys begin:

```text
["treatment", userId, ...]
```

Examples:
- `["treatment", userId, "references"]`
- `["treatment", userId, "case", caseId, "episodes"]`
- `["treatment", userId, "detail", treatmentId]`
- `["treatment", userId, "doses", treatmentId, page, size]`

Every queryFn receives TanStack AbortSignal.

Commands snapshot the current actor and ignore/abort late previous-account completions, errors, invalidations and navigation.

Sensitive treatment command inputs must not enter persistent storage or generic mutation cache.

Add regressions for:
- old-account treatment GET resolving after account switch;
- old-account treatment command resolving after account switch.

## 8. Treatment reference data

Consume `/treatment-reference-data`.

Memory-only cache; reasonable staleTime such as 5 minutes.

Use:
- regimens
- drugs
- outcomeCodes
- treatmentStatuses
- staffDoseStatuses
- administrationModes
- followUpStatuses

Never hard-code mutable regimen/drug/outcome catalogs.

Do not invent catalogs for free-text treatment fields.

## 9. Case treatment route

Route:

`/cases/[caseId]/treatments`

Require TB_OFFICER + TREATMENT_READ.

Fetch:
- case detail
- case treatments
- treatment references

Display:
- patient/context heading
- case status/category
- current facility
- all visible treatment episodes, newest first as backend returns
- regimen
- treatment status
- start/planned/actual end dates
- link to treatment detail

Do not add patient identity values to URL, metadata or global chrome.

### Start treatment action

Show only with TREATMENT_WRITE and case status ACTIVE.

UI should suppress the start form if the returned treatment list already contains an open episode status:
- PLANNED
- ACTIVE
- PAUSED

Backend remains final concurrency/state guard.

Filter regimen choices to:
- active reference rows where `caseCategoryCode === case.caseCategoryCode`.

Do not offer a regimen from another case category.

If no matching regimen exists, show a safe catalog-unavailable state; do not invent one.

## 10. Start treatment form

Input:

Treatment-level:
- regimenCode
- startDate
- plannedEndDate optional
- initialWeightKg optional
- oatForm optional free text
- drugSource optional free text
- intensiveStartDate optional
- intensiveEndDate optional
- continuationStartDate optional
- continuationEndDate optional
- regimenDescription optional
- notes optional

Drug lines: 1..20, each:
- drugCode
- treatmentPhase optional free text
- doseValue optional decimal
- doseUnit optional, required client-side when doseValue present
- frequencyPerWeek optional 1..7
- startDate required
- endDate optional
- batchNumber optional
- drugSource optional
- notes optional

Drug code choices come from live active drug catalog.

Do not auto-populate drug lines from regimen selection.

Do not calculate:
- regimen composition
- dose
- duration
- phase
- frequency
- eligibility

Show an explicit informational note:

`TBCall tidak menyusun paduan atau dosis secara otomatis. Isi obat sesuai keputusan klinis yang telah ditetapkan.`

This is product guidance, not a medical recommendation.

Client UX may validate only structural rules already explicit in backend:
- 1..20 rows
- no duplicate normalized drugCode/treatmentPhase/startDate tuple
- drug start >= treatment start
- drug end >= drug start
- doseUnit required if doseValue entered
- frequency 1..7
- planned/phase end dates not before starts
- continuation start not before intensive end when both present
- treatment start not in future

Backend remains final authority.

No ETag required for start.

On success navigate to `/treatments/{id}` and invalidate case treatment list and case detail.

## 11. Treatment detail

Route:

`/treatments/[treatmentId]`

Require TB_OFFICER + TREATMENT_READ.

GET detail and actual server ETag.

Display:
- patient display context
- case link if CASE_READ
- facility
- regimen/status/dates
- metadata
- explicit drug snapshots
- adherence evidence summary if ADHERENCE_READ
- follow-up list if FOLLOW_UP_READ
- adverse events if ADVERSE_EVENT_READ
- outcome if OUTCOME_READ
- follow-up laboratory request links if LAB_REQUEST_READ

Do not enrich with extra patient identity requests.

Historical drug snapshot names are authoritative display values even if current drug catalog changes.

## 12. Treatment metadata edit

Show with TREATMENT_WRITE only when treatment status ACTIVE.

Use actual treatment-detail response ETag.

PATCH only dirty fields:
- plannedEndDate
- initialWeightKg
- oatForm
- drugSource
- intensiveStartDate
- intensiveEndDate
- continuationStartDate
- continuationEndDate
- regimenDescription
- notes

Explicit null clears optional field. Omission leaves unchanged.

Never send:
- regimenCode
- startDate
- status
- actualEndDate
- case/facility IDs
- drugs

No automatic retry after conflicts.

## 13. Treatment child ETag contract

Follow-up and adverse-event child resources do not have separate GET endpoints. TreatmentDetail intentionally publishes their numeric versions.

Define a treatment-only helper:

```ts
treatmentChildEtagFromVersion(version: number): string
```

Use only for:
- follow-up completion -> followUp.version
- adverse-event update -> adverseEvent.version

Do not use it for treatment PATCH/outcome/schedule-follow-up, where the actual treatment response ETag is available.

Do not generalize it to F2A resources.

## 14. Dose evidence

If ADHERENCE_READ:
- show evidence summary from treatment detail
- query paginated `/treatments/{id}/dose-events`
- page default 0, size 20, max 100
- render scheduledDate, recordedAt, status, administrationMode, source
- notes are staff-only output already returned by backend; display only in treatment staff view

If ADHERENCE_RECORD and treatment ACTIVE:
- show record form

Fields:
- scheduledDate
- status from `staffDoseStatuses`
- administrationMode optional from reference
- notes optional

UX structural rules:
- scheduledDate >= treatment.startDate
- scheduledDate <= today

Do not infer one canonical daily adherence status from multiple evidence records.

Do not merge contradictory records.

Duplicate actor/day backend conflict must show safe feedback and refetch dose list; do not overwrite existing evidence.

No ETag is required for dose recording.

## 15. Follow-up schedule

If FOLLOW_UP_READ, render `treatment.followUps`.

If FOLLOW_UP_WRITE and treatment ACTIVE, allow scheduling.

Fields:
- followUpType required free text
- scheduledAt required offset timestamp
- facilityId optional
- notes optional

Facility selector:
- choices from `/me.activeFacilities`
- allow blank to mean backend default treatment facility
- do not use global facility directory because backend requires selected facility inside actor scope

Schedule uses the actual current treatment ETag.

Important: scheduling advances treatment version.

After success:
- refetch treatment detail immediately;
- discard old treatment ETag;
- close/reset successful form.

No automatic retry.

## 16. Follow-up completion

Eligible UI:
- status SCHEDULED
- FOLLOW_UP_WRITE
- follow-up facility is present in current user's activeFacilities
- treatment remains ACTIVE

Fields:
- completedAt required
- weightKg optional
- symptomSummary optional
- adherenceAssessment optional free text
- notes optional

Use `treatmentChildEtagFromVersion(followUp.version)`.

Structural UX:
- completedAt >= scheduledAt
- completedAt <= now
- weight positive when supplied

Do not interpret symptom summary or adherence assessment.

After success refetch treatment detail.

## 17. Adverse-event create/update

If ADVERSE_EVENT_READ, render treatment adverse-event list.

### Create

Show with ADVERSE_EVENT_WRITE and treatment ACTIVE.

Fields:
- eventType required free text
- severity optional free text
- serious explicit boolean, default false in form
- startedAt optional
- endedAt optional
- description optional
- actionTaken optional
- outcome optional

No ETag required for create.

Do not infer causality, seriousness, regimen changes or treatment interruption.

### Update

Existing adverse events may be edited with ADVERSE_EVENT_WRITE even after treatment closure, matching backend behavior.

Use child ETag from `adverseEvent.version`.

PATCH dirty fields only.

`eventType`, parent and reportedAt are immutable and never sent.

If serious is sent, it must be boolean, never null.

Structural UX:
- startedAt/endedAt cannot be future
- endedAt cannot precede startedAt

After success refetch detail.

## 18. Final outcome

Show outcome read section only with OUTCOME_READ.

If an outcome already exists:
- render it;
- do not show another outcome form.

If OUTCOME_WRITE, treatment ACTIVE, case ACTIVE and no outcome:
- allow explicit outcome recording.

Fields:
- outcomeCode from live active `outcomeCodes`
- outcomeDate
- notes optional

Use actual current treatment ETag.

UX:
- outcomeDate >= treatment.startDate
- outcomeDate <= today

Do not infer outcome from:
- dose evidence
- lab results
- follow-ups
- adverse events
- regimen
- duration

Require explicit confirmation before submission:

`Pencatatan hasil akhir akan menutup episode pengobatan dan kasus ini.`

After success:
- refetch treatment detail
- invalidate case detail and treatment list
- do not attempt another write using the old ETag

## 19. Follow-up laboratory links

TreatmentDetail may contain `followUpLabRequests` when LAB_REQUEST_READ is granted.

Render simple links:
- request ID represented only as a neutral sequence label, not raw UUID text where avoidable
- request status
- link to `/laboratory/requests/{id}`

Do not interpret laboratory status into treatment outcome.

## 20. Date/time handling

LocalDate fields use `YYYY-MM-DD`.

OffsetDateTime fields:
- use a treatment-local tested `datetime-local` serializer similar in rigor to F2B
- display browser timezone near editable timestamp controls
- serialize explicit user-entered local time to ISO offset/instant
- reject nonexistent/ambiguous DST times rather than silently choosing

Do not claim browser timezone equals facility timezone.

For unchanged adverse-event timestamps during dirty-only update, preserve the original backend timestamp string exactly so precision/offset is not lost.

## 21. Conflict/error behavior

No mutation auto-retry.

Treatment stale/precondition/state conflict:
- preserve form values
- refetch treatment detail/list as relevant
- require explicit user review before resubmit

SOURCE_AUTHORITY_CONFLICT:
- show externally controlled/read-only warning
- lock repeated relevant save action for mounted editor
- reads/navigation remain available

DOSE_EVENT_ALREADY_RECORDED:
- show safe duplicate-evidence message
- refetch dose page
- do not replace prior row

Other treatment state 409:
- safe Indonesian state-change feedback
- refetch authoritative resource
- never render arbitrary backend prose

## 22. Privacy

No treatment clinical data in:
- localStorage/sessionStorage/indexedDB
- console logs
- URL query state
- document metadata
- global chrome

Allowed route identifiers:
- case UUID
- treatment UUID

Do not place:
- patient name
- regimen notes
- drug notes
- adherence notes
- symptom summaries
- adverse-event descriptions
- outcome notes

in URLs/history.

No raw backend payload/problem prose logging.

## 23. Accessibility/responsive UX

Maintain F1/F2A/F2B standards.

Drug-line editor:
- numbered semantic groups
- add/remove buttons with explicit accessible names
- never remove last required row without explaining at least one drug is required

Treatment detail:
- sections with semantic headings
- no color-only state
- long clinical text wraps safely
- mobile-friendly dose/follow-up/adverse cards or accessible responsive table

Outcome closure confirmation must clearly describe consequence.

## 24. Tests

Continue Vitest + RTL + user-event.

At minimum:

Authorization:
- TB_OFFICER + TREATMENT_READ can enter treatment routes
- wrong roles with artificial permission do not
- each action independently permission-gated

Session:
- treatment keys include user ID
- all treatment queries pass AbortSignal
- late old-user GET ignored
- late old-user command ignored
- no treatment persistence

References/start:
- strict reference schema
- regimen filtered by case category
- null-category cannot appear under strict schema/contract
- PREVENTIVE regimens unavailable
- 1..20 explicit drug rows
- no regimen auto-composition
- live drug codes only
- structural date/dose validation
- payload excludes derived status/facility fields

Treatment detail/edit:
- actual response ETag used for treatment PATCH
- dirty-only metadata PATCH
- explicit null clears
- regimen/start/status/drugs never sent in metadata patch
- historical drug snapshot displayed

Dose:
- paginated read
- live staff statuses/modes
- no inferred aggregate day state
- duplicate actor/day conflict no replay

Follow-up:
- schedule uses actual treatment ETag
- successful schedule refetches treatment because version advances
- facility choices restricted to active assigned facilities
- completion uses quoted followUp.version
- timestamp/weight structural validation
- no interpretation of symptom/adherence text

Adverse:
- create requires no ETag
- update uses quoted adverse.version
- dirty-only update
- immutable eventType not sent
- unchanged timestamp precision preserved
- post-closure edit remains available when permission allows
- no causality/regimen inference

Outcome:
- live outcome catalog
- explicit confirmation
- actual treatment ETag
- no outcome inference
- success invalidates case/treatment
- second outcome action not offered

Privacy:
- no treatment payload persistence/log/history/metadata
- no raw backend prose

## 25. Build gates

From `frontend/`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Backend source/tests/migrations must remain unchanged.

A real-backend smoke test is recommended with already provisioned TB_OFFICER accounts, but do not weaken auth or invent production credentials.

## 26. Documentation

Add:
- `docs/FRONTEND_F2C_TREATMENT.md`
- `docs/FRONTEND_F2C_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.3_F2C_Treatment.md`

Update:
- `frontend/README.md`
- root README frontend section

## 27. Deferred

F2D:
- referral/transfer + contacts/TPT

F2E:
- staff monitoring/alerts/notifications

F3:
- patient/supporter portal treatment/adherence/monitoring

F4:
- administration/integration boundary

Do not start these in F2C.
