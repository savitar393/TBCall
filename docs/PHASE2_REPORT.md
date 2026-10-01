# Phase 2 implementation report

Historical Phase 2 completion report. The [Phase 2.1 checkpoint](architecture/TBCall_Application_API_v1.2.1_Phase2.1_Transition_Hardening.md) supersedes initial case-state and patient-list status-filter behavior as described in the addendum below. The original 199-test build evidence remains historical evidence for the Phase 2 commit.

Base: `dbb659fdbf48f9333ecfc819c1f814e69a6de5fc`. Scope: approved clinical intake and case confirmation only. The completion commit containing this report is identified in the final handoff; no commit hash is embedded in its own contents.

## Files created/changed

Created:

- `src/main/java/id/tbcall/application/clinical/ClinicalDtos.java` — typed create/patch inputs and explicit response projections.
- `ClinicalAccess.java` — permission/current-patient/resource scope checks.
- `ClinicalErrors.java` — stable clinical failures and identity unique-conflict mapping.
- `ClinicalValidation.java` — merged identity, active references, dates, numeric values and SO/RO validation.
- `ClinicalViews.java` — explicit mapping, masked identities and batched catalog labels.
- `ClinicalQueryService.java` — bounded list, scoped details and restricted SELF query.
- `PatientIdentityService.java` — exact resolution and existing-patient reconfirmation.
- `PatientService.java` — demographic update.
- `RegistrationService.java` — atomic new/existing registration and OPEN patch.
- `DiagnosisService.java` — explicit diagnosis commands and parent version/state coordination.
- `CaseService.java` — explicit case confirmation and profile patch.
- `src/main/java/id/tbcall/web/ClinicalIntakeController.java` — 13 HTTP endpoints.
- `src/main/resources/db/migration/V11__clinical_intake_support.sql`.
- `src/test/java/id/tbcall/application/ClinicalIntakeIntegrationTest.java`.
- `docs/CLINICAL_INTAKE.md`.
- `docs/architecture/TBCall_Application_API_v1.2_Phase2_Clinical_Intake.md` — supplied approved architecture.
- `docs/plans/phase2-clinical-intake.md`.
- `docs/PHASE2_REPORT.md` — this report.

The clinical Java filenames without repeated paths above are all in `src/main/java/id/tbcall/application/clinical/`.

Changed:

- `README.md` and `docs/AUTHORIZATION.md` — Phase 2 coverage, scope/projections, V11 and operational contract.
- `src/main/java/id/tbcall/authorization/ClinicalSourceAuthorityPolicy.java` and `PrototypeClinicalSourceAuthorityPolicy.java` — explicit create policy alongside edit.
- `src/test/java/id/tbcall/persistence/PersistenceIntegrationTest.java` — expected applied migration count 11.
- `src/test/java/id/tbcall/persistence/SchemaHardeningIntegrationTest.java` — exact TB_OFFICER permission set includes V11 grant.
- `src/test/java/id/tbcall/application/IdentityAuthorizationIntegrationTest.java` — replace the obsolete Phase 1 assumption that clinical routes are absent with ordinary-account denial; public NIK claim remains unavailable (405 because the GET patient-detail path now exists).

No V1–V10 migration, entity, build configuration, session, CSRF/CORS or authentication behavior was modified. No PDF/local task prompt/helper or generated Java source directory is part of the changes. Application compilation uses committed ordinary Java sources; `.tools/` supplies local development tooling only.

## Migration and endpoints

V11 adds PATIENT_IDENTITY_RESOLVE (`Mencocokkan identitas pasien untuk registrasi`), grants it only to TB_OFFICER and creates `idx_patients_other_identity` on non-null other_identity_number. No other schema changes.

The 13 method/path combinations and required permissions are listed in [CLINICAL_INTAKE.md](CLINICAL_INTAKE.md): identity resolve; registration create; patient list/detail/patch; registration detail/patch; diagnosis create/patch; case confirm/detail/patch; patient SELF. Laboratory/treatment and later phase endpoints remain absent.

## Design judgments

- Patient, TBRegistration, Diagnosis and TBCase remain separate mapped records. No external identifiers replace local UUID primary keys.
- Explicit DTO records prevent recursive entity serialization. Separate confirmation/list/detail/resource/SELF projections retain only use-case-approved data. Lists use arrays for multiple scoped current episodes and batched queries rather than per-patient queries.
- Exact secondary name confirmation normalizes trim, repeated whitespace and case. All supplied confirmation values must match; there is no fuzzy identity resolver. BPJS is additional confirmation only. WNA ambiguity is checked after confirmations; no unsupported WNA unique constraint was introduced.
- Existing UUID alone is accepted only with current clinical scope. Optional confirmation is validated and resolved, including ambiguity, before UUID lookup, then rechecked after locking/refreshing the matched patient. Neither malformed nor ambiguous confirmation discloses whether an unrelated UUID exists.
- Database NIK/BPJS unique constraints arbitrate concurrent inserts/updates. Preflight duplicate checks use COMMIT query flush mode so a dirty demographic PATCH can return PATIENT_IDENTITY_DUPLICATE before automatic flush. Clinical changes are explicitly flushed before IDENTITY-keyed success audit inserts can trigger implicit flushing; unique races therefore receive the same clinical code. Failed clinical writes and success audits roll back.
- Known birthDate and birthDateUnknown=true are treated as mutually exclusive. PATCH tracks field presence and validates merged records, including active optional references. Weight/height must fit existing numeric(6,2).
- First diagnosis changes OPEN → DIAGNOSED; additional diagnosis preserves DIAGNOSED and explicitly increments registration.version. Case confirmation locks registration then chosen diagnosis, creates one ACTIVE case, timestamps it using injected Clock and changes registration to CONVERTED_TO_CASE. Diagnosis patch takes the same lock order and rejects a confirming diagnosis. No clinical result or resistance classification is inferred.
- Ordinary scoped queries return indistinguishable 404 for missing/out-of-scope resources. Role/permission/no-active-assignment denials are 403. Historical registration reads do not grant patient detail or unrelated clinical resources. Case resource access follows currentFacility; diagnosis follows its parent registration facility.
- Every clinical write calls the explicit create/edit source policy after authorization. The local prototype enforces TB officer permission/facility scope without guessed SITB ownership or integration behavior.

