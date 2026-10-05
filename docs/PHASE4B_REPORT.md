# Phase 4B implementation report

Base: `e57009842d0cac6ebcc9c7e980c9dfdc6675dde4`. Binding design: [approved v1.4B](architecture/TBCall_Application_API_v1.4B_Phase4B_Contact_Investigation_TPT.md).

Finalized on `wip/phase4b` from preservation commit `68bf8c62758600265ca5fc158c3a1f916840aa5a`. The preserved application, migration and test sources were not restarted, rewritten or changed during finalization.

## Files changed

Added:

- `src/main/resources/db/migration/V14__contact_investigation_tpt_support.sql`
- `src/main/java/id/tbcall/application/contact/ContactDtos.java`
- `src/main/java/id/tbcall/application/contact/ContactAccess.java`
- `src/main/java/id/tbcall/application/contact/ContactViews.java`
- `src/main/java/id/tbcall/application/contact/ContactValidation.java`
- `src/main/java/id/tbcall/application/contact/ContactErrors.java`
- `src/main/java/id/tbcall/application/contact/ContactQueryService.java`
- `src/main/java/id/tbcall/application/contact/ContactService.java`
- `src/main/java/id/tbcall/application/contact/InvestigationService.java`
- `src/main/java/id/tbcall/application/contact/TptService.java`
- `src/main/java/id/tbcall/authorization/ContactSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/authorization/PrototypeContactSourceAuthorityPolicy.java`
- `src/main/java/id/tbcall/web/ContactController.java`
- `src/main/java/id/tbcall/web/InvestigationController.java`
- `src/main/java/id/tbcall/web/TptController.java`
- `src/test/java/id/tbcall/application/ContactTptIntegrationTest.java`
- `src/test/java/id/tbcall/persistence/ContactTptSchemaIntegrationTest.java`
- `docs/CONTACT_INVESTIGATION.md`
- `docs/TPT.md`
- `docs/PHASE4B_REPORT.md`
- `docs/architecture/TBCall_Application_API_v1.4B_Phase4B_Contact_Investigation_TPT.md`
- `docs/superpowers/plans/2026-10-05-phase4b.md`
- `mvnw.cmd` (user-supplied Apache Maven Wrapper 3.3.4, committed unchanged)
- `mvnw` (companion wrapper script, committed unchanged)
- `.mvn/wrapper/maven-wrapper.properties` (Maven 3.9.16 distribution, committed unchanged)

Modified:

- `src/main/java/id/tbcall/persistence/entity/ContactInvestigation.java` (three approved fields)
- `src/main/java/id/tbcall/persistence/entity/PreventiveTreatment.java` (description/reason)
- `src/test/java/id/tbcall/persistence/PersistenceIntegrationTest.java` (expected version 14)
- `src/test/java/id/tbcall/persistence/SchemaHardeningIntegrationTest.java` (exact catalog includes the six approved concepts)
- `README.md`
- `docs/AUTHORIZATION.md`
- `.gitignore` (exclude root `phase4b-clean-test.log`)

All 14 new main Java files are ordinary sources under src/main/java; no generator or reference PDF is needed for compilation. Local prompts/PDFs, toolchains, Maven cache/logs, target and review scratch are excluded from the commit.

The completed Phase 4B range contains 32 files: 25 additions and seven modifications. The finalization commit contains only documentation/ignore updates and the existing wrapper files; application/test/migration content matches the preservation commit. No diagnostic log or Kemenkes PDF is committed.

## V14 and schema boundaries

V14 contains only active_tb_excluded/tpt_eligible/eligibility_assessed_at plus the eligibility CHECK, one-open-investigation partial unique index, source/status/requestedAt index, regimen_description/closure_reason, one-open-contact-TPT index and six PREVENTIVE regimen concepts. Eligibility uses `tpt_eligible IS NOT TRUE OR active_tb_excluded IS TRUE`, so PostgreSQL NULL cannot bypass required exclusion. JPA fields match these additions. V1–V13, V6 lineage and all earlier clinical/laboratory/treatment/referral policies/production behavior remain unchanged.

No genuine schema/specification contradiction was found; V14 was not broadened.

## Routes, states and clinical gate

The full 21-route tables are in [CONTACT_INVESTIGATION.md](CONTACT_INVESTIGATION.md) and [TPT.md](TPT.md): five contact routes, eight investigation routes, seven officer TPT routes and safe GET /api/v1/me/tpt. Existing writes are If-Match protected; lists are bounded to 50 with deterministic ordering.

