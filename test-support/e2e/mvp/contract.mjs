// Pure contract checks. Importing this module performs no I/O or live operation.
export const definition = Object.freeze({
  id: 'MVP01', objective: 'One rendered synthetic adult TB_SO journey from intake to explicit outcome',
  workers: 1, mutationRetries: 0,
  steps: ['LOGIN', 'INTAKE', 'DIAGNOSTIC_REQUEST', 'SPECIMEN', 'RECEIPT', 'RESULT',
    'DIAGNOSIS', 'CASE', 'TREATMENT', 'DOSE', 'FOLLOW_UP_SCHEDULE', 'FOLLOW_UP_COMPLETE', 'OUTCOME'],
});
export function requireThat(value, code) { if (!value) throw new Error(code); }
export function uuid(value) {
  requireThat(typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value), 'MVP_UUID_INVALID');
  return value;
}
const text = (v, max = 255) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const time = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)
  && Number.isFinite(Date.parse(v));
function shape(v, required, optional = []) {
  requireThat(v && typeof v === 'object' && !Array.isArray(v), 'MVP_PLAN_SHAPE');
  requireThat(required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => [...required, ...optional].includes(k)), 'MVP_PLAN_SHAPE');
}
function catalog(list, code) { requireThat(text(code, 100) && Array.isArray(list)
  && list.filter(v => v.code === code).length === 1, 'MVP_CATALOG_SELECTION_UNAVAILABLE'); }

