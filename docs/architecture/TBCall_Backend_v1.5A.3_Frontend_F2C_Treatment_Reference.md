# TBCall Backend v1.5A.3 — Frontend F2C Treatment Reference Contract

Base commit: `bab0ac3f9b24fbfbffbcc1761edcaf20728f197c`

This is a narrow read-contract checkpoint before staff treatment frontend F2C. Do not modify V1–V17 or add V18.

## Endpoint

Add `GET /api/v1/treatment-reference-data`.

Authorization:
- authenticated TB_OFFICER
- TREATMENT_READ
- existing active-facility assignment semantics

Reuse `ClinicalAccess.officer(actor, "TREATMENT_READ")` or the exact shared equivalent. No success audit row.

## Response

Return explicit DTOs only.

### regimens

Only active `regimens` where `regimen_kind='TB_TREATMENT'`.

Fields:
- code
- name
- caseCategoryCode

Sort by caseCategoryCode then code.

Exclude PREVENTIVE regimens, descriptions, effective dates, internal UUIDs and regimen_drugs. Do not expose composition/dose/frequency recommendations.

### drugs

Active `drugs`, code/name only, sorted by code. Exclude strength/dosage form for this contract.

### outcomeCodes

Active `treatment_outcome_codes`, code/name only, sorted by code.

### fixed TBCall workflow lists

`treatmentStatuses`
- PLANNED — Direncanakan
- ACTIVE — Aktif
- PAUSED — Dijeda
- TRANSFERRED — Dialihkan
- COMPLETED — Selesai
- STOPPED — Dihentikan
- CANCELLED — Dibatalkan

`staffDoseStatuses`
- TAKEN_OBSERVED — Diminum terobservasi
- TAKEN_SELF_REPORTED — Diminum berdasarkan laporan
- DISPENSED_HOME — Obat dibawa pulang
- MISSED — Tidak diminum
- UNKNOWN — Tidak diketahui

`administrationModes`
- DIRECTLY_OBSERVED — Diawasi langsung
- SELF_ADMINISTERED — Diminum mandiri
- OTHER — Lainnya

`followUpStatuses`
- SCHEDULED — Terjadwal
- COMPLETED — Selesai

These are TBCall workflow labels, not SITB physical/API codes.

Do not invent catalogs for treatmentPhase, doseUnit, oatForm, drugSource, followUpType, adherenceAssessment, adverse-event type/severity/action/outcome narrative.

## Clinical boundary

This endpoint must not infer regimen composition, dose, duration, treatment phase, eligibility, substitutions, resistance, follow-up schedules, adverse-event causality or final outcome.

The current treatment write services remain authoritative and unchanged.

## Existing behavior unchanged

Do not change TreatmentService, AdherenceService, FollowUpService, AdverseEventService, TreatmentAccess, ClinicalSourceAuthorityPolicy, treatment projections, patient/supporter routes, laboratory/referral/monitoring behavior, or frontend files.

The endpoint grants no treatment write scope.

## Tests

Backend baseline: 973.

Cover:
- TB_OFFICER + TREATMENT_READ success
- missing permission -> 403
- wrong role with artificial permission denied
- no active facility denied
- active TB_TREATMENT regimens only
- PREVENTIVE/inactive regimen excluded
- regimen projection only code/name/caseCategoryCode
- active drugs/outcomes only
- deterministic ordering
- exact fixed option code/order
- no composition/dose/effective-date leakage
- no audit side effect
- reference read does not grant treatment writes
- existing category-mismatch regimen validation unchanged
- inactive/unknown drug validation unchanged
- inactive/unknown outcome validation unchanged
- all previous tests green
- frontend unchanged

Run:

```powershell
.\mvnw.cmd clean test
```

## Documentation

Add:
- `docs/FRONTEND_TREATMENT_READ_CONTRACTS.md`
- `docs/PHASE5A_3_REPORT.md`
- `docs/architecture/TBCall_Backend_v1.5A.3_Frontend_F2C_Treatment_Reference.md`

Update root README only if useful.

After approval, F2C may implement staff treatment list/start/detail/update, dose evidence, follow-up schedule/complete, adverse-event create/update and final outcome.
