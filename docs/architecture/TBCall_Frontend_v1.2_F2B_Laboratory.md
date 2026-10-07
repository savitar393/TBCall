# TBCall Frontend v1.2 — F2B Laboratory Workflow

Approved backend base: `e13e3e3c934298d9a76827b40f2d934d21eb6bfe`
Frontend foundation: F1 + approved F2A already present in the base.

Status: approved frontend laboratory slice.

F2B implements the existing laboratory workflow for TB Officers and Laboratory Staff. It adds no new backend contract, database migration, laboratory interpretation rule, or SITB behavior.

## 1. Scope

Deliver:

```text
Shared laboratory work queue
          ↓
   Request detail
      ↙         ↘
TB Officer      LAB_STAFF
source actions  testing actions
      ↓              ↓
create request       receive specimen
record specimen      record result
cancel request       correct result
```

Request creation is contextual from an authorized registration or active case.

Explicitly out of F2B:
- treatment/adherence/outcome UI;
- referral-transfer/contact/TPT UI;
- monitoring/alerts UI;
- patient/supporter portals;
- administration;
- SITB networking.

## 2. Existing backend contracts

Use only:

Reference:
- GET `/api/v1/laboratory-reference-data`

Requests:
- GET `/api/v1/lab-requests`
- GET `/api/v1/lab-requests/{requestId}`
- POST `/api/v1/lab-requests`
- POST `/api/v1/lab-requests/{requestId}/specimens`
- POST `/api/v1/lab-requests/{requestId}/cancel`

Testing:
- POST `/api/v1/lab-specimens/{specimenId}/receive`
- POST `/api/v1/lab-request-tests/{testId}/results`
- POST `/api/v1/lab-results/{resultId}/corrections`

Context/directory already available:
- GET `/api/v1/registrations/{registrationId}`
- GET `/api/v1/cases/{caseId}`
- GET `/api/v1/clinical-facilities`

Do not modify the Java backend or V1–V17 in F2B.

## 3. Roles and permissions

Laboratory read actor contract is explicit:

- TB_OFFICER + LAB_REQUEST_READ, OR
- LAB_STAFF + LAB_REQUEST_READ.

Do not treat LAB_REQUEST_READ alone as sufficient.

Actions:

TB Officer source side:
- create request: TB_OFFICER + LAB_REQUEST_WRITE;
- record specimen: TB_OFFICER + LAB_REQUEST_WRITE;
- cancel request: TB_OFFICER + LAB_REQUEST_WRITE.

Laboratory side:
- receive specimen: LAB_STAFF + LAB_RESULT_WRITE;
- record first result: LAB_STAFF + LAB_RESULT_WRITE;
- correct result: LAB_STAFF + LAB_RESULT_WRITE.

Result value visibility:
- LAB_RESULT_READ controls result-content rendering;
- backend projection remains authoritative.

Frontend role/permission checks are UX only. The backend remains final authorization and facility-scope authority.

Users with both TB_OFFICER and LAB_STAFF may see both sets of actions when independently permitted.

## 4. Routes

Add:

- `/laboratory`
- `/laboratory/requests/[requestId]`
- `/laboratory/requests/new/registration/[registrationId]`
- `/laboratory/requests/new/case/[caseId]`

All routes use SessionBoundary.

Request UUIDs and owner UUIDs are acceptable path identifiers.

Never put patient name, NIK, BPJS, result content, specimen notes, or other clinical prose in browser URL query/history.

## 5. Navigation

Add `Laboratorium` when the user satisfies the explicit laboratory read actor contract.

Do not derive permission from role.

Use a laboratory-appropriate icon such as Lucide `FlaskConical` or `TestTube2`.

Existing F2A navigation remains unchanged.

## 6. Feature organization

Create a focused module:

```text
frontend/features/laboratory/
  api.ts
  schemas.ts
  types.ts
  queries.ts
  permissions.ts
  time.ts
  etag.ts
  use-command.ts
  forms/
  components/
```

Reuse:
- F1 native `apiRequest`;
- SessionProvider;
- TanStack Query;
- React Hook Form + Zod;
- shadcn primitives;
- safe ApiProblem feedback;
- existing F2A clinical owner queries/facility directory where appropriate.

Do not create a generic cross-domain CRUD framework.

Avoid circular feature dependencies. F2A registration/case pages may add plain contextual laboratory links using their existing TB_OFFICER permission helper rather than importing laboratory internals.

## 7. Strict runtime contracts

Create strict Zod response schemas for:

- laboratory reference data;
- request page;
- request summary;
- request detail;
- owner;
- minimum patient display;
- test summary/detail;
- specimen;
- latest result;
- completeness;
- write responses.

