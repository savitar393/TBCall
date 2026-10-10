# TBCall F6D.1 — Operational & Production Readiness Gap Audit

**Status:** proposed audit-only checkpoint; not authorization to deploy or change implementation.
**GitHub repository:** `savitar393/TBCall`
**Approved baseline:** `a39b1f2e091c6ea26bfa305413ac9e13d7094dea` (verify remote `main` and the local checkout before starting).
**Current product boundary:** standalone Indonesian TB monitoring prototype; **no authorized SITB networking or official SITB API/schema claim**.

## 1. Mission and evidence standard

Evaluate whether TBCall is ready for a **controlled institutional pilot**, and separately what would be required before **production operation with real patient information**. These are different decisions. No actual pilot/deployment is approved by this audit.

Use the current repository, Git history, existing architecture/security/admin/monitoring/integration documents, and the tracked `test-support/e2e/` suite as primary technical evidence. The F6B/F6C executions demonstrate successful **isolated synthetic-data testing**, not production acceptance. Never infer a deployment capability from a library, a test fixture, a proposed document, or an enabled configuration alone.

For each control, classify:
- **VERIFIED IN CODE** — specific source and tests support the assertion;
- **VERIFIED IN CONTROLLED E2E** — cited F6B/F6C/committed E2E evidence;
- **DOCUMENTED ONLY** — claimed in docs but not independently implemented/verified;
- **UNVERIFIED / ABSENT** — no sufficient supporting evidence;
- **NOT APPLICABLE** — explain the context and reasoning.

Separate **requirements**, **recommendations**, and **decisions requiring a deployment owner**. For legal/regulatory requirements, cite authoritative current primary Indonesian sources with jurisdiction, scope and effective dates; otherwise label as requiring specialist legal/institutional review. Do not turn Kemenkes clinical guidance into fictional SITB technical requirements.

## 2. Audit scope

### A. Hosting, infrastructure and network
- Establish *whether* any real staging/production infrastructure exists. Inventory deployment manifests, images, environment templates, certificates and ingress, but do not assume that `test-support/e2e/` is a deployment solution.
- Proposed topology: HTTPS termination, trusted proxies, strict origin and cookie settings, backend and DB private exposure, DNS, firewall/egress restrictions, CSP/HSTS, container and OS patching, image provenance, non-root/least privilege, limits and process shutdown.
- Health/readiness/liveness behavior, graceful restart, health check of database/queue/delivery dependencies, scheduler ownership, and single-versus-multi-instance assumptions.
- Distinguish HTTPS/proxy controls successfully exercised under the local synthetic E2E topology from public or institutional-domain TLS and trusted-proxy verification, which remain untested.

### B. Identity, access, patient privacy and clinical boundaries
- Registration verification and recovery delivery: determine whether real email/SMS adapters, delivery error behavior, durable outbox/retry/deduplication, and abuse controls exist. Inspect `VerificationDeliveryPort`, auth/recovery services, and associated tests.
- First-admin bootstrap and removal of its credentials; role/grant/facility scoping, auditability of administrative changes, support operations and last-admin safeguards.
- Session/CSRF/cookie rotation, safe error responses, API and edge-rate limiting, log/tracing redaction, consent and verified patient/supporter account-link procedures, break-glass/escalation (if absent, label absent; do not invent), data access/revocation processes.
- Medical-data classification, data minimization, confidentiality, retention/deletion, access audit and organizational responsibility; clinical oversight and the absence of automated treatment decisions.
- Explicit separation between local TBCall reference vocabularies and future officially authorized SITB integration.

### C. PostgreSQL data durability and changes
- Backups/schedules/permissions, encrypted backup storage, key custody and retention; **restore rehearsal evidence**; RPO/RTO targets set by responsible stakeholders; PITR/WAL if needed; disaster-recovery plan, consistency checks and deletion lifecycle.
- Database least-privilege separation between migration owner and runtime user (current startup permissions for V1 extensions need assessment); TLS connections; connection pooling; capacity and indexes; multi-instance locking/scheduler behavior.
- Flyway V1–V17 immutability, forward/backward compatibility, deployment sequencing, rollback/restore strategy, and tests that use new disposable databases rather than live data.

