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

## Asynchronous video observed treatment (aVOT)

Use a new isolated synthetic database and dedicated private media directory outside **all** repository worktrees and frontend/public/static directories. Never reuse the running smoke-test database. Keep reminders disabled, their scheduler off and external integrations disconnected throughout this test.

```powershell
# Alongside the isolated database settings above, before starting this backend:
$env:SPRING_PROFILES_ACTIVE = 'dev'
$env:TBCALL_PRODUCTION = 'false'
$env:SERVER_PORT = '18080'
$env:TBCALL_CORS_ALLOWED_ORIGINS = 'http://localhost:13000'
$env:TBCALL_COOKIE_SECURE = 'false'
$env:TBCALL_VOT_ENABLED = 'true'
$env:TBCALL_VOT_SYNTHETIC_ONLY = 'true'
$env:TBCALL_VOT_STORAGE_PATH = 'D:\TBCallSyntheticVotMedia'
$env:TBCALL_VOT_MAX_FILE_BYTES = '20971520'
$env:TBCALL_VOT_RETENTION_DAYS = '7'
$env:TBCALL_VOT_CLEANUP_ENABLED = 'true'
$env:TBCALL_VOT_CLEANUP_INTERVAL_MS = '3600000'
$env:TBCALL_REMINDER_MODE = 'DISABLED'
$env:TBCALL_REMINDER_SCHEDULER_ENABLED = 'false'
```

Start this worktree's backend on port 18080. In this worktree's `frontend/.env.local`, set the server-only `TBCALL_BACKEND_URL=http://127.0.0.1:18080`, then run `pnpm dev --hostname 127.0.0.1 --port 13000`. Open `http://localhost:13000` in a separate browser profile to isolate session cookies from other local TBCall instances. Verify the new datasource and both ports before entering test records; never reuse the original instance's port or database. Plain HTTP and insecure development cookies are for loopback synthetic testing only.

The application refuses VOT when production checks/profiles are active, no explicit `dev`/`test` profile is active, synthetic-only is false, storage is unsafe, retention is outside 1–365 days or the byte limit exceeds 20 MiB (20,971,520 bytes). On Windows provision the dedicated directory with restrictive OS ACLs for the backend account; POSIX directories/files are owner-only. Do not serve it through another web server, sync it publicly, or include recordings in source control/backups without a retention design. Local storage is not production-ready. Disable VOT again when finished.

Patients open **Video Pengobatan (VOT)**, choose an elapsed prescribed occurrence from the current active revision, record (camera/microphone permission required on HTTPS/localhost) or select a WebM/MP4, preview, explicitly consent and submit. Recording stops at about 60 seconds in the browser. The server enforces byte limits and container characteristics, **not a guaranteed duration, decoded validity, identity, ingestion or adherence**. Device denial/unsupported recording allows file selection or assistance from the treatment officer; VOT is optional. Only synthetic demonstrations belong in this environment.

Each occurrence accepts one immutable submission within seven days after its prescribed time, while the treatment and current prescription remain active and unexpired. A patient can withdraw pending review consent by cancelling with the latest version: subsequent officer playback requests and decisions are denied, while the patient's own playback, audit metadata and original video remain until retention. Completed reviews are immutable; contact the facility for assistance with subsequent privacy requests. Replacements are refused, including after cancellation. An officer with dedicated VOT permissions and matching active treatment/current case facility sees **Peninjauan VOT** and records **Aktivitas teramati** or **Tidak dapat diverifikasi** after confirmation. These are evidence classifications; neither upload nor review creates/updates a `DoseEvent` or changes adherence. SYSTEM_ADMIN has no default playback/review rights.

Retention is measured from successful submission. Expiry immediately blocks playback/new review, even if the hourly sweep has not run. Each sweep examines at most 50 expired media records and removes at most 100 unreferenced/partial files older than 24 hours; metadata, consent and decisions remain auditable. Sweeps resume past failed deletions and the orphan scan resumes after its 10,000-entry bound, so later candidates progress. Filesystem failures retry on a subsequent sweep; process restarts reset scan cursors. Keep cleanup enabled while operating this prototype. Use `TBCALL_VOT_RETENTION_DAYS=1` for a short isolated manual retention test; clock-controlled integration tests verify expiry without waiting or modifying a running database. Laced WebM blocks are unsupported; use an alternative browser or MP4 when container admission rejects such a clip.

Synthetic smoke test:

1. In the isolated environment create fictional verified PATIENT and TB_OFFICER accounts, assign the officer to an active fictional facility, and create a fictional clinical registration, case and active treatment through the normal workflow. Verify a SELF link to the patient account.
2. As that officer, create a medication schedule with an occurrence due during the demonstration. Wait until that time; do not backdate prescriptions or use clinical dosage instructions for the recording.
3. As the patient, open VOT, record a short fictional demonstration or choose a synthetic clip, preview, consent and submit. Confirm **Menunggu peninjauan**. Try a duplicate and confirm it cannot replace the original.
4. As the assigned officer, open Peninjauan VOT (or the treatment VOT section), play the protected video, choose either review classification, add optional synthetic notes and confirm. Repeating a stale decision must fail.
5. As the patient, refresh history and confirm the same review. Compare the isolated database's `dose_events` before and after: there must be no automatically added/changed row.
6. Try an unrelated patient, officer from another facility, and SYSTEM_ADMIN: neither metadata nor media may become available through a guessed submission UUID. Revoke the SELF link or facility assignment and confirm access is denied on the next request.
7. After the configured retention period, confirm playback returns unavailable, the sweep physically removes the private file, and history/audit metadata remains. Automated `VotIntegrationTest` exercises this with a disposable PostgreSQL container and simulated clock. No test requires real reminders or clinical integrations.
