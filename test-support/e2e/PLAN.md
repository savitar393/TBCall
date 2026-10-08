# F6C.1 implementation plan

1. Inventory the completed F6B/F6C runner, protocol probes and coverage. Preserve the 56 scenario IDs and all 58 database assertion occurrences in a reviewed coverage contract.
2. Add regression checks for fail-closed coverage, source/artifact guards, cleanup ownership and path containment. Consolidate the runner into an opt-in PowerShell entry point with task-local evidence and a durable resource journal.
3. Pin the existing approved artifacts and exact browser seccomp profile. Document separate, controlled acquisition and Linux packaging. Runtime execution must never pull or install.
4. Remove fixed host paths/run IDs. Check the production source against the approved baseline; isolate synthetic fixtures and temporary TLS under ignored `.local/`.
5. Run static/safety checks, then one complete fresh disposable execution. Verify all scenarios, database assertions, TLS, sandbox, network probes and exact preservation/cleanup.
6. Perform a fresh-context critical review, address actionable findings, verify the tracked manifest, then commit and push only the test-support scope.

No production source, application dependencies, migrations or global networking changes are authorized. Failed mutations are never automatically retried. Incomplete runs remain evidence rather than being overwritten.
