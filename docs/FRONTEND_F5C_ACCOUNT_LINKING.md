# Frontend F5C — officer account linking

Approved backend base: `a7e4233576f3e89e5a19f5146b60bd4c18829029`. Architecture: [TBCall Frontend v1.8](architecture/TBCall_Frontend_v1.8_F5C_Account_Linking.md). These are TBCall contracts, not an official SITB database or API specification.

## Screens and permissions

The existing `/patients/[patientId]` detail embeds **Akun pasien** only for `TB_OFFICER` with `PATIENT_LINK_VERIFY`. Its host still independently requires `PATIENT_READ`. The existing `/cases/[caseId]` embeds **Pendamping kasus** only for `TB_OFFICER` with `SUPPORTER_LINK_MANAGE`; its host independently requires `CASE_READ`. Mixed roles need the same exact grants. Frontend gates supplement the backend's facility, historical-patient, lifecycle and active-supporter checks.

Existing clinical queries, editing, route boundaries and navigation remain intact. There is no new global directory, frontend route, account UUID input, admin role action or portal mutation.

## Patient workflow

1. Read scoped current VERIFIED SELF state. A current owner displays its masked account and offers explicit revocation; prospective linking is available only when no owner is present.
2. Enter exact verified login email/phone and explicitly choose **Cari akun terverifikasi**. Input is cleared when submitted, cancelled or context changes. Typing triggers no request. Resolution displays only the returned matched masked channel.
3. Review the candidate and tick the initially unchecked officer acknowledgement. This manual UI step is not a consent document, proof of identity or stored legal attestation.
4. **Periksa tautan pasien** obtains fresh current state and the exact candidate pair. A current VERIFIED owner blocks linking. REJECTED/VERIFIED pairs block; PENDING/REVOKED require their own GET ETag; absent pairs send no If-Match.
5. A separate confirmation re-reads both states immediately before POST. A changed ID, state or ETag ends the confirmation and requires manual review. With unchanged state the request uses only `{userId}` and the actual pair GET ETag where applicable.
6. Revocation prepares a fresh current GET, asks confirmation, re-reads and compares the whole reviewed state, then calls the identity-bound DELETE using the actual **link ID and GET ETag**. Equal-version owner replacements cannot be revoked using an earlier review. The legacy DELETE is never called.
7. Success re-reads current state and clears candidate/acknowledgement. If the changed target is the acting user, `/me` is refreshed. Other browsers see new roles/links on their next backend request; no remote-tab push is claimed.

## Supporter workflow

Roster paging (20 per page) is local component state. Names/contact masks appear within authorized case content. Selecting a row separately reads supporter detail and its authoritative ETag. Inactive records remain visible with no account mutation controls.

The explicit create form validates PMO/COMPANION, a trimmed nonblank name up to 255 characters and optional contact phone up to 30. Only these fields are sent. Contact phone is not a verified login claim. Confirmed creation refreshes the roster and selects the new record; its independent detail GET supplies every subsequent write precondition, never the creation response ETag.

Active supporters on ACTIVE/REFERRED cases offer a separate exact-login resolver and unchecked acknowledgement. Preparation reads current detail. Confirmation reads it again and compares identity, record state and actual ETag before link/replace/unlink. Replacement additionally requires explicit acknowledgement that the previous account may lose supporter access if it has no other active links. Unlink has its own confirmation. The backend owns all role assignment/last-link cleanup.

TRANSFERRED/COMPLETED/CLOSED/CANCELLED cases offer read and authorized active-supporter unlink cleanup only. No create/resolve/link/replacement or unsupported record edit/deactivate/delete/reactivation is offered.

## API contracts used

Paths below are relative to `/api/v1` and go through existing same-origin `/api/tbcall/v1` proxy, cookie session and CSRF handling.

| Method | Path | Input / precondition |
|---|---|---|
| POST | `/patients/{patientId}/account-link/resolve-user` | `{identity}` |
| GET | `/patients/{patientId}/account-link` | Current state; actual link ETag when present |
| GET | `/patients/{patientId}/account-link/precondition?userId={candidateId}` | Candidate ID exclusively from successful resolver; actual historical pair ETag |
| POST | `/patients/{patientId}/account-link` | `{userId}`; pair GET If-Match only when pair exists |
| DELETE | `/patients/{patientId}/account-links/{linkId}` | Current GET link ID and If-Match |
| GET | `/cases/{caseId}/supporters?page={page}&size=20` | Scoped roster |
| POST | `/cases/{caseId}/supporters` | `{supporterType,fullName,phone?}` |
| GET | `/cases/{caseId}/supporters/{supporterId}` | Detail with actual row ETag |
| POST | `/cases/{caseId}/supporters/{supporterId}/account-link/resolve-user` | `{identity}` |
| POST | `/cases/{caseId}/supporters/{supporterId}/account-link` | `{userId}` and fresh detail GET If-Match |
| DELETE | `/cases/{caseId}/supporters/{supporterId}/account-link` | Fresh detail GET If-Match |

All projections and nested objects are strict Zod schemas. Unknown fields, unmasked identities and wrong-context GET records fail closed. Required GET ETags must be quoted numeric backend headers. No list, patient/case version or mutation response supplies a write ETag.

## Failure, concurrency and privacy

Commands run once with no automatic retry, replay or polling. Neutral resolver 404 does not reveal whether an unverified account exists; 429 requests manual waiting. 409 closes preparation, resets acknowledgement and re-reads state without replay. 428/CSRF/invalid-response/authority/network errors use safe local Indonesian text rather than backend prose. Existing session handling refreshes CSRF without replay.

Uncertain creation (network/5xx/invalid response) blocks further creation until a successful explicit roster refresh/check; duplicate supporter records are possible. SOURCE_AUTHORITY_CONFLICT locks creation across cancel, form edits and supporter selection until the actual case/session context changes. It never switches API or bypasses authority.

Each workspace remounts on the complete `/me` snapshot and patient/case context; supporter selection remounts its account workspace. Commands independently compare the complete captured snapshot against live session cache, abort on mismatch/unmount and check that guard between dependent reads/writes and callbacks. Related reads consume AbortSignal, and unmounted context queries are cancelled/removed. Read keys begin `['account-linking', userId, opaqueMountContext, ...resourceIds]`; the opaque context carries no identity or session PII. Raw resolver input and candidates stay only in mounted local state/command closures; commands do not enter TanStack mutation history.

No identity/link data is written to browser storage, history, metadata, global navigation, logs or analytics. Candidate IDs appear only in approved backend request bodies and the exact pair GET query. No target-browser refresh, consent recording, role API, clinical inference or SITB network activity is introduced.

## Next checkpoint

F6 remains separate: real-backend end-to-end/security/deployment verification with provisioned seven-role synthetic actors. Participating facilities must approve a real-person identity/consent SOP before deployment. There is no missing backend contract identified for F5C.
