// Task-owned real HTTPS browser requests. No mocks, payload logging or mutation retry.
import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

export const extendedDefinitions = [
 ['D01','Restore fixture assignment; separate sessions and live catalogs','admin, officers, laboratory staff','B08','Supported assignment restored; independent sessions; active catalog options available'],
 ['D02','Request, specimen and testing-facility permission boundaries','officer A, laboratories A/B','D01','Request/specimen 201; source laboratory and officer result roles denied; destination receipt 200 once'],
 ['D03','Append-only result and correction lineage','laboratory B','D02','Initial FINAL sequence 1; CORRECTED sequence 2; stale/older lineage rejected; original retained'],
 ['D04','Same-test initial-result race','two laboratory A sessions','D01','201/409; exactly one result and success audit'],
 ['D05','Same-latest-result correction race','two laboratory A sessions','D04','201/409; exactly one successor and correction audit'],
 ['D06','Different-test parallel results','two laboratory A sessions','D01','201/201; two final results and audits; request COMPLETED'],
 ['D07','Cancellation versus result race','officer A, laboratory A','D01','One 200/409 or 409/201 legal outcome; no result under cancelled request'],
 ['D08','Treatment initiation race and explicit drug lines','two officer A sessions','D01','201/409; one ACTIVE treatment, one supplied drug line and start audit'],
 ['D09','Treatment ETags, role and facility denials','officers A/B, laboratory','D08','428/400/stale409; fresh PATCH200; wrong-role403 and foreign404'],
 ['D10','Same actor/day adherence evidence race','two officer A sessions','D08','201/409; one HEALTH_WORKER evidence row and audit'],
 ['D11','Follow-up schedule and completion with structured weight','officer A','D08','Schedule201; complete200; repeated completion409; no inferred medical assessment'],
 ['D12','Adverse-event create/update and stale precondition','officer A','D08','Create201, PATCH200 and stale409; safe projections omit narratives'],
 ['D13','Explicit treatment outcome concurrency','two officer A sessions','D01','201/409; one outcome; treatment and case COMPLETED; no duplicate success audit'],
 ['D14','Terminal treatment boundaries and late laboratory evidence','officer/laboratory A','D13','Closed new writes409; adverse PATCH200; correction409; late initial result201'],
 ['D15','Linked portals with real treatment and actor-specific doses','patient, supporter, officer','D08,D11,D12','Relink approved identities; safe treatment/follow-ups; distinct actors same day201/201'],
 ['D16','Investigation eligibility gating','officer A','D01','TPT before completion409; incompatible flags400; ineligible completion200 then TPT409'],
 ['D17','Eligible internal investigation and TPT-start race','two officer A sessions','D01','COMPLETED with explicit true flags; TPT201/409; exactly one open episode/audit'],
 ['D18','TPT metadata preconditions and permission isolation','officers A/B, patient','D17','Fresh PATCH200; stale409; immutable status400; foreign404 and patient403'],
 ['D19','Outgoing investigation destination workflow','officers A/B','D01','Destination receive/start/complete; source complete404; TPT belongs to destination'],
 ['D20','Exact contact-to-patient confirmation and safe TPT portal','officer, new verified patient','D17','Exact synthetic identity link200; independent SELF account link; safe /me/tpt projection'],
 ['D21','Treatment and TPT monitoring plans and active-plan uniqueness','officer A','D08,D17,D20','Create201; duplicate409; explicit live event types; authoritative GET ETags'],
 ['D22','Monitoring event reschedule/cancel race','two officer A sessions','D21','Missing428; same GET ETag race200/409; one terminal or rescheduled state'],
 ['D23','Actual controlled scheduler DUE/OVERDUE and fanout','scheduler, linked recipients','D21,D15','SCHEDULED→DUE→OVERDUE; one alert/event; deduplicated IN_APP delivery; scheduler actor null'],
 ['D24','Safe portal monitoring/alert privacy and receipt semantics','patient, supporter, TPT patient','D23','Safe projections; receipts idempotent; staff alert remains OPEN/version unchanged; foreign receipt404'],
 ['D25','Staff alert acknowledgement race and explicit resolution','two officer A sessions','D23','Ack200/409; idempotent fresh ack200; resolve200; no event completion/reopening'],
 ['D26','Notification owner scope and read race','two patient sessions, officer','D23','Owner GET ETag; foreign404; read200/409; fresh repeat idempotent; one read audit'],
 ['D27','Monitoring completion/cancellation and alert auto-resolution','officer A','D23','Complete overdue event200 resolves its alert; cancel remaining events/plan; no duplicates'],
 ['D28','Rendered patient/supporter portals with real clinical records','patient, supporter','D15,D23','Actual portal pages render linked records without identity/narrative leakage or runtime errors'],
 ['D29','Transfer send/receive preserves source ownership until report','officers A/B','D08,D17,D19','SENT→RECEIVED; case REFERRED at source; treatment still source; wrong-side transition404'],
 ['D30','Arrival report versus source outcome race','officers A/B','D29','Report200; source outcome404/409; destination owns ACTIVE case/treatment; no outcome'],
 ['D31','New owner writes; retained referral and contact/TPT history','officers A/B, patient, supporter','D30,D17,D19','Source case/treatment404; referral history200; source historical IK/TPT200; destination historical IK/TPT404; portals persist'],
 ['D32','Transfer send versus outcome race','two officer A sessions','D01','201/409; exactly one referral or outcome; final serial state and success audits agree'],
 ['D33','Referral receive versus source cancellation race','officers A/B','D01','200/409; one transition; ownership remains source; no duplicate transition audit'],
 ['D34','Context and actor identity-resolution throttle with durable audits','fresh officer A','D01','Context sixth429; actor eleventh429; all unavailable/throttled outcomes committed'],
 ['D35','Concurrent identity-resolution budget serialization','two fresh officer sessions','D01','Eight bounded requests yield five404 and three429; exactly eight durable lookup audits'],
 ['D36','Revocation and independent role/permission/facility denials','officer, patient, supporter, roleless, lab','D24,D28,D31','Identity-bound revoke/unlink200; existing sessions immediately403; missing permission403; lab role403; foreign404'],
];

