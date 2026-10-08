# F6C.1 verification report

Baseline: `ce7c5f353dd4593c86775f957a2f7d826f9e7337`. Branch: `test/f6c-e2e-harness`. Runtime evidence stays exclusively in ignored `.local/`; legacy diagnostic evidence remains ignored under `.tools/`.

## Audit and changes

Consolidated the original 20 scenarios and 36 extensions into one runner and two shared scenario modules. Original clinical assertions and all 58 SQL/audit assertion occurrences are preserved. Reusable Java/Node/PostgreSQL/browser probes, TLS helpers and scheduler restart control are now tracked, with no runtime dependency on ignored diagnostics.

Removed fixed machine paths, dates/run labels, pre-existing host PID/container/volume assumptions and the ignored JDK bind mount. Added random per-run networks/IDs, pinned artifact metadata, exact source/security hashes, an explicit manifest, isolated offline build recipes, task-local evidence, environment restoration, generic preservation snapshots and durable identity/label-checked cleanup (including recovery of a create/journal interruption window).

No backend/frontend dependency or application lockfile change was required. No source behavior, authentication, permission, clinical logic or V1–V17 modification was made. Existing untracked repository content was preserved and excluded. No new downloads, global installations, firewall/Docker settings changes, existing database access or SITB connections occurred.

## Executed checks and disclosed run history

- Native PowerShell safety regressions: initially RED for the missing implementation, then GREEN. Final set: **20 checks**, covering path escape/root junction/ancestor junction denial, exact resource ownership, incomplete/duplicate/failed coverage, matching database counts, legal alternate race winners and inconsistent winner/audit vectors.
- Static checks: PowerShell parsing; Node syntax; exact approved profile hashes and complete structural comparison with the pinned 60-rule Moby baseline; source hash verification; coverage cardinality; prohibited local assumptions/security flags; proposed manifest and staged-content checks.
- Checkout-normalized static execution passed, including the safety checks. This explicitly verifies the LF hash correction across Git checkout, rather than relying only on the author's working files.
- Promoted full invocation 01: **56 scenario PASS, 0 FAIL/BLOCKED/NOT RUN; 58/58 SQL assertions PASS**, TLS/sandbox/isolation and cleanup PASS, but **host exit 1** due to an infrastructure coverage-gate defect. D07 cancellation won instead of result recording. The gate had mistakenly frozen the previous run's expected winner counts. No application failure or automatic mutation replay occurred. This invocation remains retained as unsuccessful host evidence.
- The correction preserves every assertion and its actual/expected equality, checks exact occurrence multiplicity, and permits only the original legal coupled vectors for D07 and D32. Illegal mixed vectors still fail. The invocation-01 ledger passes the corrected regression gate without reexecuting any mutation.
- Fresh-context read-only review found two additional actionable issues: CRLF hash instability on fresh checkout and a path guard that skipped root/ancestor junctions. Both were reproduced RED and fixed GREEN before the final fresh full run. No deferred review findings remain.

Promoted invocation 02 passed with host exit 0, 56/56 scenarios and 58/58 SQL assertions. Independent cleanup and idempotent cleanup verification passed. A final multi-resource portability regression then found the preservation snapshot treated multiline Docker output as one row. This failed RED and was corrected GREEN using a two-container/two-volume/two-network fixture. Invocation 03 verified the final implementation on another fresh database; its results are below.

## Limitations and handoff

The suite is Windows PowerShell 7 + Linux amd64 Docker infrastructure. A fresh clone needs separately approved pinned artifacts/cache inputs; no silent acquisition occurs. The offline packaging entry point is statically checked but was **not rebuilt in this checkpoint**; runtime verification reuses the already built and validated F6A.3 artifacts. Archive/image inputs remain external prerequisites. A new Linux dependency tar can have different metadata bytes and requires provenance/hash review before changing the infrastructure pin.

Docker daemon implicit-default seccomp equivalence is still unverified; the exact approved official baseline plus four syscall permissions is explicit and unchanged. Network tests cover the listed IPv4/IPv6 TCP/UDP/DNS/HTTPS/STUN protocols and actual Chromium children, with controlled positive/negative sinks, not exhaustive packet capture or a compromised-daemon model.

Most clinical operations use real browser HTTPS fetches, with selected rendered account-link/portal UI flows. No selective single-officer-permission fixture, forced lock ordering, multi-JVM/soak, complete clinical transition matrix, external-authority import or deployment verification is claimed. D28 patient DOM privacy covers its final alerts page; other safe API projections and original patient-home DOM are separate checks. See `COVERAGE.md` for remaining transition gaps.

**GO for opt-in use and independent review of the promoted suite.** No production/deployment readiness claim is made. This checkpoint does not authorize the next phase or merging into main.

## Final fresh reproduction (invocation 03)

