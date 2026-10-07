# TBCall Backend v1.5A.2 — Frontend F2B Laboratory Reference Contract

Base commit: `6946a982b8ad44e6cdc56d960df46fdaf0d88d68`

Status: narrow backend read-contract checkpoint required before laboratory frontend F2B.

No database migration or laboratory workflow change is authorized.

## 1. Why this checkpoint exists

The current laboratory backend already has complete operational endpoints for request list/detail/create/cancel, specimen recording/receipt, initial result recording and result correction.

The browser can recover mutable resource IDs/versions from request detail.

The remaining frontend blocker is safe selectable laboratory reference data. A browser must not hard-code active `lab_test_types` / `lab_request_reasons` or duplicate fixed laboratory status codes and labels.

## 2. Migration policy

Do not modify V1–V17.
Do not add V18.
No schema change.

## 3. Add laboratory reference endpoint

Add:

`GET /api/v1/laboratory-reference-data`

Authorization must match the existing laboratory read actor contract:
- TB_OFFICER + LAB_REQUEST_READ, OR
- LAB_STAFF + LAB_REQUEST_READ;
- at least one active assigned facility.

Reuse `LabAccess.require(actor, Mode.READ)`.

Return one explicit DTO.

Database-backed active catalogs, code/name only, sorted by code:
- `testTypes` from active `lab_test_types`
- `requestReasons` from active `lab_request_reasons`

Fixed TBCall workflow options:

`requestStatuses`
- DRAFT — Draf
- REQUESTED — Diminta
- SENT — Dikirim
- RECEIVED — Diterima
- PARTIAL — Hasil sebagian
- COMPLETED — Selesai
- CANCELLED — Dibatalkan

`ownerTypes`
- REGISTRATION — Registrasi
- CASE — Kasus

`referralTypes`
- INTERNAL — Internal
- EXTERNAL — Eksternal

`testStatuses`
- REQUESTED — Diminta
- RESULT_AVAILABLE — Hasil tersedia
- CANCELLED — Dibatalkan

`resultStatuses`
- FINAL — Final
- CORRECTED — Dikoreksi

These are TBCall application/workflow labels, not SITB physical codes.

Do not add specimen-type or result-code catalogs because those existing inputs are intentionally bounded free text.

## 4. Privacy and semantics

The response contains no patient, facility, identity, clinical result or audit data.

This endpoint grants no write scope.

Do not change:
- LabAccess role/facility rules
- request reason-owner coupling
- active testing-facility validation
- laboratory source authority
- result correction lineage
- If-Match behavior
- existing laboratory DTO semantics

No success audit entry is needed for this read.

## 5. F2B owner/facility implications

No additional owner-search endpoint is required for F2B.

F2B request creation will be launched contextually from an authorized registration detail or active case detail.

Testing-facility selection may reuse `/api/v1/clinical-facilities` for TB_OFFICER request creation. Directory visibility does not grant write authorization.

LAB_STAFF does not create requests and does not need the global facility directory for receive/result workflows.

## 6. Tests

Backend baseline: 944 tests.

Add authenticated PostgreSQL/Spring tests covering:
- TB_OFFICER + LAB_REQUEST_READ can read
- LAB_STAFF + LAB_REQUEST_READ can read
- missing LAB_REQUEST_READ -> 403
- wrong roles with artificially granted permission cannot bypass actor type
- no active facility assignment -> 403
- both catalogs active-only code/name
- inactive test/reason rows excluded
- deterministic code ordering
- exact fixed workflow code sets/order
- successful read creates no audit entry
- no patient/facility/result payload
- existing lab request create validation unchanged
- frontend files unchanged

Run:

```powershell
.\mvnw.cmd clean test
```

All previous 944 tests must remain green.

## 7. Documentation

Add:
- `docs/FRONTEND_LAB_READ_CONTRACTS.md`
- `docs/PHASE5A_2_REPORT.md`

Commit architecture:
- `docs/architecture/TBCall_Backend_v1.5A.2_Frontend_F2B_Laboratory_Reference.md`

Update README only where useful.

## 8. After this checkpoint

Frontend F2B may implement:
- TB Officer request creation from registration/case context
- shared laboratory work queue
- request detail
- source specimen recording/cancellation
- LAB_STAFF specimen receipt
- LAB_STAFF result recording/correction

F2B must consume this live laboratory reference endpoint rather than hard-code active catalogs.
