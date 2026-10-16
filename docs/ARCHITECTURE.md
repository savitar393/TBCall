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

## Test infrastructure

Backend integration tests use disposable PostgreSQL with Flyway and real database constraints. Frontend tests validate contracts and rendered interactions with mocked requests. The opt-in `test-support/e2e/` harness separately pins an earlier application baseline, Linux artifacts, Chromium sandbox and isolated networking. Its source locks are not automatically updated by normal application builds, and synthetic test success is not production certification.
