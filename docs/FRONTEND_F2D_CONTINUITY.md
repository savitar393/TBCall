# F2D continuity frontend

Approved backend base: `584fdea9bbe420c771593d52e2028407c6738c9c`.

F2D consumes the existing referral/transfer, contact-investigation and contact-driven TPT contracts. Java, backend tests, Flyway V1–V17, source-authority and clinical workflow semantics are unchanged. Workflow/reference codes are TBCall canonical contracts; this frontend does not claim an official SITB physical schema/API.

## Routes and permissions

All routes use SessionBoundary and require explicit TB_OFFICER plus the indicated permission. The backend is the final authorization/facility/state/source-authority validator.

| Route | Read/entry permission | Actions |
|---|---|---|
| `/referrals` | REFERRAL_READ | Incoming/outgoing queue, memory-only pages |
| `/referrals/[referralId]` | REFERRAL_READ | REFERRAL_WRITE and recorded source/destination side |
| `/cases/[caseId]/referrals/new` | REFERRAL_WRITE | Preparation/send; optional references only with REFERRAL_READ |
| `/cases/[caseId]/contacts` | CONTACT_READ | CONTACT_WRITE to create |
| `/contacts/[contactId]` | CONTACT_READ | CONTACT_WRITE edit/link; resolver also PATIENT_IDENTITY_RESOLVE |
| `/contact-investigations` | CONTACT_READ | Incoming/outgoing queue; internal investigations remain contextual |
| `/contact-investigations/[investigationId]` | CONTACT_READ | CONTACT_WRITE transitions; independent TPT_WRITE start |
| `/preventive-treatments/[tptId]` | TPT_READ | TPT_WRITE edits/closure when ACTIVE |

Navigation exposes Rujukan and Investigasi kontak independently. Case detail exposes Buat rujukan and Kontak only with their explicit permissions. There is no global TPT queue. Optional contact sex catalog queries require PATIENT_READ; omission does not block contacts. Contextual case reads/links separately require CASE_READ; treatment links require TREATMENT_READ. Contact TPT history requires TPT_READ.

For send/start actors without the matching read permission, successful commands display an in-place confirmation and disable repeat submission. Navigation to detail occurs only when independently readable, avoiding dead links without broadening backend contracts.

## Referral/transfer

Creation uses live referral preparation. REFERRED + recorded destination + no open treatment + no in-flight referral permits pre-treatment referral; destination is fixed and treatmentId omitted. ACTIVE case + exact ACTIVE episode + no in-flight referral permits transfer. PLANNED/PAUSED never qualify. Transfer requires explicit active destination selection from the continuity directory; source is excluded. Search uses at least two trimmed characters and a 300 ms debounce.

The initial preparation intent remains mounted on conflict so notes survive. If authoritative preparation changes episode, destination, source or eligibility, the retained draft cannot send. Closing/reopening the page starts a fresh preparation.

Transitions mirror recorded sides: source SENT cancel; destination SENT receive; destination RECEIVED return/report. Cancel requires reason/confirmation, return requires reason, report explicitly confirms movement of clinical ownership. Success refetches continuity resources and invalidates known per-user case/treatment caches; it never rewrites ownership locally. Send has no If-Match.

## Contacts and exact identity

Creation uses live creatable INTERNAL/OUTGOING_REFERRAL workflow options. INTERNAL omits destination; outgoing requires explicit continuity-directory selection and excludes the current case facility when independently known. Creation has no ETag.

Contact read projections retain backend-masked phones and linked-patient boolean. No identity enrichment query is performed. PATCH contains only dirty allowed demographics; explicit null clears optional fields. Masked phone is never copied into input or submitted: a blank new-phone field leaves the existing phone untouched; an explicit clear checkbox sends null. IDs, version, index case, link state and child summaries are never PATCHed.

Exact linking requires CONTACT_WRITE + PATIENT_IDENTITY_RESOLVE and an unlinked contact. Collect WNI NIK or WNA other identity plus name or birth-date confirmation, optional BPJS, then POST patients/resolve. Display only the masked response. Original confirmation is component-local transient memory; the confirmed link sends resolver patientId plus the original exact values and current contact GET ETag. No manual UUID, fuzzy search, or masked-value reuse. Sensitive draft/resolution state is discarded on cancel, success, unmount and session-context remount. It is never stored in Query/mutation variables.

## Investigation and TPT

Outgoing destination SENT receive; RECEIVED start; RECEIVED/IN_PROGRESS return; source SENT cancel. INTERNAL working facility is source; OUTGOING_REFERRAL working facility is destination. Only working IN_PROGRESS can complete. Legacy incoming workflow does not invent a working facility.

Completion requires explicit activeTbExcluded and tptEligible choices with no initial selection. Only the structural rule eligible=true implies excluded=true is enforced. Completion creates no case, registration or TPT.

TPT start requires completed/excluded/eligible projected state, TPT_WRITE and recorded working facility. Live PREVENTIVE catalog choices are filtered by index-case category, with no automatic choice. Catalog regimen or explicit individualized description is required; RO is not forced to a particular regimen. No dose/composition, duration, planned end date or eligibility is inferred. Start has no ETag.

ACTIVE TPT edits include only dirty allowed metadata. Clearing the sole individualized regimen description is prevented. Complete/lost-to-follow-up accept optional reasons; stop requires reason. Each closure requires explicit confirmation and uses the actual current detail ETag. No frontend mapping to national outcome codes.

## Session, concurrency, errors and time

Strict Zod response schemas reject malformed/enriched DTOs as INVALID_RESPONSE. All continuity queries begin `["continuity", userId]` and consume AbortSignal. Protected screens remount for the full `/me` snapshot. Commands abort on unmount and compare snapshots before success/error, refresh, cache invalidation and navigation. Mutation payloads stay outside TanStack mutation cache.

Existing-resource writes use actual GET ETags, never summary versions: referral transitions, contact PATCH/link, investigation transitions and TPT PATCH/closure. No automatic replay. 409/428 and known workflow errors preserve draft, refetch authority and require explicit review. Known REFERRAL_DESTINATION_INVALID also refreshes preparation and facility directory. SOURCE_AUTHORITY_CONFLICT locks relevant saves for the mounted form and leaves reading/navigation available. Indonesian feedback is locally defined; raw backend problem prose is never shown.

OffsetDateTime inputs reuse tested local-to-ISO conversion and display browser timezone. Nonexistent/ambiguous DST times are rejected. Optional blank referral/investigation times mean backend now, and blank TPT closure date means backend today. Local dates remain YYYY-MM-DD.

No clinical text is stored in localStorage, sessionStorage, indexedDB, logs, URL query/history, metadata or global chrome. Pagination/filter state and drafts remain in memory. UUID route identifiers are used. Responsive cards, semantic labels, announced feedback and explicit confirmation dialogs preserve the existing accessibility approach; dialog focus restores to its trigger.

## Verification and next checkpoint

See FRONTEND_F2D_REPORT.md for exact gates, test counts and changed-file manifest. Regression coverage includes strict DTOs, actor/action isolation, all query signals, prior-session GET/command races, referral preparation/transitions, original identity reuse, explicit completion/TPT choices, dirty PATCH, conflict retention and privacy.

A live source/destination account smoke test remains recommended with separately provisioned accounts. No production credentials are created. F2E monitoring/alerts/notifications, F3 portals, F4 administration and SITB networking require separate approval.