### D. Operations, observability and support
- Structured access/error/security events and audit retention, privacy-safe metrics/traces, alerting on downtime, job failures, failed logins/lookup throttling, security incidents, and abnormal data access.
- Error budgets/SLIs/SLOs (only if actually defined), on-call ownership, incident triage/communications, runbooks, support escalation, maintenance windows, patching, dependency vulnerability handling and scheduled access reviews.
- Controlled scheduler test evidence vs. cluster-safe scheduling, duplicate sweep prevention, notification delivery channels beyond IN_APP and actual operator alerting.

### E. Quality and deployment release controls
- Separate unit/integration and E2E evidence. Inspect `test-support/e2e/`: 56 scenarios, 58 DB/audit assertions and 20 safety regressions were reported at F6C.1; verify actual current manifest and limitations, but **do not rerun** or edit it as part of audit-only task.
- Assess CI automation (or absence), branch protection/review, dependency/SBOM/vulnerability scanning, image provenance, secret scanning, test promotion, rollback verification and a staging-to-production approval gate.
- List known E2E omissions: full staff form-by-form UI, selective officer permission, forced lock order, multi-JVM/soak, various clinical lifecycle edges, real verification-delivery, backup/restore and deployment acceptance.

### F. Institution and legal/SOP readiness
- Identify responsible healthcare institution, controller/processor responsibilities, legal basis, consent and patient/supporter verification steps, incident/breach process, service availability and clinical escalation protocols. Mark unknown institution-specific facts **UNRESOLVED — OWNER INPUT NEEDED** rather than guessing.
- Map potentially applicable Indonesian privacy/medical-record/health information rules to actual product functions, with current official primary citations where verified. Distinguish statutory obligations from policy decisions and recommendations.
- Determine formal approval path for a synthetic-data institutional demonstration vs. a live clinical pilot; do **not** claim government or Kemenkes endorsement. Treat SITB API/network integration as deferred until authorized.

## 3. Mandatory deliverables

Create an **audit report only**, saved under ignored `.tools/f6d1/` unless the user explicitly approves tracked documentation changes. Include:

1. **Executive verdicts:** `GO / CONDITIONAL GO / NO-GO` for (i) further synthetic-data demo, (ii) controlled real-person pilot, (iii) public production deployment, each separately justified.
2. **Current-state architecture:** as observed, not imagined; mark proposed components as proposed.
3. **Control matrix:** ID, domain, control, evidence category, exact source/test/document reference and method, severity, likelihood/impact or risk rationale, status and required evidence.
4. **Prioritized risk register:** P0 / P1 / P2 / P3 with user/data consequence, recommended mitigation, acceptance test, blocker/dependency, accountable owner role (suggested, not assigned), and rough effort **estimate**.
5. **Gap-to-workstream roadmap:** small reversible hardening milestones, with clear constraints on backend migrations, data model, SITB and external integration. Identify what requires architecture approval before coding.
6. **Operational runbook inventory:** missing/available runbooks, on-call/incident, backup/restore, secret rotation, release/rollback, verification delivery, synthetic demo reset and audit export/retention procedures.
7. **Open questions:** only decisions requiring responsible organizational/user input, explicitly separated from facts Codex can determine by reading code.
8. **Evidence ledger:** executed audit commands, inspected files, tools, dates, checksums where relevant; facts from live controls vs prior test reports; redacted output; original repository unchanged.

Avoid a generic security checklist: cite specific TBCall code paths for supported claims and give testable remediation for every blocker. If a control cannot be assessed without infrastructure credentials, say so; do not request secrets in chat.

## 4. Hard boundaries

**No source modification, no migration, no Docker resource creation, no dependency install, no CI changes, no git commit/push/merge, no deploy, no public networking, no live service account login, no real patient data, no reading ignored `.env.local` values or secrets.**

Allow read-only code/history/configuration/evidence inspection and non-sensitive local tool/environment inventory only. Do not access existing PostgreSQL or other external services. The audit must not begin production hardening or SITB implementation. If sensitive data is encountered, do not print or retain it.

Completion criterion: evidence-backed audit and ranked implementation plan, **not** green automated tests or production readiness.
