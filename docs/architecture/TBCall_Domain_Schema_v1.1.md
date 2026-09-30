# TBCall Domain / Schema v1.1

Status: Architecture specification for the next implementation checkpoint.

Repository baseline: `savitar393/TBCall`, `main`, persistence foundation commit `c173f11` plus later housekeeping commit(s).

## 1. Governing principles

1. `V1__initial_schema.sql` and `V2__reference_data.sql` are immutable historical migrations.
2. The 2021 SITB manual is the primary reference for SITB workflow, module boundaries, data-entry concepts, and future interoperability shape.
3. Newer national technical guidance takes precedence for current clinical terminology and treatment/reference semantics:
   - Penatalaksanaan TB Sensitif Obat di Indonesia, 2025.
   - Penatalaksanaan TBC Resistan Obat di Indonesia, 2024.
   - Tata Laksana Tuberkulosis Anak dan Remaja, 2023.
   - Tuberkulosis dengan Komorbid, 2025.
4. TBCall canonical codes are not claimed to be official SITB API/database codes.
5. SITB/external identifiers never replace TBCall UUID primary keys.
6. User accounts remain separate from patient records.
7. Clinical/reference vocabulary is configurable data, not Java/PostgreSQL enums, unless the value is a stable internal workflow state.

## 2. Language and terminology policy

### Indonesian

Use Indonesian for:
- UI labels and navigation.
- Forms and field labels.
- Patient-facing validation/errors.
- Notifications/reminders.
- Reports and printable forms.
- Clinical/reference display names.
- OpenAPI summaries/descriptions intended for Indonesian implementers.
- Role names shown in the application.
- Official program terms and acronyms where meaningful: NIK, BPJS, SITB, TBC, TBC SO, TBC RO, OAT, TPT, PMO, fasyankes.

Use SITB/Kemenkes wording instead of inventing synonyms when the official term exists.

Preferred TBCall UI terminology:
- Terduga TBC
- Pasien TBC
- TBC Sensitif Obat (TBC SO)
- TBC Resistan Obat (TBC RO)
- Lokasi Anatomi
- Terkonfirmasi Bakteriologis
- Terdiagnosis Klinis
- Paduan Pengobatan
- Hasil Akhir Pengobatan
- Investigasi Kontak
- Terapi Pencegahan Tuberkulosis (TPT)
- Pengawas Menelan Obat (PMO)
- Fasilitas Pelayanan Kesehatan (Fasyankes)

### English

Use English for:
- SQL table/column names.
- Java class, method, package and ordinary variable names.
- JSON/API property names.
- infrastructure configuration.
- technical logs.
- internal developer comments where no official domain wording is required.

Examples:
- Java `TreatmentOutcome`
- SQL `treatment_outcomes`
- JSON `outcomeCode`
- code `PENGOBATAN_LENGKAP`
- display `Pengobatan Lengkap`

Existing Indonesian canonical reference codes such as `LAKI_LAKI`, `PARU`, and `GAGAL` may remain. Stable internal application state-machine values such as `ACTIVE`, `COMPLETED`, and `CANCELLED` remain English.

For UI consistency, TBCall uses `TBC` in operational labels that mirror SITB. Exact official document titles and quoted terminology remain unchanged.

## 3. Migration plan

Do not rewrite V1 or V2.

### V3__align_reference_data_with_current_guidelines.sql

#### Treatment outcomes

Keep existing stable codes:
- `GAGAL` -> rename display to `Gagal Pengobatan`.
- `MENINGGAL`
- `PUTUS_BEROBAT`

Add:
- `SEMBUH` -> `Sembuh`
- `PENGOBATAN_LENGKAP` -> `Pengobatan Lengkap`
- `TIDAK_DAPAT_DIEVALUASI` -> `Tidak Dapat Dievaluasi`

Do not add `BERHASIL_DIOBATI` as an individual final outcome. It is derived as `SEMBUH + PENGOBATAN_LENGKAP`.

#### Previous treatment history

Keep active:
- `BARU`
- `KAMBUH`

Add:
- `RIWAYAT_PENGOBATAN_SEBELUMNYA` -> `Riwayat Pengobatan TBC Sebelumnya`

