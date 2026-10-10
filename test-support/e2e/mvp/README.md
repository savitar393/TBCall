# MVP01 — one complete rendered synthetic patient journey

Preparation only. **Browser scenario NOT RUN.** No live stack entrypoint is enabled here.

`journey.mjs` exports `runMvpJourney(h)` using the existing `runExtended(h)` helper convention: `scenario`, `client`, `request`, `observe`, `db`, `actors`, `fixture`. It adds `plan`. `mvpDefinitions` and `registration.json` register **one** separate scenario, thirteen rendered steps and thirty-two queued read-only database/audit assertions. Existing 56 scenarios, 58 assertions, original runner, coverage, manifest and source locks are unchanged.

## Safe validation now (Windows PowerShell)

From the repository root:

```powershell
node --check .\test-support\e2e\mvp\contract.mjs
node --check .\test-support\e2e\mvp\journey.mjs
node --check .\test-support\e2e\mvp\tests.test.mjs
node --test --test-isolation=none .\test-support\e2e\mvp\tests.test.mjs
```

These commands run only parsing, local source/hash checks and injected pure mocks; they do not import Playwright, create files, install dependencies, contact a network, or start a browser/database/Docker. Mock fixtures use deliberately noncatalog `MOCK_*` codes and simulated approval. They are not a clinical execution plan and must not be reused as one.

## Future composition contract — NOT an execution command

After separate owner approval, a reviewed opt-in host composition must:

1. Use a separately approved clean checkout and the original `Assert-ProductionSource`, runtime artifact/image identity, HTTPS trust, actual Chromium sandbox, IPv4/IPv6 TCP/UDP/DNS/browser-subprocess isolation and fresh disposable PostgreSQL admission. This module does not establish or replace those gates.
2. Provision only fictional **verified** officer A, laboratory B and foreign officer B using supported existing account/facility operations, **before** this scenario. Inject `actors.officer/lab/crossOfficer` with ephemeral `email/password`; `fixture.facilityA/facilityB/facilityBName`. Emails must end in `@example.invalid`. The module has no account-registration, verification or delivery call. No real patient or existing database is permitted.
3. Load an independently reviewed synthetic `plan` only into disposable memory/tmpfs. Clinical owner selects all clinical catalog codes, observations, drug lines and outcome. There are no automatic selections or recommended doses/schedules. `clinicalReview` must contain status `APPROVED_SYNTHETIC_ONLY` and a review reference; this declaration checks completeness, **not** authenticity or execution authorization. The operator must independently verify owner approval.
4. Supply the original real browser-origin request helper and create independent contexts with HTTPS errors rejected and UTC timezone. Launch the approved pinned Chromium with sandboxing enabled; verify actual sandbox beforehand. Run only `MVP01`, serially, once. Never import the top-level original `run-smoke.mjs` as a library: it automatically starts its complete suite.
5. Invoke `runMvpJourney(h)` and execute all 32 `db` rows using the original read-only transaction/scalar/counted assertion mechanism. Keep SQL/IDs/clinical strings in tmpfs, retain only key/count/PASS-or-FAIL evidence. Do **not** mark acceptance PASS from the browser callback alone. `verifyAcceptance` admits only the exact completed steps, serial/no-retry metadata and all actual database rows matching the originally queued expected values; missing, duplicate, extra, mismatched or failing results refuse. Only drug-count expected value varies with the approved 1–20 supplied lines.
6. Retain no credentials, input plan, session storage/cookies, clinical request/response payloads, SQL, screenshots, HAR or traces. Map any failure to a constant sanitized classification. No write replay, hidden retry or UI/API response mocking. Stop on failure and preserve sanitized evidence. Use only the original ownership-verified cleanup with independently approved retention and cleanup scope.

The original `Run-E2E.ps1` still starts the 56-scenario runner, and its `Test-E2E.ps1` complete-manifest check will reject these new, intentionally unregistered companion files. **Do not invoke either as if it runs MVP01.** Future host composition and deliberate reviewed manifest admission are outstanding; this task does not rewrite original locks or bypass their checks. The new companion validates its own exact five-file manifest, and verifies all original pinned hashes unchanged. It is not silently added to historical results.

## Plan fields

See `validatePlan` for the strict executable shape:

- `clinicalReview`: status/reference; actual owner decision is still pending.
- `patient`: explicitly fictional full name, unique `MVP-SYNTHETIC-<UUID>` alternate identity, adult birth date and live sex code. WNA is a synthetic test identity path that avoids generating an apparent real NIK; citizenship is not a clinical recommendation.
- `registration`: date, live suspect/prior-treatment codes.
- `lab`: live test code, owner-approved fictional specimen type/result text, timestampMode `LIVE_CAPTURED_UTC`.
- `diagnosis`: today's date, live site/type and approved fictional text; explicit TREAT_HERE.
- `treatment`: matching active TB_SO regimen, start date, 1–20 explicit active drug-code/start-date lines; optional phase/dose/unit/frequency only if independently approved. Missing dose stays absent; no default is generated.
- `dose`: date, TAKEN_OBSERVED or TAKEN_SELF_REPORTED, live administration mode; records HEALTH_WORKER provenance without computing adherence.
- `followUp`: explicit type, UTC schedule/completion instants, positive weight, symptom summary and entered assessment.
- `outcome`: explicitly chosen live outcome code and date; no inferred cure.

Dates form a deliberately compressed **software test**, not a plausible clinical treatment course. New request receipt must be later than server `requestedAt`; the scenario captures current actual lab timestamps and checks that boundary instead of submitting a historical receipt. Diagnosis/treatment/outcome use the same UTC date under present chronology validation. Clinical owner must approve that representational limitation before running/presenting it. Follow-up instants must satisfy the application chronology and not be in the future. A clock/day-boundary mismatch fails; no clock manipulation is allowed.

## UI and security assertions

All successful clinical writes come from rendered forms and observed actual HTTP responses. Actual requests must have CSRF and the authoritative parent/detail or child projection ETag where required. Every watched UI mutation must occur once. POST API helpers are never used for clinical steps. GETs verify catalogs/lineage/final state. Three separately labelled, expected-rejected PATCH controls verify stale precondition (409), lab wrong-role (403), foreign facility (404), then confirm unchanged treatment version/notes and zero success-update audit. Foreign reads and missing source/testing actions are also checked. These negative controls are not stakeholder-presented clinical steps.

The same patient/registration/diagnosis/case/treatment is asserted through final closure. Thirteen exact actor-specific mutation audits, one result/episode/evidence/follow-up/outcome, exact drug snapshot multiset and terminal versions are queued for PostgreSQL verification. Precondition failure never grants permission to try again.

After outcome, authorized treatment/case detail URLs remain readable. There is no claimed historical worklist or reporting feature. A later narrow historical discovery contract/UI is a separate product checkpoint.