Malformed responses use the existing safe INVALID_RESPONSE behavior.

Do not use `any` for laboratory DTOs.

## 8. Query/session isolation

Every protected laboratory query key starts with:

```text
["laboratory", userId, ...]
```

Examples:
- `["laboratory", userId, "requests", filters]`
- `["laboratory", userId, "request", requestId]`
- `["laboratory", userId, "references"]`

Every queryFn consumes TanStack's AbortSignal.

Commands must snapshot current `/me`, abort on unmount/context change, and ignore late prior-account success/error/navigation exactly as F2A does.

Do not place sensitive command inputs in TanStack mutation variables/cache.

Add permanent regressions for:
- old-account laboratory GET resolving after account switch;
- old-account result/specimen command resolving after account switch.

Neither may render, invalidate current-user state, or navigate.

## 9. Laboratory reference data

Fetch `/laboratory-reference-data`.

Memory cache only; reasonable staleTime such as 5 minutes.

Use:
- testTypes;
- requestReasons;
- requestStatuses;
- ownerTypes;
- referralTypes;
- testStatuses;
- resultStatuses.

Never hard-code active test type/reason catalogs.

Fixed workflow codes may be compared structurally in UI state logic, but labels should come from the reference endpoint when available.

Do not invent specimen-type or result-code options.

## 10. Shared work queue

Route: `/laboratory`.

Require laboratory read actor contract.

GET `/lab-requests`.

Display safe backend summary:
- patient full name;
- sex;
- birth date/unknown;
- owner type;
- requesting facility;
- testing facility;
- request reason;
- referral type;
- requestedAt;
- status;
- test type/status summary;
- completeness.

The backend intentionally does not expose NIK/BPJS here; do not attempt to obtain them for this screen.

Filters:
- status;
- ownerType;
- requestReasonCode;
- requestingFacilityId;
- testingFacilityId;
- page;
- size.

Facility filter choices come only from `/me.activeFacilities`.

Keep work-queue filters in memory rather than page URL state.

Validate:
- page >= 0;
- size 1..50;
- only live reference options.

Provide loading, safe error, empty and pagination states.

Each row/card links to `/laboratory/requests/{id}`.

## 11. Contextual request creation

F2A registration and case detail pages gain a contextual action link when allowed:

Registration:
- TB_OFFICER + LAB_REQUEST_WRITE;
- registration status OPEN or DIAGNOSED;
- route to `/laboratory/requests/new/registration/{registrationId}`.

Case:
- TB_OFFICER + LAB_REQUEST_WRITE;
- case status ACTIVE;
- route to `/laboratory/requests/new/case/{caseId}`.

Do not add a free-form "enter owner UUID" request creator.

### Owner context

New-request route fetches its owner using the existing clinical GET contract.

Registration request:
- owner is registration;
- backend contract requires reason `DIAGNOSIS`.

Case request:
- owner is case;
- backend contract requires reason `FOLLOW_UP`.

This owner→reason relation is an explicit TBCall workflow contract, not clinical inference.

Show the live reason label from laboratory reference data and do not offer invalid alternative reasons.

If required owner detail cannot be read, do not substitute write permission for missing read permission.

## 12. Testing facility selection

Requesting facility is derived by backend and shown from owner context:
- registration facility;
- case current facility.

Testing facility must be explicit.

Always permit an explicit choice of the owner/requesting facility itself when active in the owner projection.

If the user also has PATIENT_READ, allow remote search through existing `/clinical-facilities`:
- minimum 2 characters;
- debounce;
- active facilities only;
- show name and region codes;
- never infer write authorization from directory visibility.

Assigned `/me.activeFacilities` may be offered as convenience choices.

Do not silently preselect a testing facility merely because only one is visible.

The backend derives INTERNAL vs EXTERNAL.

## 13. Create laboratory request

Fields:
- contextual registrationId OR caseId, never both;
- testingFacilityId;
- derived requestReasonCode;
- 1..10 distinct testTypeCodes from live active catalog;
- sampleShippingMethod optional;
- courierName optional;
- notes optional.

Do not send:
- requestingFacilityId;
- referralType;
- status;
- requestedAt;
- patient data;
- test status.

After success:
- navigate to `/laboratory/requests/{id}`;
- invalidate current-user laboratory queue/detail prefix.

No precondition/ETag is required for request creation.

## 14. Request detail

Route: `/laboratory/requests/[requestId]`.

GET request detail + request ETag.

Display:
- patient minimum context;
- owner type;
- facilities;
- reason/referral type/status;
- request logistics;
- completeness;
- tests;
- specimens;
- latest result lineages when backend returns them.

Do not make a second patient query merely to enrich laboratory identity context.

