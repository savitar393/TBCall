# Phase 3B implementation report

Base: `fe780347fa6e12362f7d2cbc1587ae47959c96e8`. Binding contract: schema-reconciled v1.3B.1 with the user's Option 1 authorization retaining the existing V1 PLANNED/ACTIVE/PAUSED index. Earlier v1.3B is explicitly superseded.

## Changes

- Added `application/treatment`: explicit DTOs, access/scope, validation, views, treatment lifecycle, adherence, follow-up, adverse-event and query services.
- Added `web/TreatmentController.java`: 18 routes documented in [TREATMENT.md](TREATMENT.md).
- Added V12 and the three FollowUp entity fields.
- Added authenticated PostgreSQL `TreatmentIntegrationTest` and permanent `TreatmentSchemaIntegrationTest`.
- Updated the existing migration-version assertion to include V12. Laboratory assertions remain unchanged; its setup registration date uses the application's Clock rather than database current_date, and a test-only fixed UTC Clock at PostgreSQL microsecond precision makes chronology deterministic.
- Added treatment guide, this report and implementation plan; updated README/AUTHORIZATION and both architecture documents to remove conflicting active contracts.
- V1–V11, laboratory source policy/implementation, clinical intake and identity infrastructure are unchanged. No generator/build dependency, API entity exposure or Phase 4 feature was introduced.

### File manifest

Added:

- `src/main/java/id/tbcall/application/treatment/AdherenceService.java`
- `src/main/java/id/tbcall/application/treatment/AdverseEventService.java`
- `src/main/java/id/tbcall/application/treatment/FollowUpService.java`
- `src/main/java/id/tbcall/application/treatment/TreatmentAccess.java`
- `src/main/java/id/tbcall/application/treatment/TreatmentDtos.java`
- `src/main/java/id/tbcall/application/treatment/TreatmentErrors.java`
- `src/main/java/id/tbcall/application/treatment/TreatmentQueryService.java`
- `src/main/java/id/tbcall/application/treatment/TreatmentService.java`
- `src/main/java/id/tbcall/application/treatment/TreatmentValidation.java`
- `src/main/java/id/tbcall/application/treatment/TreatmentViews.java`
- `src/main/java/id/tbcall/web/TreatmentController.java`
- `src/main/resources/db/migration/V12__treatment_monitoring_support.sql`
- `src/test/java/id/tbcall/application/TreatmentIntegrationTest.java`
- `src/test/java/id/tbcall/persistence/TreatmentSchemaIntegrationTest.java`
- `docs/TREATMENT.md`
- `docs/PHASE3B_REPORT.md`
- `docs/architecture/TBCall_Application_API_v1.3B.1_Phase3B_Treatment_Monitoring_Schema_Reconciled.md` (approved replacement, updated for Option 1)
- `docs/architecture/TBCall_Application_API_v1.3B_Phase3B_Treatment_Monitoring.md` (supplied predecessor, marked superseded)
- `docs/superpowers/plans/2026-10-04-phase3b.md`

Modified:

- `README.md`
- `docs/AUTHORIZATION.md`
- `src/main/java/id/tbcall/persistence/entity/FollowUp.java`
- `src/test/java/id/tbcall/application/LaboratoryIntegrationTest.java` (test time fixtures only)
- `src/test/java/id/tbcall/persistence/PersistenceIntegrationTest.java` (expected migration versions)

All application/test Java files are normal checked-in source paths. Maven has no source-generation hook or `.tools/` prerequisite. Local toolchain/cache/log files, `target/`, task prompts and reference PDFs are ignored and excluded from the commit. The permanent schema regression replaces the one-off diagnostic role.

## Exact V12 reconciliation

1. `follow_ups`: nullable numeric(6,2) weight, text symptoms, varchar(80) adherence assessment; positive-or-null weight CHECK.
2. Drop `dose_events_treatment_id_scheduled_date_key`; add partial `uq_dose_events_actor_day(treatment_id,scheduled_date,recorded_by_user_id)` for non-null user IDs.
3. Drop `dose_events_source_check`; add named `chk_dose_event_source` preserving SITB/PATIENT/HEALTH_WORKER/TBCALL/IMPORT and adding TREATMENT_SUPPORTER.
4. No status/administration-mode CHECK change. No open-treatment index DDL: reuse V1's PLANNED/ACTIVE/PAUSED invariant unchanged.

The generated names and predicate were inspected on a clean PostgreSQL 16.15 V1–V11 Testcontainer before V12 was written. The retained permanent regression repeats that verification and tests all nine open-state pairings, terminal history, legacy statuses/sources, supporter provenance, redundant TAKEN rejection, multiple null-actor imported rows, actor/day uniqueness and structured observations.

## Behavior and judgments

