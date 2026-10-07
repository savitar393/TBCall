# Frontend F2B laboratory guide

Approved contracts: backend `e13e3e3c934298d9a76827b40f2d934d21eb6bfe`; [architecture](architecture/TBCall_Frontend_v1.2_F2B_Laboratory.md). This checkpoint changes frontend/docs only. No Java, backend tests, migrations, laboratory semantics or SITB networking changes.

## Routes and actors

| Route | Gate / workflow |
| --- | --- |
| `/laboratory` | TB_OFFICER or LAB_STAFF plus LAB_REQUEST_READ, active assigned facility |
| `/laboratory/requests/[requestId]` | Same read gate; independent source/testing actions |
| `/laboratory/requests/new/registration/[registrationId]` | TB_OFFICER + LAB_REQUEST_WRITE + REGISTRATION_READ + LAB_REQUEST_READ; OPEN/DIAGNOSED; DIAGNOSIS |
| `/laboratory/requests/new/case/[caseId]` | TB_OFFICER + LAB_REQUEST_WRITE + CASE_READ + LAB_REQUEST_READ; ACTIVE; FOLLOW_UP |

Every route wraps F1 SessionBoundary. Laboratory navigation requires the explicit read actor contract; existing officer intake navigation remains unchanged. Source actions require LAB_REQUEST_WRITE and assignment to the projected requesting facility. Testing actions require LAB_STAFF + LAB_RESULT_WRITE and assignment to the testing facility. Dual actors are checked independently. LAB_RESULT_READ controls rendered result content, including corrections. Backend is the final permission, facility, state and source-authority validator.

## Queue and contextual creation

Queue reads `/lab-requests` and renders backend minimum patient context, owner, facilities, reason, referral/status, timestamps, tests and completeness. It never reads another patient endpoint or obtains NIK/BPJS. Live reference labels/options come from `/laboratory-reference-data`, cached in memory for five minutes. Status, owner, reason, requesting/testing facility and pagination filters stay in component memory. Facility filters use only `/me.activeFacilities`; size is 1–50, page nonnegative.

Plain F2A registration/case links introduce no circular feature dependency. Creation reads its contextual owner using the existing clinical contract and fixes the approved owner→reason mapping. Testing facility starts empty, even with one choice; owner/current and assigned facilities are convenience choices. PATIENT_READ additionally permits active-directory search after two characters/350ms debounce, with region codes and pagination. Directory visibility grants no writes.

Create sends exactly one owner ID, explicit testingFacilityId, live 1–10 distinct test codes, the contextual reason, and optional logistics/notes. It never sends patient data, requestingFacilityId, referralType, requestedAt or statuses. Success refetches current-user laboratory reads and navigates to the request UUID. Missing owner-read permission is explained without issuing a forbidden owner read; missing/failed catalogs block submission while preserving mounted drafts.

## Detail and commands

Detail uses only the request projection, showing logistics, specimens, test statuses and backend-projected latest result lineages. Owner links require the independent officer clinical read permission. No clinical state is inferred from result values/text. The backend maintains result history; successful commands invalidate/refetch rather than replacing result rows locally.

| Command | UI guidance | If-Match |
| --- | --- | --- |
| Record specimen | REQUESTED/SENT; bounded free-text type; optional code/times/notes; sent≥collected | Actual request-detail response ETag |
| Cancel request | REQUESTED/SENT/RECEIVED; explicit confirmation | Actual request-detail response ETag |
| Receive specimen | Unreceived specimen; parent REQUESTED/SENT/RECEIVED; required receivedAt and explicit boolean; false requires rejection | Quoted specimen.version |
| First result | Request/test not CANCELLED; testedAt and at least one code/value/text; usable unrepresented specimens or independent null lineage | Quoted test.version |
| Correct latest result | Latest projected FINAL/CORRECTED only; fixed test/specimen lineage; payload contains only testedAt/code/value/text | Quoted result.version |

`labEtagFromVersion` validates a nonnegative safe integer and is confined to the laboratory child contract. F2A clinical ETags remain unchanged. Missing request ETag blocks source commands. Receipt usable=true clears rejection form state/payload. Specimen types/result codes are free text, with no invented catalog. All represented lineages direct the user to correction. If result-read content is absent, the UI does not recover it from another endpoint; the backend remains the collision guard for unprojected lineages.

## Time, conflicts and drafts

One tested serializer interprets datetime-local using the browser timezone and sends ISO UTC. Timezone is displayed beside editable fields, never described as facility timezone. Invalid calendar, nonexistent and ambiguous repeated DST times are rejected for new/edited timestamps. An unchanged correction time is submitted verbatim from its original result, preserving the original offset, repeated-hour occurrence and sub-millisecond precision. No clinical time defaults are fabricated. Returned timestamps have exact accessible time/title values and locale formatting.

No command retries automatically. Optimistic 409, 428 and approved laboratory state conflicts preserve form values, refresh current-user request reads and require explicit review. A removed/replaced result or ineligible specimen blocks the obsolete editor while retaining input. SOURCE_AUTHORITY_CONFLICT locks that mounted form, with reads still available. Background read errors retain draft/lock state. Closing an action form requires explicit inline discard confirmation; pending commands cannot be discarded. A successful write is acknowledged even if its subsequent read fails, with a separate safe read error and retry action.

## Isolation, privacy and verification

All laboratory query keys begin `["laboratory", userId, ...]`, consume AbortSignal, and use strict Zod responses. Session/context changes clear protected queries and remount forms. Commands snapshot `/me`, abort on unmount and check the original identity before rendering, invalidation or navigation. Old-account success/error responses cannot affect the new session. Command inputs stay in mounted memory and never enter generic mutation cache.

No patient/result/note/courier data in storage, logs, URL query/history, metadata or global chrome. UUID path segments are allowed. Errors use safe Indonesian messages, never arbitrary backend prose. Associated labels, text statuses, responsive cards, live feedback and confirmation preserve F1/F2A accessibility conventions.

From `frontend/`: `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`. See [checkpoint report](FRONTEND_F2B_REPORT.md) for exact evidence and manifest. A real-backend smoke run requires separately provisioned authorized officer/lab accounts/facilities; no credentials or production data are invented. F2C and later UI remain deferred.
