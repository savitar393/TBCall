# Architecture

## Application structure

The Next.js frontend in `frontend/` serves the Indonesian public and authenticated interfaces. Browser API calls go through its fixed same-origin proxy to the Spring Boot application. Provider credentials and the backend origin remain server-side.

The backend separates HTTP controllers (`src/main/java/id/tbcall/web`), application services and authorization policies from persistence. PostgreSQL is the durable store. Spring Data JPA maps clinical aggregates; JDBC is also used for bounded reporting and reminder operations that require explicit locking and durable handoff state.

Flyway migrations in [db/migration](../src/main/resources/db/migration) are the schema authority. Hibernate runs with `ddl-auto=validate`; it does not create the schema. Historical migrations are immutable, with subsequent changes introduced additively.

## Clinical records and authority

Patient, TBRegistration, Diagnosis, TBCase and Treatment are distinct records. A patient can have multiple registrations and case episodes. Laboratory results retain test/specimen lineage and corrections; referrals retain facility history. Treatment, contact investigation and TPT transitions remain explicit authorized operations.

TBCall owns authentication, account links, monitoring, reminders, notifications and audit functionality. Local integration metadata records external identities and source-authority policy, but does not implement SITB transport or invent an external API contract. [Clinical terminology and provenance](DATA_SOURCES.md) are independent of physical table and field names.

## Access and concurrency

Seven built-in roles are supported: TB_OFFICER, LAB_STAFF, FACILITY_ADMIN, SYSTEM_ADMIN, PROGRAM_MONITOR, PATIENT and TREATMENT_SUPPORTER. A role alone does not replace individual permission checks, facility scope, verified patient/supporter links or geographic reporting grants. SYSTEM_ADMIN has no automatic right to clinical records or reporting aggregates.

Opaque session cookies authenticate requests. The backend resolves current permissions and links; the frontend is not the authorization authority. State-changing requests require CSRF protection. Versioned writes use authoritative GET ETags and `If-Match`, with transaction locks and database constraints for concurrent transitions. Audit records capture consequential changes and denied access without retaining provider secrets or unnecessary clinical payloads.

## Reporting

Program reporting uses immutable, explicitly published snapshots of TBCall-held records. Access requires PROGRAM_MONITOR, REPORT_READ and active geographic grants. Verified current responsible facilities determine attribution; transfers must not duplicate case episodes.

The prototype disclosure policy requires support from at least ten distinct patients, complementary suppression and whole-release checks, including previous publications. This is not proof of anonymity or legal compliance. Public map assets contain geographic attributes only; authorized APIs supply aggregate values. Indicator counts do not establish incidence, prevalence or treatment success.

## Schedules, monitoring and reminders

Prescribed medication occurrences, recorded dose evidence and follow-up appointments are separate concepts. Reminder planning reuses prescribed occurrences; sending never changes treatment times or creates adherence evidence.

Each reminder channel has independent consent, destination binding, enrollment version, jobs and duplicate guards. Eligibility is revalidated before a short durable handoff transaction. Provider HTTP runs outside that transaction; uncertain admitted handoffs are not automatically resent. Email/Telegram are restricted to manual `CHANNEL_TEST`; Meta uses separate `CLOUD_TEST` admission. Transport and reminder scheduling default to disabled.

## Asynchronous video evidence

V23 adds `vot_submissions` with patient/treatment/schedule/revision foreign keys, immutable occurrence/consent/media metadata, a unique schedule/instant constraint, one final review or cancellation, optimistic versioning and retention timestamps. The shared occurrence calculator validates current prescriptions; submissions accept elapsed occurrences within seven days, with active case/treatment and current schedule revision. An occurrence has one immutable submission, including after cancellation. VOT has no dependency on dose creation, schedule mutation, adherence calculations or reminder consent/providers.

`VotService` gates patient operations with `PATIENT`, verified account and current verified SELF link plus `VOT_SELF_READ/WRITE`. Staff need `TB_OFFICER`, `VOT_REVIEW_READ/WRITE`, active assignment and both treatment and current case facility scope through existing treatment authorization. Administrator/supporter roles receive no video grants. Session resolution re-reads roles, permissions, assignments and links on every request. Scoped failures are audited without clinical payloads. Reviews/cancellation require `If-Match`; owner locks, versioning and status constraints prevent overwrites. Pending cancellation withdraws further officer playback/review; own-patient playback remains until expiry. Original decisions remain after video deletion.

Patient API: `GET /api/v1/me/vot-policy`; `GET/POST /api/v1/me/vot-submissions`; `GET /api/v1/me/vot-submissions/{id}`; `GET .../{id}/media`; `POST .../{id}/cancel`. Creation consumes the raw WebM/MP4 body with `treatmentId`, `occurrenceId`, `consentAcknowledged` and `consentPolicyVersion` query parameters. It atomically creates/stores the submission; failed uploads expose no draft. Staff API: `GET /api/v1/vot-submissions` (status/treatmentId/page/size), `GET /api/v1/treatments/{id}/vot-submissions`, `GET /api/v1/vot-submissions/{id}`, `GET .../{id}/media`, `POST .../{id}/review` with decision/optional notes. Lists are bounded to 100 rows. Frontend routes use the existing authenticated same-origin proxy, with streaming upload and non-cacheable video responses.

`VotStorage` currently has one private local adapter, admitted only in synthetic development. It uses generated UUID names, bounded streaming, container structure checks, private permissions where supported, link/path checks, atomic file placement and rollback deletion. It never trusts client filenames. A bounded retention sweep deletes at most 50 expired media per transaction and 100 old orphan/partial files per pass (10,000 inspected entries). Deletion is idempotent and audited; failures retry, and expiry blocks playback/review even before physical deletion. Interrupted-upload partials and uncommitted crash leftovers become eligible for orphan cleanup after 24 hours. Expired metadata and decisions remain; no public media URL exists. Full-stream playback is supported without byte-range seeking. Container checks do not decode every frame or verify duration; production storage, malware scanning, access operations, backup deletion and governance require a separate approved design.

## Test infrastructure

Backend integration tests use disposable PostgreSQL with Flyway and real database constraints. Frontend tests validate contracts and rendered interactions with mocked requests. The opt-in `test-support/e2e/` harness separately pins an earlier application baseline, Linux artifacts, Chromium sandbox and isolated networking. Its source locks are not automatically updated by normal application builds, and synthetic test success is not production certification.
