# Laboratory frontend read contract — backend v1.5A.2

Approved base: `6946a982b8ad44e6cdc56d960df46fdaf0d88d68`.

This checkpoint adds only `GET /api/v1/laboratory-reference-data`. It does not add laboratory workflow behavior, migrations or frontend UI.

## Authorization

The read service reuses `LabAccess.require(actor, Mode.READ)` inside a read-only transaction. Authentication, an explicit TB_OFFICER or LAB_STAFF role, LAB_REQUEST_READ, and at least one active assigned facility are required. PATIENT_READ and laboratory write permissions are not prerequisites. An artificial permission grant cannot bypass the actor gate. Existing authorization-denial auditing remains in effect; successful reads create no audit entry.

Reference visibility grants no clinical owner, testing-facility or mutation scope. All existing laboratory access, source-authority, owner/reason coupling, active testing-facility validation, If-Match and result-correction lineage remain authoritative and unchanged.

## Response

The explicit DTO contains exactly seven arrays. Every entry has only `code` and `name`.

| Group | Source and ordering |
| --- | --- |
| `testTypes` | Active `lab_test_types`; ordered by code |
| `requestReasons` | Active `lab_request_reasons`; ordered by code |
| `requestStatuses` | Fixed options in the order below |
| `ownerTypes` | Fixed options in the order below |
| `referralTypes` | Fixed options in the order below |
| `testStatuses` | Fixed options in the order below |
| `resultStatuses` | Fixed options in the order below |

Fixed options are TBCall application/workflow codes and labels, not claims about SITB physical database or API fields.

| Group | Exact ordered code — name pairs |
| --- | --- |
| `requestStatuses` | DRAFT — Draf; REQUESTED — Diminta; SENT — Dikirim; RECEIVED — Diterima; PARTIAL — Hasil sebagian; COMPLETED — Selesai; CANCELLED — Dibatalkan |
| `ownerTypes` | REGISTRATION — Registrasi; CASE — Kasus |
| `referralTypes` | INTERNAL — Internal; EXTERNAL — Eksternal |
| `testStatuses` | REQUESTED — Diminta; RESULT_AVAILABLE — Hasil tersedia; CANCELLED — Dibatalkan |
| `resultStatuses` | FINAL — Final; CORRECTED — Dikoreksi |

No inactive rows, entity identifiers, descriptions, patient/facility/result/audit data or SITB mappings are returned. No specimen-type or result-code catalog is invented; those existing write inputs remain bounded free text. Active catalog data is queried on every read, with no application cache or hard-coded active catalog list.

## F2B handoff

F2B will consume this endpoint for selectable laboratory references and launch request creation contextually from an authorized registration or active case detail. No additional owner-search endpoint is required. TB_OFFICER may reuse the existing clinical-facility directory for testing-facility selection; visibility does not authorize writes. LAB_STAFF receipt/result workflows do not require that global directory.

No F2B UI is implemented here. There is no schema or read-contract blocker remaining in the approved F2B scope. See [checkpoint report](PHASE5A_2_REPORT.md) for the manifest and exact clean-test result.
