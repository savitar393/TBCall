# Backend v1.5A.2 — laboratory reference checkpoint report

## Base and boundaries

- Approved base: `6946a982b8ad44e6cdc56d960df46fdaf0d88d68`.
- Prepared feature branch: `feat/frontend-f2b-read-contracts`.
- Narrow backend read contract only; no frontend changes, F2B UI or SITB networking.
- V1–V17 remain unchanged; no V18 or schema change.
- Existing laboratory write services, DTOs, access policy, owner/reason validation, testing-facility checks, source authority, If-Match and correction lineage are unchanged.
- Source-control preservation was verified using `git diff --exit-code` against the approved base for frontend, migrations, existing laboratory services/controller, authorization/security and Maven files. Exactly17 migration files exist; no V18.
- The unrelated untracked logo is preserved/excluded (SHA256 `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`). Local prompts, PDFs, `.tools/` diagnostics, build output and secrets are excluded.

## Manifest

Eight files:

```text
README.md
docs/FRONTEND_LAB_READ_CONTRACTS.md
docs/PHASE5A_2_REPORT.md
docs/architecture/TBCall_Backend_v1.5A.2_Frontend_F2B_Laboratory_Reference.md
src/main/java/id/tbcall/application/laboratory/LabReferenceDtos.java
src/main/java/id/tbcall/application/laboratory/LabReferenceService.java
src/main/java/id/tbcall/web/LaboratoryReferenceController.java
src/test/java/id/tbcall/application/LaboratoryReferenceIntegrationTest.java
```

## Endpoint and reference groups

`GET /api/v1/laboratory-reference-data` reuses `LabAccess.require(actor, Mode.READ)`: authenticated TB_OFFICER or LAB_STAFF, LAB_REQUEST_READ, and at least one active assigned facility. No PATIENT_READ or write permission is required. Successful reads create no audit entries or clinical writes; authorization-denial auditing remains unchanged.

The response contains exactly seven arrays of code/name only:

- `testTypes`: active lab_test_types, sorted by code.
- `requestReasons`: active lab_request_reasons, sorted by code.
- `requestStatuses`: DRAFT/Draf, REQUESTED/Diminta, SENT/Dikirim, RECEIVED/Diterima, PARTIAL/Hasil sebagian, COMPLETED/Selesai, CANCELLED/Dibatalkan.
- `ownerTypes`: REGISTRATION/Registrasi, CASE/Kasus.
- `referralTypes`: INTERNAL/Internal, EXTERNAL/Eksternal.
- `testStatuses`: REQUESTED/Diminta, RESULT_AVAILABLE/Hasil tersedia, CANCELLED/Dibatalkan.
- `resultStatuses`: FINAL/Final, CORRECTED/Dikoreksi.

Fixed pairs above retain the specified order and are TBCall workflow labels, not SITB physical codes. No descriptions, inactive rows, patient/facility/result payload, audit data, SITB mappings, specimen-type catalog or result-code catalog is returned.

## Tests

Added 29 authenticated PostgreSQL/Spring integration cases:

| Cases | Coverage |
| ---: | --- |
| 2 | Both laboratory read actors without clinical-directory permission |
| 2 | Missing LAB_REQUEST_READ denied independently of role |
| 5 | Wrong roles with artificially granted LAB_REQUEST_READ denied |
| 6 | Both actors denied with absent/inactive assignment or inactive facility |
| 2 | Both catalogs active-only, code/name-only and sorted, including inactive fixtures |
| 1 | Exact fixed option codes, labels and ordering |
| 1 | Exactly seven safe groups; no clinical data, mappings or invented catalogs |
| 2 | Successful reads leave audit and clinical rows unchanged |
| 2 | Reference visibility does not grant request writes |
| 5 | Existing create validation rejects wrong owner/reason, inactive catalogs/facility and unknown tests after reference reads |
| 1 | Anonymous read requires authentication |

Before implementation, focused tests ran29:28 failures caused by the missing endpoint (404),0 errors,0 skipped; the anonymous authentication case passed. Initial focused GREEN:29 tests,0 failures,0 errors,0 skipped; BUILD SUCCESS,44.146s, finished2026-10-07T11:59:12+07:00. Review identified one test cleanup issue: V7 grants PATIENT_READ to both read actors, so both must restore it after temporary removal. A cleanup assertion reproduced one failure across the two actor cases; restoration now applies to both. Final focused and clean results follow.

## Final verification and review

Independent read-only review:0 Critical,0 Important,1 Minor (seeded-grant cleanup), corrected with a failing regression before the fix. No outstanding or deferred findings. The first clean run was interrupted to apply that test-only correction; the subsequent full clean run supplies delivery evidence. Post-fix focused GREEN:29 tests,0 failures,0 errors,0 skipped; BUILD SUCCESS,39.154s, finished2026-10-07T12:03:07+07:00.
Exact final command: `.\mvnw.cmd clean test`, exit0.

```text
Tests run: 973, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 12:23 min
Finished at: 2026-10-07T12:15:45+07:00
```

All previous944 tests plus29 new cases passed. Fresh PostgreSQL Testcontainers migration through V17 and Hibernate/application startup passed. Existing Hikari reconnect warnings from terminated earlier-class containers and JVM/Mockito/Flyway warnings did not cause failures; no production behavior was changed to silence them. Whitespace checks and the final eight-file manifest pass. Ignored `.tools/` logs and `target/` output are development artifacts and are not committed. Publication SHA is returned after commit/push and remote comparison.

## Implementation judgments and F2B handoff

The supplied architecture is the approved design; its existing controller/service/DTO patterns are reused without redesign or additional contracts. The prepared feature checkout is retained, and a dedicated controller/service isolates the additive read from existing write handlers. Existing laboratory `Label` provides the required code/name pair without altering its semantics. Catalog query entity names are fixed internal constants, never client input.

Reviewer judgments accepted: fixed internal JPQL entity names are not client injection; existing Label has the required safe projection; pending verification fields are completed before publication; unrelated logo remains excluded. Cost if wrong: a future Label change could alter response shape, covered by exact projection tests. The prepared checkout and explicit user commit/push instructions are retained without a new integration menu or PR.

No schema or laboratory workflow conflict was discovered. F2B must consume live reference data, contextual authorized owners and existing write validation. No additional owner-search endpoint is required. F2B UI remains a separate implementation request.