Retain but deactivate as legacy SITB-2021-derived values:
- `SETELAH_GAGAL_KAT_1`
- `SETELAH_GAGAL_KAT_2`
- `SETELAH_PUTUS_BEROBAT`
- `HASIL_SEBELUMNYA_TIDAK_DIKETAHUI`
- `SETELAH_GAGAL_LINI_2`
- `LAIN_LAIN`

`TIDAK_DIKETAHUI` may remain active as a TBCall data-quality/import fallback, but it is not a current clinical classification.

#### Laboratory test catalog

Keep existing:
- `MIKROSKOPIS_BTA`
- `TCM`
- `BIAKAN`
- `UJI_KEPEKAAN`
- `LPA_LINI_DUA`

Add:
- `LPA_LINI_SATU` -> `LPA lini satu`
- `TCM_XDR` -> `TCM XDR`
- `RONTGEN_TORAKS` -> `Rontgen toraks`
- `HIV` -> `Pemeriksaan HIV`

Do not over-model test-specific result enums yet. Result interpretation belongs to later laboratory-domain rules.

#### Display terminology cleanup

Where only the display value changes, preserve the code:
- use `TBC` instead of `TB` for SITB-aligned operational display labels.
- `PRAKTEK_DOKTER_MANDIRI` code remains unchanged; display becomes `Praktik dokter mandiri`.

### V4__clinical_model_extensions.sql

#### Drug-resistance classification

Add:

`drug_resistance_patterns`
- `code varchar(...) primary key`
- `name`
- `description`
- `active`

Seed:
- `TB_SO` -> `TBC Sensitif Obat (TBC SO)`
- `TB_HR` -> `TBC Sensitif Rifampisin, Resistan Isoniazid (TBC Hr)`
- `TB_RR` -> `TBC Resistan Rifampisin (TBC RR)`
- `TB_MDR` -> `TBC Multidrug-Resistant (TBC MDR)`
- `TB_PRE_XDR` -> `TBC Pre-Extensively Drug-Resistant (TBC pre-XDR)`
- `TB_XDR` -> `TBC Extensively Drug-Resistant (TBC XDR)`

Add nullable `drug_resistance_pattern_code` to `tb_cases` with FK to this table.

`tb_case_categories` remains the coarse program track (`TB_SO` / `TB_RO`); drug-resistance pattern is the precise clinical subtype.

#### Additional comorbidity/risk-factor observations

Keep existing dedicated `hiv_status_code` and `dm_status_code` because they are explicit SITB concepts.

Add reference table `additional_condition_types`:
- `KURANG_GIZI`
- `MEROKOK`
- `TERPAPAR_ASAP_ROKOK`
- `GANGGUAN_KESEHATAN_MENTAL`
- `HEPATITIS`
- `PENYAKIT_PERNAPASAN_KRONIS`
- `GANGGUAN_GINJAL`
- `GANGGUAN_IMUNITAS_LAIN`
- `COVID_19`

Add `case_condition_observations`:
- `id UUID PK`
- `case_id UUID FK NOT NULL`
- `condition_type_code FK NOT NULL`
- `status_code` constrained to `PRESENT`, `ABSENT`, `UNKNOWN`
- `classification_code varchar(...) NULL`
- `observed_at timestamptz NOT NULL`
- `source varchar(...)` such as `SITB`, `TBCALL`, `IMPORT`
- `notes text`
- timestamps

This is an observation/history table, not one mutable boolean row. `classification_code` can preserve child/adult nutritional classification or future condition-specific classifications without redesigning the table.

Do not duplicate HIV/DM in this table in v1.1.

### V5__clinical_catalogs.sql

Seed canonical drug records. No dosing engine is implemented in this phase.

Minimum drug catalog:
- `H` Isoniazid
- `R` Rifampisin
- `Z` Pirazinamid
- `E` Etambutol
- `P` Rifapentine
- `MFX` Moksifloksasin
- `LFX` Levofloksasin
- `BDQ` Bedaquiline
- `PA` Pretomanid
- `LZD` Linezolid
- `CFZ` Clofazimine
- `CS` Sikloserin
- `TRD` Terizidone
- `DLM` Delamanid
- `ETO` Etionamid
- `PTO` Protionamid
- `PAS` P-aminosalicylic acid
- `IPM_CLN` Imipenem-cilastatin
- `MPM` Meropenem
- `AMK` Amikasin
- `S` Streptomisin

