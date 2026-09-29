# V2 reference data provenance

All `code` values in `V2__reference_data.sql` are **TBCall canonical codes inferred from displayed concepts in the 2021 SITB user manual**. The manual does not specify SITB physical database names, IDs, enum values, or API codes. The `name` column preserves a concise Indonesian display term from the manual, with expansions of TB SO/RO for clarity.

| TBCall tables | Manual evidence |
|---|---|
| `facility_types` | Facility types listed in report filters, section 3.16 (manual printed page around 252) |
| `sex_codes` | Laki-laki / Perempuan in the staff registration guide (printed page 270); patient identity asks for sex (page 49) |
| `tb_suspect_types`, `tb_case_categories` | Terduga TB SO/RO and patient TB SO/RO workflows, sections 3.9–3.11 |
| `anatomical_sites`, `diagnosis_types`, `previous_treatment_categories` | Explicit choices in TB SO and TB RO registration guidance (printed pages 114–115 and 167–168) |
| `hiv_statuses`, `dm_statuses` | Explicit choices in terduga registration guidance (printed page 50) |
| `pregnancy_statuses`, `bcg_statuses` | Explicit choices in TB case guidance (printed pages 114–115) |
| `lab_test_types`, `lab_request_reasons` | Examination types in section 3.9.4 (printed page around 66); diagnosis and follow-up request reasons in section 3.9.5 |
| `treatment_outcome_codes` | Gagal, Meninggal, Putus berobat listed as final outcome choices (printed pages 129 and 181) |

V2 deliberately leaves `roles`, `permissions`, `regimens`, `drugs`, `external_systems`, and patient/episode records empty. Their operational definitions or concrete records need a separate approved source or later application-layer decision. TBCall workflow `CHECK` values are already defined by V1 and are not claimed to be SITB codes.
