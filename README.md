# TBCall

TBCall is a tuberculosis care coordination and monitoring application for healthcare teams, patients, treatment supporters and program monitors. It combines clinical records, laboratory and treatment workflows, patient portals and geographic reporting in an Indonesian-language interface.

**Status:** a development prototype for synthetic-data demonstrations. Clinical validation, institutional approval and production operations remain prerequisites for real-patient use.

## Features

- Patient intake, TB registrations, diagnoses, distinct case episodes and completed-case history.
- Laboratory requests, specimens, results and traceable result corrections.
- Treatment records, prescribed medication schedules, dose evidence, follow-ups, adverse events and recorded outcomes.
- Referrals and transfers, contact investigations and preventive treatment (TPT).
- Patient and treatment-supporter portals with staff-verified account links.
- Monitoring plans, alerts and in-app notifications.
- Published geographic reporting snapshots with explicit reporting grants, suppression and an indicative Indonesia choropleth.
- Consent-bound WhatsApp, Email and Telegram reminder infrastructure. External delivery is disabled by default; provider adapters support explicitly admitted nonproduction tests only.
- Facility-scoped permissions, session authentication, CSRF protection, optimistic concurrency and audit records.
- Asynchronous video observed treatment (aVOT): consented private synthetic videos, prescribed-occurrence linkage, officer review and retention. Uploads/reviews never create dose evidence or establish adherence.

## Technology

| Component | Stack |
| --- | --- |
| Backend | Java 21, Spring Boot 4.1.1, Spring Security, Spring Data JPA/Hibernate, JDBC |
| Database | PostgreSQL; Flyway-managed migrations through V23 |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query |
| Testing | JUnit 5, Testcontainers/PostgreSQL, Vitest, Testing Library; optional isolated browser harness |
| Build tools | Maven Wrapper, Node.js 24.15–24.x, pnpm 11.19.0 |

## Prerequisites and local setup

Install Java 21, Node.js 24.15–24.x and pnpm 11.19.0. Provide a dedicated empty PostgreSQL database; PostgreSQL 16 is used by the integration tests. Docker Desktop with Linux containers, or a compatible Docker runtime, is needed for those tests. Maven is provided by the wrapper.

1. Follow [local setup](docs/SETUP.md) to configure the database, start Spring Boot and bootstrap an administrator.
2. In `frontend/`, run `pnpm install --frozen-lockfile`, copy `.env.example` to `.env.local`, then run `pnpm dev --hostname 127.0.0.1`.
3. Open `http://localhost:3000`. The frontend forwards API requests to the configured backend using its same-origin proxy.

Use fictional accounts and records during development. Do not point local setup or tests at a patient database. Dependency installation and the first Maven Wrapper invocation require access to the corresponding package repositories.

## Configuration

The backend reads `TBCALL_DB_URL`, `TBCALL_DB_USER` and `TBCALL_DB_PASSWORD` from its environment. Security defaults enable production checks and secure cookies; development-only overrides are documented in [SETUP.md](docs/SETUP.md).

`frontend/.env.local` contains the server-only `TBCALL_BACKEND_URL`. Never put provider credentials in `NEXT_PUBLIC_*` variables, source files or committed environment files.

Reminder sending defaults to `TBCALL_REMINDER_MODE=DISABLED` with its scheduler off. WhatsApp uses the separate `CLOUD_TEST` mode; Email/Telegram use `CHANNEL_TEST`. Both require explicit nonproduction configuration and authenticated operator actions. See [provider configuration](docs/SETUP.md#reminder-provider-tests) and the defaults in [application.properties](src/main/resources/application.properties).

VOT is disabled by default and local storage is restricted to explicitly enabled synthetic `dev`/`test` environments. See [VOT setup and smoke test](docs/SETUP.md#asynchronous-video-observed-treatment-avot). This storage implementation is not production-ready.

## Testing

```powershell
# Repository root; Docker must be running for PostgreSQL integration tests
.\mvnw.cmd clean test

# Frontend
cd frontend
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

On Linux/macOS, use `./mvnw clean test`. Tests use synthetic records and disposable PostgreSQL containers. Do not interpret mocked-provider tests as live message-delivery evidence. The optional harness in `test-support/e2e/` retains its own pinned source baseline and runtime prerequisites; it does not automatically admit the current application revision.

## Architecture and data sources

- [Architecture](docs/ARCHITECTURE.md): application boundaries, authorization and persistence.
- [Data sources](docs/DATA_SOURCES.md): clinical guidance, TBCall vocabulary, geographic provenance and attribution.

SITB guidance informs domain terminology and workflows. TBCall does **not** implement SITB networking, and its tables, identifiers and canonical codes are not official SITB database/API contracts.

## Current limitations

- No production email/SMS contact-verification or account-recovery delivery provider is supplied. Reminder email delivery is a separate adapter and does not enable those flows.
- External reminders are manually operated tests, not a production messaging service. Provider acceptance is not proof of delivery or medication adherence.
- Clinical decisions, doses and outcomes require authorized human input. The application does not infer clinical risk or treatment success.
- Reporting describes records held by TBCall, not official national surveillance totals. Map boundaries are indicative and qualified for prototype visualization only.
- Production hosting, operational monitoring, backup/recovery validation, institutional privacy review and healthcare-data approvals remain deployment responsibilities.

## Licensing

No application-code license is currently declared in this repository. A public repository alone does not grant an open-source license. Third-party geographic data has separate attribution and reuse conditions described in [DATA_SOURCES.md](docs/DATA_SOURCES.md).
