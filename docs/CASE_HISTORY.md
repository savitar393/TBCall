# Completed-case history

Authorized TB officers can open **Riwayat kasus selesai** from the main
navigation or patient worklist, then **Buka kasus selesai → Pengobatan →
Buka pengobatan**. Treatment navigation independently requires
`TREATMENT_READ`. The ordinary patient worklist retains its existing active
registration and ACTIVE/REFERRED case scope.

## Read contract

`GET /api/v1/cases/history`

Requires the existing `TB_OFFICER` role, `CASE_READ`, and active facility
assignments. Only `COMPLETED` cases whose **current responsible facility**
is an assigned active facility are discoverable. Previous registration
ownership and referral participation do not grant full-case access.
Existing referral-history contracts are unchanged.

Accepted filters: `page` (default 0), `size` (default 20, maximum 50), `name`
(optional, 3–255 characters after trimming), `facilityId` (optional, assigned
facility only). Unknown filters are rejected; foreign facility selection
returns 404. Name matching treats wildcard characters literally. Ordering
is confirmation timestamp descending, nulls last, then case UUID.

The page contains `content`, `page`, `size`, `totalElements`. Each item has
`patientId`, `fullName`, `confirmedAt`, and the existing `CaseListSummary`
as `tbCase`. It contains no NIK, BPJS, phone, address, diagnosis prose,
HIV/DM status, source identifiers, or account details. Each case is a
separate result, including multiple completed episodes for one patient.

List versions are informational. Case and treatment details still obtain
their own authoritative GET ETags; history creates no mutation contract.
Search values remain in component/query state, not the browser address or
persistent storage. Session boundaries and abortable, user-scoped query
keys use existing application protections.

Completed case details hide case editing, referral creation and laboratory
creation. Existing terminal treatment-start, dose-entry and outcome gates
remain in force. Patient demographic reads/updates are not expanded to
completed-only patients; their case heading is text rather than a link to
the active-only patient-detail contract.

## Verification boundary

Local MVC/service and frontend jsdom tests cover read gates, projection,
bounded filters, history navigation and terminal behavior. PostgreSQL
regressions are included in `ClinicalIntakeIntegrationTest`. Running those
or a real-stack browser journey requires separately authorized disposable
resources. Existing migrations and E2E acceptance/security locks are unchanged.