Create Contact + initial investigation atomically under TBCase lock: INTERNAL starts IN_PROGRESS at source; OUTGOING_REFERRAL starts SENT with an active different destination. Outgoing follows SENT -> RECEIVED -> IN_PROGRESS -> COMPLETED; destination can RETURN from RECEIVED/IN_PROGRESS, source can CANCEL SENT only. Request/receipt/investigation chronology is validated. Completion requires explicit consistent booleans; eligibilityAssessedAt equals investigatedAt. Completion creates no patient/registration/case/TPT.

TPT start requires COMPLETED + activeTbExcluded=true + tptEligible=true and no PLANNED/ACTIVE TPT for that contact. Contact, patient=null, indexCase, source/destination-derived working facility and ACTIVE status are server-owned. ACTIVE PATCH only permits approved metadata. Completion/stop/LTFU close to their explicit statuses with bounded actualEndDate; stop requires reason. outcome_code is not populated.

The six canonical codes are TPT_SO_6H, TPT_SO_3HP, TPT_SO_3HR, TPT_SO_4R, TPT_SO_1HP (TB_SO) and TPT_RO_6LFX (TB_RO). They are TBCall concepts, not official SITB database/API codes. Catalog starts require active PREVENTIVE/category match; individualized starts may use regimenDescription alone. No fixed composition, dose, eligibility or duration is calculated. Selection follows national guidance and clinician assessment.

## Identity, projections, source and continuity

link-patient requires Contact If-Match plus Phase 2 exact WNI/WNA identity reconfirmation, using PatientIdentityService.existing and its post-lock demographic refresh. No UUID-only fallback, fuzzy matching, auto patient creation, demographic copy or link replacement/unlink.

Officer scope is active recorded investigation ownership and recorded TPT facility, independent of index-case currentFacility after transfer. Contact read/write uses recorded investigation source/destination; legacy contact without investigation falls back to current index-case facility. TPT history separately recognizes historical TPT facility, including legacy contact TPT with no investigation. Contact responses mask phone, reveal linked boolean only and filter summaries by permissions/facility. Investigation handoff excludes index-patient identity/HIV/DM/labs/diagnosis/account/audit/sync.

PATIENT + TPT_READ + VERIFIED SELF sees latest direct-patient/contact-linked TPT through explicit left joins. Multiple ACTIVE episodes return 409 ACTIVE_TPT_AMBIGUOUS. Safe DTO includes only status, regimen display/dedicated description, dates/duration and facility display. No writable aggregate ID/version, index-case/category, contact private details, eligibility/results/notes, weight, drugSource, closureReason or audit/sync. No supporter TPT access/adherence write.

ContactSourceAuthorityPolicy provides local contact-write/investigation-transition/TPT-write checks under locks after permission/scope. Its prototype has no external ownership inference/networking. Earlier policies are unchanged. Index-case transfer keeps same indexCase FK and never moves investigation/TPT facilities.

## Concurrency and audit

READ_COMMITTED, scalar scoped IDs before hydration, fresh parent-first locks and no retries:

- Create: TBCase -> inserts.
- Investigation: Contact -> ContactInvestigation.
- TPT start: Contact -> ContactInvestigation -> open check/insert.
- TPT update/closure: Contact -> PreventiveTreatment.
- Contact PATCH/link: Contact; exact linking also reuses Phase 2 patient read-lock reconfirmation.

Real concurrent HTTP tests prove one winner for duplicate TPT starts, receive/cancel, return/complete and concurrent exact patient links. Both deterministic receive-first/cancel-first cases gate the source policy after locks, observe PostgreSQL pg_stat_activity/pg_blocking_pids waits and verify fresh investigation version/state on wake. Unique indexes remain final guards. Source-denial tests compare complete before/after database snapshots and success-audit counts.

All 14 audit actions are covered: CONTACT_CREATED, CONTACT_UPDATED, CONTACT_LINKED_PATIENT, CONTACT_INVESTIGATION_SENT, CONTACT_INVESTIGATION_RECEIVED, CONTACT_INVESTIGATION_STARTED, CONTACT_INVESTIGATION_RETURNED, CONTACT_INVESTIGATION_CANCELLED, CONTACT_INVESTIGATION_COMPLETED, TPT_STARTED, TPT_UPDATED, TPT_COMPLETED, TPT_STOPPED, TPT_LOST_TO_FOLLOW_UP. Metadata stays actor/action/target/correlation only, excluding identity, eligibility/result/notes, regimenDescription and closureReason.

## Verification and review

