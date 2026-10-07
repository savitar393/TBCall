# Backend v1.5A.3 treatment-reference checkpoint report

## Base and boundaries

- Approved base: `bab0ac3f9b24fbfbffbcc1761edcaf20728f197c`.
- Branch: `codex/backend-f2c-treatment-reference`.
- Additive GET only; V1–V17 unchanged, no V18. Existing treatment workflow/write services, projections, policies, patient/supporter and other clinical behavior unchanged.
- Frontend unchanged, including preservation/exclusion of the untracked logo (SHA256 `5C84663E7F56B90EC1C07424FBD090931178364C00498AE047844283BF1BA696`). No F2C UI or SITB networking.
- No schema/specification conflict or missing persistence mapping found.
- Local task prompts, `.tools/` logs, PDFs, caches, secrets and unrelated assets excluded.

## Endpoint

`GET /api/v1/treatment-reference-data` calls the existing ClinicalAccess officer gate with TREATMENT_READ. AuthorizationResolver supplies only active facility assignments. TB_OFFICER role, independent permission and active facility are all required; PATIENT_READ is not required. Wrong roles with artificial TREATMENT_READ are denied.

Explicit DTOs return seven groups: regimens, drugs, outcomeCodes, treatmentStatuses, staffDoseStatuses, administrationModes, followUpStatuses. Active TB_TREATMENT regimens expose only code/name/caseCategoryCode, sorted category/code. Active drugs/outcomes expose only code/name, sorted code. Four fixed lists match the exact approved codes, Indonesian labels and order; they are TBCall workflow labels, not SITB physical/API codes.

Scalar projections exclude PREVENTIVE/inactive regimens, UUIDs, descriptions, effective dates, regimen composition/dosing/frequency recommendations, strength/dosage form, clinical data and SITB mappings. No success audit or clinical/persistence write side effect. No write-scope expansion, invented free-text catalogs or clinical inference.

## Changed-file manifest

1. `src/main/java/id/tbcall/application/treatment/TreatmentReferenceDtos.java` — explicit reference DTO.
2. `src/main/java/id/tbcall/application/treatment/TreatmentReferenceService.java` — officer-gated read-only catalog projections and fixed options.
3. `src/main/java/id/tbcall/web/TreatmentReferenceController.java` — new GET only.
4. `src/test/java/id/tbcall/application/TreatmentReferenceIntegrationTest.java` — PostgreSQL/Spring/session regressions.
5. `docs/FRONTEND_TREATMENT_READ_CONTRACTS.md` — frontend handoff contract.
6. `docs/PHASE5A_3_REPORT.md` — this report.
7. `docs/architecture/TBCall_Backend_v1.5A.3_Frontend_F2C_Treatment_Reference.md` — supplied approved architecture.
8. `README.md` — reference checkpoint link.

## Tests and verification

Existing backend baseline: 973 tests. Preflight existing LaboratoryReferenceIntegrationTest: 29 tests, 0 failures, 0 errors, 0 skipped; BUILD SUCCESS; 01:05 min; finished 2026-10-07T16:30:15+07:00. Docker Desktop 29.8.0, Java 21.0.12.1 and Maven wrapper 3.9.16 verified.

New treatment-reference matrix:

| Cases | Coverage |
| --- | --- |
| 1 | Officer reader succeeds without PATIENT_READ |
| 1 | Missing TREATMENT_READ denied |
| 6 | Wrong actor roles denied despite artificial grant |
| 3 | Missing/inactive assignment and inactive facility denied |
| 1 | Active TB_TREATMENT only; category/code ordering; PREVENTIVE/inactive exclusion |
| 2 | Active drugs/outcomes; exact code/name fields; code ordering |
| 1 | Exact fixed code/label sets and order |
| 1 | Exact seven-group projection; no UUID/composition/dose/date/clinical/mapping leakage |
| 1 | Repeated reads leave audit and persistence rows unchanged |
| 1 | Reference read does not grant treatment writes |
| 3 | Category mismatch and inactive/unknown drug validation unchanged |
| 2 | Inactive/unknown outcome validation unchanged |
| 1 | Anonymous read requires authentication |

Focused RED before implementation: 24 tests, 23 failures caused by missing-endpoint 404, 0 errors, 0 skipped; anonymous 401 passed. Focused GREEN after implementation: 24 tests, 0 failures, 0 errors, 0 skipped; BUILD SUCCESS; 58.830 s; finished 2026-10-07T16:35:48+07:00.

Independent final read-only review: 0 Critical, 0 Important, 0 Minor; no code, security, scope or test-cleanup findings.

Exact final command: `.\mvnw.cmd clean test`.

```text
Tests run: 997, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time:  30:30 min
Finished at: 2026-10-07T17:07:13+07:00
```

The clean run passed all 973 previous tests plus 24 new treatment-reference tests. Fresh PostgreSQL Testcontainers migrations through V17 and Hibernate/application startup passed. The run emitted existing background Hikari warnings against terminated earlier-class containers and a roughly 15-minute clock-jump warning during a host pause; neither caused a test failure. No production behavior was changed to suppress these warnings. Build logs remain ignored under `.tools/`.

## Implementation judgments and F2C handoff

The supplied approved architecture is the design. This bounded addition follows the existing service/controller/DTO reference pattern in the current Windows checkout on a dedicated branch. Reusing ClinicalAccess retains the exact existing active-facility semantics; no separate permission policy is introduced. Regimen caseCategoryCode maps the existing tbCaseCategoryCode field; filtering uses active/kind only, without inferring eligibility from effective dates. Explicit scalar projections prevent entity fields/relationships from leaking.

No known backend contract blocker before F2C. The UI remains a separate implementation request and must treat these values as options only, retaining backend write/category/active-reference validation. No treatment, adherence, follow-up, adverse-event or outcome behavior was redesigned.

Reviewer set aside medical correctness of unchanged baseline catalog names/content, deferred F2C UI, the unrelated logo (preservation checked), and clean-suite completion (still running during review, subsequently verified above). These remain governed by the approved catalog contract, the explicit task boundary, exclusion/hash checks and the mandatory clean gate respectively. Cost if the boundary assumption is wrong: catalog clinical governance or future UI acceptance needs separate review; no clinical recommendation is supplied by this endpoint. No deferred findings.
