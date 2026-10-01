# TBCall Application/API v1.3A — Phase 3A Laboratory Workflow

Base commit: `a2edfb1582d0a7e9d469713d0308038740a1bf24`

Status: approved laboratory vertical slice before treatment implementation.

Phase 3 is intentionally split:
- Phase 3A: laboratory request/specimen/result workflow.
- Phase 3B: treatment, adherence, follow-up, outcomes and adverse events.

This keeps laboratory authorization and state semantics independently reviewable before treatment services consume laboratory data.

No schema migration is required for Phase 3A. V1–V11 remain immutable.

## 1. Source alignment

The SITB manual is used for workflow shape:
- requests are created by the sending TB/facility side;
- laboratory staff confirm specimen receipt/condition and whether examination is possible;
- requested examinations may be multiple within one request;
- a request can have incomplete results when only some requested examinations have results;
- if a specimen cannot be examined, the sending facility decides whether to cancel and/or create a new request;
- laboratory results are primarily entered by laboratory staff, especially for external referrals.

Current national clinical guidance governs terminology but Phase 3A does not interpret results into diagnoses, resistance classifications or treatment decisions.

TBCall canonical test/result identifiers are not official SITB API/database codes.

## 2. Scope

Implement:
- laboratory request creation;
- request list/detail;
- specimen recording by requesting TB officer;
- specimen receipt/condition confirmation by laboratory staff;
- request cancellation;
- final result entry by laboratory staff;
- append-only correction of a final result;
- automatic request/test status aggregation;
- explicit DTO projections for TB officer vs laboratory staff.

Do not implement:
- automatic diagnosis from results;
- automatic drug-resistance classification;
- treatment initiation;
- result-specific medical decision support;
- carried/external historical result ingestion by TB officers;
- laboratory billing/claims;
- notification engine;
- SITB network integration.

## 3. Authorization

### TB officer

Requires:
- role TB_OFFICER;
- LAB_REQUEST_READ / LAB_REQUEST_WRITE or LAB_RESULT_READ as appropriate;
- active requesting-facility assignment.

May:
- create requests;
- add source-side specimens;
- view requests/results sent by own assigned facility;
- cancel eligible requests.

May not:
- write laboratory results.

### Laboratory staff

Requires:
- role LAB_STAFF;
- LAB_REQUEST_READ and/or LAB_RESULT_WRITE as appropriate;
- active assignment to the request.testingFacility.

May:
- view laboratory queue/details for testing facilities in scope;
- confirm specimen receipt/condition;
- create final results;
- append result corrections.

May not:
- create TB clinical requests;
- modify patient/case/treatment clinical data;
- write results for another testing facility.

### Administrators / program monitors / patients / supporters

No Phase 3A laboratory operational write access.

Patient/self laboratory result projection is deferred because sensitive result disclosure, including HIV-related results, requires a separate product projection decision.

## 4. Request owner rules

A LabRequest must continue to have exactly one owner through existing V1 constraint.

### Registration-owned diagnostic request

Allowed when:
- registration status is OPEN or DIAGNOSED;
- requestReasonCode = DIAGNOSIS;
- requestingFacility = registration.facility;
- actor has that facility in scope.

### Case-owned request

Allowed when:
- case status is ACTIVE;
- requestReasonCode = FOLLOW_UP;
- requestingFacility = case.currentFacility;
- actor has that facility in scope.

REFERRED cases cannot create follow-up laboratory requests at the source.

Do not permit:
- DIAGNOSIS request owned by a case;
- FOLLOW_UP request owned by a registration;
- owner reassignment.

## 5. Create request

Endpoint:

`POST /api/v1/lab-requests`

TB_OFFICER + LAB_REQUEST_WRITE.

Request:
- exactly one of `registrationId` or `caseId`;
- `testingFacilityId`;
- `requestReasonCode`;
- non-empty distinct `testTypeCodes` (max 10);
- sampleShippingMethod optional;
- courierName optional;
- notes optional.

System derives:
- requestingFacility from owner;
- referralType:
  - same requesting/testing facility -> INTERNAL
  - different -> EXTERNAL
- requestedAt = injected Clock now;
- status = REQUESTED;
- each LabRequestTest status = REQUESTED.

Validation:
- testing facility exists and active;
- every test type exists and active;
- reason active;
- owner/state/reason rules above;
- external request may include shipping metadata;
- no duplicate test type.

Call source-authority policy for local request creation.

Audit:
`LAB_REQUEST_CREATED`

Return request DTO + ETag.

## 6. Request list

Endpoint:

`GET /api/v1/lab-requests`

Role-sensitive union:

TB_OFFICER sees requests where requestingFacility is in active facility scope and has LAB_REQUEST_READ.

LAB_STAFF sees requests where testingFacility is in active facility scope and has LAB_REQUEST_READ.

If user has both roles, union without duplicates.

Pagination:
- page >= 0
- size 1..50

Optional filters:
- status
- testingFacilityId
- requestingFacilityId
- requestReasonCode
- ownerType = REGISTRATION | CASE