Initial RED: 90 tests/90 expected failures/zero errors, missing HTTP routes and eligibility columns. Initial implementation GREEN: 90 tests/zero failures/errors/skips, exit 0. Independent review identified one Important legacy TPT-history scope issue; an actual Phase 4A transfer regression reproduced expected 200/actual 404. The focused scope fix changed no schema. Expanded verification: 121 tests (120 HTTP + 1 schema), zero failures/errors/skips, exit 0, BUILD SUCCESS, 04:05 min, finished 2026-10-05T06:06:11+07:00.

Fresh independent read-only review found no other material production/migration/controller/test/documentation issue. The reviewer did not edit files or execute Maven. The exact migration/catalog expectations were extended, not weakened. All previous clinical tests remain part of the required clean verification.

The user completed the required clean verification on Windows at `D:\TBCall`, using the supplied wrapper because Maven is not globally installed:

```powershell
.\mvnw.cmd clean test
```

Exact reported result:

```text
Tests run: 589, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 09:03 min
Finished at: 2026-10-05T11:12:59+07:00
```

This is the previous 468 tests plus 121 Phase 4B tests. Finalization independently summed the current 15 Surefire XML reports and confirmed 589 tests, zero failures/errors/skips, with report timestamps from 11:05 through 11:12 on 2026-10-05. The user confirmed fresh PostgreSQL Testcontainers migration through V14 and Hibernate/application startup. No application or test content changed after that run; no further Maven command was needed for documentation-only finalization.

| Test class | Tests |
|---|---:|
| AdminRecoveryIntegrationTest | 40 |
| ClinicalIntakeIntegrationTest | 63 |
| ContactTptIntegrationTest | 120 |
| IdentityAuthorizationIntegrationTest | 46 |
| LaboratoryIntegrationTest | 68 |
| ProductionVerificationIntegrationTest | 1 |
| ReferralIntegrationTest | 69 |
| SecurityConfigurationTest | 13 |
| TreatmentIntegrationTest | 113 |
| ContactTptSchemaIntegrationTest | 1 |
| PersistenceIntegrationTest | 7 |
| ReferralSchemaIntegrationTest | 1 |
| RuntimePersistenceIntegrationTest | 8 |
| SchemaHardeningIntegrationTest | 37 |
| TreatmentSchemaIntegrationTest | 2 |

The run contains Hikari warnings from earlier test-class pools attempting to reconnect to already terminated Testcontainers. They produced no failures. No correctness/resource-leak defect was identified in the Phase 4B implementation by the read-only review, and production behavior was not changed to suppress warnings.

Final read-only verification confirms the preservation commit's complete workflow, exactly the approved V14 additions, and unchanged V1–V13/earlier production policies. The earlier independent review has no unresolved finding. Root diagnostic logs are absent/ignored; local task prompts/reference PDFs remain ignored. Sources and tests are ordinary tracked files, with standard build output under ignored target.

## Judgments and costs

- Supplied approved architecture/direct request authorizes execution in the current checkout and one completed local commit. No push is authorized.
- Contact writes/read use recorded investigation source/destination ownership; no-investigation legacy contacts use current case scope. TPT reads use their own historical facility. Cost: index-case destination does not inherit unrelated historical workflow access.
- Linking requires exact confirmation even for in-scope patients and Contact If-Match. Cost: clients must first read the Contact and obtain identity confirmation; no convenience matching fallback.
- regimenDescription is a dedicated safe display field visible to SELF; private narratives stay in notes. Cost: officers must keep that description appropriate for patient display.
- Completion notes omitted/null preserve existing notes; nonnull text replaces them. Cost: preserving multiple narratives needs a future approved history design.
- Duration fields remain independently optional with schema validation; startDate denotes actual active start and cannot be future. Cost: prospective scheduling needs a separate approved flow; no implicit duration is supplied.
- Authorization is per request, as before. Revocation affects subsequent requests; already authenticated in-flight commands are not cancelled. Imported inconsistent records require explicit future reconciliation; no silent repair or external authority inference.

The final reviewer explicitly considered and set aside immediate in-flight revocation, automatic imported-record reconciliation, prospective scheduling/duration pairing, automatic description sanitization/narrative history, patient-owned enrollment/supporter/adherence and Phase 4C automation. The above rulings retain the existing request authorization and approved safe-display/date contracts; the deferred behaviors require separately approved designs. Cost: there is no implicit repair, scheduling, redaction, expanded ownership or operational access in this slice.

## Before Phase 4C

No known schema/specification blocker remains. Phase 4C needs its approved architecture, specifically whether monitoring_plans becomes multi-target for treatment/TPT. National TPT outcome-code mapping, external source-authority/ingestion, non-contact risk-group enrollment and prospective/history-relocation workflows need their own later contracts. TPT adherence/adverse tracking, monitoring plans, alerts, notifications, clinical automation and SITB networking were not implemented.
