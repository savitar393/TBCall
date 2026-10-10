// Pure/source/mock tests only. No Playwright import, browser, Docker, DB or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { definition, validatePlan, validateChain, databaseAssertions, verifyActor, verifyAcceptance, sameDrugSnapshots } from './contract.mjs';
import { runMvpJourney, mvpDefinitions } from './journey.mjs';
const root = new URL('../../', import.meta.url), here = new URL('./', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const registration = JSON.parse(readFileSync(new URL('registration.json', here), 'utf8'));
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const keys = ['patient','registration','request','test','specimen','result','diagnosis','case','treatment','dose','followUp','outcome'];
const chain = Object.fromEntries(keys.map((k, i) => [k, uid(i + 1)])); chain.labUser = uid(101);
const option = code => ({ code, name: `MOCK ${code}` });
function input() {
  const today = new Date().toISOString().slice(0,10), past = new Date(Date.now()-1000).toISOString();
  // Simulated review/codes are PURE fixtures; not an approved clinical plan.
  return { clinicalReview: { status:'APPROVED_SYNTHETIC_ONLY', reference:'PURE-MOCK-REVIEW' },
    patient:{fullName:'MVP SYNTHETIC pure fixture',otherIdentityNumber:'MVP-SYNTHETIC-'+uid(90),birthDate:'1990-01-01',sexCode:'MOCK_SEX'},
    registration:{registrationDate:today,suspectTypeCode:'MOCK_SUSPECT',previousTreatmentCategoryCode:'MOCK_PREVIOUS'},
    lab:{testTypeCode:'MOCK_TEST',specimenType:'MOCK synthetic specimen',timestampMode:'LIVE_CAPTURED_UTC',resultText:'MOCK synthetic result'},
    diagnosis:{diagnosisDate:today,anatomicalSiteCode:'MOCK_SITE',diagnosisTypeCode:'MOCK_DIAGNOSIS',diagnosisResult:'MOCK synthetic diagnosis'},
    treatment:{regimenCode:'MOCK_REGIMEN',startDate:today,drugs:[{drugCode:'MOCK_DRUG',startDate:today}]},
    dose:{scheduledDate:today,status:'TAKEN_SELF_REPORTED',administrationMode:'SELF_ADMINISTERED'},
    followUp:{followUpType:'MOCK synthetic follow-up',scheduledAt:past,completedAt:past,weightKg:60,symptomSummary:'MOCK observation',adherenceAssessment:'MOCK entered assessment'},
    outcome:{outcomeCode:'MOCK_OUTCOME',outcomeDate:today} };
}
function references() { return {
  clinical:{citizenships:[option('WNA')],caseCategories:[option('TB_SO')],treatmentDispositions:[option('TREAT_HERE')],
    sexCodes:[option('MOCK_SEX')],suspectTypes:[option('MOCK_SUSPECT')],previousTreatmentCategories:[option('MOCK_PREVIOUS')],
    anatomicalSites:[option('MOCK_SITE')],diagnosisTypes:[option('MOCK_DIAGNOSIS')]},
  lab:{requestReasons:[option('DIAGNOSIS')],testTypes:[option('MOCK_TEST')]},
  treatment:{regimens:[{...option('MOCK_REGIMEN'),caseCategoryCode:'TB_SO'}],drugs:[option('MOCK_DRUG')],
    staffDoseStatuses:[option('TAKEN_SELF_REPORTED')],administrationModes:[option('SELF_ADMINISTERED')],outcomeCodes:[option('MOCK_OUTCOME')]} }; }
test('registration is one opt-in scenario, 13 rendered steps and 32 DB contracts', () => {
  assert.equal(mvpDefinitions.length,1); assert.equal(mvpDefinitions[0][0],'MVP01');
  assert.deepEqual(registration.steps,definition.steps); assert.equal(registration.steps.length,13);
  assert.equal(registration.workers,1); assert.equal(registration.mutationRetries,0); assert.equal(registration.executionStatus,'NOT RUN');
  assert.deepEqual(readdirSync(here).sort(),registration.files.slice().sort());
  const rows = databaseAssertions(chain,input(),uid(100),{treatmentVersion:2,caseVersion:1});
  assert.equal(rows.length,32); assert.deepEqual(rows.map(v=>v.key),registration.databaseKeys);
  assert.equal(new Set(rows.map(v=>v.key)).size,32);
});
test('simulated explicit plan matches simulated catalogs; supplies no dose default', () => {
  const p=input(); assert.equal(validatePlan(p,references()),p); assert.equal(p.treatment.drugs[0].doseValue,undefined);
});
for (const [name, change, code] of [
  ['pending review',p=>p.clinicalReview.status='PENDING','MVP_CLINICAL_OWNER_APPROVAL_PENDING'],
  ['missing review reference',p=>p.clinicalReview.reference='','MVP_CLINICAL_OWNER_APPROVAL_PENDING'],
  ['nonfictional name',p=>p.patient.fullName='Person','MVP_SYNTHETIC_IDENTITY_REQUIRED'],
  ['real-looking identity',p=>p.patient.otherIdentityNumber='1234567890123456','MVP_SYNTHETIC_IDENTITY_REQUIRED'],
  ['unexpected clinical key',p=>p.patient.nik='1234','MVP_PLAN_SHAPE'],
  ['invalid calendar date',p=>p.patient.birthDate='1990-02-31','MVP_DATE_INVALID'],
  ['minor',p=>p.patient.birthDate=p.registration.registrationDate,'MVP_CHRONOLOGY_INVALID'],
  ['future outcome',p=>p.outcome.outcomeDate='2999-01-01','MVP_CHRONOLOGY_INVALID'],
  ['completion before schedule',p=>p.followUp.completedAt='2020-01-01T00:00:00Z','MVP_CHRONOLOGY_INVALID'],
  ['lab timestamp substitution',p=>p.lab.timestampMode='FIXED_PAST','MVP_LAB_TIME_MODE_INVALID'],
  ['no medication-taking evidence',p=>p.dose.status='DISPENSED_HOME','MVP_MEDICATION_EVIDENCE_REQUIRED'],
  ['empty drug lines',p=>p.treatment.drugs=[],'MVP_DRUG_LINES_INVALID'],
  ['duplicate exact drug line',p=>p.treatment.drugs.push({...p.treatment.drugs[0]}),'MVP_DUPLICATE_DRUG_LINE'],
  ['dose without unit',p=>p.treatment.drugs[0].doseValue=100,'MVP_DRUG_LINES_INVALID'],
  ['bad frequency',p=>p.treatment.drugs[0].frequencyPerWeek=8,'MVP_DRUG_LINES_INVALID'],
  ['bad drug chronology',p=>p.treatment.drugs[0].startDate='1900-01-01','MVP_DRUG_DATE_INVALID'],
  ['nonpositive weight',p=>p.followUp.weightKg=0,'MVP_CLINICAL_INPUT_INVALID'],
]) test(`plan refuses ${name}`, () => { const p=input(); change(p); assert.throws(()=>validatePlan(p,references()), {message:code}); });
test('missing, duplicate or wrong-category live catalog selection refuses', () => {
  for(const edit of [r=>r.treatment.regimens=[],r=>r.treatment.regimens.push(r.treatment.regimens[0])]) {
    const r=references();edit(r);assert.throws(()=>validatePlan(input(),r),{message:'MVP_CATALOG_SELECTION_UNAVAILABLE'});
  }
  const r=references();r.treatment.regimens[0].caseCategoryCode='TB_RO';
  assert.throws(()=>validatePlan(input(),r),{message:'MVP_REGIMEN_CATEGORY_MISMATCH'});
});
test('independent role, permission and facility checks', () => {
  const me={id:uid(100),roles:[{code:'TB_OFFICER'}],permissions:['TREATMENT_READ'],activeFacilities:[{id:uid(200)}]};
  verifyActor(me,'TB_OFFICER',['TREATMENT_READ'],uid(200));
  for(const args of [['LAB_STAFF',['TREATMENT_READ'],uid(200)],['TB_OFFICER',['OUTCOME_WRITE'],uid(200)],['TB_OFFICER',['TREATMENT_READ'],uid(201)]])
    assert.throws(()=>verifyActor(me,...args),{message:'MVP_ACTOR_SCOPE_UNAVAILABLE'});
});
test('chain rejects substitution collisions and injection IDs', () => {
  validateChain(chain);
  assert.throws(()=>validateChain({...chain,treatment:chain.case}),{message:'MVP_CHAIN_IDENTITY_COLLISION'});
  assert.throws(()=>validateChain({...chain,patient:"' or true --"}),{message:'MVP_UUID_INVALID'});
});
test('explicit drug snapshots are compared without assuming DB UUID order',()=>{
  const supplied=[{drugCode:'A',startDate:'2026-10-10',doseValue:1,doseUnit:'mock'},{drugCode:'B',startDate:'2026-10-10'}];
  const actual=[{...supplied[1],drugName:'Mock B'},{...supplied[0],drugName:'Mock A'}],catalog=[{code:'A',name:'Mock A'},{code:'B',name:'Mock B'}];
  assert.equal(sameDrugSnapshots(actual,supplied,catalog),true);
  actual[0].drugName='Changed';assert.equal(sameDrugSnapshots(actual,supplied,catalog),false);
});
test('drug multiset rejects altered dose or substituted/duplicated lines',()=>{
  const supplied=[{drugCode:'A',startDate:'2026-10-10',doseValue:1}],catalog=[{code:'A',name:'Mock A'}];
  assert.equal(sameDrugSnapshots([{...supplied[0],drugName:'Mock A',doseValue:2}],supplied,catalog),false);
  assert.equal(sameDrugSnapshots([],supplied,catalog),false);
});
test('DB contract preserves actor audits, exact multiset, one outcome and no denied success writes', () => {
  const rows=databaseAssertions(chain,input(),uid(100),{treatmentVersion:2,caseVersion:1});
  assert.ok(rows.every(v=>/^(select|with) /i.test(v.sql))); assert.ok(rows.every(v=>['0','1'].includes(v.expected)));
  assert.match(rows.find(v=>v.key==='drug_snapshot_mismatch').sql,/except all/);
  assert.match(rows.find(v=>v.key==='audit_lab_result_recorded').sql,new RegExp(`actor_user_id='${chain.labUser}'`));
  assert.equal(rows.find(v=>v.key==='denied_updates_no_success_audit').expected,'0');
});
test('DB SQL escapes string literals and rejects injected numerics/versions', () => {
  const p=input();p.treatment.drugs[0].doseUnit="x'; drop table drugs; --";
  assert.match(databaseAssertions(chain,p,uid(100),{treatmentVersion:1,caseVersion:1}).find(v=>v.key==='drug_snapshot_mismatch').sql,/x''; drop table drugs; --/);
  p.followUp.weightKg='1;delete';assert.throws(()=>databaseAssertions(chain,p,uid(100),{treatmentVersion:1,caseVersion:1}),{message:'MVP_SQL_NUMBER_INVALID'});
  assert.throws(()=>databaseAssertions(chain,input(),uid(100),{treatmentVersion:'1 or true',caseVersion:1}),{message:'MVP_VERSION_INVALID'});
});
function acceptanceFixture() {
  const expected=databaseAssertions(chain,input(),uid(100),{treatmentVersion:2,caseVersion:1});
  return {ledger:{id:'MVP01',status:'PASS',workers:1,mutationRetries:0,steps:[...definition.steps]},expected,
    actual:expected.map(r=>({scenario:'MVP01',key:r.key,status:'PASS',expected:r.expected,actual:r.expected}))};
}
test('pure completion gate admits only all browser steps plus all actual DB expectations',()=>{
  const f=acceptanceFixture();assert.equal(verifyAcceptance(f.ledger,f.expected,f.actual).databaseAssertions,32);
});
for(const [name,edit] of [
  ['missing DB result',f=>f.actual.pop()], ['extra DB result',f=>f.actual.push(f.actual[0])],
  ['duplicate DB key',f=>f.actual[1]=f.actual[0]], ['unknown DB key',f=>f.actual[0].key='unknown'],
  ['changed expected value',f=>f.actual[0].expected='0'], ['wrong actual value',f=>f.actual[0].actual='0'],
  ['failed DB row',f=>f.actual[0].status='FAIL'],
])test(`pure completion gate refuses ${name}`,()=>{
  const f=acceptanceFixture();edit(f);assert.throws(()=>verifyAcceptance(f.ledger,f.expected,f.actual),{message:'MVP_DATABASE_ACCEPTANCE_INCOMPLETE'});
});
for(const [name,edit] of [
  ['NOT RUN',f=>f.ledger.status='NOT RUN'], ['FAIL',f=>f.ledger.status='FAIL'], ['BLOCKED',f=>f.ledger.status='BLOCKED'],
  ['missing UI step',f=>f.ledger.steps.pop()], ['parallel workers',f=>f.ledger.workers=2], ['mutation retries',f=>f.ledger.mutationRetries=1],
])test(`pure completion gate refuses browser ${name}`,()=>{
  const f=acceptanceFixture();edit(f);assert.throws(()=>verifyAcceptance(f.ledger,f.expected,f.actual),{message:'MVP_BROWSER_ACCEPTANCE_INCOMPLETE'});
});
test('original harness source locks, coverage and scenario sources stay unchanged', () => {
  const lock=JSON.parse(read('e2e/source.lock.json'));
  for(const row of lock.files) assert.equal(createHash('sha256').update(readFileSync(new URL(`e2e/${row.path}`,root))).digest('hex'),row.sha256);
  const old=JSON.parse(read('e2e/coverage.json'));assert.equal(old.scenarios.length,56);assert.equal(old.database.length,58);
  assert.doesNotMatch(read('e2e/harness/run-smoke.mjs')+read('e2e/harness/extended.mjs'),/MVP01|runMvpJourney/);
});
test('source-only form/route binding: exact inspected labels and commands exist', () => {
  const repo=new URL('../../../',import.meta.url);
  const sources=[
    ['frontend/features/clinical-intake/forms/patient-fields.tsx',['Nama lengkap','Kewarganegaraan','Nomor identitas lain','Tanggal lahir','Jenis kelamin']],
    ['frontend/features/clinical-intake/components/registration-wizard.tsx',['Fasilitas registrasi','Lanjut ke pasien','Lanjut ke registrasi','Simpan registrasi']],
    ['frontend/features/laboratory/forms/receive-fields.tsx',['Waktu penerimaan','Dapat diperiksa']],
    ['frontend/features/laboratory/forms/result-fields.tsx',['Spesimen hasil','Waktu pemeriksaan','Narasi hasil']],
    ['frontend/features/treatment/forms/fields.tsx',['Kode hasil akhir','Tanggal hasil akhir','Saya mengonfirmasi penutupan episode pengobatan dan kasus ini','Tanggal awal obat']],
    ['frontend/features/clinical-intake/components/registration-detail.tsx',['Tambah diagnosis','Simpan diagnosis','Simpan konfirmasi kasus']],
    ['frontend/features/treatment/components/treatment-editor.tsx',['Simpan pengobatan','Simpan jadwal','Simpan penyelesaian','Simpan hasil akhir']],
  ];
  // Start submit label lives in CaseTreatments, not TreatmentEditor.
  sources.at(-1)[1]=sources.at(-1)[1].filter(v=>v!=='Simpan pengobatan');
  sources.push(['frontend/features/treatment/components/case-treatments.tsx',['Simpan pengobatan']]);
  for(const [path,labels] of sources) {const s=readFileSync(new URL(path,repo),'utf8');for(const label of labels)assert.ok(s.includes(label),`UI anchor missing: ${path}`);}
  const v=readFileSync(new URL('src/main/java/id/tbcall/application/laboratory/LabValidation.java',repo),'utf8');
  assert.match(v,/receivedAt\(\)\.isBefore\(specimen\.getLabRequest\(\)\.getRequestedAt\(\)\)/);
});
test('scenario import is inert and source has no API step substitution/capture/retry/resource access', () => {
  const s=readFileSync(new URL('journey.mjs',here),'utf8');
  assert.doesNotMatch(s,/from ['"](?:playwright|node:(?:fs|child_process|net|http|https|tls))/);
  assert.doesNotMatch(s,/\.request\.[a-z]+\(|\.route\(|\.fulfill\(|screenshot\(|tracing\.|storageState\(|console\.|writeFile|execSync|spawn\(/);
  assert.doesNotMatch(s,/h\.request\([^\n]*'(?:POST|DELETE)'/);
  assert.match(s,/watch(?:es)?\.every\(w => w\.count === 1\)/);
  assert.match(s,/Date\.parse\(beforeReceive\.data\.requestedAt\)/);
});

// Injected Playwright-shaped objects exercise orchestration/failure paths only.
// They cannot establish actual rendering, HTTP, database, TLS or sandbox success.
function mockHarness(options={}) {
  const p=input(),refs=references(),observations=[],db=[],http=[],clicked=[],contexts=[];
  const world={regVersion:0,treatmentVersion:0,caseVersion:0,received:false,result:false,terminal:false,follow:false};
  const o={id:uid(100),email:'mock-officer@example.invalid',password:'PUBLIC-PURE-MOCK'},
    l={id:uid(101),email:'mock-lab@example.invalid',password:'PUBLIC-PURE-MOCK'},
    b={id:uid(102),email:'mock-foreign@example.invalid',password:'PUBLIC-PURE-MOCK'};
  const facilityA=uid(200),facilityB=uid(201);
  const permissions=['PATIENT_READ','PATIENT_CREATE','REGISTRATION_READ','REGISTRATION_WRITE','DIAGNOSIS_READ','DIAGNOSIS_WRITE','CASE_READ','CASE_WRITE','LAB_REQUEST_READ','LAB_REQUEST_WRITE','LAB_RESULT_READ','LAB_RESULT_WRITE','TREATMENT_READ','TREATMENT_WRITE','ADHERENCE_READ','ADHERENCE_RECORD','FOLLOW_UP_READ','FOLLOW_UP_WRITE','OUTCOME_READ','OUTCOME_WRITE'];
  function me(actor){return {id:actor.id,roles:[{code:actor===l?'LAB_STAFF':'TB_OFFICER'}],permissions,
    activeFacilities:[{id:actor===o?facilityA:facilityB},...(options.foreignAssignment&&actor===o?[{id:facilityB}]:[])]};}
  const treatment=()=>({id:chain.treatment,caseId:chain.case,version:world.treatmentVersion,patient:{id:chain.patient},status:world.terminal?'COMPLETED':'ACTIVE',notes:null,
    drugs:[{drugCode:'MOCK_DRUG',drugName:'MOCK MOCK_DRUG',startDate:p.treatment.startDate}],followUps:world.follow?[{id:chain.followUp,version:0,treatmentId:chain.treatment}]:[],
    outcome:world.terminal?{id:chain.outcome,outcomeCode:p.outcome.outcomeCode,outcomeName:'MOCK outcome'}:null});
  const tbCase=()=>({id:chain.case,registration:{id:chain.registration},patient:{patientId:chain.patient},confirmingDiagnosis:{id:chain.diagnosis},status:world.terminal?'COMPLETED':'ACTIVE',version:world.caseVersion});
  const request=()=>({id:chain.request,owner:{type:'REGISTRATION',id:chain.registration},requestReason:{code:'DIAGNOSIS'},
    testingFacility:{id:facilityB},requestingFacility:{id:facilityA},requestedAt:new Date(Date.now()-1000).toISOString(),
    tests:[{id:chain.test,version:world.result?1:0}],specimens:[{id:chain.specimen,version:world.received?1:0}]});
  const submits=[
    ['Masuk','POST','/auth/login',200,()=>({})],['Masuk','POST','/auth/login',200,()=>({})],['Masuk','POST','/auth/login',200,()=>({})],
    ['Simpan registrasi','POST','/registrations',201,()=>({id:chain.registration,patient:{patientId:chain.patient},facility:{id:facilityA},status:'OPEN'})],
    ['Simpan permintaan','POST','/lab-requests',201,request],
    ['Simpan spesimen','POST',`/lab-requests/${chain.request}/specimens`,201,()=>({id:chain.specimen})],
    ['Simpan penerimaan','POST',`/lab-specimens/${chain.specimen}/receive`,200,()=>{world.received=true;return {id:chain.specimen,examinationPossible:true};}],
    ['Simpan hasil','POST',`/lab-request-tests/${chain.test}/results`,201,()=>{world.result=true;return {id:chain.result,testId:chain.test,specimenId:options.badLineage?uid(777):chain.specimen,sequenceNo:1,status:'FINAL',resultText:p.lab.resultText};}],
    ['Simpan diagnosis','POST',`/registrations/${chain.registration}/diagnoses`,201,()=>{world.regVersion=1;return {id:chain.diagnosis,registrationId:chain.registration};}],
    ['Simpan konfirmasi kasus','POST',`/registrations/${chain.registration}/cases`,201,()=>{world.regVersion=2;return tbCase();}],
    ['Simpan pengobatan','POST',`/cases/${chain.case}/treatments`,201,treatment],
    ['Simpan bukti dosis','POST',`/treatments/${chain.treatment}/dose-events`,201,()=>({id:chain.dose,source:'HEALTH_WORKER',recordedByUserId:o.id,status:p.dose.status,scheduledDate:p.dose.scheduledDate})],
    ['Simpan jadwal','POST',`/treatments/${chain.treatment}/follow-ups`,201,()=>{world.treatmentVersion=1;world.follow=true;return {id:chain.followUp};}],
    ['Simpan penyelesaian','POST',`/follow-ups/${chain.followUp}/complete`,200,()=>({id:chain.followUp,treatmentId:chain.treatment,status:'COMPLETED',weightKg:p.followUp.weightKg,symptomSummary:p.followUp.symptomSummary,adherenceAssessment:p.followUp.adherenceAssessment})],
    ['Simpan hasil akhir','POST',`/treatments/${chain.treatment}/outcome`,201,()=>{world.terminal=true;world.caseVersion=1;world.treatmentVersion=2;return {id:chain.outcome};}],
  ];
  let cursor=0;
  class Locator {
    constructor(page,kind,name){this.page=page;this.kind=kind;this.name=name;}
    async fill(){} async selectOption(){} async check(){} async waitFor(){}
    async count(){return 0;}
    getByText(v){return new Locator(this.page,'text',v);}
    async click(){clicked.push(this.name);if(submits[cursor]?.[0]!==this.name)return;
      const [,method,path,status,data]=submits[cursor++];const url='https://app.tbcall.test:3443/api/tbcall/v1'+path;
      let tag=path.includes('/registrations/')?`"${world.regVersion}"`:path.endsWith('/specimens')?'"0"':path.endsWith('/receive')?'"0"':path.endsWith('/results')?'"0"':`"${world.treatmentVersion}"`;
      if(path.includes('/follow-ups/')&&path.endsWith('/complete'))tag='"0"';
      const req={url:()=>url,method:()=>method,allHeaders:async()=>({'x-xsrf-token':'PUBLIC-MOCK', 'if-match':options.badEtag?'"99"':tag})};
      for(const handler of this.page.events.get('request')??[]) {handler(req);if(options.replay&&path==='/registrations')handler(req);}
      const result=data();const response={url:()=>url,status:()=>status,request:()=>req,json:async()=>result,headers:()=>({})};
      assert.ok(this.page.waiter.predicate(response));this.page.waiter.resolve(response);
    }
  }
  class Page {
    constructor(actor){this.actor=actor;this.events=new Map();}
    setDefaultTimeout(){} async goto(){} async reload(){} async evaluate(){return 'UTC';}
    getByLabel(v){return new Locator(this,'label',v);} getByRole(kind,opts){return new Locator(this,kind,opts.name);}
    getByText(v){return new Locator(this,'text',v);} locator(v){return new Locator(this,'css',v);}
    on(event,handler){const list=this.events.get(event)??[];list.push(handler);this.events.set(event,list);}
    off(event,handler){this.events.set(event,(this.events.get(event)??[]).filter(v=>v!==handler));}
    waitForResponse(predicate){return new Promise(resolve=>{this.waiter={predicate,resolve};});}
  }
  const accounts=[o,l,b];
  const h={plan:p,actors:{officer:o,lab:l,crossOfficer:b},fixture:{facilityA,facilityB,facilityBName:'MVP SYNTHETIC lab B'},
    scenario:async(id,fn)=>{assert.equal(id,'MVP01');await fn();},
    client:async()=>{const page=new Page(accounts[contexts.length]);const c={page,context:{close:async()=>{c.closed=true;}}};contexts.push(c);return c;},
    observe:(code,value)=>observations.push({code,value}),db:(key,sql,expected)=>db.push({key,sql,expected}),
    request:async(c,method,path,body,expected=200)=>{http.push({method,path,expected});
      if(method==='PATCH')return {status:expected,data:{code:expected===409?'OPTIMISTIC_LOCK_CONFLICT':'ACCESS_DENIED'}};
      if(expected!==200)return {status:expected,data:{}};
      if(path==='/me')return {data:me(c.page.actor)};
      if(path==='/clinical-reference-data')return {data:refs.clinical};if(path==='/laboratory-reference-data')return {data:refs.lab};if(path==='/treatment-reference-data')return {data:refs.treatment};
      if(path.startsWith('/registrations/'))return {data:{},etag:`"${world.regVersion}"`};
      if(path.startsWith('/lab-requests/'))return {data:request(),etag:'"0"'};
      if(path.startsWith('/treatments/'))return {data:treatment(),etag:`"${world.treatmentVersion}"`};
      if(path.startsWith('/cases/'))return {data:tbCase()};throw new Error('MOCK_UNEXPECTED_READ');},
  };
  return {h,observations,db,http,clicked,contexts,get cursor(){return cursor;}};
}
test('mock full orchestration preserves all 13 UI steps, 32 DB assertions, denials and closes only its sessions', async()=>{
  const m=mockHarness();await runMvpJourney(m.h);
  assert.deepEqual(m.observations.filter(v=>v.code.startsWith('MVP_UI_')&&definition.steps.some(s=>v.code===`MVP_UI_${s}`)).map(v=>v.code.slice(7)),definition.steps);
  assert.equal(m.cursor,15);assert.equal(m.db.length,32);assert.ok(m.contexts.every(c=>c.closed));
  assert.deepEqual(m.http.filter(v=>v.method!=='GET').map(v=>v.expected),[409,403,404]);
  assert.ok(m.observations.every(v=>v.value));
});
test('pending approval refuses before helper or browser dispatch', async()=>{
  const m=mockHarness();m.h.plan.clinicalReview.status='PENDING';await assert.rejects(runMvpJourney(m.h),{message:'MVP_CLINICAL_OWNER_APPROVAL_PENDING'});
  assert.equal(m.contexts.length,0);assert.equal(m.http.length,0);
});
for(const [name,options,code] of [
  ['wrong facility assignment',{foreignAssignment:true},'MVP_NO_FOREIGN_ASSIGNMENT'],
  ['substituted result lineage',{badLineage:true},'MVP_RESULT_LINEAGE'],
  ['unexpected ETag',{badEtag:true},'MVP_UI_AUTHORITATIVE_ETAG'],
  ['duplicate UI mutation observation',{replay:true},'MVP_NO_MUTATION_REPLAY'],
])test(`mock refuses ${name}; no replay or DB assertion dispatch`,async()=>{
  const m=mockHarness(options);await assert.rejects(runMvpJourney(m.h),{message:code});
  assert.equal(m.db.length,0);assert.ok(m.contexts.every(c=>c.closed));
  if(!options.replay)assert.ok(!m.clicked.includes('Simpan hasil akhir'));
});
