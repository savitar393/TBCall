# Treatment — Phase 3B

Contract: [schema-reconciled v1.3B.1](architecture/TBCall_Application_API_v1.3B.1_Phase3B_Treatment_Monitoring_Schema_Reconciled.md), with the approved reuse of V1's open-treatment index. The earlier v1.3B draft is superseded. These identifiers are TBCall canonical values; they are not official SITB database/API fields.

## Schema

V1–V11 remain immutable. V12 adds `follow_ups.weight_kg numeric(6,2)`, `symptom_summary text`, `adherence_assessment varchar(80)` and `chk_follow_up_weight` (null or positive).

V12 drops the verified V1 `dose_events_treatment_id_scheduled_date_key`, replaces it with `uq_dose_events_actor_day` on treatment/date/user where user is non-null, and replaces `dose_events_source_check` with `chk_dose_event_source`. All old source values remain valid; TREATMENT_SUPPORTER is added. Status and administration-mode CHECKs are unchanged. Null-actor import/SITB evidence can coexist on the same day.

V12 **reuses** V1's `uq_treatments_one_open_per_case` unchanged, covering PLANNED, ACTIVE and PAUSED. It neither creates nor alters this index. Terminal history without an outcome may coexist with a new treatment if every start precondition holds.

## Endpoints

All paths are under `/api/v1`. Session authentication and CSRF apply. Scoped staff resources return 404 for absent/out-of-scope IDs, 403 for missing role/permission/active membership. Versioned reads/commands return ETag; required If-Match is one quoted numeric version (428 missing, 400 malformed, 409 stale). Child creation does not require an If-Match except follow-up scheduling, which uses the treatment version.

| Method | Path | Permission / precondition |
|---|---|---|
| POST | `/cases/{caseId}/treatments` | TB_OFFICER, TREATMENT_WRITE, ACTIVE case, no open episode or final case outcome |
| GET | `/cases/{caseId}/treatments` | TB_OFFICER, TREATMENT_READ, current case facility scope; historical treatments filtered by treatment facility |
| GET | `/treatments/{treatmentId}` | TB_OFFICER, TREATMENT_READ, treatment and current case facility scope |
| PATCH | `/treatments/{treatmentId}` | TB_OFFICER, TREATMENT_WRITE, ACTIVE treatment, Treatment If-Match |
| POST / GET | `/treatments/{treatmentId}/dose-events` | TB_OFFICER, ADHERENCE_RECORD / ADHERENCE_READ |
| POST / GET | `/me/treatment/dose-events` | PATIENT, verified SELF, ADHERENCE_RECORD / ADHERENCE_READ |
| POST / GET | `/me/supporting-cases/{caseId}/dose-events` | TREATMENT_SUPPORTER, exact active case link, ADHERENCE_RECORD / ADHERENCE_READ |
| POST | `/treatments/{treatmentId}/follow-ups` | TB_OFFICER, FOLLOW_UP_WRITE, ACTIVE treatment, Treatment If-Match |
| POST | `/follow-ups/{followUpId}/complete` | TB_OFFICER, FOLLOW_UP_WRITE, SCHEDULED follow-up, ACTIVE treatment, FollowUp If-Match |
| GET | `/me/follow-ups` | PATIENT, FOLLOW_UP_READ, verified SELF |
| POST | `/treatments/{treatmentId}/adverse-events` | TB_OFFICER, ADVERSE_EVENT_WRITE, ACTIVE treatment |
| PATCH | `/adverse-events/{eventId}` | TB_OFFICER, ADVERSE_EVENT_WRITE, Event If-Match; allowed after treatment closure |
| POST | `/treatments/{treatmentId}/outcome` | TB_OFFICER, OUTCOME_WRITE, ACTIVE case/treatment, Treatment If-Match |
| GET | `/me/treatment` | PATIENT, TREATMENT_READ, verified SELF |
| GET | `/me/supporting-cases/{caseId}/treatment` | TREATMENT_SUPPORTER, TREATMENT_READ, exact active case link |

No administrator, lab or program role grants an operational bypass. Follow-up completion also requires the follow-up facility in active scope; scheduling's optional target defaults to the treatment facility and must be active/in scope.

## Treatment and snapshots

Start accepts regimenCode/startDate plus planned end, initial weight, oatForm, drugSource, intensive/continuation dates, regimenDescription and notes. It requires 1–20 explicitly supplied active drug lines. Regimen must be active TB_TREATMENT and match the case category. Treatment facility/status and drug-name snapshot are derived by the server. A catalog rename never changes a stored drug snapshot.

Drug lines accept drugCode, treatmentPhase, doseValue, doseUnit, frequencyPerWeek, startDate/endDate, batchNumber, drugSource and notes. Doses are optional, positive when present and require a unit; frequency is 1–7. No exact duplicate normalized code/phase/start tuple. Decimal precision follows the database (weight 4 integer/2 fraction digits, dose 7 integer/3 fraction digits). Start cannot be future or precede the confirming diagnosis date when present. End dates cannot precede start dates; drug/phase dates cannot precede treatment start; continuation cannot start before intensive end when both are provided. Planning future dates is allowed.

