# TBCall Backend v1.5A.4 — Frontend F2D Continuity Read Contracts

Base commit: `e55f769e60184013f7fb61a85bbfc5b2679ba153`

This is a narrow read-contract checkpoint before F2D referral/transfer + contact investigation + TPT frontend. Do not modify V1–V17 or add V18.

## Why

F2D still lacks safe browser contracts for:
1. referral send preparation without unrelated CASE_READ/DIAGNOSIS_READ/TREATMENT_READ dependencies or manual UUID entry;
2. global active-facility destination search for REFERRAL_WRITE / CONTACT_WRITE without PATIENT_READ;
3. live PREVENTIVE regimen catalog for TPT;
4. server-owned fixed workflow/status labels.

## Endpoints

### 1. GET `/api/v1/cases/{caseId}/referral-preparation`

Authorization:
- TB_OFFICER
- REFERRAL_WRITE
- case current facility active and assigned

Do not require CASE_READ, DIAGNOSIS_READ, TREATMENT_READ or PATIENT_READ.
Use a read-only access path; do not call the write-locking sendCase() method.

Projection:
- caseId
- caseStatus
- caseCategoryCode
- sourceFacility {id,name}
- preTreatmentDestination {id,name} | null
- openTreatment {id,status,startDate,plannedEndDate,regimenCode,regimenName} | null
- inFlightReferral boolean

Rules:
- preTreatmentDestination only from confirming diagnosis when treatmentDisposition=REFERRED and referred facility exists
- openTreatment is current PLANNED/ACTIVE/PAUSED episode if present
- inFlightReferral true for SENT/RECEIVED
- no patient identity or diagnosis prose
- no ETag; send remains authoritative

### 2. GET `/api/v1/continuity-facilities`

Authorization:
- TB_OFFICER
- active facility assignment
- REFERRAL_WRITE OR CONTACT_WRITE

Parameters:
- page default 0
- size default 20, max 50
- query optional, trimmed, length 2..255 when supplied

Return active facilities only:
- id
- name
- facilityTypeCode
- provinceCode
- regencyCode

Case-insensitive name substring, literal wildcard escaping, order name then id.

No address, coordinates, parent internals, assignments or audit data. Visibility grants no mutation scope.

### 3. GET `/api/v1/referral-reference-data`

Authorization:
- TB_OFFICER + REFERRAL_READ
- active assignment

Return:

referralTypes:
- PRE_TREATMENT_REFERRAL — Rujukan sebelum pengobatan
- TREATMENT_TRANSFER — Alih pengobatan

referralStatuses:
- DRAFT — Draf
- SENT — Dikirim
- RECEIVED — Diterima
- REPORTED — Pasien dilaporkan datang
- CANCELLED — Dibatalkan
- RETURNED — Dikembalikan

### 4. GET `/api/v1/contact-reference-data`

Authorization:
- TB_OFFICER + CONTACT_READ
- active assignment

Return:

workflowTypes:
- INTERNAL — Internal
- INCOMING_REFERRAL — Rujukan masuk
- OUTGOING_REFERRAL — Rujukan keluar

creatableWorkflowTypes:
- INTERNAL — Internal
- OUTGOING_REFERRAL — Rujukan keluar

investigationStatuses:
- NEW — Baru
- SENT — Dikirim
- RECEIVED — Diterima
- IN_PROGRESS — Sedang diinvestigasi
- COMPLETED — Selesai
- RETURNED — Dikembalikan
- CANCELLED — Dibatalkan

### 5. GET `/api/v1/tpt-reference-data`

Authorization:
- TB_OFFICER
- active assignment
- TPT_READ OR TPT_WRITE

Reuse existing officer semantics by selecting a relevant permission the actor actually holds.

Return preventiveRegimens:
- active regimens only
- regimenKind=PREVENTIVE
- non-null case category
- fields code/name/caseCategoryCode
- order category then code

Exclude TB_TREATMENT, inactive/null-category, description/effective dates/regimen_drugs/composition/dose/duration guidance.

tptStatuses:
- PLANNED — Direncanakan
- ACTIVE — Aktif
- COMPLETED — Selesai
- STOPPED — Dihentikan
- LOST_TO_FOLLOW_UP — Putus tindak lanjut
- CANCELLED — Dibatalkan

durationUnits:
- DAY — Hari
- WEEK — Minggu
- MONTH — Bulan

All fixed labels are TBCall workflow labels, not SITB physical/API codes.

## Existing behavior unchanged

Do not change ReferralService/ReferralQueryService, ContactService, InvestigationService, TptService, exact contact-patient linking, source-authority policies, ownership rules, monitoring, or frontend files.

No new write endpoints. No success read audits.

## Tests

Backend baseline: 998.

Cover:
- referral preparation works with REFERRAL_WRITE without unrelated read permissions
- wrong role/out-of-scope isolation
- correct pre-treatment destination, open treatment and in-flight flag
- no patient/diagnosis prose and no side effects
- continuity facility REFERRAL_WRITE-only and CONTACT_WRITE-only access
- active-only/pagination/query/wildcard/safe projection
- facility visibility does not grant write scope
- exact referral/contact labels
- contact creatable list excludes INCOMING_REFERRAL while display list includes it
- TPT_READ-only and TPT_WRITE-only access
- active PREVENTIVE non-null-category only
- TB_TREATMENT/inactive/null-category exclusion
- exact TPT statuses/duration units
- no regimen composition/dose leakage
- no audit/write-scope expansion
- all previous 998 backend tests green
- frontend byte-for-byte unchanged

Run:

```powershell
.\mvnw.cmd clean test
```

## Documentation

Add:
- `docs/FRONTEND_CONTINUITY_READ_CONTRACTS.md`
- `docs/PHASE5A_4_REPORT.md`
- `docs/architecture/TBCall_Backend_v1.5A.4_Frontend_F2D_Continuity_Read_Contracts.md`

Update README only if useful.

After approval, F2D may implement referral queues/transitions, contacts, contact investigations and TPT.