Facility filters must remain inside the actor's applicable role scope.

List projection:
- request id/version
- owner type/id
- patient minimal display
- requesting/testing facility
- reason
- referral type
- requestedAt
- status
- requested test summaries
- specimen/result completeness summary

No HIV/DM, diagnosis narrative, audit/sync metadata.

## 7. Request detail

Endpoint:

`GET /api/v1/lab-requests/{requestId}`

Readable when:
- TB_OFFICER + LAB_REQUEST_READ and requestingFacility in officer scope, OR
- LAB_STAFF + LAB_REQUEST_READ and testingFacility in lab scope.

DTO includes:
- request/version/status
- minimal patient context
- owner summary
- facilities
- reason/referral/logistics
- tests
- specimens
- latest result per test/specimen sequence context

For LAB_STAFF patient context:
- fullName
- sex
- birthDate/birthDateUnknown
- only minimum identity needed operationally
- no HIV/DM and no unrelated case details.

## 8. Record source specimen

Endpoint:

`POST /api/v1/lab-requests/{requestId}/specimens`

TB_OFFICER + LAB_REQUEST_WRITE.
Request must be in requesting-facility scope.

Require request `If-Match`.

Allowed request statuses:
- REQUESTED
- SENT

Input:
- specimenCode optional
- specimenType required
- collectedAt optional
- sentAt optional
- notes optional

Rules:
- timestamps not future;
- sentAt >= collectedAt when both present;
- for EXTERNAL request, sentAt may be supplied and when at least one specimen is marked sent the request becomes SENT;
- for INTERNAL request, request remains REQUESTED until laboratory receipt;
- no specimen can be added after request reaches RECEIVED/PARTIAL/COMPLETED/CANCELLED.

Use source-authority policy.

Audit:
`LAB_SPECIMEN_RECORDED`

Return specimen DTO and current request version.

## 9. Confirm specimen receipt

Endpoint:

`POST /api/v1/lab-specimens/{specimenId}/receive`

LAB_STAFF + LAB_RESULT_WRITE.
Testing facility must be in lab scope.

Require specimen `If-Match`.

Input:
- receivedAt required
- conditionOnReceipt optional
- examinationPossible required
- rejectionReason required when examinationPossible=false
- notes optional

Rules:
- request status REQUESTED/SENT/RECEIVED only;
- receivedAt not future;
- receivedAt >= request.requestedAt;
- existing specimen timeline constraint remains authoritative;
- lock request before mutating derived request status;
- first successful receipt moves request to RECEIVED;
- examinationPossible=false does not auto-cancel request or tests;
- expose derived `needsNewSpecimen=true` when no received specimen is examinationPossible.

Audit:
`LAB_SPECIMEN_RECEIVED`
or
`LAB_SPECIMEN_REJECTED`

No automatic notification is sent in Phase 3A.

## 10. Cancel request

Endpoint:

`POST /api/v1/lab-requests/{requestId}/cancel`

TB_OFFICER + LAB_REQUEST_WRITE.
Request must be in requesting-facility scope.
Require request If-Match.

Allowed:
- REQUESTED
- SENT
- RECEIVED

Only when no FINAL/CORRECTED result exists.

Behavior:
- request -> CANCELLED
- all non-result tests -> CANCELLED
- preserve specimens/results
- no hard delete

Audit:
`LAB_REQUEST_CANCELLED`

## 11. Create laboratory result

Endpoint:

`POST /api/v1/lab-request-tests/{testId}/results`

LAB_STAFF + LAB_RESULT_WRITE.
Testing facility scope through parent request.

Require LabRequestTest `If-Match`.

Input:
- specimenId optional
- testedAt required
- resultCode optional
- resultValue optional
- resultText optional

Require at least one of resultCode/resultValue/resultText.

Rules:
- testedAt not future;
- request not CANCELLED;
- test not CANCELLED;
- supplied specimen belongs to same request (V6 trigger remains final guard);
- if specimen supplied, examinationPossible must be true;
- initial result status is FINAL only;
- sequenceNo is next sequence for `(test, specimen-or-null)` under a lock;
- do not interpret test-specific result values;
- test -> RESULT_AVAILABLE;
- recompute request:
  - COMPLETED if every non-cancelled requested test has a FINAL/CORRECTED result;
  - PARTIAL if at least one but not all has a result;
  - otherwise RECEIVED/previous receive state.

Audit:
`LAB_RESULT_RECORDED`

## 12. Correct laboratory result

Endpoint:

`POST /api/v1/lab-results/{resultId}/corrections`

LAB_STAFF + LAB_RESULT_WRITE.
Testing-facility scope.

Require result If-Match.

Rules:
- result must be the latest result for the same test/specimen lineage;
- original row remains unchanged;
- create a new LabResult:
  - same test
  - same specimen
  - sequenceNo = previous + 1
  - status = CORRECTED
  - testedAt and result fields from correction input