PATCH accepts only plan metadata. Omitted fields remain unchanged; explicit null clears optional metadata. Case, facility, regimen, start/status/actualEndDate and drug rows are protected. Regimen composition, dose, eligibility and duration are never calculated. Staff detail includes minimum patient/case context, plan, drug snapshots, evidence counts/recent reports, follow-ups, adverse events, outcome and only case-owned FOLLOW_UP laboratory request IDs/statuses.

## Dose evidence

Aggregate projections respect the child's read permission as well as the parent route's permission: ADHERENCE_READ, FOLLOW_UP_READ, ADVERSE_EVENT_READ, OUTCOME_READ and LAB_REQUEST_READ where applicable. If a child read permission is removed, its list is empty or its summary/outcome is null; aggregate detail is not a bypass. Standard V7 grants provide all fields approved for each role.

| Route | Derived source | Allowed statuses |
|---|---|---|
| Officer | HEALTH_WORKER | TAKEN_OBSERVED, TAKEN_SELF_REPORTED, DISPENSED_HOME, MISSED, UNKNOWN |
| Patient | PATIENT | TAKEN_SELF_REPORTED, MISSED, UNKNOWN |
| Supporter | TREATMENT_SUPPORTER | TAKEN_OBSERVED, TAKEN_SELF_REPORTED, MISSED, UNKNOWN |

Input is scheduledDate/status, optional administrationMode and notes. Modes are DIRECTLY_OBSERVED, SELF_ADMINISTERED, OTHER. The server derives actor and recordedAt from the session/Clock. ACTIVE treatment and startDate ≤ scheduledDate ≤ today are required. Each user may submit only once per treatment/day, even across role routes. Same-actor duplicates return 409 DOSE_EVENT_ALREADY_RECORDED; different actors' independent evidence remains intact. There is no update/delete/dedupe, medical score, inferred daily status or lifecycle mutation. Summary counts count reports, including contradictory evidence, rather than classifying days.

Dose lists use page/size, default 0/20, maximum 100, stable date/time/id ordering. Treatment projections include the 10 most recent reports.

## Follow-up, adverse events and outcome

Schedule input: followUpType, scheduledAt, optional facilityId/notes. Scheduling sets SCHEDULED and advances the treatment version so a stale scheduling command cannot succeed. Completion records completedAt (between scheduled time and now), optional positive weight, symptom summary, adherence assessment/notes; it sets COMPLETED and the current health worker. Completion does not create labs, doses or outcomes.

Adverse-event creation accepts eventType, optional severity/serious/startedAt/endedAt/description/actionTaken/outcome and derives reportedAt from Clock. Updates accept the same optional observations, excluding eventType/parent/reportedAt. Omitted fields are preserved; explicit null clears optional observations, but serious cannot be null. Event times cannot be future or reversed. No causality/seriousness or regimen change is inferred. Post-closure updates remain auditable.

Outcome input: active outcomeCode, outcomeDate between treatment start and today, optional notes. The command locks TBCase then Treatment, verifies outcome absence, inserts one immutable outcome and atomically sets treatment.actualEndDate/outcomeDate, treatment/case status COMPLETED and case.closedAt/Clock. COMPLETED denotes lifecycle closure, including clinical failure outcomes; outcomeCode carries the classification. Follow-up lab corrections take the same case lock: a correction committed first can precede closure; a correction arriving after closure fails. Late first FINAL lab entries remain allowed after outcome. No silent retries.

## Projection and source authority

SELF reads select the deterministic latest own episode (startDate, createdAt, id descending); adherence writes select the own ACTIVE treatment. Multiple active treatments across a patient's cases produce 409 ACTIVE_TREATMENT_AMBIGUOUS for writes so no arbitrary episode is modified. Supporter selection is restricted to the linked case. SELF follow-ups span own episodes.

Patient DTOs include status/regimen/dates, safe drug schedule, recent evidence, code/date outcome and adverse type/severity/seriousness/times. They exclude narratives/action/outcome text, clinician notes, dose notes, operational batch/source details, HIV/DM, labs, audit/sync and other-user IDs. Follow-up projection includes only scheduling/status/facility, without weight, symptom/adherence narrative or health-worker identity.

Supporter DTOs include caseId, patient display name, treatment status/regimen/dates, safe drug schedule and evidence counts/recent reports. They omit adverse events, outcome, labs, HIV/DM, NIK/BPJS, diagnosis, clinical/operational notes and actor identities. No supporter follow-up access is implemented.

ClinicalSourceAuthorityPolicy applies to treatment start/update, follow-up schedule/complete, adverse-event create/update and outcome. Dose evidence is TBCall-owned monitoring data. LaboratorySourceAuthorityPolicy and Phase 3A.1 behavior are unchanged.

## Audit and deferred work

TREATMENT_STARTED, TREATMENT_UPDATED, DOSE_EVENT_RECORDED, FOLLOW_UP_SCHEDULED, FOLLOW_UP_COMPLETED, ADVERSE_EVENT_RECORDED, ADVERSE_EVENT_UPDATED, TREATMENT_OUTCOME_RECORDED record only actor/action/target/correlation metadata, never clinical payload.

Pause/resume/stop/cancel, dose corrections, post-start drug adjustments, automated schedules/labs/outcomes, referral/contact/TPT, alerts and SITB networking remain out of scope. Future drug/dose changes need history-preserving commands; future multiple-active-episode self selection needs an explicit API contract.
