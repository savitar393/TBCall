import type * as values from "./values";
import type { CommandInput, AdverseView } from "../types";
import { localDateTimeToIso, isoToLocalDateTime } from "../time";
export type Dirty=Partial<Record<string,unknown>>;
const text=(v:string)=>v.trim()||null, number=(v:string)=>v===""?null:Number(v), date=(v:string)=>v||null;
const select=(v:CommandInput,dirty:Dirty)=>Object.fromEntries(Object.entries(v).filter(([k])=>dirty[k]===true));
function metadataInput(v:ReturnType<typeof values.metadataValues>):CommandInput {return {plannedEndDate:date(v.plannedEndDate),initialWeightKg:number(v.initialWeightKg),oatForm:text(v.oatForm),drugSource:text(v.drugSource),intensiveStartDate:date(v.intensiveStartDate),intensiveEndDate:date(v.intensiveEndDate),continuationStartDate:date(v.continuationStartDate),continuationEndDate:date(v.continuationEndDate),regimenDescription:text(v.regimenDescription),notes:text(v.notes)};}
export const metadataPatch=(v:ReturnType<typeof values.metadataValues>,dirty:Dirty)=>select(metadataInput(v),dirty);
export function startInput(v:ReturnType<typeof values.startValues>) {return {...metadataInput(v),regimenCode:v.regimenCode.trim(),startDate:v.startDate,drugs:v.drugs.map(d=>({drugCode:d.drugCode.trim(),treatmentPhase:text(d.treatmentPhase),doseValue:number(d.doseValue),doseUnit:text(d.doseUnit),frequencyPerWeek:number(d.frequencyPerWeek),startDate:d.startDate,endDate:date(d.endDate),batchNumber:text(d.batchNumber),drugSource:text(d.drugSource),notes:text(d.notes)}))};}
export const doseInput=(v:ReturnType<typeof values.doseValues>):CommandInput=>({scheduledDate:v.scheduledDate,status:v.status,administrationMode:text(v.administrationMode),notes:text(v.notes)});
export const scheduleInput=(v:ReturnType<typeof values.scheduleValues>):CommandInput=>({followUpType:v.followUpType.trim(),scheduledAt:localDateTimeToIso(v.scheduledAt),facilityId:text(v.facilityId),notes:text(v.notes)});
export const completeInput=(v:ReturnType<typeof values.completeValues>):CommandInput=>({completedAt:localDateTimeToIso(v.completedAt),weightKg:number(v.weightKg),symptomSummary:text(v.symptomSummary),adherenceAssessment:text(v.adherenceAssessment),notes:text(v.notes)});
const adverseKeys=["severity","serious","startedAt","endedAt","description","actionTaken","outcome"] as const;
export function adversePatch(v:ReturnType<typeof values.adverseValues>,dirty:Dirty,original?:AdverseView):CommandInput {
 const result:CommandInput={};for(const key of adverseKeys) if(dirty[key]===true){if(key==="serious") result[key]=v.serious;else if(key==="startedAt"||key==="endedAt") result[key]=v[key]?original?.[key]&&v[key]===isoToLocalDateTime(original[key])?original[key]:localDateTimeToIso(v[key]):null;else result[key]=text(v[key]);}return result;
}
export const adverseInput=(v:ReturnType<typeof values.adverseValues>):CommandInput=>({eventType:v.eventType.trim(),...adversePatch(v,Object.fromEntries(adverseKeys.map(k=>[k,true])))});
export const outcomeInput=(v:ReturnType<typeof values.outcomeValues>):CommandInput=>({outcomeCode:v.outcomeCode,outcomeDate:v.outcomeDate,notes:text(v.notes)});
