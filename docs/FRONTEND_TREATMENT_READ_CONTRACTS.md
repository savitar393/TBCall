# Frontend F2C treatment read contracts

Backend v1.5A.3 adds only `GET /api/v1/treatment-reference-data`, based on `bab0ac3f9b24fbfbffbcc1761edcaf20728f197c`. See the [approved architecture](architecture/TBCall_Backend_v1.5A.3_Frontend_F2C_Treatment_Reference.md) and [checkpoint report](PHASE5A_3_REPORT.md).

## Authorization and transaction

The existing authenticated TB_OFFICER actor must independently have TREATMENT_READ and at least one active assigned facility. The service calls `ClinicalAccess.officer(actor, "TREATMENT_READ")`; the existing authorization resolver filters inactive assignments/facilities. A role alone, an artificial permission on a different role, or an inactive/missing assignment does not authorize this GET. No PATIENT_READ permission is required.

Existing session/security behavior supplies anonymous 401 and unauthorized 403 responses. Successful reference reads create no audit row. Existing authorization-denial auditing remains unchanged. The service runs in a read-only transaction and returns explicit DTO records rather than entities. The endpoint requires no owner/patient ID or write precondition and grants no write permission or expanded facility scope.

## Response

| Property | Source and exact fields | Ordering |
| --- | --- | --- |
| `regimens` | Active regimens of kind TB_TREATMENT: `code`, `name`, `caseCategoryCode` (mapped from tbCaseCategoryCode) | Category then code |
| `drugs` | Active drugs: `code`, `name` | Code |
| `outcomeCodes` | Active treatment_outcome_codes: `code`, `name` | Code |
| `treatmentStatuses` | Fixed TBCall `code`, `name` | Approved list below |
| `staffDoseStatuses` | Fixed TBCall `code`, `name` | Approved list below |
| `administrationModes` | Fixed TBCall `code`, `name` | Approved list below |
| `followUpStatuses` | Fixed TBCall `code`, `name` | Approved list below |

Live lists use scalar database projections. Only active/kind filters from the architecture apply; effective dates are neither returned nor used to infer eligibility. PREVENTIVE/inactive regimens are excluded. Drugs omit UUIDs, strength and dosage form; regimens omit UUIDs, descriptions, effective dates, regimen_drugs/composition and dose/frequency recommendations; outcomes omit descriptions.

## Fixed options

These are **TBCall workflow labels**, not official SITB physical-schema/API codes.

| List | Exact code — Indonesian label, in order |
| --- | --- |
| treatmentStatuses | PLANNED — Direncanakan; ACTIVE — Aktif; PAUSED — Dijeda; TRANSFERRED — Dialihkan; COMPLETED — Selesai; STOPPED — Dihentikan; CANCELLED — Dibatalkan |
| staffDoseStatuses | TAKEN_OBSERVED — Diminum terobservasi; TAKEN_SELF_REPORTED — Diminum berdasarkan laporan; DISPENSED_HOME — Obat dibawa pulang; MISSED — Tidak diminum; UNKNOWN — Tidak diketahui |
| administrationModes | DIRECTLY_OBSERVED — Diawasi langsung; SELF_ADMINISTERED — Diminum mandiri; OTHER — Lainnya |
| followUpStatuses | SCHEDULED — Terjadwal; COMPLETED — Selesai |

No catalogs are added for treatmentPhase, doseUnit, oatForm, drugSource, followUpType, adherenceAssessment or adverse-event type/severity/action/outcome narrative. No patient data or SITB mappings are returned. Regimen display names are catalog labels and do not constitute composition/dosing guidance.

## Clinical boundary and F2C handoff

The endpoint does not infer composition, dose, frequency, duration, phase, eligibility, substitution, resistance, follow-up schedules, adverse-event causality or final outcome. Existing TreatmentService, AdherenceService, FollowUpService, AdverseEventService, TreatmentAccess, ClinicalSourceAuthorityPolicy, projections and patient/supporter routes remain authoritative and unchanged.

Reference visibility does not permit treatment writes. Existing start validation still rejects category-mismatched regimens and inactive/unknown drugs; outcome validation still rejects inactive/unknown outcome codes. No schema change, V18, frontend modification or SITB networking is introduced. F2C UI needs separate authorization and must continue to use existing scoped reads, write validation and version contracts.
