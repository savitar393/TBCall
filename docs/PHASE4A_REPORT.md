# Phase 4A implementation report

Base: `d148b13a52c13d58c9cab332cb31ecb820347903`. Binding design: [approved v1.4A](architecture/TBCall_Application_API_v1.4A_Phase4A_Referral_Transfer.md).

## Changes and V13

V13 contains exactly the approved in-flight unique index, source/status/sentAt index and return_reason text column. Referral mapping adds only returnReason. V1–V12 remain unchanged.

The workflow has eight routes, explicit DTO/access/view/query/command/error classes and a dedicated referral source-authority interface/prototype. The complete endpoint and state tables are in [REFERRALS.md](REFERRALS.md).

Files added:

- `src/main/resources/db/migration/V13__referral_continuity_support.sql`
- `src/main/java/id/tbcall/application/referral/ReferralDtos.java`
- `src/main/java/id/tbcall/application/referral/ReferralAccess.java`
- `src/main/java/id/tbcall/application/referral/ReferralViews.java`
- `src/main/java/id/tbcall/application/referral/ReferralQueryService.java`
- `src/main/java/id/tbcall/application/referral/ReferralService.java`
- `src/main/java/id/tbcall/application/referral/ReferralErrors.java`
- `src/main/java/id/tbcall/authorization/ReferralSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/authorization/PrototypeReferralSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/web/ReferralController.java`
- `src/test/java/id/tbcall/application/ReferralIntegrationTest.java`
- `src/test/java/id/tbcall/persistence/ReferralSchemaIntegrationTest.java`
- `docs/REFERRALS.md`
- `docs/PHASE4A_REPORT.md`
- `docs/architecture/TBCall_Application_API_v1.4A_Phase4A_Referral_Transfer.md`
- `docs/superpowers/plans/2026-10-05-phase4a.md`

Files modified:

- `src/main/java/id/tbcall/persistence/entity/Referral.java`
- `src/test/java/id/tbcall/persistence/PersistenceIntegrationTest.java` (expected version 13)
- `README.md`
- `docs/AUTHORIZATION.md`

All source files are ordinary tracked Java/Maven paths; no source-generator prerequisite or local prompt/PDF/build artifact is committed.

## Behavior and judgments

- PRE_TREATMENT send requires REFERRED, confirming diagnosis REFERRED with the exact destination and no open treatment. It does not move ownership or create treatment. Report activates the same case at destination; Phase 3B can then start treatment.
- TREATMENT_TRANSFER send moves only case status to REFERRED; treatment stays ACTIVE at source. Report moves the same case/currentFacility and same treatment/facility to destination, with ACTIVE continuation. Return/cancel restore ACTIVE at source; received referrals require destination return rather than source cancellation.
- Scalar scope queries precede fresh TBCase -> Treatment -> Referral locks, compatible with start/outcome/laboratory correction. Existing-referral transitions require Referral If-Match. No retries.
- Receive notes preserve the send notes when omitted/null and replace them when non-null text is supplied; one notes column is available and no inferred concatenation is introduced. Cost if this choice needs revision: receipt notes can replace prior text; a separate history-preserving narrative contract would be needed.
- Restore/report recheck REFERRED parent/current source and active source treatment without outcome, preventing reactivation of closed or externally moved parents. Inconsistent external records require reconciliation rather than silent repair.
- Incoming/outgoing use destination/source assignments separately; detail remains accessible to both after transfer. Ordinary clinical access follows current case/treatment facility. Explicit dual assignment can retain both scopes; it is not an administrator bypass.
- Minimal handoff projection contains only patient id/display name, case category/status, limited treatment summary, referral facilities/states/times/notes/reasons. HIV/DM, labs, diagnosis prose, operational drug/dose narratives, account/audit/sync data are excluded. SELF/supporter links are unchanged and no referral portal is added for those roles.
- ReferralSourceAuthorityPolicy runs after permission/scope checks under the locks; prototype authority is local. Existing clinical and laboratory policies are unchanged.
- Audits: REFERRAL_SENT, REFERRAL_RECEIVED, REFERRAL_RETURNED, REFERRAL_CANCELLED, REFERRAL_REPORTED. Existing correlation-only metadata excludes identity, notes and reasons.