export function validatePlan(p, refs, now = new Date()) {
  shape(p, ['clinicalReview', 'patient', 'registration', 'lab', 'diagnosis', 'treatment', 'dose', 'followUp', 'outcome']);
  shape(p.clinicalReview, ['status', 'reference']);
  requireThat(p.clinicalReview.status === 'APPROVED_SYNTHETIC_ONLY' && text(p.clinicalReview.reference, 100), 'MVP_CLINICAL_OWNER_APPROVAL_PENDING');
  shape(p.patient, ['fullName', 'otherIdentityNumber', 'birthDate', 'sexCode']);
  requireThat(/^MVP SYNTHETIC /.test(p.patient.fullName) && text(p.patient.fullName)
    && /^MVP-SYNTHETIC-[a-f0-9-]{36}$/.test(p.patient.otherIdentityNumber), 'MVP_SYNTHETIC_IDENTITY_REQUIRED');
  uuid(p.patient.otherIdentityNumber.slice(14));
  shape(p.registration, ['registrationDate', 'suspectTypeCode', 'previousTreatmentCategoryCode']);
  shape(p.lab, ['testTypeCode', 'specimenType', 'timestampMode', 'resultText']);
  requireThat(p.lab.timestampMode === 'LIVE_CAPTURED_UTC', 'MVP_LAB_TIME_MODE_INVALID');
  shape(p.diagnosis, ['diagnosisDate', 'anatomicalSiteCode', 'diagnosisTypeCode', 'diagnosisResult']);
  shape(p.treatment, ['regimenCode', 'startDate', 'drugs']);
  shape(p.dose, ['scheduledDate', 'status', 'administrationMode']);
  shape(p.followUp, ['followUpType', 'scheduledAt', 'completedAt', 'weightKg', 'symptomSummary', 'adherenceAssessment']);
  shape(p.outcome, ['outcomeCode', 'outcomeDate']);
  const dates = [p.patient.birthDate, p.registration.registrationDate, p.diagnosis.diagnosisDate,
    p.treatment.startDate, p.dose.scheduledDate, p.outcome.outcomeDate];
  requireThat(dates.every(date) && Number.isFinite(now.getTime()), 'MVP_DATE_INVALID');
  const today = now.toISOString().slice(0, 10);
  requireThat(p.patient.birthDate <= `${Number(p.registration.registrationDate.slice(0, 4)) - 18}${p.registration.registrationDate.slice(4)}`
    && p.registration.registrationDate <= p.diagnosis.diagnosisDate && p.diagnosis.diagnosisDate <= p.treatment.startDate
    && p.treatment.startDate <= p.dose.scheduledDate && p.dose.scheduledDate <= p.outcome.outcomeDate
    && p.outcome.outcomeDate <= today, 'MVP_CHRONOLOGY_INVALID');
  const times = [p.followUp.scheduledAt, p.followUp.completedAt];
  requireThat(times.every(time) && times.every(t => Date.parse(t) <= now.getTime()), 'MVP_TIME_INVALID');
  // New request receipt must not predate the server-created requestedAt. Actual lab
  // timestamps are captured during the run; this intentionally compressed story
  // requires today's diagnosis, not fabricated historical lab receipt times.
  requireThat(p.diagnosis.diagnosisDate === today && p.treatment.startDate <= p.followUp.scheduledAt.slice(0, 10)
    && Date.parse(p.followUp.scheduledAt) <= Date.parse(p.followUp.completedAt)
    && p.followUp.completedAt.slice(0, 10) <= p.outcome.outcomeDate, 'MVP_CHRONOLOGY_INVALID');
  requireThat(text(p.lab.specimenType, 100) && text(p.lab.resultText, 2000)
    && text(p.diagnosis.diagnosisResult, 255) && text(p.followUp.followUpType, 100)
    && text(p.followUp.symptomSummary, 2000) && text(p.followUp.adherenceAssessment, 255)
    && typeof p.followUp.weightKg === 'number' && p.followUp.weightKg > 0 && /^\d{1,4}(?:\.\d{1,2})?$/.test(String(p.followUp.weightKg)),
  'MVP_CLINICAL_INPUT_INVALID');
  requireThat(['TAKEN_OBSERVED', 'TAKEN_SELF_REPORTED'].includes(p.dose.status), 'MVP_MEDICATION_EVIDENCE_REQUIRED');
  catalog(refs.clinical.citizenships, 'WNA'); catalog(refs.clinical.caseCategories, 'TB_SO');
  catalog(refs.clinical.treatmentDispositions, 'TREAT_HERE'); catalog(refs.lab.requestReasons, 'DIAGNOSIS');
  catalog(refs.clinical.sexCodes, p.patient.sexCode);
  catalog(refs.clinical.suspectTypes, p.registration.suspectTypeCode);
  catalog(refs.clinical.previousTreatmentCategories, p.registration.previousTreatmentCategoryCode);
  catalog(refs.clinical.anatomicalSites, p.diagnosis.anatomicalSiteCode);
  catalog(refs.clinical.diagnosisTypes, p.diagnosis.diagnosisTypeCode); catalog(refs.lab.testTypes, p.lab.testTypeCode);
  catalog(refs.treatment.regimens, p.treatment.regimenCode);
  requireThat(refs.treatment.regimens.find(r => r.code === p.treatment.regimenCode).caseCategoryCode === 'TB_SO', 'MVP_REGIMEN_CATEGORY_MISMATCH');
  catalog(refs.treatment.staffDoseStatuses, p.dose.status); catalog(refs.treatment.administrationModes, p.dose.administrationMode);
  catalog(refs.treatment.outcomeCodes, p.outcome.outcomeCode);
  requireThat(Array.isArray(p.treatment.drugs) && p.treatment.drugs.length >= 1 && p.treatment.drugs.length <= 20, 'MVP_DRUG_LINES_INVALID');
  const drugKeys = new Set();
  for (const d of p.treatment.drugs) {
    shape(d, ['drugCode', 'startDate'], ['treatmentPhase', 'doseValue', 'doseUnit', 'frequencyPerWeek']);
    catalog(refs.treatment.drugs, d.drugCode);
    requireThat(date(d.startDate) && d.startDate >= p.treatment.startDate && d.startDate <= p.outcome.outcomeDate, 'MVP_DRUG_DATE_INVALID');
    requireThat((d.doseValue === undefined || (typeof d.doseValue === 'number' && d.doseValue > 0 && /^\d{1,7}(?:\.\d{1,3})?$/.test(String(d.doseValue))))
      && (d.frequencyPerWeek === undefined || (Number.isInteger(d.frequencyPerWeek) && d.frequencyPerWeek >= 1 && d.frequencyPerWeek <= 7))
      && (d.doseUnit === undefined || text(d.doseUnit, 30)) && (d.treatmentPhase === undefined || text(d.treatmentPhase, 40))
      && (d.doseValue === undefined || d.doseUnit !== undefined), 'MVP_DRUG_LINES_INVALID');
    const key = JSON.stringify([d.drugCode, d.treatmentPhase ?? null, d.startDate]);
    requireThat(!drugKeys.has(key), 'MVP_DUPLICATE_DRUG_LINE'); drugKeys.add(key);
  }
  return p; // No defaults or clinical recommendations are supplied here.
}

