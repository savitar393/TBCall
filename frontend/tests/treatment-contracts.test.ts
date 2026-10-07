import { expect, it } from "vitest";
import { treatmentDetail, treatmentReferences, treatmentAdverse } from "./treatment-fixtures";
const modules = import.meta.glob("../features/treatment/**/*.ts");
async function load<T>(file:string):Promise<T> { const loader=modules[`../features/treatment/${file}.ts`]; if(!loader) throw new Error(`Missing treatment module ${file}`); return await loader() as T; }
it("strict references reject null category, preventive shape, unknown composition and incomplete groups", async()=>{
  const {referenceDataSchema:s}=await load<typeof import("@/features/treatment/schemas")>("schemas");
  expect(s.safeParse(treatmentReferences).success).toBe(true);
  for(const regimen of [{...treatmentReferences.regimens[0],caseCategoryCode:null},{...treatmentReferences.regimens[0],caseCategoryCode:"PREVENTIVE"},{...treatmentReferences.regimens[0],composition:["H"]}]) expect(s.safeParse({...treatmentReferences,regimens:[regimen]}).success).toBe(false);
  expect(s.safeParse({...treatmentReferences,drugs:undefined}).success).toBe(false);
});
it("strict detail accepts permission-dependent empties and rejects extra clinical payload fields",async()=>{
  const {treatmentDetailSchema:s}=await load<typeof import("@/features/treatment/schemas")>("schemas");
  expect(s.safeParse(treatmentDetail).success).toBe(true);
  expect(s.safeParse({...treatmentDetail,adherenceSummary:null,recentDoseEvents:[],followUps:[],adverseEvents:[],outcome:null,followUpLabRequests:[]}).success).toBe(true);
  expect(s.safeParse({...treatmentDetail,patient:{...treatmentDetail.patient,nik:"private"}}).success).toBe(false);
});
it.each([-1,1.5,Number.MAX_SAFE_INTEGER+1])("child ETag rejects invalid version %s",async version=>{ const {treatmentChildEtagFromVersion:f}=await load<typeof import("@/features/treatment/etag")>("etag"); expect(()=>f(version)).toThrow(); });
it("child ETag quotes only the published child version",async()=>{const {treatmentChildEtagFromVersion:f}=await load<typeof import("@/features/treatment/etag")>("etag");expect(f(8)).toBe('"8"');});
it("metadata patch includes only dirty permitted fields with explicit null clears",async()=>{
  const {metadataValues}=await load<typeof import("@/features/treatment/forms/values")>("forms/values"); const {metadataPatch}=await load<typeof import("@/features/treatment/forms/mappers")>("forms/mappers");
  expect(metadataPatch({...metadataValues(treatmentDetail),notes:"",oatForm:" Tablet "},{notes:true,oatForm:true,regimenCode:true,status:true,drugs:true})).toEqual({notes:null,oatForm:"Tablet"});
});
it("adverse patch preserves unchanged timestamp precision and excludes immutable fields",async()=>{
 const {adverseValues}=await load<typeof import("@/features/treatment/forms/values")>("forms/values");const {adversePatch}=await load<typeof import("@/features/treatment/forms/mappers")>("forms/mappers");const v=adverseValues(treatmentAdverse);
 expect(adversePatch({...v,severity:"Mild"},{severity:true,eventType:true},treatmentAdverse)).toEqual({severity:"Mild"});
 expect(adversePatch(v,{startedAt:true,serious:true},treatmentAdverse)).toEqual({startedAt:treatmentAdverse.startedAt,serious:false});
});
it.each([0,21])("start rejects %s drug rows",async n=>{ const m=await load<typeof import("@/features/treatment/forms/values")>("forms/values"); const v=m.startValues();v.regimenCode="SO";v.startDate="2026-09-04";v.drugs=Array.from({length:n},()=>({...m.drugValues(),drugCode:"H",startDate:v.startDate}));expect(m.startFormSchema.safeParse(v).success).toBe(false); });
it("start validates dates, duplicate normalized drug tuples, units and frequency without composition",async()=>{
 const m=await load<typeof import("@/features/treatment/forms/values")>("forms/values"); const v={...m.startValues(),regimenCode:"SO",startDate:"2026-09-04",drugs:[{...m.drugValues(),drugCode:"H",startDate:"2026-09-04"}]};expect(m.startFormSchema.safeParse(v).success).toBe(true);
 for(const override of [{startDate:"2200-01-01"},{plannedEndDate:"2026-09-03"},{intensiveEndDate:"2026-09-10",continuationStartDate:"2026-09-09"},{drugs:[{...v.drugs[0],doseValue:"1",doseUnit:""}]},{drugs:[{...v.drugs[0],startDate:"2026-09-03"}]},{drugs:[{...v.drugs[0],frequencyPerWeek:"8"}]},{drugs:[v.drugs[0],{...v.drugs[0],drugCode:" H "}]}]) expect(m.startFormSchema.safeParse({...v,...override}).success).toBe(false);
 const {startInput}=await load<typeof import("@/features/treatment/forms/mappers")>("forms/mappers");expect(startInput(v)).not.toHaveProperty("status");expect(startInput(v)).not.toHaveProperty("facilityId");expect(startInput(v).drugs).toHaveLength(1);
});
it("completion rejects negative weight and completion before scheduled time",async()=>{const m=await load<typeof import("@/features/treatment/forms/values")>("forms/values"); expect(m.completeFormSchema("2026-09-05T00:00:00Z").safeParse({...m.completeValues(),completedAt:"2026-09-01T12:00",weightKg:"-1"}).success).toBe(false);});
it("explicit outcome confirmation is required",async()=>{const m=await load<typeof import("@/features/treatment/forms/values")>("forms/values"); expect(m.outcomeFormSchema("2026-09-04").safeParse({...m.outcomeValues(),outcomeCode:"SEMBUH",outcomeDate:"2026-09-10"}).success).toBe(false);});
it("phase dates cannot precede treatment start and distinct free-text phase casing is preserved",async()=>{
 const m=await load<typeof import("@/features/treatment/forms/values")>("forms/values");const v={...m.startValues(),regimenCode:"SO",startDate:"2026-09-04",drugs:[{...m.drugValues(),drugCode:"H",treatmentPhase:"Phase",startDate:"2026-09-04"},{...m.drugValues(),drugCode:"H",treatmentPhase:"phase",startDate:"2026-09-04"}]};expect(m.startFormSchema.safeParse(v).success).toBe(true);expect(m.startFormSchema.safeParse({...v,intensiveStartDate:"2026-09-03"}).success).toBe(false);
});
it("20 explicit distinct drug lines remain valid without generating doses",async()=>{const m=await load<typeof import("@/features/treatment/forms/values")>("forms/values");const v={...m.startValues(),regimenCode:"SO",startDate:"2026-09-04",drugs:Array.from({length:20},(_,i)=>({...m.drugValues(),drugCode:"H",treatmentPhase:`User phase ${i}`,startDate:"2026-09-04"}))};expect(m.startFormSchema.safeParse(v).success).toBe(true);});
it.each([{startedAt:"2200-01-01T12:00"},{startedAt:"2026-09-06T12:00",endedAt:"2026-09-05T12:00"},{serious:null}])("adverse input rejects structurally invalid fields %j",async override=>{const m=await load<typeof import("@/features/treatment/forms/values")>("forms/values");expect(m.adverseFormSchema().safeParse({...m.adverseValues(),eventType:"Explicit event",...override}).success).toBe(false);});