Minimum regimen catalog:
- `SO_6M_2HRZE_4HR` -> `Paduan OAT SO 6 bulan (2HRZE/4HR)`
- `SO_4M_2HPMZ_2HPM` -> `Paduan OAT SO 4 bulan (2HPMZ/2HPM)`
- `SO_CHILD_6M_2RHZ_4RH` -> `Paduan anak 2RHZ/4RH`
- `SO_CHILD_6M_2RHZE_4RH` -> `Paduan anak/remaja 2RHZE/4RH`
- `SO_CHILD_12M_2RHZE_10RH` -> `Paduan anak 2RHZE/10RH`
- `SO_CHILD_4M_2RHZ_2RH` -> `Paduan jangka pendek anak 2RHZ/2RH`
- `RO_HR_6RZE_LFX` -> `Paduan TBC Hr 6 RZE-Lfx`
- `RO_BPALM` -> `Paduan BPaLM`
- `RO_BPAL` -> `Paduan BPaL`
- `RO_9M_ETO` -> `Paduan TBC RO 9 bulan variasi etionamid`
- `RO_9M_LZD` -> `Paduan TBC RO 9 bulan variasi linezolid`
- `RO_LONG_INDIVIDUAL` -> `Paduan TBC RO jangka panjang/individual`

For individualized RO regimens, do not pretend there is one fixed composition.

Do not implement automated eligibility, dose calculation, or clinical decision support in this migration. Those are later service-layer rules and require explicit clinical validation.

### V6__relational_integrity.sql

Enforce important cross-row invariants in PostgreSQL and again in services.

#### Database-enforced

1. `tb_cases.confirming_diagnosis_id` must reference a diagnosis belonging to the same `registration_id`.
   - add `UNIQUE (id, registration_id)` to `diagnoses`
   - add composite FK from `(confirming_diagnosis_id, registration_id)`.

2. `lab_results.specimen_id`, when present, must reference a specimen from the same `lab_request` as `lab_request_test_id`.
   - use a PostgreSQL validation trigger.

3. `referrals.treatment_id`, when present, must belong to `referrals.case_id`.
   - validation trigger.

4. `preventive_treatments.contact_id` + `index_case_id`, when both present, must match the contact's `index_case_id`.
   - validation trigger.

5. `alerts` lineage:
   - supplied `case_id` must belong to `patient_id`;
   - supplied `treatment_id` must belong to that case/patient;
   - validation trigger.

6. `treatment_outcomes.outcome_date` may not precede the treatment `start_date`.
   - validation trigger.

All validation functions should raise clear PostgreSQL exceptions and have integration tests demonstrating both accepted and rejected rows.

#### Service-enforced

Do not attempt to solve these with polymorphic DB constraints:
- `patient_user_links` with `SELF` require successful identity/link verification.
- external identifier polymorphic target validity.
- monitoring-event polymorphic source validity.
- permitted state transitions.
- referral acceptance/transfer workflow.
- whether SITB-sourced data may be edited locally.
- regimen eligibility.
- dosage.
- interpretation of laboratory results.
- outcome derivation.
- user field-level visibility.

## 4. RBAC v1

Role codes remain technical; role display names are Indonesian.

### Roles

- `PATIENT` — Pasien
- `TREATMENT_SUPPORTER` — Pendamping Pengobatan / PMO
- `TB_OFFICER` — Petugas TBC
- `LAB_STAFF` — Petugas Laboratorium
- `FACILITY_ADMIN` — Administrator Fasyankes
- `PROGRAM_MONITOR` — Pengelola / Pemantau Program TBC
- `SYSTEM_ADMIN` — Administrator Sistem

TBCall intentionally does not recreate every SITB user category. SITB's roles are used as evidence for separation of responsibilities, not copied one-for-one.

### Core permissions