- Staff writes require the command permission, TB_OFFICER and both treatment/current case facility scopes. Follow-up also verifies its target facility. Clinical source authority applies to all specified clinical writes; monitoring evidence does not consult it.
- Start derives facility/status/catalog drug-name snapshots and stores only explicit lines, including optional clinician-entered doses/frequency. No composition, eligibility, duration, dose or outcome calculation.
- Partial PATCH tracks omitted versus explicit-null optional values; immutable case/facility/regimen/start/status/end/drug fields are rejected.
- Route-specific legacy dose statuses are retained; sources are HEALTH_WORKER/PATIENT/TREATMENT_SUPPORTER and actor/time are derived. Same actor/day duplicates return the specified 409; cross-role routes cannot bypass it. Independent reports coexist; no updates or inferred scores.
- Follow-up schedule/complete persist structured observations with versions and no generated labs/doses/outcomes. Adverse-event observations are explicit, timeline-validated and may be updated after closure.
- Outcome holds TBCase then Treatment before absence check/insertion and atomically closes case/treatment. Failed and successful clinical outcomes both use lifecycle COMPLETED. Two deterministic concurrency tests observe a real PostgreSQL case-lock wait: correction first can commit before closure, outcome first blocks correction. Late first FINAL entries remain allowed after closure.
- SELF reads select latest own episode by startDate/createdAt/id; SELF writes use the ACTIVE selection and reject multiple observed active episodes. Supporter is restricted to the exact active linked case. No patient identity matching or cross-patient treatment selection is introduced.
- Patient DTOs omit clinical prose, operational data and other-user identity. Supporter DTOs additionally omit adverse/outcome/follow-up clinical data. The guide lists exact safe fields; no laboratory results or HIV/DM/NIK/BPJS are exposed.
- Audit actions: TREATMENT_STARTED, TREATMENT_UPDATED, DOSE_EVENT_RECORDED, FOLLOW_UP_SCHEDULED, FOLLOW_UP_COMPLETED, ADVERSE_EVENT_RECORDED, ADVERSE_EVENT_UPDATED, TREATMENT_OUTCOME_RECORDED. Metadata remains the existing correlation-only traceId map.

## Verification

Initial HTTP tests failed on missing endpoints. The schema reconciliation regression reproduced the old treatment/day unique constraint before V12. The first focused green run passed 89 HTTP and 2 schema tests, including real start/dose/outcome concurrency and both lab race orderings. Additional permission/source/history tests are included in the final clean suite.

Root review added child-permission revocation regressions: all five staff and all four SELF/supporter cases first failed by exposing denied child data. Explicit field gates now respect those V7 read permissions without changing standard grants, route scope or clinical behavior. This correction is covered by the final clean suite.

The first clean run exposed three baseline laboratory fixture failures after Jakarta midnight: SQL current_date produced a registration date one day ahead of the UTC Clock used by diagnosis input/validation. Fixed the fixture date source to use the same Clock. The second clean run then exposed a host clock adjustment in a laboratory chronology test: request creation at 17:48:54.077790249Z was followed by a receipt input at 17:48:53.657650819Z. A test-only fixed UTC Clock, truncated to PostgreSQL microsecond precision, removes dependence on wall-clock changes. Every laboratory assertion and all production behavior remain unchanged. The final clean verification reruns the complete suite.

Final verification ran `mvn clean test` with Java 21 and Maven 3.9.16 in WSL, using real PostgreSQL 16.15 Testcontainers. Clean removed `target`, recompiled all 168 application and 11 test source files, migrated empty databases and verified application startup with Hibernate validation. No source generator was run.

Exact final Maven result (exit code 0):

```text
[INFO] Tests run: 398, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  14:30 min
[INFO] Finished at: 2026-10-05T01:09:50+07:00
```

All 283 baseline tests and 115 new Phase 3B tests passed:

| Test class | Tests |
|---|---:|
| AdminRecoveryIntegrationTest | 40 |
| ClinicalIntakeIntegrationTest | 63 |
| IdentityAuthorizationIntegrationTest | 46 |
| LaboratoryIntegrationTest | 68 |
| ProductionVerificationIntegrationTest | 1 |
| SecurityConfigurationTest | 13 |
| TreatmentIntegrationTest | 113 |
| PersistenceIntegrationTest | 7 |
| RuntimePersistenceIntegrationTest | 8 |
| SchemaHardeningIntegrationTest | 37 |
| TreatmentSchemaIntegrationTest | 2 |

Final diff checks verify that V1–V11 and laboratory production/source-authority code remain unchanged. `git diff --check` passes. No one-off diagnostic test, ignored build output, local prompt or clinical reference PDF is included in the commit.

## Review and before Phase 4

Fresh independent read-only review found no confirmed actionable findings in the implemented slice. Early follow-up completion remains restricted by immutable V1's scheduled/completed timestamp constraint.

Cross-case SELF active selection is a request-time lookup under READ_COMMITTED; the selected case/treatment is then locked and checked fresh. A simultaneous start on another case is not globally serialized by a patient lock. The contract has no patient-wide one-active-treatment invariant. Explicit multi-episode selection and any stronger patient-wide serialization need an architectural decision before expanding the patient portal; no new patient-level invariant was invented here.

No remaining migration conflict is known. Phase 4 requires its approved referral/contact/TPT/monitoring design, including current-facility transitions and treatment continuation. Dose correction/post-start drug adjustment and outcome correction remain future history-preserving commands. No Phase 4 work or SITB network integration was started.
