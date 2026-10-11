import { apiRequest, type ApiOptions } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as s from "./schemas";
import type { ScheduleDefinition } from "./types";
const invalid=()=>new ApiError({status:502,code:"INVALID_RESPONSE",title:"Respons layanan tidak valid"});
async function validated<S extends z.ZodType>(path:string,schema:S,options:ApiOptions={}){const response=await apiRequest<unknown>(path,options),parsed=schema.safeParse(response.data);if(!parsed.success)throw invalid();return {...response,data:parsed.data as z.infer<S>};}
async function absence<T>(operation:()=>Promise<T>){try{return await operation();}catch(error){if(error instanceof ApiError&&error.problem.status===404)return null;throw error;}}
const staffPath=(id:string)=>`/v1/treatments/${encodeURIComponent(id)}/medication-schedule`,patientPath="/v1/me/treatment/medication-schedule",supporterPath=(id:string)=>`/v1/me/supporting-cases/${encodeURIComponent(id)}/medication-schedule`;
async function prescription(path:string,signal?:AbortSignal,id?:string){const response=await validated(path,s.schedulePrescriptionSchema,{signal});if(id&&response.data.treatmentId!==id)throw invalid();return response;}
async function calendar(path:string,from:string,to:string,signal?:AbortSignal){if(!s.scheduleRangeSchema.safeParse({from,to}).success)throw new ApiError({status:400,code:"INVALID_INPUT",title:"Rentang kalender tidak valid"});const response=await validated(`${path}/occurrences?${new URLSearchParams({from,to})}`,s.scheduleCalendarPageSchema,{signal});if(response.data.from!==from||response.data.to!==to)throw invalid();return response;}
export const scheduleApi={
 staff:(id:string,signal?:AbortSignal)=>prescription(staffPath(id),signal,id),
 history:async(id:string,page=0,signal?:AbortSignal)=>{if(!Number.isSafeInteger(page)||page<0||page*20>2147483647)throw new ApiError({status:400,title:"Halaman tidak valid"});const response=await validated(`${staffPath(id)}/revisions?page=${page}&size=20`,s.scheduleRevisionPageSchema,{signal});if(response.data.page!==page)throw invalid();return response;},
 patient:(signal?:AbortSignal)=>absence(()=>prescription(patientPath,signal)),
 patientOccurrences:(from:string,to:string,signal?:AbortSignal)=>absence(()=>calendar(patientPath,from,to,signal)),
 supporter:(caseId:string,signal?:AbortSignal)=>absence(()=>prescription(supporterPath(caseId),signal)),
 supporterOccurrences:(caseId:string,from:string,to:string,signal?:AbortSignal)=>absence(()=>calendar(supporterPath(caseId),from,to,signal)),
 create:(id:string,body:ScheduleDefinition,signal?:AbortSignal)=>validated(staffPath(id),s.schedulePrescriptionSchema,{method:"POST",body:s.scheduleDefinitionSchema.parse(body),signal,expectedStatus:201}),
 revise:(id:string,body:ScheduleDefinition,etag:string,signal?:AbortSignal)=>validated(staffPath(id),s.schedulePrescriptionSchema,{method:"PATCH",body:s.scheduleDefinitionSchema.parse(body),etag,signal}),
 cancel:(id:string,etag:string,signal?:AbortSignal)=>validated(`${staffPath(id)}/cancel`,s.schedulePrescriptionSchema,{method:"POST",etag,signal}),
};
