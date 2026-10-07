# Frontend F2A clinical intake

F2A is the TB officer patient → registration → diagnosis → case workflow on backend read-contract commit `863ca8c23b15dd57f3fc85db9618a75537212609`. It adds no backend contracts, migrations or clinical rules.

## Routes and access

| Route | Required explicit actor/permission | Actions |
| --- | --- | --- |
| `/patients` | TB_OFFICER + PATIENT_READ | Masked worklist and in-memory filters |
| `/intake/new` | TB_OFFICER + PATIENT_CREATE + REGISTRATION_WRITE | Assigned facility; new patient or exact identity resolve; registration |
| `/patients/[patientId]` | TB_OFFICER + PATIENT_READ | Demographics/current registrations/current cases; PATIENT_UPDATE edits |
| `/registrations/[registrationId]` | TB_OFFICER + REGISTRATION_READ | Registration; optional DIAGNOSIS_READ list; OPEN-only REGISTRATION_WRITE edit; DIAGNOSIS_WRITE creation; CASE_WRITE confirmation |
| `/diagnoses/[diagnosisId]` | TB_OFFICER + DIAGNOSIS_READ | Stateless detail/ETag; DIAGNOSIS_WRITE edit |
| `/cases/[caseId]` | TB_OFFICER + CASE_READ | Case/context/confirming diagnosis; CASE_WRITE edit |

All routes use the F1 SessionBoundary. The role is only the backend's explicit officer actor gate. Every permission is checked independently from `/me`; patient/supporter/admin/lab/program accounts do not acquire officer UI from permission names alone. The backend is always authoritative.

Live reference directories require PATIENT_READ. An account that can read a diagnosis/case but lacks PATIENT_READ can still read that record; its catalog-dependent editor explains the missing permission. Referral destination search needs the registration facility from an authorized REGISTRATION_READ context; without it, other diagnosis fields remain editable but destination search is unavailable. No write permission is substituted for a read permission.

## Worklist and privacy

GET `/api/v1/patients` supplies patient cards that work on narrow and wide screens. Names, sex, birth-date/unknown and current registration/case summaries are rendered from backend data. NIK/BPJS are displayed only in their returned masked form; response validation rejects unmasked list/resolve identity values.

Filters are name(blank or3..255), NIK(blank or16digits), BPJS(max50), live registration/case status options, assigned facility and page size1..50. Apply resets to page0; clear resets all filters; previous/next use the backend total. Loading, safe errors, retry and empty states are available.

Sensitive filters live only in form/query memory. API GET query parameters are required by the backend contract; they never become browser page URL/history state. Authorized staff may see full identities on patient detail, confined to its content/editor. Clinical values are never put in document metadata/global chrome, console logs, localStorage, sessionStorage or IndexedDB.

## Registration wizard

1. Select a facility only from `/me.activeFacilities`. Exactly one is preselected; zero prevents continuation; multiple require explicit selection. Global directory results are never registration facilities.
2. Choose new patient or existing patient. New demographics use live citizenship/sex options, explicit WNI NIK/WNA identity and known/unknown birth-date pairs. Existing path additionally requires PATIENT_IDENTITY_RESOLVE. Collect exact identity plus name or birth-date confirmation and optional BPJS; POST `/patients/resolve`; show the returned masked confirmation.
3. Enter registration fields from the approved architecture using live suspect/previous-treatment/HIV/DM catalogs; POST `/registrations`; navigate to the returned registration UUID.

The original exact existing-patient input is held only in wizard memory and reused with the resolved patient UUID in `existingPatient`. Masked response values are never sent back as confirmation. A refresh/remount requires new confirmation. Success, path switch, logout/account/context change and leaving the wizard erase state. Pending resolve is aborted on unmount/path switch; a late result cannot restore confirmation. Ordinary back/forward navigation to review the same patient preserves registration inputs in wizard memory; actual path changes and reconfirmation/reset clear that registration draft. No fuzzy matching or patient-ID-only fallback exists.

## Detail, ETags and PATCH

