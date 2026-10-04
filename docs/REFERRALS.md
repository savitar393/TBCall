# Referrals and transfer continuity — Phase 4A

Contract: [approved v1.4A architecture](architecture/TBCall_Application_API_v1.4A_Phase4A_Referral_Transfer.md). All identifiers/statuses are TBCall canonical values, not official SITB database/API fields.

## Migration

V1–V12 remain immutable. `V13__referral_continuity_support.sql` adds only:

- `uq_referrals_one_inflight_per_case(case_id)` where status is SENT or RECEIVED;
- `idx_referrals_source_status(source_facility_id,status,sent_at DESC)`;
- nullable text `referrals.return_reason`, mapped by `Referral.returnReason`.

Terminal referral history remains intact and allows a subsequent in-flight referral. Existing inconsistent duplicate in-flight records cause migration failure and need explicit reconciliation; the migration does not silently repair history.

## Routes

All routes are under `/api/v1`. Session authentication and CSRF apply. TB_OFFICER plus REFERRAL_READ/REFERRAL_WRITE and an active facility assignment are required. Other roles have no bypass.

| Method | Route | Permission and scope |
|---|---|---|
| POST | `/cases/{caseId}/referrals` | REFERRAL_WRITE, case's current source facility |
| GET | `/referrals/incoming` | REFERRAL_READ, recorded destination |
| GET | `/referrals/outgoing` | REFERRAL_READ, recorded source |
| GET | `/referrals/{referralId}` | REFERRAL_READ, recorded source or destination |
| POST | `/referrals/{referralId}/receive` | REFERRAL_WRITE, destination, SENT |
| POST | `/referrals/{referralId}/return` | REFERRAL_WRITE, destination, RECEIVED |
| POST | `/referrals/{referralId}/cancel` | REFERRAL_WRITE, source, SENT |
| POST | `/referrals/{referralId}/report` | REFERRAL_WRITE, destination, RECEIVED |

Send returns 201; transitions and reads return 200. Detail/send/transition responses include the current referral ETag. Each existing-referral transition requires the referral's quoted numeric If-Match (428 absent, 400 malformed, 409 stale).

Incoming/outgoing default to page 0, size 20, maximum 50; invalid/overflow offsets return 400. Ordering is sentAt then id descending. Immutable referral facility scope permits both sides to read the handoff after clinical ownership moves. Missing/out-of-scope resources return 404; missing officer role/permission/active assignment returns 403.

## Inputs and transitions

Send accepts referralType, destinationFacilityId, optional treatmentId and notes. Source, status and sentAt are server-derived; unsupported input fields are rejected. Destination must exist, be active and differ from source.

| Mode | Send prerequisites | Send effect | Destination report effect | Return/cancel effect |
|---|---|---|---|---|
| PRE_TREATMENT_REFERRAL | REFERRED case, no PLANNED/ACTIVE/PAUSED treatment, no supplied treatmentId, confirming diagnosis disposition REFERRED and matching referred-to destination | SENT; case stays REFERRED at source | REPORTED; same case becomes ACTIVE at destination | Case stays REFERRED at source |
| TREATMENT_TRANSFER | ACTIVE case, supplied ACTIVE treatment from that case/current source, no outcome | SENT; case becomes REFERRED; treatment stays ACTIVE at source | REPORTED; same case and same ACTIVE treatment move to destination; case becomes ACTIVE | Case becomes ACTIVE at source; treatment remains ACTIVE at source |

Receive sets RECEIVED and receivedAt without changing ownership. receivedAt is optional/default Clock now and must be between sentAt and now. Optional receive notes preserve existing notes when omitted or null and replace them when non-null text is supplied (blank supplied notes clear them).

Return requires nonblank returnReason. Cancel requires nonblank cancelReason and derives cancelledAt from Clock. A RECEIVED referral cannot be source-cancelled. Report accepts optional/default-now patientReportedAt, constrained to sentAt/receivedAt through now.

Restore/report recheck the current parent state and source ownership under locks; a closed or externally moved parent is not silently reactivated. Transfer treatment must still be ACTIVE at source without an outcome. PRE_TREATMENT report checks there is still no open treatment. Report creates no treatment; destination uses the existing Phase 3B start command afterward.

## Locking and authority

Commands use READ_COMMITTED and lock TBCase, then Treatment if relevant, then Referral for transitions. Scope queries select scalar IDs before these locks; parent entities are fetched fresh after acquiring them. Scope is rechecked after waiting. The partial unique index is the final in-flight guard. No command retries.

`ReferralSourceAuthorityPolicy.requireLocalCreate` and `requireLocalTransition` run after scope authorization, under the parent locks, before changes. The prototype implementation accepts authorized local records. Existing ClinicalSourceAuthorityPolicy and LaboratorySourceAuthorityPolicy remain unchanged. Future authorized external integration must define referral and associated ownership authority, not assume official SITB field names or networking behavior.

Treatment start/outcome and follow-up laboratory correction already serialize on the same case lock. Send versus outcome permits one coherent winner. Report can precede a later valid destination outcome; an outcome cannot close a still-REFERRED transfer episode. Version and facility checks apply to fresh post-lock state.

## Handoff privacy and continuity

Only authorized source/destination officers receive: referral id/version/type/status/timestamps, source/destination id/name, patient id/display name, case id/category/status, optional treatment id/status/start/planned end/regimen code/name, and referral notes/reasons.

This explicit handoff projection excludes NIK/BPJS, HIV/DM, diagnosis prose, laboratory data, drug/dose/follow-up/adverse narratives, account data, audit and synchronization metadata. It does not expose JPA entities or borrow the broader clinical DTO. No patient/supporter referral portal exists.

After report, destination gains ordinary case/treatment access and source loses it unless the actor separately holds destination assignment. Source still reads its outgoing referral. SELF/supporter links remain attached to the existing patient/case.

Case/treatment IDs, start/regimen/drugs/doses, historical FollowUp/AdverseEvent/LabRequest/LabResult and user links remain unchanged. Historical facility fields are retained. Existing follow-up completion continues to require its own target facility scope; no relocation, cancellation or rescheduling is inferred.

## Errors and audit

Indonesian application/problem+json errors use REFERRAL_STATE_CONFLICT, REFERRAL_ALREADY_IN_FLIGHT, REFERRAL_DESTINATION_INVALID and REFERRAL_TREATMENT_MISMATCH alongside existing scope/version/validation codes.

REFERRAL_SENT, REFERRAL_RECEIVED, REFERRAL_RETURNED, REFERRAL_CANCELLED and REFERRAL_REPORTED audit actor/action/referral target with correlation-only traceId metadata. Patient identity, notes and reasons never enter audit metadata. Failed commands have no successful referral audit or partial ownership movement.

## Deferred scope

Phase 4B contacts/TPT and Phase 4C monitoring/alerts/notifications require separate approval. No drug adjustment, patient/supporter referral portal, lab relocation, follow-up relocation or SITB networking is implemented.
