# F2D continuity read contracts — backend v1.5A.4

These five authenticated GETs prepare the later staff continuity frontend. They add no write scope, clinical recommendations, frontend screens or SITB networking. All fixed options below are TBCall workflow labels, not official SITB physical-schema/API codes.

## Authorization and errors

Every endpoint requires the explicit `TB_OFFICER` role and at least one active facility assignment. The existing session authorization resolver supplies active assignments only, and the existing officer gate checks the relevant permission. Artificial permissions on other roles do not grant access.

| GET under `/api/v1` | Additional permission/scope |
| --- | --- |
| `/cases/{caseId}/referral-preparation` | `REFERRAL_WRITE`; case current facility active and assigned |
| `/continuity-facilities` | `REFERRAL_WRITE` OR `CONTACT_WRITE` |
| `/referral-reference-data` | `REFERRAL_READ` |
| `/contact-reference-data` | `CONTACT_READ` |
| `/tpt-reference-data` | `TPT_READ` OR `TPT_WRITE` |

No `PATIENT_READ`, `CASE_READ`, `DIAGNOSIS_READ` or `TREATMENT_READ` dependency is introduced. For either OR gate, the service passes a permission the actor actually holds to the existing officer gate. Authentication failures use 401; role/permission/active-assignment failures use 403. Missing or out-of-scope cases use the existing indistinguishable 404. Invalid pagination/search/path/parameter values use existing safe problem responses, normally 400. Existing denial auditing remains; successful reads create no audit record.

## Referral preparation

`GET /api/v1/cases/{caseId}/referral-preparation` returns:

```text
{
  caseId: UUID,
  caseStatus: string,
  caseCategoryCode: string | null,
  sourceFacility: {id: UUID, name: string},
  preTreatmentDestination: {id: UUID, name: string} | null,
  openTreatment: {
    id: UUID, status: string, startDate: YYYY-MM-DD,
    plannedEndDate: YYYY-MM-DD | null,
    regimenCode: string | null, regimenName: string | null
  } | null,
  inFlightReferral: boolean
}
```

The destination comes only from the case's confirming diagnosis when its treatment disposition is `REFERRED` and its referred facility exists. A non-confirming diagnosis is never substituted. V11 already requires a target for a REFERRED diagnosis; the projection still handles absent diagnosis/target defensively. Destination data is not filtered to the caller's assignments or current catalog activity, because it represents the recorded diagnosis target.

Open treatment means only `PLANNED`, `ACTIVE` or `PAUSED`. V1's existing unique open-treatment index guarantees at most one. Terminal episodes are excluded; historical regimen name/code remains readable even when that catalog entry is inactive. Null regimen/end date does not remove the episode. `inFlightReferral` is true only for `SENT`/`RECEIVED` for this case.

This is a scalar, read-only projection: no call to `sendCase()`, row write lock, patient hydration, diagnosis prose, treatment notes/composition or side effect. No ETag is returned. It is advisory preparation, not a reservation or authorization to send: the existing send command remains authoritative for state, source authority, scope and concurrency.

## Continuity facility search

`GET /api/v1/continuity-facilities?page=0&size=20&query=...`

- `page`: default 0, non-negative.
- `size`: default 20, range 1–50.
- Page offset must fit a Java integer; overflowing offsets are rejected.
- `query`: optional. If supplied, trim it and require 2–255 characters. Empty/blank is invalid; omission means no name filter.
- Search is a case-insensitive name substring; `%`, `_` and the escape character `!` are literal input, never wildcard expansion.
- Global active facilities only, including destinations outside the actor's assignments; order by name then UUID.

```text
{
  content: [{id: UUID, name: string, facilityTypeCode: string | null,
             provinceCode: string | null, regencyCode: string | null}],
  page: integer, size: integer, totalElements: integer
}
```

No address, coordinates, parent internals, district/village/postal code, assignment list, versions or audit fields are exposed. Search visibility does not confer ownership or mutation scope. Existing referral/contact destination checks and case ownership remain unchanged.

## Fixed reference groups

Every option has exactly `{code,name}`. Lists use the following order.

### `/referral-reference-data`

`referralTypes`:

| Code | Name |
| --- | --- |
| PRE_TREATMENT_REFERRAL | Rujukan sebelum pengobatan |
| TREATMENT_TRANSFER | Alih pengobatan |

`referralStatuses`:

| Code | Name |
| --- | --- |
| DRAFT | Draf |
| SENT | Dikirim |
| RECEIVED | Diterima |
| REPORTED | Pasien dilaporkan datang |
| CANCELLED | Dibatalkan |
| RETURNED | Dikembalikan |

### `/contact-reference-data`

`workflowTypes`: `INTERNAL` — Internal; `INCOMING_REFERRAL` — Rujukan masuk; `OUTGOING_REFERRAL` — Rujukan keluar.

`creatableWorkflowTypes`: `INTERNAL` — Internal; `OUTGOING_REFERRAL` — Rujukan keluar. INCOMING_REFERRAL is available for display only.

`investigationStatuses`:

| Code | Name |
| --- | --- |
| NEW | Baru |
| SENT | Dikirim |
| RECEIVED | Diterima |
| IN_PROGRESS | Sedang diinvestigasi |
| COMPLETED | Selesai |
| RETURNED | Dikembalikan |
| CANCELLED | Dibatalkan |

### `/tpt-reference-data`

`preventiveRegimens`: live active `PREVENTIVE` regimens with a non-null case category, ordered category then code. Each has exactly `{code,name,caseCategoryCode}`. Excludes TB_TREATMENT, inactive and null-category entries. No UUIDs, descriptions, effective dates, regimen-drug composition, dose, frequency or duration guidance. There is no effective-date filtering or inferred eligibility. Existing TPT write validation remains authoritative.

`tptStatuses`:

| Code | Name |
| --- | --- |
| PLANNED | Direncanakan |
| ACTIVE | Aktif |
| COMPLETED | Selesai |
| STOPPED | Dihentikan |
| LOST_TO_FOLLOW_UP | Putus tindak lanjut |
| CANCELLED | Dibatalkan |

`durationUnits`: `DAY` — Hari; `WEEK` — Minggu; `MONTH` — Bulan.

## Boundaries

V1–V17, frontend, existing referral/query/contact/investigation/TPT services, exact contact-patient linking, source-authority and ownership rules remain unchanged. No new write endpoint, table, migration, generic directory permission, reference composition or success read audit is introduced. F2D UI is a separate checkpoint. No missing backend contract was identified in this checkpoint.
