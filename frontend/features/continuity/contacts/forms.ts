import { z } from "@/lib/validation";
import type { Body,Contact,Dirty } from "../types";
import { localDateTimeToIso,todayLocal } from "../time";
export const required=(max=255)=>z.string().trim().min(1,"Isian wajib diisi.").max(max,"Isian terlalu panjang.");
export const optional=(max=255)=>z.string().max(max,"Isian terlalu panjang.");
export const optionalDate=z.union([z.literal(""),z.iso.date()]);
export const localTime=z.string().refine(v=>{if(!v)return true;try{localDateTimeToIso(v);return true;}catch{return false;}},"Waktu lokal tidak valid atau ambigu.");
export const contactFormSchema=z.object({fullName:required(),birthDate:optionalDate.refine(v=>!v||v<=todayLocal(),"Tanggal lahir tidak boleh di masa depan."),sexCode:optional(30),phone:optional(40),clearPhone:z.boolean(),address:z.string(),relationshipToIndexCase:optional(100),householdContact:z.enum(["","true","false"]),workflowType:z.string(),destinationFacilityId:z.union([z.literal(""),z.uuid()]),notes:z.string()});
export const contactCreateSchema=contactFormSchema.superRefine((v,c)=>{if(!["INTERNAL","OUTGOING_REFERRAL"].includes(v.workflowType))c.addIssue({code:"custom",path:["workflowType"],message:"Pilih alur kontak yang dapat dibuat."});if(v.workflowType==="OUTGOING_REFERRAL"&&!v.destinationFacilityId)c.addIssue({code:"custom",path:["destinationFacilityId"],message:"Pilih fasilitas tujuan."});});
export function contactValues(c?:Contact){return {fullName:c?.fullName??"",birthDate:c?.birthDate??"",sexCode:c?.sexCode??"",phone:"",clearPhone:false,address:c?.address??"",relationshipToIndexCase:c?.relationshipToIndexCase??"",householdContact:c?.householdContact==null?"" as const:c.householdContact?"true" as const:"false" as const,workflowType:"",destinationFacilityId:"",notes:""};}
export type ContactValues=z.infer<typeof contactFormSchema>;
const text=(v:string)=>v.trim()||null;
export function contactPatch(v:ContactValues,dirty:Dirty):Body{
 const mutable:Body={fullName:v.fullName.trim(),birthDate:v.birthDate||null,sexCode:text(v.sexCode),phone:text(v.phone),address:text(v.address),relationshipToIndexCase:text(v.relationshipToIndexCase),householdContact:v.householdContact===""?null:v.householdContact==="true"};
 return {...Object.fromEntries(Object.entries(mutable).filter(([key])=>dirty[key]===true)),...(dirty.clearPhone===true&&v.clearPhone?{phone:null}:{})};
}
export function contactInput(v:ContactValues):Body{return {...contactPatch(v,{fullName:true,birthDate:true,sexCode:true,phone:true,address:true,relationshipToIndexCase:true,householdContact:true}),workflowType:v.workflowType,...(v.workflowType==="OUTGOING_REFERRAL"?{destinationFacilityId:v.destinationFacilityId}:{}),...(v.notes.trim()?{notes:v.notes.trim()}:{})};}
export const completionSchema=z.object({investigatedAt:localTime,resultCode:optional(100),activeTbExcluded:z.enum(["true","false"],"Pilih pengecualian TB aktif secara eksplisit."),tptEligible:z.enum(["true","false"],"Pilih kelayakan TPT secara eksplisit."),notes:z.string()}).refine(v=>v.tptEligible!=="true"||v.activeTbExcluded==="true",{path:["tptEligible"],message:"Layak TPT memerlukan pengecualian TB aktif yang eksplisit."});
export const completionValues=()=>({investigatedAt:"",resultCode:"",activeTbExcluded:"",tptEligible:"",notes:""});
// Blank booleans are deliberate initial values; Zod validates before conversion.
export function completionInput(v:ReturnType<typeof completionValues>):Body{return {activeTbExcluded:v.activeTbExcluded==="true",tptEligible:v.tptEligible==="true",...(v.investigatedAt?{investigatedAt:localDateTimeToIso(v.investigatedAt)}:{}),...(v.resultCode.trim()?{resultCode:v.resultCode.trim()}:{}),...(v.notes.trim()?{notes:v.notes.trim()}:{})};}