- at least one result field required;
- no correction if request CANCELLED.

Additional editability:
- registration-owned DIAGNOSIS request: correction allowed only while registration status OPEN or DIAGNOSED;
- case-owned FOLLOW_UP request: correction allowed only while no TreatmentOutcome exists for a treatment of that case.

This mirrors the documented distinction that diagnostic results stop being revisable after case validation and follow-up results stop being revisable after final treatment outcome, without claiming exact SITB API behavior.

Audit:
`LAB_RESULT_CORRECTED`

## 13. Status aggregation

Use one application component for status recomputation so result/correction paths do not duplicate logic.

LabRequestTest:
- REQUESTED initially
- IN_PROGRESS may be used after receipt if useful
- RESULT_AVAILABLE once a FINAL/CORRECTED result exists
- CANCELLED only through request cancellation in Phase 3A

LabRequest:
- REQUESTED initially
- SENT when an external specimen is marked sent
- RECEIVED after specimen receipt and before result completeness
- PARTIAL when some tests have final/corrected results
- COMPLETED when all non-cancelled tests have final/corrected results
- CANCELLED by explicit source command

Never infer diagnosis/case status from laboratory state.

## 14. Source authority

Phase 3A must not weaken Phase 2 source-authority behavior.

Add a laboratory-specific source-authority abstraction, for example:

`LaboratorySourceAuthorityPolicy`

with:
- requireLocalCreate(...)
- requireLocalEdit(...)

The local prototype permits writes after authorization/scope checks.

Do not modify Phase 2 `ClinicalSourceAuthorityPolicy` semantics unless necessary for compilation; do not remove existing Phase 2 source checks.

Future SITB integration can replace the lab policy independently.

## 15. Error contract

Continue application/problem+json with Indonesian detail and stable codes.

Add as useful:
- LAB_REQUEST_STATE_CONFLICT
- LAB_SPECIMEN_STATE_CONFLICT
- LAB_RESULT_STATE_CONFLICT
- LAB_RESULT_NOT_LATEST

Keep:
- 428 missing If-Match
- 409 stale optimistic version
- 404 for missing/out-of-scope resource
- 403 for missing role/permission/facility assignment.

## 16. Audit privacy

Audit only:
- actor
- action
- target type/id
- correlation id

Do not copy:
- result text/value/code
- patient identity
- specimen rejection narrative
- notes
into audit metadata.

Actions:
- LAB_REQUEST_CREATED
- LAB_SPECIMEN_RECORDED
- LAB_SPECIMEN_RECEIVED
- LAB_SPECIMEN_REJECTED
- LAB_REQUEST_CANCELLED
- LAB_RESULT_RECORDED
- LAB_RESULT_CORRECTED

## 17. Tests

Use PostgreSQL Testcontainers + authenticated HTTP tests.

At minimum verify:
- no new migration and V1–V11 still migrate/validate;
- TB officer can create INTERNAL and EXTERNAL request in own scope;
- owner/reason/state combinations are enforced;
- REFERRED case cannot create follow-up request at source;
- inactive facility/test/reason rejected;
- duplicate test type rejected;
- TB officer cannot write result;
- LAB_STAFF cannot create request;
- lab staff only sees/testing-writes assigned testing facility;
- admin/program/patient/supporter roles have no operational lab bypass;
- specimen add/receive timeline and If-Match;
- rejected specimen produces needsNewSpecimen without auto-cancel;
- source officer can cancel eligible no-result request;
- request with any final result cannot be cancelled;
- final result sets test RESULT_AVAILABLE;
- partial vs completed aggregation across multiple requested tests;
- result specimen/request lineage;
- result value is not interpreted into diagnosis/case;
- append-only correction creates new sequence and preserves original;
- stale/non-latest correction rejected;
- diagnostic correction blocked after registration converted to case;
- follow-up correction blocked after treatment outcome exists;
- list/detail projections do not leak HIV/DM or unrelated clinical notes to lab staff;
- source-authority policy invoked on lab writes;
- audit metadata excludes sensitive values;
- all 215 existing tests remain green.

Run:
`mvn clean test`

## 18. Documentation

Add:
- `docs/LABORATORY.md`

Update:
- README
- AUTHORIZATION
- architecture docs
- Phase 3A implementation report

Document explicitly:
- TBCall does not encode test-specific clinical interpretation yet;
- laboratory results do not automatically change diagnosis/resistance/treatment;
- external carried-result ingestion is deferred;
- notifications for unusable specimens are deferred;
- Phase 3B will consume finalized laboratory data only as displayed evidence, not as an automatic decision engine.

## 19. Phase 3B boundary

Do not implement treatment in this checkpoint.

Phase 3B will define:
- treatment start for ACTIVE case only;
- regimen selection as explicit clinician choice;
- treatment drug snapshot;
- adherence/dose events;
- follow-up;
- adverse events;
- treatment outcome;
- patient/supporter projections.

No automatic regimen eligibility/dose calculation will be introduced without separately approved clinical rules.
