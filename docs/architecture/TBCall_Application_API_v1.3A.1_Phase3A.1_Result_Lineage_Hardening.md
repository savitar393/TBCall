# TBCall Application/API v1.3A.1 — Phase 3A.1 Result-Lineage Hardening

Base commit: `ff2a56c885c036da1ced99e8b294dbaae788b119`

Status: required laboratory hardening checkpoint before Phase 3B treatment/outcome implementation.

No schema migration is required. V1–V11 remain immutable.

## 1. Why this checkpoint is required

Phase 3A correctly implements append-only CORRECTED results and blocks corrections:
- after diagnostic registration has been converted to a case; and
- after a treatment outcome exists for a follow-up request.

However, the current `POST /lab-request-tests/{testId}/results` command still permits another `FINAL` result in the same `(test, specimen-or-null)` lineage whenever the caller has a current test ETag.

That allows a caller to bypass the correction barrier:
1. record FINAL;
2. registration is converted to TB case, or treatment receives final outcome;
3. correction endpoint is correctly blocked;
4. caller submits another FINAL for the same lineage;
5. the newer FINAL becomes the displayed latest result.

The intended distinction is:
- **late first entry of a result that was previously missing** remains permitted;
- **revision/supersession of a result that already exists** must use the correction path and its editability barriers.

The SITB workflow explicitly permits results that have not yet been entered to be added even after case validation/final outcome, while separately restricting revision of already-entered diagnostic/follow-up results.

## 2. Approved lineage rule

A laboratory result lineage is:

`(lab_request_test_id, specimen_id-or-null)`

### First FINAL

`POST /api/v1/lab-request-tests/{testId}/results`

may create a FINAL result only when that lineage has **no existing FINAL or CORRECTED result**.

This first FINAL remains allowed even when:
- a DIAGNOSIS registration has already become `CONVERTED_TO_CASE`; or
- a FOLLOW_UP case already has a TreatmentOutcome.

This preserves late entry of a previously missing result.

### Subsequent supersession

Once a lineage has any FINAL/CORRECTED result:
- another FINAL through `/results` is rejected;
- any permitted change must use `/lab-results/{resultId}/corrections`;
- correction remains subject to the existing diagnostic/outcome barriers.

### Different specimens

The rule is per lineage.

For the same requested test:
- specimen A may have its own first FINAL;
- specimen B may have its own first FINAL;
- a specimen-less result (`specimen_id IS NULL`) is its own lineage.

Do not globally limit a LabRequestTest to one result.

## 3. HTTP behavior

When `/lab-request-tests/{testId}/results` is called for a lineage that already has a FINAL/CORRECTED result:

Return:
- HTTP 409
- code `LAB_RESULT_ALREADY_EXISTS`
- Indonesian detail explaining that the result already exists and correction must use the correction endpoint when still permitted.

Do not:
- create a new result;
- increment result sequence;
- alter request/test status;
- advance request/test versions;
- write `LAB_RESULT_RECORDED` audit.

If If-Match is stale, ordinary optimistic conflict behavior may still occur first. Do not weaken existing ETag semantics.

## 4. Concurrency

Keep the existing request-first/test locking order.

After request and test are locked and If-Match is accepted:
- resolve/lock the optional specimen as today;
- check for existing FINAL/CORRECTED result in the exact lineage;
- reject if one exists;
- otherwise create sequence `max(sequence_no for lineage)+1`.

Two concurrent attempts to create the first FINAL for the same lineage must result in exactly one success.

Do not add retry loops.

## 5. Sequence semantics

Do not assume sequence 1 if historical PRELIMINARY/CANCELLED rows somehow exist.

For a permitted first FINAL:
- sequence number remains `max(sequence_no for lineage)+1`.

The new rule checks existence of FINAL/CORRECTED, not existence of any row.

The current application does not create PRELIMINARY results, but persistence compatibility should remain safe.

## 6. Correction behavior remains unchanged

Keep the existing correction contract:
- correction target must be latest FINAL/CORRECTED in its lineage;
- append a new CORRECTED row;
- preserve original row;
- diagnostic correction only while registration OPEN/DIAGNOSED;
- follow-up correction only before any TreatmentOutcome for the case;
- cancelled request/test cannot be corrected.

Do not relax these rules.

## 7. Phase 3B lock contract

Document, but do not implement treatment/outcome APIs here:

Phase 3B outcome creation must lock in this order:
1. TBCase `PESSIMISTIC_WRITE`
2. Treatment `PESSIMISTIC_WRITE`
3. verify no existing outcome
4. create TreatmentOutcome

Laboratory follow-up correction already locks the case before checking outcome existence.

This shared case lock is required so outcome creation and lab correction cannot race past each other's eligibility checks.

## 8. Tests

Add real PostgreSQL/Spring Security regression coverage proving:

1. first FINAL for a lineage succeeds;
2. second FINAL for same test + same specimen returns 409 `LAB_RESULT_ALREADY_EXISTS`;
3. second specimen for same test can have its own first FINAL;
4. specimen-less lineage and specimen lineage are independent;
5. a first diagnostic FINAL may still be entered after registration is `CONVERTED_TO_CASE` if that lineage previously had no FINAL/CORRECTED result;
6. after conversion, an existing diagnostic result cannot be changed through either another FINAL or CORRECTED endpoint;
7. a first follow-up FINAL may still be entered after TreatmentOutcome exists if that lineage was previously missing;
8. after outcome, an existing follow-up result cannot be changed through another FINAL or correction;
9. rejected duplicate FINAL does not change request/test/result versions or success audit state;
10. concurrent first-FINAL attempts for same lineage produce exactly one success;
11. multiple specimen lineages still aggregate request/test status correctly;
12. all 267 existing tests remain green, adjusting only tests that intentionally asserted successive FINAL behavior.

Run:
`mvn clean test`

## 9. Documentation

Update:
- `docs/LABORATORY.md`
- `docs/PHASE3A_REPORT.md`
- README only if useful
- add a Phase 3A.1 implementation report
- commit this architecture under `docs/architecture/`

Document explicitly:

`POST /results` = first FINAL for a previously unreported lineage.

`POST /corrections` = superseding an already reported lineage while correction is still allowed.

This distinction is application semantics, not a claim about SITB physical API design.

## 10. Final report

Return:
- commit SHA;
- files changed;
- exact lineage rule implemented;
- late-first-entry behavior;
- duplicate FINAL error contract;
- concurrency-test method;
- test count;
- exact `mvn clean test` result;
- confirmation V1–V11 unchanged;
- blocker assessment before Phase 3B.

Do not start Phase 3B in this checkpoint.