## Verification

The initial schema regression failed on missing return_reason against V1–V12. The initial HTTP fixture mistakenly supplied email instead of auth.identity; corrected the fixture before implementing the workflow. The corrected red run executed 60 HTTP tests failing on missing routes, with the V13 schema regression green (61 total, zero test errors).

The final suite covers state/side/version/chronology rules, in-flight uniqueness and terminal history, source authority invocation/denial rollback, audit/privacy and exact history snapshots. Real concurrent tests include duplicate send, receive/cancel, outcome/send and outcome/report. Deterministic tests gate real source policies after parent locks and observe PostgreSQL lock waits rather than infer locking from final status alone.

Focused verification: 70 tests (69 authenticated HTTP + 1 schema), zero failures/errors/skips, Maven exit 0; BUILD SUCCESS, total time 03:09 min, finished 2026-10-05T05:01:20+07:00. The first implementation run's only failure was the destination-start test fixture missing Phase 3B's required drug startDate; corrected the input without weakening the existing contract.

Final full verification used Java 21, Maven 3.9.16 and PostgreSQL 16.15 Testcontainers in WSL. `mvn clean test` removed target and recompiled all 177 application and 13 test source files. Empty databases migrated through V13; Hibernate validation/application startup passed. All 398 existing tests plus 70 Phase 4A tests passed. No source generator was executed.

Exact final result, exit code 0:

```text
[INFO] Tests run: 468, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  10:20 min
[INFO] Finished at: 2026-10-05T05:13:30+07:00
```

| Test class | Tests |
|---|---:|
| AdminRecoveryIntegrationTest | 40 |
| ClinicalIntakeIntegrationTest | 63 |
| IdentityAuthorizationIntegrationTest | 46 |
| LaboratoryIntegrationTest | 68 |
| ProductionVerificationIntegrationTest | 1 |
| ReferralIntegrationTest | 69 |
| SecurityConfigurationTest | 13 |
| TreatmentIntegrationTest | 113 |
| PersistenceIntegrationTest | 7 |
| ReferralSchemaIntegrationTest | 1 |
| RuntimePersistenceIntegrationTest | 8 |
| SchemaHardeningIntegrationTest | 37 |
| TreatmentSchemaIntegrationTest | 2 |

Final diff checks pass. V1–V12 and treatment/laboratory production/source-policy code remain unchanged. The requested local commit includes 20 files: 16 additions and four modifications. Ignored toolchain/cache/log/build/review scratch files, local task prompts and clinical PDFs are excluded.

## Before Phase 4B

Fresh independent read-only whole-change review found no Critical/Important implementation issue and confirmed the focused test evidence. Its sole minor finding, stale README wording that Phase 4 was unimplemented, is corrected in the requested documentation update.

Reviewer questions settled by existing boundaries:

- Authorization is resolved per request. Revoked permissions/assignments affect the next request; an already authenticated in-progress command is not cancelled. Stronger immediate revocation would require a broader authorization contract.
- External inconsistent records require explicit reconciliation. External ingestion and source ownership rules are not inferred in the local prototype.
- Historical follow-up/laboratory ownership is preserved. Automatic relocation or rescheduling is expressly excluded.
- Contacts/TPT/monitoring/alerts/notifications and patient/supporter referral portals remain outside Phase 4A.

No known schema/specification conflict remains. Phase 4B requires its approved contacts/TPT architecture. Future imported referrals need explicit source authority, consistent parent continuity and migration reconciliation for duplicate in-flight records. Historical follow-up/lab facility ownership remains deliberate; any relocation/rescheduling requires its own approved commands. No Phase 4B/4C feature, clinical automation or SITB network integration is implemented.