Owner links:
- may be offered only when the current user is TB_OFFICER and independently has the corresponding clinical read permission;
- do not expose a nonfunctional owner link to LAB_STAFF.

If LAB_RESULT_READ is absent, do not attempt to recover result content from another endpoint.

## 15. Laboratory version/If-Match contract

Request-level commands:
- record specimen -> use request ETag returned by request-detail GET;
- cancel request -> use request ETag returned by request-detail GET.

Child commands have no separate child GET endpoints. The existing laboratory backend contract explicitly exposes nested numeric versions for this purpose.

Therefore F2B may define one laboratory-only helper:

```ts
labEtagFromVersion(version: number): string
```

which produces exactly the quoted numeric header expected by backend:

```text
"0"
"1"
...
```

Use only for:
- specimen receive -> specimen.version;
- first result -> test.version;
- correction -> result.version.

Do not generalize this helper to clinical F2A resources.

Never use request.version to invent a request ETag when the real request-detail response ETag is available.

No write auto-retry after 409/428.

## 16. TB Officer source actions

Show only for TB_OFFICER + LAB_REQUEST_WRITE and requesting-facility scope as returned/validated by backend.

### Record specimen

Available in UI only while request status is REQUESTED or SENT.

POST `/lab-requests/{id}/specimens` with request ETag.

Fields:
- specimenCode optional;
- specimenType required bounded free text;
- collectedAt optional;
- sentAt optional;
- notes optional.

Do not invent specimen-type catalog choices.

Client UX validates sentAt is not before collectedAt when both are present, but backend remains authority.

After success refetch request because request status/version may change.

### Cancel request

Offer only for statuses REQUESTED/SENT/RECEIVED.

Require explicit confirmation.

POST `/lab-requests/{id}/cancel` with request ETag.

Do not locally decide whether a final result exists beyond using currently visible backend state; backend remains final cancellation gate.

On success refetch detail/queue.

## 17. LAB_STAFF specimen receipt

Show only for LAB_STAFF + LAB_RESULT_WRITE.

Eligible UI specimen:
- not yet received;
- parent request currently REQUESTED/SENT/RECEIVED.

POST `/lab-specimens/{specimenId}/receive` with ETag from specimen.version.

Fields:
- receivedAt required;
- conditionOnReceipt optional;
- examinationPossible required boolean;
- rejectionReason required when examinationPossible=false;
- notes optional.

When examinationPossible=true, do not preserve a stale rejection reason in form state/payload.

After success refetch request.

Do not infer request cancellation or replacement.

## 18. LAB_STAFF first result entry

Show only for LAB_STAFF + LAB_RESULT_WRITE.

Each test card may offer `Catat hasil` when the request/test is not CANCELLED.

Input:
- specimenId optional;
- testedAt required;
- resultCode optional;
- resultValue optional;
- resultText optional;
- at least one of code/value/text nonblank.

Specimen choices:
- `Tanpa spesimen tercatat` for null lineage;
- only request specimens with `examinationPossible=true` for specimen lineage.

For each test, do not offer an exact lineage already represented in `latestResults` as a new FINAL; direct the user to correction for that lineage.

This is UI guidance only. Backend remains final `LAB_RESULT_ALREADY_EXISTS` guard.

POST `/lab-request-tests/{testId}/results` with ETag from test.version.

Do not parse or interpret result values into:
- diagnosis;
- resistance;
- case category;
- treatment;
- regimen;
- outcome.

After success refetch request because test/request versions and aggregate status may change.

## 19. Result correction

Only LAB_STAFF + LAB_RESULT_WRITE.

For each backend-projected latest FINAL/CORRECTED result, offer `Koreksi hasil`.

POST `/lab-results/{resultId}/corrections` with ETag from result.version.

Fields:
- testedAt required;
- resultCode optional;
- resultValue optional;
- resultText optional;
- at least one nonblank.

Correction keeps test/specimen lineage fixed. Frontend must not send specimenId/testId.

Do not invent correction eligibility from clinical state. Backend can reject a correction after registration conversion or final treatment outcome; surface safe state conflict and refetch.

Do not replace an existing result row in local cache. Refetch the request so append-only lineage remains backend authoritative.

## 20. Date/time handling

Backend laboratory timestamps are OffsetDateTime.

Use `datetime-local` inputs for usability, but serialize through one tested helper that interprets the value in the browser's local timezone and sends a valid ISO-8601 instant/offset accepted by the backend.

Display the browser timezone name near editable timestamp controls, e.g. from:

```ts
Intl.DateTimeFormat().resolvedOptions().timeZone
```

Do not claim it is the facility timezone.

