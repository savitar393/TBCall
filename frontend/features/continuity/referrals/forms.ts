import { z } from "@/lib/validation";
import { localTime,required } from "../contacts/forms";
import { localDateTimeToIso } from "../time";
import type { Body } from "../types";
export const transitionValues=()=>({receivedAt:"",patientReportedAt:"",notes:"",returnReason:"",cancelReason:"",confirmed:false});
export type ReferralAction="receive"|"return"|"cancel"|"report";
export const transitionSchema=(action:ReferralAction)=>z.object({receivedAt:localTime,patientReportedAt:localTime,notes:z.string(),returnReason:action==="return"?required(Number.MAX_SAFE_INTEGER):z.string(),cancelReason:action==="cancel"?required(Number.MAX_SAFE_INTEGER):z.string(),confirmed:z.boolean()}).refine(v=>!["cancel","report"].includes(action)||v.confirmed,{path:["confirmed"],message:"Konfirmasi tindakan diperlukan."});
export function transitionInput(action:ReferralAction,v:ReturnType<typeof transitionValues>):Body{switch(action){case "receive":return {...(v.receivedAt?{receivedAt:localDateTimeToIso(v.receivedAt)}:{}),...(v.notes.trim()?{notes:v.notes.trim()}:{})};case "return":return {returnReason:v.returnReason.trim()};case "cancel":return {cancelReason:v.cancelReason.trim()};case "report":return v.patientReportedAt?{patientReportedAt:localDateTimeToIso(v.patientReportedAt)}:{};}}
