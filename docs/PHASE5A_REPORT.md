# Phase 5A completion report

Approved base: `688e21cb805d5f664b87d911455ac582032dde42`. Branch: `feat/phase5a-integration-boundary`. Contract: [approved v1.5A](architecture/TBCall_Application_API_v1.5A_SITB_Integration_Boundary.md). Scope is integration boundary only; no SITB network access, import or write-back.

## Changed-file manifest

Created:

- `src/main/resources/db/migration/V17__integration_boundary_source_authority.sql`
- `src/main/java/id/tbcall/persistence/entity/ExternalSourceAuthority.java`
- `src/main/java/id/tbcall/persistence/entity/IntegrationConflict.java`
- `src/main/java/id/tbcall/persistence/repository/ExternalSourceAuthorityRepository.java`
- `src/main/java/id/tbcall/persistence/repository/IntegrationConflictRepository.java`
- `src/main/java/id/tbcall/authorization/ExternalAuthorityRegistry.java`
- `src/main/java/id/tbcall/application/integration/IntegrationDtos.java`
- `src/main/java/id/tbcall/application/integration/IntegrationQueryService.java`
- `src/main/java/id/tbcall/web/IntegrationController.java`
- `src/test/java/id/tbcall/persistence/IntegrationBoundarySchemaIntegrationTest.java`
- `src/test/java/id/tbcall/application/ExternalAuthorityIntegrationTest.java`
- `src/test/java/id/tbcall/application/IntegrationAdministrationIntegrationTest.java`
- `src/test/java/id/tbcall/application/IntegrationWriteGuardIntegrationTest.java`
- `docs/INTEGRATION_BOUNDARY.md`
- `docs/PHASE5A_REPORT.md`
- `docs/architecture/TBCall_Application_API_v1.5A_SITB_Integration_Boundary.md` (supplied approved file, unchanged)
- `docs/superpowers/plans/2026-10-05-phase5a.md`

Modified:

- `src/main/java/id/tbcall/persistence/entity/SyncItem.java`
- `src/main/java/id/tbcall/authorization/PrototypeClinicalSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/authorization/PrototypeLaboratorySourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/authorization/PrototypeReferralSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/authorization/PrototypeContactSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/authorization/PrototypeMonitoringSourceAuthorityPolicy.java`
- `src/test/java/id/tbcall/persistence/PersistenceIntegrationTest.java` (V17, 62 tables, inactive SITB seed expectation)
- `src/test/java/id/tbcall/persistence/AlertLineageHardeningSchemaIntegrationTest.java` (explicit historical V16 boundary)
- `README.md`
- `docs/AUTHORIZATION.md`

V1–V16 are unchanged. No local prompt, PDF, diagnostic log, credentials or `.tools/` scratch belongs to this manifest. Dependencies/configuration and existing clinical/laboratory/referral/contact/monitoring/adherence services/controllers are unchanged.

## V17 exact summary

Only the approved seed/DDL:

1. Seed TBCall-internal external_systems code SITB with the approved name/description and active=false, ON CONFLICT(code) DO NOTHING.
2. external_source_authorities: UUID/system FK, exact entity UUID/type/scope, optional external ID/version, effective/released/created/updated times and release-order CHECK. One active registration per entity/scope across systems; system/scope/time and entity lookup indexes. No SQL scope allowlist.
3. integration_conflicts: UUID/system FK, optional local entity UUID, external ID/type/scope, optional hashes/version, four approved statuses, observation/resolution timestamps/note and time-order CHECK. One OPEN conflict per system/external record/scope; status/time and entity indexes.
4. sync_items.local_content_hash and conflict_id FK. Existing operation/status checks remain unchanged.

Existing integration tables, UUID primary keys and external identifier uniqueness are retained. Authority/conflict rows are internal ledgers with lazy unidirectional JPA references; no generic clinical mutation service or integration write API exists.

## Registry and policy behavior

Active means released_at IS NULL. Explicit entity/type/scope registration controls ownership independently of system activation and identifiers. Registry methods expose exact active descriptors and enforce the Phase 5A application scope allowlist under read-only READ_COMMITTED, joining existing write transactions.

Existing role/permission/facility checks remain first. Policy mappings: Clinical→CLINICAL with unchanged resource type; Laboratory→LABORATORY with actual lab target; Referral→REFERRAL entity/scope; Contact/Investigation/TPT→their respective entity under CONTACT_TPT; Monitoring→MONITORING_PLAN/MONITORING even for event commands. New targets without IDs remain local. No identifier/parent/facility-based authority inference.

Matching authority returns 409 SOURCE_AUTHORITY_CONFLICT, title `Sumber data tidak mengizinkan perubahan lokal`, with fixed Indonesian reconciliation detail and no external-system internals. No success audit survives denial. Patient/supporter adherence and automatic monitoring sweep semantics remain unchanged; no retries/distributed authority locks are introduced.

## Admin API, privacy and inactive SITB

All seven approved GET endpoints and exact safe projections/pagination are documented in [INTEGRATION_BOUNDARY.md](INTEGRATION_BOUNDARY.md). Both SYSTEM_ADMIN and INTEGRATION_MANAGE are required; other roles have no bypass. Authorization precedes existence lookup. Wrong-system sync-run IDs are 404.