- `PATIENT_READ`
- `PATIENT_CREATE`
- `PATIENT_UPDATE`
- `REGISTRATION_READ`
- `REGISTRATION_WRITE`
- `DIAGNOSIS_READ`
- `DIAGNOSIS_WRITE`
- `CASE_READ`
- `CASE_WRITE`
- `LAB_REQUEST_READ`
- `LAB_REQUEST_WRITE`
- `LAB_RESULT_READ`
- `LAB_RESULT_WRITE`
- `TREATMENT_READ`
- `TREATMENT_WRITE`
- `ADHERENCE_READ`
- `ADHERENCE_RECORD`
- `FOLLOW_UP_READ`
- `FOLLOW_UP_WRITE`
- `OUTCOME_READ`
- `OUTCOME_WRITE`
- `CONTACT_READ`
- `CONTACT_WRITE`
- `TPT_READ`
- `TPT_WRITE`
- `ADVERSE_EVENT_READ`
- `ADVERSE_EVENT_WRITE`
- `REFERRAL_READ`
- `REFERRAL_WRITE`
- `MONITORING_READ`
- `MONITORING_MANAGE`
- `ALERT_READ`
- `ALERT_ACKNOWLEDGE`
- `ALERT_RESOLVE`
- `NOTIFICATION_READ_SELF`
- `USER_MANAGE_FACILITY`
- `FACILITY_MANAGE`
- `ROLE_MANAGE`
- `AUDIT_READ`
- `REPORT_READ`
- `INTEGRATION_MANAGE`

### Access matrix

| Capability | Patient | PMO | Petugas TBC | Lab | Fasyankes Admin | Program Monitor | System Admin |
|---|---:|---:|---:|---:|---:|---:|---:|
| Own/linked monitoring view | Yes, self | Yes, linked | Yes, facility | Limited | No by default | Aggregated | No by default |
| Clinical patient/case read | Self | Limited | Facility scope | Minimum necessary | No by default | Aggregated/read-only later | No by default |
| Create/update patient/registration/case | No | No | Yes | No | No | No | No |
| Diagnosis write | No | No | Yes | No | No | No | No |
| Lab request | No | No | Yes | Read | No | No | No |
| Lab result write/finalize | No | No | No | Yes | No | No | No |
| Treatment/outcome write | No | No | Yes | No | No | No | No |
| Record adherence | Self-report | Linked patient | Yes | No | No | No | No |
| Follow-up/monitoring manage | No | No | Yes | No | No | No | No |
| Alert acknowledge | Own | Linked | Yes | Lab-related later | No | No | No |
| Alert resolve | No | No | Yes | Lab-related later | No | No | No |
| Manage facility users | No | No | No | No | Yes | No | System-wide |
| Audit | No | No | No | No | Facility | Read-only authorized | System |
| Integration | No | No | No | No | No | No | Yes |
| Reports | Own summary | No | Facility | Lab operational | Facility | Yes | Operational only |

Important:
- authorization always combines permission + scope;
- `user_facilities` scopes facility users;
- patient and supporter scopes come from verified links;
- `SYSTEM_ADMIN` does not automatically receive clinical data access;
- `FACILITY_ADMIN` does not automatically become a clinician;
- `PROGRAM_MONITOR` is report-oriented until a separate regional-scope model is approved.

### Field-level restriction

PMO/supporter access must not automatically reveal sensitive fields such as HIV/DM or unrelated laboratory/diagnostic detail. A supporter sees only the monitoring/treatment information necessary for the assigned support relationship.

## 5. Source authority / editability

Prototype mode:
- local/synthetic clinical data may be entered by authorized staff.

Future SITB-connected mode:
- SITB-sourced clinical/program fields are authoritative unless the integration contract explicitly permits write-back;
- TBCall-owned monitoring, adherence, user, alert and notification data remain writable in TBCall;
- source metadata determines whether a clinical field is locally editable.

This policy should be enforced in services, not through separate duplicate tables.

## 6. Next implementation checkpoint

Codex should implement only:
- V3 through V7 migrations;
- new JPA entities/repositories required by V4;
- mapping updates for `TBCase`;
- persistence tests for new catalogs and integrity constraints;
- RBAC seed data;
- terminology/provenance documentation updates.

Do not add controllers, services, authentication implementation, frontend, SITB network integration, or clinical automation in this checkpoint.

`mvn clean test` must pass on a fresh PostgreSQL Testcontainer.
