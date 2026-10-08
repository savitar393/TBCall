# TBCall isolated real-stack E2E suite

Opt-in test infrastructure for approved application baseline `ce7c5f353dd4593c86775f957a2f7d826f9e7337`. It preserves the executed F6B/F6C suite: **56 serial scenarios and 58 database/audit assertions**. This is not a deployment recipe or production-readiness certification.

## Windows commands

Run from the repository root using ordinary Windows PowerShell 7 (not Administrator), Git, Node for syntax checks and Docker Desktop's Linux amd64 engine:

Repository history must contain the approved baseline object. A full clone works; a shallow checkout without that commit fails the source guard until it is separately fetched. Reserve sufficient Docker memory/disk and stop unrelated Docker mutations during a run.

```powershell
# Local source, manifest, syntax, security-profile and safety regression checks.
& .\test-support\e2e\Test-E2E.ps1

# TLS, sandbox, isolation, empty-database ownership and migrated stack startup.
& .\test-support\e2e\Run-E2E.ps1 -Mode Preflight

# Full suite on a new tmpfs database, followed by automatic owned cleanup.
& .\test-support\e2e\Run-E2E.ps1 -Mode Full

# Substitute the state.json path printed by that invocation; independently read-only.
& .\test-support\e2e\Verify-Cleanup.ps1 -StatePath $statePath

# Only after an interruption: remove resources matching the journal and all ownership labels.
& .\test-support\e2e\Remove-OwnedResources.ps1 -StatePath $statePath
```

`-Mode Tls` is a narrower certificate check, not a full pass. Preflight starts migrations only after the owned database is confirmed empty and component isolation passes. Each invocation prints a unique run ID and ignored `.local/runs/<id>/` evidence directory. An incomplete run is retained and never overwritten or counted as success. Stop parallel Docker/application work during execution: exact preservation checks intentionally fail if unrelated resources change.

The runner never pulls images, installs packages or accesses an existing database. Missing pinned artifacts fail before runtime creation. The included `artifacts.reference.json` identifies the already verified F6A.3 artifacts by immutable local image IDs and backend JAR hash. Another machine must acquire/build them separately; see [ACQUISITION.md](ACQUISITION.md). An explicitly reviewed `.local/` artifact manifest may be passed with `-ArtifactManifest` after offline packaging. No changes to the application's dependency files are required.

## Topology

All four Docker bridges are **internal and dual stack**, with random per-run ULA prefixes. Nothing is published to the host, including PostgreSQL. There is no host browser or host application process.

```text
PostgreSQL -- db -- Java/Spring -- api -- Node/Next -- web -- TLS gateway + Chromium
                [owned sinks on each bridge]                 HTTPS app.tbcall.test:3443

outside control bridge: independent owned sink + positive-control probes
```

Java attaches only to db/api; Next to api/web; Chromium and the gateway only to web; PostgreSQL only to db. Docker DNS resolves same-network aliases; upstream DNS is container loopback with bounded timeouts. Reserved `.test` names resolve only in the owned topology. Sinks never forward DNS. Positive controls prove TCP/UDP/DNS/HTTPS/STUN endpoints work, then isolated probes verify IPv4/IPv6 denial to off-network sinks and non-peer bridges. Sink counters must remain unchanged after controls, stack startup and workflows. Browser probes execute requests and WebRTC STUN in Chromium subprocesses, examine process restrictions, and require `chrome://sandbox` namespace/PID/network/seccomp/TSYNC activation. This proves the tested protocols/topology; it is not a claim of exhaustive packet capture or protection from a compromised Docker daemon.

TLS uses a fresh one-day synthetic CA, SAN-checked leaf certificate and separate untrusted control. Before CA import the browser must reject trust; afterwards valid app TLS must succeed, wrong-host and untrusted-CA TLS must fail. Only the public CA is mounted into the browser; private keys stay in the temporary generator/server directory and are removed during cleanup. No host trust store is modified.

Application/browser containers use non-root identities, read-only roots, zero capabilities, no-new-privileges and bounded resources. Chromium has private IPC, 512 MiB shm, 2 GiB memory and 768 PIDs (F6C showed 256 was insufficient). The exact separately approved browser seccomp profile is byte-hash pinned; no additional permissions are introduced. PostgreSQL uses the same **PG-derived backend image**, invoking only `docker-entrypoint.sh postgres`, so its existing Linux Java runtime can execute server-child isolation probes without a host JDK mount. Initialization has only CHOWN/FOWNER/DAC_OVERRIDE/SETUID/SETGID; PostgreSQL's server/probe executes as UID 999. All inherited PG volumes are overridden with tmpfs; persistent volumes and arbitrary bind mounts are refused.

## Safety and reproducibility

- Production tracked contents must match the baseline. Builds use `git archive` of that commit, including V1–V17, never untracked working files or Windows `node_modules`.
- `source.lock.json` hashes executable infrastructure, profiles, coverage and artifact/toolchain contracts. `manifest.json` is the complete allowed tracked manifest. Maintainers deliberately update them when reviewing infrastructure changes.
  Use `& .\test-support\e2e\Update-Manifests.ps1` only after an intentional infrastructure edit, review its diff, then rerun static checks. Execution never regenerates its own trust contract.
- `coverage.json` preserves unique scenario IDs and every assertion occurrence, including repeated keys. Completion requires precisely that coverage, all PASS, and matching expected/actual counts. D07 and D32 races may produce either of their two source-defined winner vectors; the final gate checks those coupled vectors rather than freezing one previous execution's winner.
- Scenarios execute serially. Only explicit bounded races create concurrency with separate authenticated contexts. Failed mutations are never replayed. Polling readiness/event reads does not retry writes.
- Scheduler defaults off. Only D23 restarts the owned JVM with profile `test`, nonproduction flag and 1000 ms sweep interval, after creating real time-bounded events. No application trigger, clock override or direct clinical fixture SQL is added.
- Accounts, credentials and synthetic clinical records are generated per run. Mutation payloads, cookies, tokens, verification values and queued SQL/IDs remain in disposable memory/tmpfs. Retained local evidence includes masked operation paths, status/expected/actual assertions and aggregate counts. No screenshots, HAR, traces or clinical snapshots are recorded.
- Resource IDs and three ownership labels are journaled. Cleanup verifies the Docker context/daemon and each exact resource ID/labels, never prunes volumes. Before/after inventories check every original container status/exit code, network ID, volume name, host 5432 listener identity and firewall profile defaults. The host database is not connected to.
- Everything generated, including reports/logs/certificates, stays under ignored `.local/`; ignore patterns also prevent accidental captures or private keys. Stage only this directory's reviewed manifest, never `git add .`.

## Coverage and limits

See [COVERAGE.md](COVERAGE.md), [coverage.json](coverage.json) and [REPORT.md](REPORT.md). This suite covers real HTTPS browser API fetches and selected rendered account-link/portal workflows. Most clinical writes are not full staff form interaction. Stock role APIs cannot independently remove one officer permission for a selective-missing-permission fixture. Roleless notification denial, wrong roles and foreign facilities are covered. No multi-JVM/soak test, forced lock order, exhaustive transition matrix, authoritative external import, SITB call or deployment verification is performed. A failed test is evidence to investigate; production code must not be modified just to make this suite pass.
