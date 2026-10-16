# Local setup

These instructions run a development instance with synthetic data. They are not a production deployment guide. Use a dedicated empty database and keep credentials outside Git.

## Database and backend

Provision PostgreSQL 16 with a database and role reserved for this instance. The examples assume `127.0.0.1:15432`, database `tbcall_dev` and role `tbcall_dev`; substitute your actual values. The migration connection needs schema creation privileges and permission to install `pgcrypto`, `citext` and `pg_trgm`.

In PowerShell, from the repository root:

```powershell
$env:TBCALL_DB_URL = 'jdbc:postgresql://127.0.0.1:15432/tbcall_dev'
$env:TBCALL_DB_USER = 'tbcall_dev'
# Supply TBCALL_DB_PASSWORD privately in this process environment.
$env:SPRING_PROFILES_ACTIVE = 'dev'
$env:SERVER_ADDRESS = '127.0.0.1'
$env:TBCALL_PRODUCTION = 'false'
$env:TBCALL_COOKIE_SECURE = 'false' # Local HTTP only; use secure cookies with HTTPS.
$env:TBCALL_MONITORING_SCHEDULER_ENABLED = 'false'
.\mvnw.cmd spring-boot:run
```

Spring Boot starts on port 8080 by default. Flyway applies migrations and Hibernate validates the resulting schema. Do not edit already-applied migrations or enable Hibernate schema generation. The current application uses one datasource for migrations and runtime; production privilege separation needs a separate deployment design.

For a first administrator, privately set `TBCALL_BOOTSTRAP_EMAIL` and/or `TBCALL_BOOTSTRAP_PHONE`, together with `TBCALL_BOOTSTRAP_PASSWORD` (12–128 characters), before startup. Bootstrap runs only when no SYSTEM_ADMIN assignment exists. Remove those settings after initialization. There are no built-in passwords or seeded clinical accounts.

## Frontend

In a second terminal:

```powershell
cd frontend
pnpm install --frozen-lockfile
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
pnpm dev --hostname 127.0.0.1
```

Set `TBCALL_BACKEND_URL=http://127.0.0.1:8080` in `.env.local`. This is a server-only origin, without a path or query. Open `http://localhost:3000` and use one consistent frontend hostname for sessions. The same-origin proxy handles API forwarding; cookies and CSRF remain required for mutations.

Use `pnpm run build` and `pnpm start` for a local production build. That command does not make the system operationally production-ready.

## Accounts and verification

An administrator assigns roles and facility membership through the existing administration screens. Each workflow independently enforces its required permissions. Patient self-registration does not assign clinical access: staff must verify identity and explicitly link the account to its patient record.

The default contact-delivery port is unavailable. For isolated synthetic registration tests only, `TBCALL_EXPOSE_VERIFICATION_TOKENS=true` with explicit nonproduction `dev`/`test` settings permits token return in the registration response. Never enable that setting in production. Password recovery still requires a functioning verification-delivery adapter; the reminder providers below do not supply one.

## Reminder provider tests

Keep `TBCALL_REMINDER_MODE=DISABLED` unless deliberately testing a provider. All credentials belong in a private process environment or secret store. Neither provider acceptance nor a simulated response establishes delivery or adherence.

For Email/Telegram, use `CHANNEL_TEST`, explicit `dev`/`test`, `TBCALL_PRODUCTION=false`, `TBCALL_CHANNEL_SYNTHETIC_ENVIRONMENT=true` and `TBCALL_REMINDER_SCHEDULER_ENABLED=false`.

| Channel | Configuration |
| --- | --- |
| Email | `TBCALL_EMAIL_ENABLED=true`, private `RESEND_API_KEY`, `TBCALL_EMAIL_FROM`, and `TBCALL_EMAIL_TEST_RECIPIENTS` containing exact canonical verified account emails |
| Telegram | `TBCALL_TELEGRAM_ENABLED=true`, private `TELEGRAM_BOT_TOKEN`, `TBCALL_TELEGRAM_BOT_USERNAME`, exact private test-chat IDs in `TBCALL_TELEGRAM_TEST_RECIPIENTS`, and `TBCALL_TELEGRAM_EXCLUSIVE_CONSUMER_CONFIRMED=true` |

Allowlist at most five recipients per enabled channel. The default test sender is `TBCall Test <test@notify.umkmtumbuh.xyz>`; use a sender/domain you control and have verified with Resend. A Telegram bot must be dedicated to this test, without a webhook or another polling consumer.

1. Prepare a verified SELF-linked synthetic patient, an active treatment and a staff-entered medication schedule. Email uses only that account's verified address.
2. In **Profil → Pengingat**, request the Telegram link and send `/start` through the single-use five-minute deep link. Linking leaves reminder consent off.
3. A SYSTEM_ADMIN with `USER_ACCOUNT_MANAGE` calls `POST /api/v1/admin/medication-reminders/channel-test-telegram-poll` with CSRF and `{"confirmTestOperation":true}`. Refresh patient linking status, acknowledge each desired channel's privacy risk, and save consent and permitted hours.
4. The operator calls `/api/v1/admin/medication-reminders/channel-test-plan` with the same confirmation body. At the prescribed time, call `/api/v1/admin/medication-reminders/channel-test-dispatch` with `{"jobId":"<owned synthetic job UUID>","confirmTestOperation":true}`. Inspect only jobs from this test database.

Every operation is manual. Telegram `/stop` withdraws securely attributable current consent when ingested by the operator's poll. Timeouts and ambiguous handoffs are not automatically resent. Confirmed-safe failures remain bounded by the attempt limit, configured retry delay and original ten-minute lateness window.

WhatsApp remains separate: `SIMULATED` makes no network requests; `CLOUD_TEST` requires its own Meta sender/template/recipient approvals, credentials and authenticated manual actions. `CHANNEL_TEST` cannot send WhatsApp. Complete configuration names and limits are in [application.properties](../src/main/resources/application.properties); never substitute a production account for a synthetic test.