export async function runExtended(h) {
 const {scenario,request,check,actors:a,fixture:f,client,login,provision,observe,db}=h;
 const o=a.officer,b=a.crossOfficer,l=a.lab;
 const x={}; const today=()=>new Date().toISOString().slice(0,10),now=()=>new Date().toISOString();
 const tag=v=>`"${v}"`, headers=etag=>({headers:{'If-Match':etag}});
 const assertion=(value,code)=>{observe(code,Boolean(value));check(value,code);};
 const uuid=v=>{check(/^[a-f0-9-]{36}$/.test(v),'ASSERTION_UUID_INVALID');return `'${v}'`;};
 const count=(key,sql,expected)=>db(key,sql,String(expected));
 const audit=(key,action,id,n)=>count(key,`select count(*) from audit_logs where action='${action}' and entity_id=${uuid(id)}`,n);
 const get=async(c,p)=>(await request(c,'GET',p));
 const mutate=async(c,m,p,body,expected=200,etag)=>request(c,m,p,body,expected,etag?headers(etag):{});
 async function session(account){const c=await client();await login(c,account);return c;}
 async function registration(){const r=x.clinical,identity='E2E-SYNTHETIC-'+randomUUID(),fullName='E2E synthetic person';
  const made=await request(o,'POST','/registrations',{facilityId:f.facilityA,registrationDate:today(),suspectTypeCode:r.suspectTypes[0].code,previousTreatmentCategoryCode:r.previousTreatmentCategories[0].code,newPatient:{fullName,citizenship:'WNA',otherIdentityNumber:identity,birthDate:'1990-01-01',birthDateUnknown:false,sexCode:r.sexCodes[0].code}},201);
  return {registration:made.data.id,patient:made.data.patient.patientId,identity,fullName};
 }
 async function newCase(){const z=await registration(),reg=await get(o,`/registrations/${z.registration}`);
  const d=await mutate(o,'POST',`/registrations/${z.registration}/diagnoses`,{diagnosisDate:today(),anatomicalSiteCode:x.clinical.anatomicalSites[0].code,diagnosisTypeCode:x.clinical.diagnosisTypes[0].code,diagnosisResult:'Synthetic diagnostic fixture',treatmentDisposition:'TREAT_HERE'},201,reg.etag);
  const fresh=await get(o,`/registrations/${z.registration}`);
  z.case=(await mutate(o,'POST',`/registrations/${z.registration}/cases`,{diagnosisId:d.data.id,caseCategoryCode:'TB_SO',previousTreatmentCategoryCode:x.clinical.previousTreatmentCategories[0].code},201,fresh.etag)).data.id;return z;
 }
 const startBody=()=>({regimenCode:x.regimen.code,startDate:today(),drugs:[{drugCode:x.treatment.drugs[0].code,startDate:today()}]});
 async function treatment(z){z.treatment=(await request(o,'POST',`/cases/${z.case}/treatments`,startBody(),201)).data.id;return z;}
 async function labRequest(cid=f.case,testing=f.facilityA,two=false){const q=(await request(o,'POST','/lab-requests',{caseId:cid,testingFacilityId:testing,requestReasonCode:'FOLLOW_UP',testTypeCodes:x.lab.testTypes.slice(0,two?2:1).map(t=>t.code)},201)).data;return q;}
 const resultBody=()=>({testedAt:now(),resultText:'Synthetic laboratory evidence'});
 async function testState(q,c=l){const g=await get(c,`/lab-requests/${q.id}`);return {g,test:g.data.tests[0]};}
 async function contact(workflow='INTERNAL'){return (await request(o,'POST',`/cases/${f.case}/contacts`,{fullName:'E2E synthetic contact',workflowType:workflow,...(workflow==='OUTGOING_REFERRAL'?{destinationFacilityId:f.facilityB}:{})},201)).data;}
 async function ik(c,id,command,body){const g=await get(c,`/contact-investigations/${id}`);return mutate(c,'POST',`/contact-investigations/${id}/${command}`,body,200,g.etag);}
 const tptBody=()=>({regimenCode:x.tptRegimen.code,startDate:today()});
 const outcomeBody=()=>({outcomeCode:x.treatment.outcomeCodes[0].code,outcomeDate:today()});
 const eventBody=(offset,dueOffset=offset)=>({eventType:x.eventType,scheduledAt:new Date(Date.now()+offset).toISOString(),dueAt:new Date(Date.now()+dueOffset).toISOString()});
 async function events(plan){return (await get(o,`/monitoring-plans/${plan}/events?size=50`)).data.content;}
 async function alertFor(eid){return (await get(o,'/alerts?size=50')).data.content.filter(z=>z.monitoringEventId===eid);}
 async function waitEvent(eid,status,timeout=100000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const g=await get(o,`/monitoring-events/${eid}`);if(g.data.status===status)return g;await sleep(700);}throw new Error('CONTROLLED_SCHEDULER_STATE_TIMEOUT');}
 async function race(fn1,fn2,expected){const deadline=sleep(30000).then(()=>{throw new Error('BOUNDED_RACE_TIMEOUT');});const r=await Promise.race([Promise.all([fn1(),fn2()]),deadline]);assertion(r.map(z=>z.status).sort().join(',')===expected.slice().sort().join(','),'RACE_LEGAL_STATUS_SET');return r;}
 function safeKeys(value,forbidden){const s=JSON.stringify(value);assertion(!forbidden.some(k=>s.includes(`"${k}"`)),'SAFE_PROJECTION_KEYS');}

 await scenario('D01',async()=>{
  await request(a.admin,'POST',`/admin/facilities/${f.facilityA}/users/${o.id}`,{primary:true});
  x.o2=await session(o);x.l2=await session(l);await provision('labB','LAB_STAFF',f.facilityB);x.lb=a.labB;
  await provision('roleless');x.roleless=a.roleless;
  x.clinical=(await get(o,'/clinical-reference-data')).data;x.lab=(await get(o,'/laboratory-reference-data')).data;
  x.treatment=(await get(o,'/treatment-reference-data')).data;x.regimen=x.treatment.regimens.find(r=>r.caseCategoryCode==='TB_SO');
  x.tpt=(await get(o,'/tpt-reference-data')).data;x.tptRegimen=x.tpt.preventiveRegimens.find(r=>r.caseCategoryCode==='TB_SO');
  x.monitor=(await get(o,'/monitoring-reference-data')).data;x.eventType=x.monitor.treatmentEventTypes.find(e=>x.monitor.tptEventTypes.some(t=>t.code===e.code))?.code;
  assertion(x.regimen&&x.tptRegimen&&x.treatment.drugs.length&&x.lab.testTypes.length>=2&&x.lab.requestReasons.some(r=>r.code==='FOLLOW_UP')&&x.eventType,'LIVE_REFERENCE_CATALOGS');
  for(const name of ['uiOfficer','uiPatient','uiSupporter']){try{await a[name]?.context.close();}catch{}}
 });
 await scenario('D02',async()=>{
  x.q=await labRequest(f.case,f.facilityB,true);const q=await get(o,`/lab-requests/${x.q.id}`);
  x.spec=(await mutate(o,'POST',`/lab-requests/${x.q.id}/specimens`,{specimenType:'Synthetic specimen'},201,q.etag)).data;
  await mutate(l,'POST',`/lab-specimens/${x.spec.id}/receive`,{receivedAt:now(),examinationPossible:true},404,tag(x.spec.version));
  await mutate(o,'POST',`/lab-specimens/${x.spec.id}/receive`,{receivedAt:now(),examinationPossible:true},403,tag(x.spec.version));
  const receipt=await mutate(x.lb,'POST',`/lab-specimens/${x.spec.id}/receive`,{receivedAt:now(),examinationPossible:true},200,tag(x.spec.version));
  assertion(receipt.data.examinationPossible===true,'SPECIMEN_USABLE');
  await mutate(x.lb,'POST',`/lab-specimens/${x.spec.id}/receive`,{receivedAt:now(),examinationPossible:true},409,receipt.etag);
  await request(l,'GET',`/lab-requests/${x.q.id}`,undefined,404);
  count('SPECIMEN_RECEIVED_ONCE',`select count(*) from lab_specimens where id=${uuid(x.spec.id)} and received_at is not null and examination_possible`,1);
 });
 await scenario('D03',async()=>{
  let t=await testState(x.q,x.lb);await mutate(o,'POST',`/lab-request-tests/${t.test.id}/results`,resultBody(),403,tag(t.test.version));
  x.result=(await mutate(x.lb,'POST',`/lab-request-tests/${t.test.id}/results`,{...resultBody(),specimenId:x.spec.id},201,tag(t.test.version))).data;
  let g=await get(x.lb,`/lab-requests/${x.q.id}`);assertion(g.data.status==='PARTIAL','PARTIAL_COMPLETENESS');
  x.correction=(await mutate(x.lb,'POST',`/lab-results/${x.result.id}/corrections`,resultBody(),201,tag(x.result.version))).data;
  assertion(x.correction.sequenceNo===2&&x.correction.status==='CORRECTED','CORRECTION_LINEAGE');
  await mutate(x.lb,'POST',`/lab-results/${x.result.id}/corrections`,resultBody(),409,tag(x.result.version));
  const second=g.data.tests[1];await mutate(x.lb,'POST',`/lab-request-tests/${second.id}/results`,resultBody(),201,tag(second.version));
  g=await get(x.lb,`/lab-requests/${x.q.id}`);assertion(g.data.status==='COMPLETED'&&g.data.completeness.completedTests===2,'REQUEST_COMPLETED');
  count('ORIGINAL_FINAL_PRESERVED',`select count(*) from lab_results where id=${uuid(x.result.id)} and sequence_no=1 and status='FINAL'`,1);
 });
 await scenario('D04',async()=>{
  x.raceQ=await labRequest();const {test}=await testState(x.raceQ),body=resultBody();
  const r=await race(()=>mutate(l,'POST',`/lab-request-tests/${test.id}/results`,body,[201,409],tag(test.version)),()=>mutate(x.l2,'POST',`/lab-request-tests/${test.id}/results`,body,[201,409],tag(test.version)),[201,409]);
  x.raceResult=r.find(z=>z.status===201).data;x.raceTest=test.id;
  count('SAME_TEST_ONE_INITIAL_RESULT',`select count(*) from lab_results where lab_request_test_id=${uuid(test.id)} and sequence_no=1 and status='FINAL'`,1);audit('ONE_INITIAL_RESULT_AUDIT','LAB_RESULT_RECORDED',x.raceResult.id,1);
 });
 await scenario('D05',async()=>{
  const g=await get(l,`/lab-requests/${x.raceQ.id}`),result=g.data.tests[0].latestResults[0],body=resultBody();
  const r=await race(()=>mutate(l,'POST',`/lab-results/${result.id}/corrections`,body,[201,409],tag(result.version)),()=>mutate(x.l2,'POST',`/lab-results/${result.id}/corrections`,body,[201,409],tag(result.version)),[201,409]);
  const corrected=r.find(z=>z.status===201).data;count('ONE_CORRECTION_SUCCESSOR',`select count(*) from lab_results where lab_request_test_id=${uuid(x.raceTest)}`,2);audit('ONE_CORRECTION_AUDIT','LAB_RESULT_CORRECTED',corrected.id,1);
 });
 await scenario('D06',async()=>{
  const q=await labRequest(f.case,f.facilityA,true),g=await get(l,`/lab-requests/${q.id}`),[t1,t2]=g.data.tests;
  const r=await race(()=>mutate(l,'POST',`/lab-request-tests/${t1.id}/results`,resultBody(),[201,409],tag(t1.version)),()=>mutate(x.l2,'POST',`/lab-request-tests/${t2.id}/results`,resultBody(),[201,409],tag(t2.version)),[201,201]);
  for(const z of r)audit('INDEPENDENT_RESULT_AUDIT','LAB_RESULT_RECORDED',z.data.id,1);
  assertion((await get(l,`/lab-requests/${q.id}`)).data.status==='COMPLETED','PARALLEL_TEST_COMPLETENESS');
  count('TWO_INDEPENDENT_FINAL_RESULTS',`select count(*) from lab_results where lab_request_test_id in (${uuid(t1.id)},${uuid(t2.id)})`,2);
 });
 await scenario('D07',async()=>{
  const q=await labRequest(),{g,test}=await testState(q),body=resultBody();
  const r=await Promise.all([mutate(o,'POST',`/lab-requests/${q.id}/cancel`,{},[200,409],g.etag),mutate(l,'POST',`/lab-request-tests/${test.id}/results`,body,[201,409],tag(test.version))]);
  const cancel=r[0].status===200;assertion(cancel?r[1].status===409:r[1].status===201,'CANCEL_RESULT_SERIAL_OUTCOME');
  assertion((await get(o,`/lab-requests/${q.id}`)).data.status===(cancel?'CANCELLED':'COMPLETED'),'CANCEL_RESULT_FINAL_STATE');
  count('CANCEL_RESULT_ROWS',`select count(*) from lab_results where lab_request_test_id=${uuid(test.id)}`,cancel?0:1);audit('CANCEL_SUCCESS_AUDIT','LAB_REQUEST_CANCELLED',q.id,cancel?1:0);
  count('CANCEL_RESULT_SUCCESS_AUDIT',`select count(*) from audit_logs a join lab_results r on a.entity_id=r.id where a.action='LAB_RESULT_RECORDED' and r.lab_request_test_id=${uuid(test.id)}`,cancel?0:1);
 });
 await scenario('D08',async()=>{
  const body=startBody(),r=await race(()=>request(o,'POST',`/cases/${f.case}/treatments`,body,[201,409]),()=>request(x.o2,'POST',`/cases/${f.case}/treatments`,body,[201,409]),[201,409]);
  x.treatmentId=r.find(z=>z.status===201).data.id;
  count('ONE_MAIN_TREATMENT',`select count(*) from treatments where case_id=${uuid(f.case)}`,1);
  count('ONE_EXPLICIT_DRUG',`select count(*) from treatment_drugs where treatment_id=${uuid(x.treatmentId)}`,1);audit('ONE_START_AUDIT','TREATMENT_STARTED',x.treatmentId,1);
 });
 await scenario('D09',async()=>{
  const path=`/treatments/${x.treatmentId}`,g=await get(o,path),body={initialWeightKg:60};
  await request(o,'PATCH',path,body,428);await mutate(o,'PATCH',path,body,400,'W/'+g.etag);
  await request(b,'GET',path,undefined,404);await request(l,'GET',path,undefined,403);
  await mutate(o,'PATCH',path,body,200,g.etag);await mutate(o,'PATCH',path,{initialWeightKg:61},409,g.etag);
  assertion((await get(o,path)).data.initialWeightKg===60,'STALE_METADATA_NOT_WRITTEN');
 });
 await scenario('D10',async()=>{
  const path=`/treatments/${x.treatmentId}/dose-events`,body={scheduledDate:today(),status:'TAKEN_OBSERVED'};
  await race(()=>request(o,'POST',path,body,[201,409]),()=>request(x.o2,'POST',path,body,[201,409]),[201,409]);
  count('SAME_ACTOR_DAY_ONE_EVIDENCE',`select count(*) from dose_events where treatment_id=${uuid(x.treatmentId)} and recorded_by_user_id=${uuid(o.id)}`,1);
  count('HEALTH_WORKER_SOURCE',`select count(*) from dose_events where treatment_id=${uuid(x.treatmentId)} and source='HEALTH_WORKER'`,1);
  count('ONE_STAFF_DOSE_AUDIT',`select count(*) from audit_logs a join dose_events d on a.entity_id=d.id where a.action='DOSE_EVENT_RECORDED' and d.treatment_id=${uuid(x.treatmentId)} and d.recorded_by_user_id=${uuid(o.id)}`,1);
 });
 await scenario('D11',async()=>{
  const g=await get(o,`/treatments/${x.treatmentId}`),scheduled=new Date(Date.now()-1000).toISOString();
  x.follow=(await mutate(o,'POST',`/treatments/${x.treatmentId}/follow-ups`,{followUpType:'Synthetic follow-up',scheduledAt:scheduled},201,g.etag)).data;
  const parent=await get(o,`/treatments/${x.treatmentId}`),fresh=parent.data.followUps.find(z=>z.id===x.follow.id);
  const done=await mutate(o,'POST',`/follow-ups/${x.follow.id}/complete`,{completedAt:now(),weightKg:60},200,tag(fresh.version));
  assertion(done.data.status==='COMPLETED'&&done.data.weightKg===60,'FOLLOW_UP_STRUCTURED_COMPLETION');
  await mutate(o,'POST',`/follow-ups/${x.follow.id}/complete`,{completedAt:now()},409,done.etag);audit('FOLLOW_UP_COMPLETED_ONCE','FOLLOW_UP_COMPLETED',x.follow.id,1);
 });
 await scenario('D12',async()=>{
  x.adverse=(await request(o,'POST',`/treatments/${x.treatmentId}/adverse-events`,{eventType:'Synthetic adverse evidence',description:'Synthetic private narrative'},201)).data;
  const parent=await get(o,`/treatments/${x.treatmentId}`),fresh=parent.data.adverseEvents.find(z=>z.id===x.adverse.id);
  await mutate(o,'PATCH',`/adverse-events/${fresh.id}`,{serious:true},200,tag(fresh.version));await mutate(o,'PATCH',`/adverse-events/${fresh.id}`,{serious:false},409,tag(fresh.version));
 });
 await scenario('D13',async()=>{
  x.closed=await treatment(await newCase());x.closed.q=await labRequest(x.closed.case,f.facilityA,true);
  const {test}=await testState(x.closed.q);x.closed.result=(await mutate(l,'POST',`/lab-request-tests/${test.id}/results`,resultBody(),201,tag(test.version))).data;
  x.closed.adverse=(await request(o,'POST',`/treatments/${x.closed.treatment}/adverse-events`,{eventType:'Synthetic adverse evidence'},201)).data;
  const g=await get(o,`/treatments/${x.closed.treatment}`),body=outcomeBody();
  await race(()=>mutate(o,'POST',`/treatments/${x.closed.treatment}/outcome`,body,[201,409],g.etag),()=>mutate(x.o2,'POST',`/treatments/${x.closed.treatment}/outcome`,body,[201,409],g.etag),[201,409]);
  assertion((await get(o,`/cases/${x.closed.case}`)).data.status==='COMPLETED'&&(await get(o,`/treatments/${x.closed.treatment}`)).data.status==='COMPLETED','OUTCOME_ATOMIC_CLOSURE');
  count('ONE_CLOSED_OUTCOME',`select count(*) from treatment_outcomes where treatment_id=${uuid(x.closed.treatment)}`,1);count('ONE_OUTCOME_AUDIT',`select count(*) from audit_logs a join treatment_outcomes t on a.entity_id=t.id where a.action='TREATMENT_OUTCOME_RECORDED' and t.treatment_id=${uuid(x.closed.treatment)}`,1);
 });
 await scenario('D14',async()=>{
  const path=`/treatments/${x.closed.treatment}`,g=await get(o,path);
  await mutate(o,'PATCH',path,{initialWeightKg:60},409,g.etag);
  await request(o,'POST',path+'/dose-events',{scheduledDate:today(),status:'UNKNOWN'},409);
  await request(o,'POST',path+'/adverse-events',{eventType:'Synthetic new event'},409);
  const adverse=g.data.adverseEvents.find(z=>z.id===x.closed.adverse.id);await mutate(o,'PATCH',`/adverse-events/${adverse.id}`,{serious:true},200,tag(adverse.version));
  await mutate(l,'POST',`/lab-results/${x.closed.result.id}/corrections`,resultBody(),409,tag(x.closed.result.version));
  const q=await get(l,`/lab-requests/${x.closed.q.id}`),other=q.data.tests[1];await mutate(l,'POST',`/lab-request-tests/${other.id}/results`,resultBody(),201,tag(other.version));
  assertion((await get(l,`/lab-requests/${x.closed.q.id}`)).data.status==='COMPLETED','LATE_RESULT_PRESERVED');
 });
 await scenario('D15',async()=>{
  const pair=await get(o,`/patients/${f.patient}/account-link/precondition?userId=${a.patient.id}`);
  await mutate(o,'POST',`/patients/${f.patient}/account-link`,{userId:a.patient.id},200,pair.etag);
  const supporter=await get(o,`/cases/${f.case}/supporters/${f.supporter}`);await mutate(o,'POST',`/cases/${f.case}/supporters/${f.supporter}/account-link`,{userId:a.supporter.id},200,supporter.etag);
  const pt=(await get(a.patient,'/me/treatment')).data,st=(await get(a.supporter,`/me/supporting-cases/${f.case}/treatment`)).data;
  assertion(pt.id===x.treatmentId&&st.id===x.treatmentId,'PORTAL_REAL_TREATMENT');safeKeys(pt,['notes','recordedByUserId','description','batchNumber']);safeKeys(st,['notes','outcome','adverseEvents','recordedByUserId']);
  assertion((await get(a.patient,'/me/follow-ups')).data.some(z=>z.id===x.follow.id),'PORTAL_REAL_FOLLOW_UP');
  await race(()=>request(a.patient,'POST','/me/treatment/dose-events',{scheduledDate:today(),status:'TAKEN_SELF_REPORTED'},[201,409]),()=>request(a.supporter,'POST',`/me/supporting-cases/${f.case}/dose-events`,{scheduledDate:today(),status:'TAKEN_OBSERVED'},[201,409]),[201,201]);
  count('INDEPENDENT_ACTOR_DAY_EVIDENCE',`select count(*) from dose_events where treatment_id=${uuid(x.treatmentId)}`,3);
  count('PORTAL_DERIVED_SOURCES',`select count(distinct source) from dose_events where treatment_id=${uuid(x.treatmentId)}`,3);
  count('THREE_ACTOR_DOSE_AUDITS',`select count(*) from audit_logs a join dose_events d on a.entity_id=d.id where a.action='DOSE_EVENT_RECORDED' and d.treatment_id=${uuid(x.treatmentId)}`,3);
 });
 await scenario('D16',async()=>{
  const c=await contact(),id=c.investigations[0].id;await request(o,'POST',`/contact-investigations/${id}/tpt`,tptBody(),409);
  const g=await get(o,`/contact-investigations/${id}`);await mutate(o,'POST',`/contact-investigations/${id}/complete`,{activeTbExcluded:false,tptEligible:true},400,g.etag);
  await mutate(o,'POST',`/contact-investigations/${id}/complete`,{activeTbExcluded:true,tptEligible:false},200,g.etag);
  await request(o,'POST',`/contact-investigations/${id}/tpt`,tptBody(),409);count('INELIGIBLE_NO_TPT',`select count(*) from preventive_treatments where contact_id=${uuid(c.id)}`,0);
 });
 await scenario('D17',async()=>{
  x.contact=await contact();x.ik=x.contact.investigations[0].id;await ik(o,x.ik,'complete',{activeTbExcluded:true,tptEligible:true});
  const r=await race(()=>request(o,'POST',`/contact-investigations/${x.ik}/tpt`,tptBody(),[201,409]),()=>request(x.o2,'POST',`/contact-investigations/${x.ik}/tpt`,tptBody(),[201,409]),[201,409]);x.tptId=r.find(z=>z.status===201).data.id;
  assertion(r.find(z=>z.status===201).data.status==='ACTIVE','TPT_INITIAL_ACTIVE');count('ONE_CREATED_TPT',`select count(*) from preventive_treatments where contact_id=${uuid(x.contact.id)}`,1);audit('ONE_TPT_START_AUDIT','TPT_STARTED',x.tptId,1);
 });
 await scenario('D18',async()=>{
  const path=`/preventive-treatments/${x.tptId}`,g=await get(o,path);await mutate(o,'PATCH',path,{weightKg:60},200,g.etag);await mutate(o,'PATCH',path,{weightKg:61},409,g.etag);
  const fresh=await get(o,path);await mutate(o,'PATCH',path,{status:'COMPLETED'},400,fresh.etag);await request(b,'GET',path,undefined,404);await request(a.patient,'GET',path,undefined,403);
 });
 await scenario('D19',async()=>{
  x.outContact=await contact('OUTGOING_REFERRAL');x.outIk=x.outContact.investigations[0].id;
  await ik(b,x.outIk,'receive',{});await ik(b,x.outIk,'start',{});const g=await get(o,`/contact-investigations/${x.outIk}`);
  await mutate(o,'POST',`/contact-investigations/${x.outIk}/complete`,{activeTbExcluded:true,tptEligible:true},404,g.etag);
  await ik(b,x.outIk,'complete',{activeTbExcluded:true,tptEligible:true});x.destTpt=(await request(b,'POST',`/contact-investigations/${x.outIk}/tpt`,tptBody(),201)).data.id;
  await request(o,'GET',`/preventive-treatments/${x.destTpt}`,undefined,404);assertion((await get(b,`/preventive-treatments/${x.destTpt}`)).data.facility.id===f.facilityB,'DESTINATION_TPT_SCOPE');
 });
 await scenario('D20',async()=>{
  x.tptPerson=await registration();await provision('tptPatient');x.tptPatient=a.tptPatient;
  const c=await get(o,`/contacts/${x.contact.id}`);
  await mutate(o,'POST',`/contacts/${x.contact.id}/link-patient`,{patientId:x.tptPerson.patient,citizenship:'WNA',otherIdentityNumber:x.tptPerson.identity,fullName:x.tptPerson.fullName},200,c.etag);
  await request(o,'POST',`/patients/${x.tptPerson.patient}/account-link`,{userId:x.tptPatient.id},201);
  const safe=(await get(x.tptPatient,'/me/tpt')).data;assertion(safe.status==='ACTIVE','SAFE_CONTACT_TPT_ACTIVE');safeKeys(safe,['contactId','indexCaseId','patientId','notes','weightKg','drugSource']);
 });
 await scenario('D21',async()=>{
  const future=eventBody(3600000),body={startDate:today(),events:[future]};
  x.plan=(await request(o,'POST',`/treatments/${x.treatmentId}/monitoring-plans`,body,201)).data.id;
  await request(o,'POST',`/treatments/${x.treatmentId}/monitoring-plans`,body,409);
  x.tptPlan=(await request(o,'POST',`/preventive-treatments/${x.tptId}/monitoring-plans`,body,201)).data.id;
  const p=await get(o,`/monitoring-plans/${x.plan}`);assertion(p.etag&&p.data.rulesVersion==='MANUAL_V1','PLAN_AUTHORITATIVE_ETAG');
  await request(l,'GET',`/monitoring-plans/${x.plan}`,undefined,403);await request(b,'GET',`/monitoring-plans/${x.plan}`,undefined,404);
 });
 await scenario('D22',async()=>{
  const e=(await events(x.plan))[0],path=`/monitoring-events/${e.id}`,g=await get(o,path);x.racedEvent=e.id;
  await request(o,'PATCH',path,{scheduledAt:eventBody(3600000).scheduledAt},428);
  const {scheduledAt,dueAt}=eventBody(3600000);await race(()=>mutate(o,'PATCH',path,{scheduledAt,dueAt},[200,409],g.etag),()=>mutate(x.o2,'POST',path+'/cancel',{},[200,409],g.etag),[200,409]);
  const fresh=await get(o,path);assertion(['SCHEDULED','CANCELLED'].includes(fresh.data.status),'MONITOR_EVENT_RACE_FINAL_STATE');
  count('ONE_RESCHEDULE_OR_CANCEL_AUDIT',`select count(*) from audit_logs where entity_id=${uuid(e.id)} and action in ('MONITORING_EVENT_RESCHEDULED','MONITORING_EVENT_CANCELLED')`,1);
 });
 await scenario('D23',async()=>{
  // Restart is coordinated by the host harness; no public or invented sweep API.
  const p=await get(o,`/monitoring-plans/${x.plan}`),timed=eventBody(95000,145000);
  x.timed=(await mutate(o,'POST',`/monitoring-plans/${x.plan}/events`,timed,201,p.etag)).data.id;
  const tp=await get(o,`/monitoring-plans/${x.tptPlan}`);x.tptTimed=(await mutate(o,'POST',`/monitoring-plans/${x.tptPlan}/events`,timed,201,tp.etag)).data.id;
  assertion((await get(o,`/monitoring-events/${x.timed}`)).data.status==='SCHEDULED','CONTROLLED_EVENT_INITIAL_SCHEDULED');
  writeFileSync('/tmp/e2e-scheduler-ready','ready');const deadline=Date.now()+90000;while(!existsSync('/tmp/e2e-scheduler-enabled')){check(Date.now()<deadline,'SCHEDULER_COORDINATION_TIMEOUT');await sleep(500);}
  await waitEvent(x.timed,'DUE',120000);assertion((await alertFor(x.timed)).length===0,'DUE_WITHOUT_OVERDUE_ALERT');
  await waitEvent(x.timed,'OVERDUE',65000);await waitEvent(x.tptTimed,'OVERDUE',10000);await sleep(2200);
  const ar=await alertFor(x.timed),tar=await alertFor(x.tptTimed);assertion(ar.length===1&&tar.length===1,'ONE_ALERT_PER_OVERDUE_EVENT');x.alert=ar[0].id;x.tptAlert=tar[0].id;
  for(const [who,aid] of [[a.patient,x.alert],[a.supporter,x.alert],[x.tptPatient,x.tptAlert]]){const n=(await get(who,'/me/notifications?size=50')).data.content;assertion(n.filter(z=>z.alertId===aid&&z.channel==='IN_APP'&&z.status==='DELIVERED').length===1,'INTENDED_IN_APP_RECIPIENT');}
  assertion(!(await get(a.supporter,'/me/notifications?size=50')).data.content.some(z=>z.alertId===x.tptAlert),'INDEX_SUPPORTER_EXCLUDED_FROM_TPT_FANOUT');
  count('ONE_TREATMENT_ALERT',`select count(*) from alerts where monitoring_event_id=${uuid(x.timed)}`,1);
  count('ONE_TPT_ALERT',`select count(*) from alerts where monitoring_event_id=${uuid(x.tptTimed)}`,1);
  count('NO_DUPLICATE_FANOUT',`select count(*) from (select alert_id,user_id,channel from notifications where alert_id in (${uuid(x.alert)},${uuid(x.tptAlert)}) group by alert_id,user_id,channel having count(*)>1) d`,0);
  for(const e of [x.timed,x.tptTimed])for(const act of ['MONITORING_EVENT_DUE','MONITORING_EVENT_OVERDUE'])count('NULL_ACTOR_'+act,`select count(*) from audit_logs where entity_id=${uuid(e)} and action='${act}' and actor_user_id is null`,1);
 });
 await scenario('D24',async()=>{
  for(const [c,path] of [[a.patient,'/me/monitoring'],[a.supporter,`/me/supporting-cases/${f.case}/monitoring`],[x.tptPatient,'/me/monitoring']]){const v=(await get(c,path)).data;assertion(v.content.length>0,'SAFE_REAL_MONITORING');safeKeys(v,['targetId','monitoringPlanId','notes','patientId','contactId']);}
  const original=await get(o,`/alerts/${x.alert}`),p=(await get(a.patient,'/me/alerts')).data,s=(await get(a.supporter,`/me/supporting-cases/${f.case}/alerts`)).data;safeKeys(p,['targetId','monitoringEventId','patientId','contactId','notes']);safeKeys(s,['targetId','monitoringEventId','patientId','contactId','notes']);
  for(const [c,path] of [[a.patient,`/me/alerts/${x.alert}/acknowledge`],[a.supporter,`/me/supporting-cases/${f.case}/alerts/${x.alert}/acknowledge`]]){assertion((await request(c,'POST',path,{})).data.acknowledged,'PORTAL_RECEIPT');await request(c,'POST',path,{});}
  const after=await get(o,`/alerts/${x.alert}`);assertion(after.etag===original.etag&&after.data.status==='OPEN','RECEIPT_DOES_NOT_ACK_STAFF_ALERT');
  await request(x.tptPatient,'POST',`/me/alerts/${x.alert}/acknowledge`,{},404);
  count('TWO_UNIQUE_SELF_RECEIPTS',`select count(*) from alert_acknowledgements where alert_id=${uuid(x.alert)}`,2);
  audit('TWO_SELF_RECEIPT_AUDITS','ALERT_ACKNOWLEDGEMENT_RECORDED',x.alert,2);
 });
 await scenario('D25',async()=>{
  const path=`/alerts/${x.alert}`,g=await get(o,path);
  await race(()=>mutate(o,'POST',path+'/acknowledge',{},[200,409],g.etag),()=>mutate(x.o2,'POST',path+'/acknowledge',{},[200,409],g.etag),[200,409]);
  const ack=await get(o,path);assertion(ack.data.status==='ACKNOWLEDGED','STAFF_ALERT_ACKNOWLEDGED');const again=await mutate(o,'POST',path+'/acknowledge',{},200,ack.etag);assertion(again.etag===ack.etag,'STAFF_ACK_IDEMPOTENT');
  await mutate(o,'POST',path+'/resolve',{},200,ack.etag);await sleep(2200);const resolved=await get(o,path);assertion(resolved.data.status==='RESOLVED','RESOLVED_ALERT_NOT_REOPENED');
  assertion((await get(o,`/monitoring-events/${x.timed}`)).data.status==='OVERDUE','RESOLVE_NOT_EVENT_COMPLETION');audit('ONE_STAFF_ACK_AUDIT','ALERT_ACKNOWLEDGED',x.alert,1);audit('ONE_RESOLVE_AUDIT','ALERT_RESOLVED',x.alert,1);
 });
 await scenario('D26',async()=>{
  const n=(await get(a.patient,'/me/notifications?size=50')).data.content.find(z=>z.alertId===x.alert),path=`/me/notifications/${n.id}`,g=await get(a.patient,path),p2=await session(a.patient);
  await request(o,'GET',path,undefined,404);
  await race(()=>mutate(a.patient,'POST',path+'/read',{},[200,409],g.etag),()=>mutate(p2,'POST',path+'/read',{},[200,409],g.etag),[200,409]);
  const read=await get(a.patient,path);assertion(read.data.status==='READ','NOTIFICATION_READ');const repeat=await mutate(a.patient,'POST',path+'/read',{},200,read.etag);assertion(repeat.etag===read.etag,'NOTIFICATION_READ_IDEMPOTENT');audit('ONE_NOTIFICATION_READ_AUDIT','NOTIFICATION_READ',n.id,1);await p2.context.close();
 });
 await scenario('D27',async()=>{
  const te=await get(o,`/monitoring-events/${x.tptTimed}`);await mutate(o,'POST',`/monitoring-events/${x.tptTimed}/complete`,{},200,te.etag);
  assertion((await get(o,`/alerts/${x.tptAlert}`)).data.status==='RESOLVED','EVENT_COMPLETION_AUTO_RESOLVES');
  for(const pid of [x.plan,x.tptPlan]){const g=await get(o,`/monitoring-plans/${pid}`);if(g.data.status==='ACTIVE')await mutate(o,'POST',`/monitoring-plans/${pid}/cancel`,{},200,g.etag);}
  count('NO_DUPLICATE_MONITORING_ALERT',`select count(*) from alerts where monitoring_event_id=${uuid(x.timed)}`,1);
 });
 await scenario('D28',async()=>{
  for(const [account,path,heading] of [[a.patient,'/portal/treatment','Pengobatan Saya'],[a.supporter,`/supporting-cases/${f.case}`,'Pendampingan kasus']]){
   const c=await client();let errors=0;c.page.on('pageerror',()=>errors++);await h.uiLogin(c,account);await c.page.goto(h.origin+path);await c.page.getByRole('heading',{name:heading,exact:true}).waitFor();
   await c.page.getByText(x.regimen.name,{exact:false}).first().waitFor();await c.page.getByText('HEALTH_WORKER',{exact:true}).first().waitFor();
   if(account===a.patient){await c.page.getByText('Synthetic follow-up',{exact:true}).waitFor();await c.page.goto(h.origin+'/portal/monitoring');await c.page.getByRole('heading',{name:'Pemantauan Saya',exact:true}).waitFor();await c.page.getByText(x.monitor.treatmentEventTypes.find(e=>e.code===x.eventType).name,{exact:true}).first().waitFor();await c.page.goto(h.origin+'/portal/alerts');}
   else await c.page.getByText(x.monitor.treatmentEventTypes.find(e=>e.code===x.eventType).name,{exact:true}).first().waitFor();
   await c.page.getByText('Jadwal pemantauan telah melewati batas waktu.',{exact:true}).first().waitFor();assertion(!(await c.page.content()).includes(f.identity)&&!(await c.page.content()).includes('Synthetic private narrative'),'PORTAL_RENDER_PRIVACY');assertion(errors===0,'PORTAL_RENDER_NO_RUNTIME_ERROR');await c.context.close();
  }
 });
 await scenario('D29',async()=>{
  const prep=(await get(o,`/cases/${f.case}/referral-preparation`)).data;assertion(prep.openTreatment.id===x.treatmentId,'TRANSFER_PREPARATION_TREATMENT');
  x.referral=(await request(o,'POST',`/cases/${f.case}/referrals`,{referralType:'TREATMENT_TRANSFER',destinationFacilityId:f.facilityB,treatmentId:x.treatmentId},201)).data.id;
  let g=await get(b,`/referrals/${x.referral}`);await mutate(o,'POST',`/referrals/${x.referral}/receive`,{},404,g.etag);await mutate(b,'POST',`/referrals/${x.referral}/receive`,{},200,g.etag);
  assertion((await get(o,`/cases/${f.case}`)).data.status==='REFERRED'&&(await get(o,`/treatments/${x.treatmentId}`)).data.facility.id===f.facilityA,'RECEIVE_PRESERVES_OWNERSHIP');
 });
 await scenario('D30',async()=>{
  const ref=await get(b,`/referrals/${x.referral}`),t=await get(o,`/treatments/${x.treatmentId}`);
  const r=await Promise.all([mutate(b,'POST',`/referrals/${x.referral}/report`,{},[200,409],ref.etag),mutate(o,'POST',`/treatments/${x.treatmentId}/outcome`,outcomeBody(),[201,404,409],t.etag)]);
  assertion(r[0].status===200&&[404,409].includes(r[1].status),'TRANSFER_REPORT_OUTCOME_RACE');
  assertion((await get(b,`/cases/${f.case}`)).data.status==='ACTIVE'&&(await get(b,`/treatments/${x.treatmentId}`)).data.facility.id===f.facilityB,'TRANSFER_DESTINATION_ACTIVE');
  count('TRANSFER_NO_OUTCOME',`select count(*) from treatment_outcomes where treatment_id=${uuid(x.treatmentId)}`,0);audit('ONE_REPORT_AUDIT','REFERRAL_REPORTED',x.referral,1);
  count('TRANSFER_NO_OUTCOME_AUDIT',`select count(*) from audit_logs a join treatment_outcomes t on a.entity_id=t.id where a.action='TREATMENT_OUTCOME_RECORDED' and t.treatment_id=${uuid(x.treatmentId)}`,0);
 });
 await scenario('D31',async()=>{
  await request(o,'GET',`/cases/${f.case}`,undefined,404);await request(o,'GET',`/treatments/${x.treatmentId}`,undefined,404);
  const g=await get(b,`/treatments/${x.treatmentId}`);await mutate(o,'PATCH',`/treatments/${x.treatmentId}`,{initialWeightKg:60},404,g.etag);await mutate(b,'PATCH',`/treatments/${x.treatmentId}`,{initialWeightKg:60},200,g.etag);
  assertion((await get(o,`/referrals/${x.referral}`)).data.status==='REPORTED','SOURCE_REFERRAL_HISTORY');
  assertion((await get(o,'/referrals/outgoing')).data.content.some(z=>z.id===x.referral),'SOURCE_OUTGOING_HISTORY');
  await get(o,`/contact-investigations/${x.ik}`);await get(o,`/preventive-treatments/${x.tptId}`);await request(b,'GET',`/contact-investigations/${x.ik}`,undefined,404);await request(b,'GET',`/preventive-treatments/${x.tptId}`,undefined,404);
  assertion((await get(a.patient,'/me/treatment')).data.id===x.treatmentId&&(await get(a.supporter,`/me/supporting-cases/${f.case}/treatment`)).data.id===x.treatmentId,'PORTAL_LINKS_SURVIVE_TRANSFER');
  count('TRANSFER_PRESERVES_DRUG_ROWS',`select count(*) from treatment_drugs where treatment_id=${uuid(x.treatmentId)}`,1);count('TRANSFER_PRESERVES_EVIDENCE_ROWS',`select count(*) from dose_events where treatment_id=${uuid(x.treatmentId)}`,3);
 });
 await scenario('D32',async()=>{
  const z=await treatment(await newCase()),g=await get(o,`/treatments/${z.treatment}`);
  const r=await race(()=>request(o,'POST',`/cases/${z.case}/referrals`,{referralType:'TREATMENT_TRANSFER',destinationFacilityId:f.facilityB,treatmentId:z.treatment},[201,409]),()=>mutate(x.o2,'POST',`/treatments/${z.treatment}/outcome`,outcomeBody(),[201,409],g.etag),[201,409]);
  const send=r[0].status===201;assertion((await get(o,`/cases/${z.case}`)).data.status===(send?'REFERRED':'COMPLETED'),'SEND_OUTCOME_FINAL_STATE');
  count('SEND_OUTCOME_REFERRAL_ROWS',`select count(*) from referrals where case_id=${uuid(z.case)}`,send?1:0);count('SEND_OUTCOME_OUTCOME_ROWS',`select count(*) from treatment_outcomes where treatment_id=${uuid(z.treatment)}`,send?0:1);count('SEND_OUTCOME_SUCCESS_AUDIT',`select count(*) from audit_logs a join treatment_outcomes t on a.entity_id=t.id where a.action='TREATMENT_OUTCOME_RECORDED' and t.treatment_id=${uuid(z.treatment)}`,send?0:1);
  count('SEND_REFERRAL_SUCCESS_AUDIT',`select count(*) from audit_logs a join referrals r on a.entity_id=r.id where a.action='REFERRAL_SENT' and r.case_id=${uuid(z.case)}`,send?1:0);
 });
 await scenario('D33',async()=>{
  const z=await treatment(await newCase()),ref=(await request(o,'POST',`/cases/${z.case}/referrals`,{referralType:'TREATMENT_TRANSFER',destinationFacilityId:f.facilityB,treatmentId:z.treatment},201)).data;
  const g=await get(o,`/referrals/${ref.id}`);await race(()=>mutate(b,'POST',`/referrals/${ref.id}/receive`,{},[200,409],g.etag),()=>mutate(o,'POST',`/referrals/${ref.id}/cancel`,{cancelReason:'Synthetic cancellation'},[200,409],g.etag),[200,409]);
  const state=(await get(o,`/referrals/${ref.id}`)).data.status;assertion(['RECEIVED','CANCELLED'].includes(state),'REFERRAL_RACE_FINAL_STATE');
  assertion((await get(o,`/treatments/${z.treatment}`)).data.facility.id===f.facilityA,'REFERRAL_RACE_SOURCE_OWNERSHIP');
  count('ONE_RECEIVE_OR_CANCEL_AUDIT',`select count(*) from audit_logs where entity_id=${uuid(ref.id)} and action in ('REFERRAL_RECEIVED','REFERRAL_CANCELLED')`,1);
 });
 await scenario('D34',async()=>{
  await provision('lookup','TB_OFFICER',f.facilityA);const c=a.lookup,z=await newCase(),z2=await newCase(),body={identity:'unavailable-'+randomUUID()+'@example.invalid'};
  for(let i=0;i<5;i++)await request(c,'POST',`/patients/${z.patient}/account-link/resolve-user`,body,404);
  await request(c,'POST',`/patients/${z.patient}/account-link/resolve-user`,body,429);
  for(let i=0;i<4;i++)await request(c,'POST',`/patients/${z2.patient}/account-link/resolve-user`,body,404);
  await request(c,'POST',`/patients/${z2.patient}/account-link/resolve-user`,body,429);
  count('LOOKUP_UNAVAILABLE_DURABLE',`select count(*) from audit_logs where actor_user_id=${uuid(c.id)} and action='ACCOUNT_RESOLUTION_UNAVAILABLE'`,9);
  count('LOOKUP_THROTTLED_DURABLE',`select count(*) from audit_logs where actor_user_id=${uuid(c.id)} and action='ACCOUNT_RESOLUTION_THROTTLED'`,2);
 });
 await scenario('D35',async()=>{
  await provision('parallelLookup','TB_OFFICER',f.facilityA);const c=a.parallelLookup,c2=await session(c),z=await newCase(),body={identity:'unavailable-'+randomUUID()+'@example.invalid'},path=`/patients/${z.patient}/account-link/resolve-user`;
  const requests=Array.from({length:8},(_,i)=>request(i%2?c:c2,'POST',path,body,[404,429]));const r=await Promise.race([Promise.all(requests),sleep(30000).then(()=>{throw new Error('BOUNDED_LOOKUP_TIMEOUT');})]);
  assertion(r.filter(v=>v.status===404).length===5&&r.filter(v=>v.status===429).length===3,'LOOKUP_PARALLEL_BUDGET');
  count('EIGHT_DURABLE_LOOKUP_OUTCOMES',`select count(*) from audit_logs where actor_user_id=${uuid(c.id)} and action in ('ACCOUNT_RESOLUTION_UNAVAILABLE','ACCOUNT_RESOLUTION_THROTTLED')`,8);await c2.context.close();
  count('FIVE_PARALLEL_UNAVAILABLE_AUDITS',`select count(*) from audit_logs where actor_user_id=${uuid(c.id)} and action='ACCOUNT_RESOLUTION_UNAVAILABLE'`,5);
  count('THREE_PARALLEL_THROTTLED_AUDITS',`select count(*) from audit_logs where actor_user_id=${uuid(c.id)} and action='ACCOUNT_RESOLUTION_THROTTLED'`,3);
 });
 await scenario('D36',async()=>{
  const state=await get(b,`/patients/${f.patient}/account-link`);await mutate(b,'DELETE',`/patients/${f.patient}/account-links/${state.data.link.id}`,undefined,200,state.etag);
  for(const path of ['/me/treatment','/me/monitoring','/me/alerts','/me/notifications'])await request(a.patient,'GET',path,undefined,403);
  const supporter=await get(b,`/cases/${f.case}/supporters/${f.supporter}`);await mutate(b,'DELETE',`/cases/${f.case}/supporters/${f.supporter}/account-link`,undefined,200,supporter.etag);
  for(const suffix of ['treatment','monitoring','alerts'])await request(a.supporter,'GET',`/me/supporting-cases/${f.case}/${suffix}`,undefined,403);
  await request(x.roleless,'GET','/me/notifications',undefined,403);await request(l,'GET',`/monitoring-events/${x.tptTimed}`,undefined,403);await request(b,'GET',`/monitoring-events/${x.tptTimed}`,undefined,404);
  const tp=await get(o,`/preventive-treatments/${x.tptId}`);await mutate(o,'POST',`/preventive-treatments/${x.tptId}/complete`,{},200,tp.etag);await mutate(o,'PATCH',`/preventive-treatments/${x.tptId}`,{weightKg:60},409,(await get(o,`/preventive-treatments/${x.tptId}`)).etag);
  count('TPT_EXPLICIT_COMPLETED',`select count(*) from preventive_treatments where id=${uuid(x.tptId)} and status='COMPLETED' and outcome_code is null`,1);
  count('CLINICAL_LOOKUP_AUDIT_METADATA_ALLOWLIST',`select count(*) from audit_logs where (action like 'LAB_%' or action like 'TREATMENT_%' or action like 'TPT_%' or action like 'MONITORING_%' or action like 'REFERRAL_%' or action like 'CONTACT_%' or action like 'ACCOUNT_RESOLUTION_%' or action like 'ALERT_%' or action='NOTIFICATION_READ' or action='DOSE_EVENT_RECORDED') and (before_data is not null or after_data is not null or (metadata - 'traceId') <> '{}'::jsonb or not(metadata ? 'traceId'))`,0);
 });
}