SITB is seeded inactive and reports UNCONFIGURED. All summaries report UNCONFIGURED because this phase has no connector, regardless of metadata activation flags. External IDs and domain scope codes are TBCall concepts, not claimed official SITB API/schema fields.

Explicit scalar queries never select raw_payload, raw error_message values, resolution_note, clinical rows or arbitrary audit metadata. Error summaries are fixed safe text based on presence; run item lists are paginated. No credentials are stored, requested or exposed. Read browsing adds no success audit. No integration mutation routes or network client/provider/dependency exist.

## Verification

Schema RED: two expected failures against V16 (absent marker/upgrade), zero errors. Initial schema GREEN: 46 tests, zero failures/errors/skips, including 14 new schema cases, 25 historical V16 cases and 7 persistence cases.

Policy RED: 85 cases, seven expected matching-authority failures, zero errors. Initial policy GREEN: 85 cases, zero failures/errors/skips. Admin route RED: authenticated GET returned 404; login fixture was corrected to the existing identity field before this route-level RED. The initial admin run passed 20 cases and exposed a test expectation mismatch: POST sync-runs/start matches the GET detail pattern and correctly returns 405. Fixture expectation was corrected without changing production routing.

The first combined run found five laboratory HTTP fixture failures: direct-SQL setup omitted request_reason_code, which existing LabViews requires when building the successful response. The fixture now uses the existing DIAGNOSIS reference code; production behavior is unchanged.

Expanded focused final run: 199 tests, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS; 01:49 min; finished 2026-10-05T17:22:49+07:00. New tests: 91 registry/policy, 21 administrator, 40 real HTTP write and 15 schema cases = 167 Phase 5A cases. The focused run also passed all 25 historical V16 and 7 persistence cases.

All 16 historical migration Git-filtered blob hashes match the approved base. Independent final read-only review passed with no critical, important or minor findings; no fixes were requested. No Phase 5B network or external host is needed; tests use local PostgreSQL Testcontainers and real Spring/HTTP session/policy boundaries.

Final command on Windows, with Java 21 and Docker Desktop:

```powershell
.\mvnw.cmd clean test
```

Exact result (process exit code 0):

```text
[INFO] Tests run: 886, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  14:39 min
[INFO] Finished at: 2026-10-05T17:39:11+07:00
```

Cross-check: all 22 freshly generated Surefire XML reports sum to 886 tests with zero failures/errors/skips. This is all 719 baseline cases plus 167 Phase 5A cases. The run verified fresh PostgreSQL V1–V17 migrations, Hibernate/application startup, the V16→V17 upgrade, authority/conflict history and concurrent uniqueness, safe administration, policy/access precedence, write rollback and preserved adherence. Local evidence is retained in ignored `.tools/phase5a-clean-test.log`; it is not committed. Hikari background reconnect warnings for previously terminated test containers did not fail the run; production behavior was not changed to suppress them.

The checkpoint is committed/pushed on `feat/phase5a-integration-boundary`; the commit SHA and verified remote SHA are returned with the final delivery. Only documentation was updated after the successful clean build.

## Rulings and future prerequisites

- Retain the explicitly selected Windows feature checkout; use native commands and this ledger rather than Unix skill helper scripts. Cost if wrong: edits stay on this branch and process evidence requires manual checking.
- UNCONFIGURED is explicit for all systems because no connector exists; active stays persisted metadata. Cost if wrong: a later approved connector phase must add an actual configuration status contract.
- Safe sync error summaries use presence plus fixed Indonesian wording, not free-text truncation. Cost if wrong: administrators need an approved diagnostic workflow for detailed errors.
- Existing GET pattern matching makes unsupported POST sync-runs/start return 405, while truly absent mutation paths return 404. Cost if wrong: clients must treat either as no supported mutation; no application endpoint behavior was changed to satisfy the test.
- No optional SOURCE_AUTHORITY_WRITE_BLOCKED audit action is added; existing audit/error paths remain. Cost if wrong: future integration operations may need separately designed denial telemetry.
- Final review ruling: physical connectivity/authentication/mapping/write-back remains outside Phase 5A, as approved. Cost if wrong: no operational SITB integration is available until authorized Phase 5B work.
- Final review ruling: concurrent connector authority mutation/locking/retries remains deferred, because no connector writer exists. Cost if wrong: ownership can race if a future writer is added without a locking contract.
- Final review ruling: automatic monitoring sweeps and indirect effects beyond existing source-policy commands retain approved existing semantics. Cost if wrong: a future ownership contract may require additional target checks.
- Final review ruling: detailed error diagnostics/conflict resolution remain absent from the approved read APIs. Cost if wrong: administrators cannot inspect or resolve these through Phase 5A endpoints.
- Final review ruling: reviewer did not execute the full build; the implementer must record fresh exact clean evidence before commit. Cost if wrong: a review alone would miss runtime regressions.

No genuine schema/policy conflict has been identified. Before Phase 5B, obtain authorized current interface/authentication/environment/ID/version/read-write/rate-error/ownership/cursor/privacy material, then approve mapping, synchronization lock order/idempotency, resolution, write-back, secret rotation and network resilience. The SITB manual alone cannot authorize or define those contracts.