`	ext
PROMOTED_HOST_PASS                         exit 0
E2E_FULL_PASS scenarios=56 databaseAssertions=58 mutationRetries=0
E2E_CLEANUP_PASS ownedResourcesAbsent=true certificatesRemoved=true preservationMatched=true
INDEPENDENT_CLEANUP_PASS ownershipChecked=true exactPreservation=true
`

- Scenarios: **56 PASS, 0 FAIL, 0 BLOCKED, 0 NOT RUN**, serial workers=1.
- Database/audit assertions: **58 PASS, 0 FAIL**, same occurrence contract as F6C.
- TLS: before-import rejection, valid trusted app, wrong-host rejection, untrusted-CA rejection and secure-context checks PASS.
- Actual Chromium sandbox: namespace layer 1, PID/network namespaces, seccomp-BPF and TSYNC PASS. Non-root parent/container has no outer capabilities; namespace-local zygote capabilities are confined to Chromium's own user namespace.
- **21 complete protocol probe invocations**, all expectationFailures=0, covering Java, Node, PostgreSQL UID999 child and actual browser subprocesses. IPv4/IPv6 TCP/UDP/DNS/HTTPS/STUN controls and peer/non-peer isolation PASS before/after startup and after workflows.
- Outside control counts were identical at all four checkpoints: {http:15,dns:162,stun4:1,stun6:1}. No off-network sink traffic or unapproved external connection was observed. Positive controls intentionally communicate only within their own internal bridge. No public Internet probe is used.
- Fresh owned database empty before startup; Flyway **17/17 successful migrations, max version 17, initial users 0**; Hibernate validation and Spring/Next startup PASS.
- Browser cgroup low/high/max/oom/oom_kill/oom_group_kill counters all **0**.
- All **13 created containers and 4 created networks** removed, temporary certificates/private keys removed, no new volumes. Exact original **1 stopped container, 12 volume names and 3 network IDs** preserved, together with host5432 listener identity and all three firewall profile settings. Independent cleanup PASS.
- Invocation 02 also passed the full 56/58 suite and idempotent cleanup verification; invocation 01's host failure is retained above. These are separate fresh databases, not mutation retries.

Final static/staged checks cover all **40 newly tracked files**, and checkout-normalized execution passes. No credentials, certs, cookies, patient data, dumps, logs, HAR, screenshots, private keys, diagnostic prompts or ignored artifacts are staged. Evidence stays ignored.

The whitespace check uses the one-command override `git -c core.whitespace=cr-at-eol,-blank-at-eof diff --cached --check`: the approved profiles retain their original CRLF bytes/hash, and the original probe files retain their harmless final blank lines. No Git global configuration or security profile byte was changed to silence formatting diagnostics.

## Complete changed-file manifest

All changes are new files under 	est-support/e2e/; no other tracked file changes. The equivalent machine-readable allowlist is manifest.json.

- 	est-support/e2e/.gitattributes
- 	est-support/e2e/.gitignore
- 	est-support/e2e/ACQUISITION.md
- 	est-support/e2e/artifacts.reference.json
- 	est-support/e2e/build/.dockerignore
- 	est-support/e2e/build/Backend.Dockerfile
- 	est-support/e2e/build/Browser.Dockerfile
- 	est-support/e2e/build/Frontend.Dockerfile
- 	est-support/e2e/Common.ps1
- 	est-support/e2e/coverage.json
- 	est-support/e2e/COVERAGE.md
- 	est-support/e2e/harness/BrowserNetworkProbe.mjs
- 	est-support/e2e/harness/extended.mjs
- 	est-support/e2e/harness/generate-tls.sh
- 	est-support/e2e/harness/https-gateway.mjs
- 	est-support/e2e/harness/import-ca.py
- 	est-support/e2e/harness/NetworkProbe.java
- 	est-support/e2e/harness/NodeNetworkProbe.mjs
- 	est-support/e2e/harness/OwnedSink.mjs
- 	est-support/e2e/harness/pg-network-probe.sh
- 	est-support/e2e/harness/restart-backend.sh
- 	est-support/e2e/harness/run-smoke.mjs
- 	est-support/e2e/harness/tls-probe.mjs
- 	est-support/e2e/manifest.json
- 	est-support/e2e/PLAN.md
- 	est-support/e2e/Prepare-Runtime.ps1
- 	est-support/e2e/README.md
- 	est-support/e2e/Remove-OwnedResources.ps1
- 	est-support/e2e/REPORT.md
- 	est-support/e2e/Run-E2E.ps1
- 	est-support/e2e/security/browser-seccomp.json
- 	est-support/e2e/security/moby-default.json
- 	est-support/e2e/security/README.md
- 	est-support/e2e/source.lock.json
- 	est-support/e2e/Test-E2E.ps1
- 	est-support/e2e/tests/Safety.Tests.ps1
- 	est-support/e2e/tests/Static.mjs
- 	est-support/e2e/toolchain.lock.json
- 	est-support/e2e/Update-Manifests.ps1
- 	est-support/e2e/Verify-Cleanup.ps1