## Audit actions

PATIENT_IDENTITY_RESOLVED, PATIENT_CREATED, PATIENT_UPDATED, TB_REGISTRATION_CREATED, TB_REGISTRATION_UPDATED, DIAGNOSIS_RECORDED, DIAGNOSIS_UPDATED, TB_CASE_CONFIRMED and TB_CASE_UPDATED. Metadata is traceId only; identity, HIV/DM, notes and payloads are excluded.

## Verification

The new integration suite has 47 test executions against real PostgreSQL 16 via Testcontainers and Spring Security HTTP requests. It covers migrations/grants/index, WNI/WNA rules, exact/ambiguous resolution, duplicates and rollback, concurrent identity creation, historical reconfirmation/current scope, bounded lists and projections, If-Match/merged patches, transitions/lineage/resistance, concurrent case confirmation, all 13 endpoints for four excluded roles, SELF revocation, source policy invocation/denial and audit exclusions.

Independent review identified reconfirmation existence disclosure (malformed and ambiguous variants) and duplicate identity PATCH generic errors. Corrected regression tests reproduced all four failing executions (two reconfirmation variants and two identity fields). The concurrent new-identity test also reproduced premature audit-triggered flush returning DATA_CONFLICT. Fixes preserve clinical semantics and stable identity conflicts. The original source tests first failed for missing Phase 2 endpoints. Test fixture CSRF transport was corrected without changing application security.

The first full clean build passed all 47 Phase 2 executions but exposed an obsolete Phase 1 test asserting that clinical endpoints do not exist. Its two assertions now require rejection of public NIK claiming and ACCESS_DENIED for clinical access by an ordinary account. No previous test was removed; migration/grant expectations are also updated for prescribed V11.

Final command: `mvn clean test`, run with Java 21.0.12.1 and Maven 3.9.16 through the local WSL toolchain, using Docker/Testcontainers PostgreSQL 16.15. Process exit code: **0**.

Exact Maven summary:

```text
[INFO] Tests run: 199, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  05:09 min
[INFO] Finished at: 2026-10-01T18:36:46+07:00
```

| Suite | Executions | Failures/errors/skipped |
|---|---:|---|
| AdminRecoveryIntegrationTest | 40 | 0/0/0 |
| ClinicalIntakeIntegrationTest | 47 | 0/0/0 |
| IdentityAuthorizationIntegrationTest | 46 | 0/0/0 |
| ProductionVerificationIntegrationTest | 1 | 0/0/0 |
| SecurityConfigurationTest | 13 | 0/0/0 |
| PersistenceIntegrationTest | 7 | 0/0/0 |
| RuntimePersistenceIntegrationTest | 8 | 0/0/0 |
| SchemaHardeningIntegrationTest | 37 | 0/0/0 |

The 152 existing executions and 47 new Phase 2 executions were green at Phase 2 completion. The clean gate deletes target, compiles committed ordinary source files, migrates empty PostgreSQL databases through V11 and starts Spring with Hibernate validation. The local build log path was `.tools/final-mvn-clean-test.log` (ignored and replaced by later checkpoint runs, not a build input or committed artifact). No `.tools/` source generator was executed or required. Final independent review found no remaining Important/Critical issues, including the narrow legacy-test update.

## Architecture conflicts / before Phase 3

No conflict requiring a V1–V10 or approved access-contract change was found. Phase 2 has no negative/non-TB closure-reason model; closure remains deferred as specified. Real SITB source authority requires an authorized ownership/integration contract. The next clinical phase requires its own approved laboratory/treatment specification; no Phase 3 work was started.

## Phase 2.1 transition addendum

Initial case state now follows the confirming diagnosis disposition: TREAT_HERE → ACTIVE, REFERRED → REFERRED, NOT_TREATED/UNKNOWN → 409 CLINICAL_STATE_CONFLICT. REFERRED requires a present, active destination distinct from the source. Successful confirmation retains registration.facility as currentFacility and converts registration to CONVERTED_TO_CASE; rejection creates no case/success audit and preserves registration status/version. Narrative diagnosisResult is unchanged and drives no classification.

REFERRED is pre-treatment. The destination remains on the confirming diagnosis; no referral row, transfer or acceptance occurs. Source clinical visibility remains unchanged. Future treatment initiation requires ACTIVE status; destination activation belongs to the approved future referral workflow.

Current patient-list filters now permit only registrationStatus OPEN/DIAGNOSED and caseStatus ACTIVE/REFERRED; historical values return 400 VALIDATION_ERROR. V1–V11 are unchanged, V12 is absent, and no Phase 3 work is included. See the [Phase 2.1 report](PHASE2_1_REPORT.md) for checkpoint files and clean-build evidence.