GET patient/registration/diagnosis/case detail obtains the server's ETag. Form state contains strings for decimals and ISO `YYYY-MM-DD` dates. Validation precedes number conversion (positive, below10000, at most2decimals). Explicit domain mappers serialize only editable inputs.

PATCH sends only dirty inputs with the GET ETag in If-Match. Response id/version/status/labels/audit/sync fields never become PATCH fields. Omitted means unchanged; blank optional input maps to null. WNI clears otherIdentityNumber, WNA clears nik; known birth date supplies date/false, unknown supplies null/true. Region-code editing is omitted rather than inventing region catalogs.

Missing ETag disables saving. ETags are not calculated from version. Refetch updates untouched controls while preserving dirty controls. On optimistic/state conflict, refetch the current user's related queries, retain unsaved values, block save until explicit review, and never replay. A failed record or catalog refresh keeps the mounted form and dirty values, displays safe retry feedback and blocks save/review acknowledgement until recovery. Catalog errors do not interrupt successful-write cleanup/navigation. Source-authority conflict displays the existing safe external-source message and disables repeated saving for that mounted form. Reads/navigation remain available. CSRF/session/forbidden failures use existing F1 handling; raw backend problem prose is never displayed.

All successful writes invalidate the current-user clinical prefix (including worklist, patient detail, registration and diagnosis list/detail), without injecting mutation responses into shared caches.

## Diagnosis and case confirmation

Registration diagnosis cards come from GET `/registrations/{id}/diagnoses`; detail comes from GET `/diagnoses/{id}`. Refresh requires no remembered POST response. Creation is offered in OPEN/DIAGNOSED with DIAGNOSIS_WRITE, uses current registration ETag and refetches registration because OPEN may become DIAGNOSED.

REFERRED uses debounced350ms active facility search after2typedcharacters, with pagination/name/region codes. Current registration facility is excluded in the UI; backend validates again. Changing away clears referredToFacilityId explicitly. Switching back requires destination selection again. Historical inactive labels remain readable but are never added to active catalogs; unchanged historical input codes are omitted from unrelated PATCH.

DIAGNOSED registrations with CASE_WRITE and a successfully recovered diagnosis list offer confirmation. Only TREAT_HERE/REFERRED diagnoses are eligible; selection is explicit, with no initial selection. Category, resistance and other case fields require user input from live catalogs. No category/resistance/outcome/measurement inference is made from diagnosis, registration or lab data. POST uses current registration ETag; success navigates to the returned case UUID. Case editing has no status-transition or treatment/regimen UI.

## Session isolation and implementation

`frontend/features/clinical-intake` owns typed schemas/API/query factories, permission checks, explicit form values/mappers and focused components. It is not a general domain CRUD framework. Native F1 apiRequest, TanStack Query, RHF/Zod and shadcn buttons/inputs/cards are reused.

Every clinical query key starts `["clinical", userId]`; every queryFn consumes its AbortSignal. F1 cancels/removes protected queries before publishing a changed `/me`. Clinical content remounts on account/access-context changes, discarding drafts. Commands use abort controllers and compare the original `/me` snapshot before accepting results/errors, invalidating queries or navigating. Inputs are never TanStack mutation variables. Late responses from a prior account cannot render or enter the new account's cache.

Forms have labeled controls, semantic fieldsets, safe live alerts and practical first-invalid-field focus via RHF. Statuses include text; the existing shell, mobile drawer, nonce/CSP and reduced-motion behavior remain.

## Verification and next checkpoint

From `frontend/` using Node24.x/pnpm11.19.0:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

See [F2A report](FRONTEND_F2A_REPORT.md) for exact results and test matrix. Backend tests are intentionally neither modified nor run for this frontend-only checkpoint. A real-backend browser smoke check requires separately provisioned accounts; no security weakening or fake production credential provisioning is included.

F2B laboratory UI and all later treatment, referral-transfer, contact/TPT, monitoring, patient/supporter and administration UI remain separate approvals. SITB networking is absent.