export function verifyActor(me, role, permissions, facility) {
  uuid(me.id); uuid(facility);
  requireThat(me.roles.some(r => r.code === role) && permissions.every(p => me.permissions.includes(p))
    && me.activeFacilities.some(f => f.id === facility), 'MVP_ACTOR_SCOPE_UNAVAILABLE');
}
export function validateChain(c) {
  const keys = ['patient', 'registration', 'request', 'test', 'specimen', 'result', 'diagnosis', 'case', 'treatment', 'dose', 'followUp', 'outcome'];
  keys.forEach(k => uuid(c[k]));
  requireThat(new Set(keys.map(k => c[k])).size === keys.length, 'MVP_CHAIN_IDENTITY_COLLISION');
}
export function sameDrugSnapshots(actual, supplied, catalogRows) {
  if (!Array.isArray(actual) || actual.length !== supplied.length) return false;
  if (!actual.every(v => catalogRows.some(d => d.code === v.drugCode && d.name === v.drugName))) return false;
  const signatures = rows => rows.map(v => JSON.stringify([v.drugCode,v.startDate,v.treatmentPhase ?? null,
    v.doseValue ?? null,v.doseUnit ?? null,v.frequencyPerWeek ?? null])).sort();
  return JSON.stringify(signatures(actual)) === JSON.stringify(signatures(supplied));
}
const q = v => { requireThat(typeof v === 'string' && !v.includes('\0'), 'MVP_SQL_VALUE_INVALID'); return `'${v.replaceAll("'", "''")}'`; };
const id = v => q(uuid(v));
export function databaseAssertions(c, p, officerId, final) {
  validateChain(c); uuid(officerId);
  requireThat(Number.isSafeInteger(final.treatmentVersion) && final.treatmentVersion >= 0
    && Number.isSafeInteger(final.caseVersion) && final.caseVersion >= 0, 'MVP_VERSION_INVALID');
  const rows = [], add = (key, sql, expected = 1) => rows.push({ scenario: 'MVP01', key, sql, expected: String(expected) });
  add('single_identity_chain', `select count(*) from patients p join tb_registrations r on r.patient_id=p.id join diagnoses d on d.registration_id=r.id join tb_cases c on c.registration_id=r.id and c.confirming_diagnosis_id=d.id join treatments t on t.case_id=c.id where p.id=${id(c.patient)} and r.id=${id(c.registration)} and d.id=${id(c.diagnosis)} and c.id=${id(c.case)} and t.id=${id(c.treatment)}`);
  add('one_registration', `select count(*) from tb_registrations where patient_id=${id(c.patient)}`);
  add('one_diagnosis', `select count(*) from diagnoses where registration_id=${id(c.registration)}`);
  add('one_case', `select count(*) from tb_cases where registration_id=${id(c.registration)}`);
  add('one_treatment', `select count(*) from treatments where case_id=${id(c.case)}`);
  add('diagnostic_lab_lineage', `select count(*) from lab_requests r join lab_request_tests t on t.lab_request_id=r.id join lab_specimens s on s.lab_request_id=r.id join lab_results v on v.lab_request_test_id=t.id and v.specimen_id=s.id where r.id=${id(c.request)} and r.registration_id=${id(c.registration)} and r.case_id is null and r.request_reason_code='DIAGNOSIS' and t.id=${id(c.test)} and s.id=${id(c.specimen)} and v.id=${id(c.result)} and v.status='FINAL' and v.sequence_no=1`);
  add('one_lab_request', `select count(*) from lab_requests where registration_id=${id(c.registration)}`);
  add('one_test', `select count(*) from lab_request_tests where lab_request_id=${id(c.request)}`);
  add('one_result', `select count(*) from lab_results where lab_request_test_id=${id(c.test)}`);
  add('drug_snapshot_count', `select count(*) from treatment_drugs where treatment_id=${id(c.treatment)}`, p.treatment.drugs.length);
  // Distinct phase/start-date lines may share a drug code. Compare an exact multiset.
  requireThat(typeof p.followUp.weightKg === 'number' && Number.isFinite(p.followUp.weightKg) && p.followUp.weightKg > 0
    && p.treatment.drugs.every(d => (d.doseValue === undefined || (typeof d.doseValue === 'number' && Number.isFinite(d.doseValue)))
      && (d.frequencyPerWeek === undefined || Number.isSafeInteger(d.frequencyPerWeek))), 'MVP_SQL_NUMBER_INVALID');
  const terms = p.treatment.drugs.map(d => `(${q(d.drugCode)},${q(d.startDate)}::date,${d.doseValue ?? 'null'}::numeric,${d.doseUnit === undefined ? 'null' : q(d.doseUnit)},${d.frequencyPerWeek ?? 'null'}::integer,${d.treatmentPhase === undefined ? 'null' : q(d.treatmentPhase)})`).join(',');
  add('drug_snapshot_mismatch', `with expected(code,start_date,dose,unit,frequency,phase) as (values ${terms}), actual as (select d.code,t.start_date,t.dose_value,t.dose_unit,t.frequency_per_week,t.treatment_phase from treatment_drugs t join drugs d on d.id=t.drug_id where t.treatment_id=${id(c.treatment)}), delta as ((select * from actual except all select * from expected) union all (select * from expected except all select * from actual)) select count(*) from delta`, 0);
  add('one_dose', `select count(*) from dose_events where treatment_id=${id(c.treatment)}`);
  add('dose_actor_evidence', `select count(*) from dose_events where id=${id(c.dose)} and treatment_id=${id(c.treatment)} and recorded_by_user_id=${id(officerId)} and source='HEALTH_WORKER' and status=${q(p.dose.status)} and scheduled_date=${q(p.dose.scheduledDate)}::date`);
  add('follow_up_completed', `select count(*) from follow_ups where id=${id(c.followUp)} and treatment_id=${id(c.treatment)} and status='COMPLETED' and completed_at is not null and weight_kg=${p.followUp.weightKg}`);
  add('one_follow_up', `select count(*) from follow_ups where treatment_id=${id(c.treatment)}`);
  add('explicit_outcome', `select count(*) from treatment_outcomes where id=${id(c.outcome)} and treatment_id=${id(c.treatment)} and outcome_code=${q(p.outcome.outcomeCode)} and outcome_date=${q(p.outcome.outcomeDate)}::date`);
  add('one_outcome', `select count(*) from treatment_outcomes where treatment_id=${id(c.treatment)}`);
  add('terminal_versions', `select count(*) from treatments t join tb_cases c on c.id=t.case_id where t.id=${id(c.treatment)} and c.id=${id(c.case)} and t.status='COMPLETED' and c.status='COMPLETED' and t.version=${final.treatmentVersion} and c.version=${final.caseVersion} and t.actual_end_date=${q(p.outcome.outcomeDate)}::date`);
  const actions = [['PATIENT_CREATED','patient'],['TB_REGISTRATION_CREATED','registration'],['LAB_REQUEST_CREATED','request'],
    ['LAB_SPECIMEN_RECORDED','specimen'],['LAB_SPECIMEN_RECEIVED','specimen'],['LAB_RESULT_RECORDED','result'],
    ['DIAGNOSIS_RECORDED','diagnosis'],['TB_CASE_CONFIRMED','case'],['TREATMENT_STARTED','treatment'],
    ['DOSE_EVENT_RECORDED','dose'],['FOLLOW_UP_SCHEDULED','followUp'],['FOLLOW_UP_COMPLETED','followUp'],['TREATMENT_OUTCOME_RECORDED','outcome']];
  for (const [action, key] of actions) add(`audit_${action.toLowerCase()}`, `select count(*) from audit_logs where action=${q(action)} and entity_id=${id(c[key])} and actor_user_id=${id(action === 'LAB_SPECIMEN_RECEIVED' || action === 'LAB_RESULT_RECORDED' ? c.labUser : officerId)}`);
  add('denied_updates_no_success_audit', `select count(*) from audit_logs where action='TREATMENT_UPDATED' and entity_id=${id(c.treatment)}`, 0);
  return rows;
}