Returned timestamps are formatted for the user's locale while preserving an accessible exact value/title where practical.

No default clinical timestamps should be silently fabricated except a user-visible explicit `Gunakan waktu sekarang` action if implemented.

## 21. Conflict/error behavior

Reuse F1/F2A safe problem handling.

For request/child command conflicts:
- no automatic replay;
- refetch request detail;
- preserve unsaved form values;
- require explicit user review before resubmit.

SOURCE_AUTHORITY_CONFLICT:
- show external-source read-only warning;
- lock repeated relevant source/lab save action for mounted form;
- reads remain available.

LAB_REQUEST_STATE_CONFLICT / LAB_SPECIMEN_STATE_CONFLICT / LAB_RESULT_STATE_CONFLICT / LAB_RESULT_NOT_LATEST / LAB_RESULT_ALREADY_EXISTS:
- show safe Indonesian workflow-state feedback;
- refetch request;
- never render arbitrary backend prose;
- never reinterpret values.

428 precondition:
- force request refresh;
- no synthetic retry.

## 22. Privacy

No laboratory clinical data persistence.

Do not put:
- patient name;
- result values/text;
- specimen notes;
- courier details;
- request notes

into:
- localStorage/sessionStorage/indexedDB;
- console logs;
- document metadata;
- browser page URL/query state;
- global navigation chrome.

Request/owner UUID route segments are allowed.

No raw API response logging.

## 23. Accessibility/responsive UX

Maintain F1/F2A standards.

Queue:
- responsive cards or accessible table/card alternative;
- status text, never color-only;
- filters labeled and keyboard usable.

Request detail:
- clear role/action sections;
- fieldsets/headings for source vs laboratory operations;
- confirmation for cancel;
- result/specimen lineage labels understandable without UUID knowledge.

Forms:
- focus first invalid field when practical;
- aria-live feedback;
- touch-friendly controls;
- no modal action that loses unsaved result/specimen input unexpectedly.

## 24. Tests

Continue Vitest + React Testing Library + user-event.

At minimum cover:

Authorization/navigation:
- TB_OFFICER + LAB_REQUEST_READ sees Laboratory;
- LAB_STAFF + LAB_REQUEST_READ sees Laboratory;
- permission alone on PATIENT/admin does not;
- source actions only officer+LAB_REQUEST_WRITE;
- testing actions only lab staff+LAB_RESULT_WRITE.

Session isolation:
- all lab query keys include user ID;
- every query passes AbortSignal;
- late old-user GET ignored;
- late old-user command ignored;
- no laboratory persistence.

Reference/queue:
- strict reference schema;
- live labels used;
- queue filters memory-only;
- assigned facility filters only;
- safe minimum patient projection;
- pagination/empty/error.

Request creation:
- contextual registration -> DIAGNOSIS only;
- contextual case -> FOLLOW_UP only;
- exactly one owner ID in payload;
- 1..10 distinct live test types;
- testing facility explicit;
- directory search only when permitted;
- no requesting facility/referral type/status fields sent;
- success navigation/refetch.

ETags:
- request specimen/cancel uses actual request response ETag;
- specimen receipt uses quoted specimen.version;
- first result uses quoted test.version;
- correction uses quoted result.version;
- lab child ETag helper is not used for F2A clinical resources;
- no automatic conflict replay.

Specimen:
- request-state gating;
- collection/shipping ordering;
- receive boolean/rejection requirement;
- stale rejection cleared when usable=true.

Results:
- at least one code/value/text;
- only usable specimen choices plus null lineage;
- existing lineage not offered as another first result;
- correction payload excludes specimenId/testId;
- result values never drive diagnosis/resistance/treatment inference;
- state conflict refetches without replay.

Privacy:
- no result/patient/note storage/log/history/metadata;
- no raw backend problem prose.

## 25. Build gates

From `frontend/`:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Backend files/tests/migrations must remain unchanged.

A real-backend smoke run is recommended when already provisioned TB_OFFICER and LAB_STAFF accounts/facilities are available. Do not weaken authentication or create fake production credentials merely for the smoke test.

## 26. Documentation

Add:
- `docs/FRONTEND_F2B_LABORATORY.md`
- `docs/FRONTEND_F2B_REPORT.md`
- `docs/architecture/TBCall_Frontend_v1.2_F2B_Laboratory.md`

Update:
- `frontend/README.md`
- root README frontend section.

## 27. Deferred

F2C:
- treatment/adherence/follow-up/adverse-event/outcome UI.

F2D:
- referral-transfer/contact/TPT UI.

F2E:
- staff monitoring/alerts/notifications.

F3:
- patient/supporter portals.

F4:
- administration/integration boundary UI.

Do not start these in F2B.
