# Laboratory workflow — Phase 3A

Contract: [approved Phase 3A architecture](architecture/TBCall_Application_API_v1.3A_Phase3A_Laboratory.md), based on Phase 2.1 commit `a2edfb1582d0a7e9d469713d0308038740a1bf24`.

V1–V11, entities and existing clinical/identity behavior are unchanged. Flyway remains authoritative and Hibernate validates its schema. No new migration is required.

## Endpoints and preconditions

All endpoints use existing opaque sessions, live RBAC/facility assignments, CSRF, configured CORS, correlation IDs and Indonesian `application/problem+json` responses. UUIDs identify TBCall records; catalog codes are TBCall canonical identifiers, not official SITB database/API codes.

| Method and path (`/api/v1`) | Role and permission | Facility scope | If-Match | Success |
|---|---|---|---|---|
| POST `/lab-requests` | TB_OFFICER + LAB_REQUEST_WRITE | Owner/source | None | 201 request + request ETag |
| GET `/lab-requests` | TB_OFFICER or LAB_STAFF + LAB_REQUEST_READ | Requesting or testing respectively | None | 200 page |
| GET `/lab-requests/{requestId}` | Same read union | Same | None | 200 detail + request ETag |
| POST `/lab-requests/{requestId}/specimens` | TB_OFFICER + LAB_REQUEST_WRITE | Requesting | Request version | 201 specimen + specimen ETag |
| POST `/lab-specimens/{specimenId}/receive` | LAB_STAFF + LAB_RESULT_WRITE | Testing | Specimen version | 200 specimen + specimen ETag |
| POST `/lab-requests/{requestId}/cancel` | TB_OFFICER + LAB_REQUEST_WRITE | Requesting | Request version | 200 request + request ETag |
| POST `/lab-request-tests/{testId}/results` | LAB_STAFF + LAB_RESULT_WRITE | Testing | Test version | 201 result + result ETag |
| POST `/lab-results/{resultId}/corrections` | LAB_STAFF + LAB_RESULT_WRITE | Testing | Result version | 201 new result + new result ETag |

Send one quoted numeric version, e.g. `If-Match: "0"`. Missing If-Match is 428; a stale version is 409. Specimen responses include `requestVersion`; result responses include `requestVersion` and `testVersion`. Request details contain specimen/test/result versions. Re-fetch the request after another writer changes it.

All write DTOs reject unknown fields: clients cannot set status, derived facilities, source ownership, result sequence or a correction's specimen/test. Missing/out-of-scope records return 404; missing role/permission/active facility assignment returns 403. Administrators/program monitors/patients/supporters have no operational laboratory bypass. INTERNAL requests still require LAB_STAFF for receipt/result entry.

## Request creation and reads

Create fields: exactly one of `registrationId`/`caseId`, `testingFacilityId`, `requestReasonCode`, distinct nonempty `testTypeCodes` (maximum 10), optional `sampleShippingMethod`, `courierName`, `notes`. Test/reason catalogs and testing facility must be active.

| Owner | Eligible state | Reason | Derived requesting facility |
|---|---|---|---|
| Registration | OPEN or DIAGNOSED | DIAGNOSIS | registration.facility |
| Case | ACTIVE | FOLLOW_UP | case.currentFacility |

REFERRED source cases cannot create follow-up requests. The server sets REQUESTED, requestedAt from the injected Clock, and INTERNAL for equal facilities/EXTERNAL for different facilities. Each requested test starts REQUESTED. Owners cannot be reassigned.

Lists accept `page` (>=0), `size` (1..50), `status`, `testingFacilityId`, `requestingFacilityId`, `requestReasonCode`, `ownerType` (REGISTRATION/CASE). Unknown filters are rejected. Each facility filter must be an active actor assignment; filtering never widens the role-sensitive requesting/testing predicate. Both roles receive a union without duplicate requests. Pagination and child batches run in PostgreSQL. List/detail use a read-only REPEATABLE_READ snapshot so parent ETag, child versions, completeness and page counts remain consistent during concurrent commits; commands use READ_COMMITTED with explicit locks.

List/detail DTOs contain minimum patient context (UUID, name, sex code/label, birth date/unknown), owner, facilities, reason code/label, status and completeness. Detail adds request logistics, specimens and latest results per test/specimen lineage. GET result values require LAB_RESULT_READ in addition to LAB_REQUEST_READ. No patient identity numbers, HIV/DM, unrelated diagnosis/case history, address, account or audit/sync data are exposed. Operational request/specimen notes are distinct from unrelated clinical notes.

## Specimen and cancellation states

Source recording accepts specimenCode (optional), specimenType (required), collectedAt/sentAt (optional), notes (optional) only while REQUESTED/SENT. Neither timestamp may be future; sentAt cannot precede collectedAt. A sent external specimen sets SENT; internal recording stays REQUESTED.