// The browser callback alone cannot certify acceptance. The host supplies its
// sanitized ledger and every actual read-only DB result, checked against the
// originally queued assertion expectations, not expectations rewritten to pass.
export function verifyAcceptance(ledger, expectedRows, database) {
  requireThat(ledger?.id === 'MVP01' && ledger.status === 'PASS' && ledger.workers === 1 && ledger.mutationRetries === 0
    && Array.isArray(ledger.steps) && ledger.steps.join('|') === definition.steps.join('|'), 'MVP_BROWSER_ACCEPTANCE_INCOMPLETE');
  requireThat(Array.isArray(expectedRows) && expectedRows.length === 32 && new Set(expectedRows.map(r => r.key)).size === 32
    && Array.isArray(database) && database.length === expectedRows.length, 'MVP_DATABASE_ACCEPTANCE_INCOMPLETE');
  const seen = new Set();
  for (const row of database) {
    const expected = expectedRows.find(r => r.key === row.key);
    requireThat(row.scenario === 'MVP01' && expected && !seen.has(row.key) && row.status === 'PASS'
      && String(row.expected) === expected.expected && String(row.actual) === expected.expected, 'MVP_DATABASE_ACCEPTANCE_INCOMPLETE');
    seen.add(row.key);
  }
  return { id: 'MVP01', status: 'PASS', renderedSteps: 13, databaseAssertions: 32, workers: 1, mutationRetries: 0 };
}