Laboratory receipt accepts receivedAt (required), conditionOnReceipt (optional), examinationPossible (required), rejectionReason (required when false), notes (optional), only for REQUESTED/SENT/RECEIVED parents. Receipt cannot precede requestedAt, collection or shipping, or be future. A specimen's receipt cannot be overwritten. Supplied receipt notes update the existing specimen notes column; omitted notes preserve it.

Receipt sets RECEIVED even when examination is impossible. Rejection does not cancel the request/tests. `needsNewSpecimen` is true when no received usable specimen exists, including before the first usable receipt. Source recording is closed after receipt; an unusable-specimen replacement therefore uses the explicit eligible cancellation/new-request workflow. Notifications are deferred.

Cancellation is source-only, while REQUESTED/SENT/RECEIVED and with no FINAL/CORRECTED result anywhere in the request. It sets request and tests CANCELLED and preserves specimens and any historical nonfinal rows. No implicit cancellation follows rejection.

## Results, completeness and corrections

Initial result input: optional specimenId, required testedAt (not future), and at least one nonblank resultCode/resultValue/resultText. A supplied specimen must belong to the request and be examinationPossible=true. Specimen-less results are supported by the approved schema/contract. Initial status is FINAL; input does not choose it.

One status component recomputes test RESULT_AVAILABLE from FINAL/CORRECTED evidence. Some completed tests set PARTIAL; every non-cancelled test completed sets COMPLETED. Otherwise receipt/shipping state remains. IN_PROGRESS is not introduced by this checkpoint. No result value is interpreted into diagnosis, resistance, case state, treatment or regimen eligibility.

Results are sequenced independently for `(test, specimen)` and `(test, null)`. A next FINAL entry is permitted using the current test ETag. A correction must target the latest FINAL/CORRECTED row in that same lineage and requires that result's ETag. It appends CORRECTED with the same test/specimen and sequence +1, using newly supplied testedAt/result fields. The original row, timestamps and version remain unchanged. Detail displays only the latest lineage rows.

Diagnostic correction is allowed only while the registration is OPEN/DIAGNOSED; confirmed CONVERTED_TO_CASE blocks correction. Case FOLLOW_UP correction is blocked if any treatment for that case has a TreatmentOutcome. Cancelled requests/tests cannot receive results/corrections.

The approved contract applies those owner barriers to corrections specifically, while initial FINAL entry uses the next sequence and only cancelled request/test barriers. Thus another FINAL with a current test ETag can advance a lineage after its correction gate closes. This checkpoint preserves that distinction. Before Phase 3B, clarify whether subsequent FINAL entries should share the correction editability barriers; doing so changes the approved command contract.

Commands lock the request before children, serialize sequence/status decisions and invalidate aggregate ETags even when status stays unchanged. Results also invalidate test ETags. Corrections first lock the owner, then request/test/result; the registration lock is shared with case confirmation. V6 relational triggers and unique lineage indexes remain final protection. There are no silent retries. **Future Phase 3B outcome writers must lock the case before creating the outcome, matching the correction gate's lock order.**

Conflict codes: LAB_REQUEST_STATE_CONFLICT, LAB_SPECIMEN_STATE_CONFLICT, LAB_RESULT_STATE_CONFLICT, LAB_RESULT_NOT_LATEST, plus existing precondition/optimistic/reference errors.

## Source authority and audit

`LaboratorySourceAuthorityPolicy` offers requireLocalCreate/requireLocalEdit independently of the unchanged clinical policy. Prototype local writes require the authorized role, command permission and appropriate facility. Every laboratory write calls it before mutation: requesting facility for source commands, testing facility for lab commands. An authorized future integration can replace this adapter without weakening Phase 2 source checks. No SITB ownership fields or network behavior are guessed.

Audit actions: LAB_REQUEST_CREATED, LAB_SPECIMEN_RECORDED, LAB_SPECIMEN_RECEIVED, LAB_SPECIMEN_REJECTED, LAB_REQUEST_CANCELLED, LAB_RESULT_RECORDED, LAB_RESULT_CORRECTED. Audit records actor/action/target/correlation ID only, with traceId-only metadata. Result fields, identity, rejection reasons and notes are never copied into audit metadata.

## Phase 3B boundary

Test-specific clinical interpretation, carried/external historical result ingestion, unusable-specimen notifications and SITB networking are deferred. No treatment, adherence, follow-up, outcome, adverse-event, referral-transfer or contact/TPT endpoints are implemented. The outcome test uses persistence fixtures solely to check the correction gate.

Phase 3B will consume finalized laboratory data as displayed evidence, not an automatic decision engine. Its approved architecture must define ACTIVE-only treatment initiation, clinician regimen choice, treatment snapshots, dose/adherence/follow-up/outcomes, patient/supporter projections and the shared outcome/correction lock protocol.
