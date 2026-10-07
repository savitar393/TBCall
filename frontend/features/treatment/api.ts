import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as s from "./schemas";
import type { CommandInput } from "./types";
import type { startInput } from "./forms/mappers";
async function validated<S extends z.ZodType>(path:string,model:S,options:Parameters<typeof apiRequest>[1]={}) { const response=await apiRequest<unknown>(`/v1${path}`,options);const value=model.safeParse(response.data);if(!value.success) throw new ApiError({status:502,code:"INVALID_RESPONSE",title:"Respons layanan tidak valid"});return {...response,data:value.data as z.infer<S>}; }
const segment=encodeURIComponent;
export const treatmentApi={
 references:(signal?:AbortSignal)=>validated("/treatment-reference-data",s.referenceDataSchema,{signal}),
 episodes:(id:string,signal?:AbortSignal)=>validated(`/cases/${segment(id)}/treatments`,s.treatmentListSchema,{signal}),
 detail:(id:string,signal?:AbortSignal)=>validated(`/treatments/${segment(id)}`,s.treatmentDetailSchema,{signal}),
 doses:(id:string,page:number,size:number,signal?:AbortSignal)=>validated(`/treatments/${segment(id)}/dose-events?page=${page}&size=${size}`,s.dosePageSchema,{signal}),
 start:(id:string,body:ReturnType<typeof startInput>,signal?:AbortSignal)=>validated(`/cases/${segment(id)}/treatments`,s.treatmentDetailSchema,{method:"POST",body,signal}),
 update:(id:string,body:CommandInput,etag:string,signal?:AbortSignal)=>validated(`/treatments/${segment(id)}`,s.treatmentDetailSchema,{method:"PATCH",body,etag,signal}),
 dose:(id:string,body:CommandInput,signal?:AbortSignal)=>validated(`/treatments/${segment(id)}/dose-events`,s.doseSchema,{method:"POST",body,signal}),
 schedule:(id:string,body:CommandInput,etag:string,signal?:AbortSignal)=>validated(`/treatments/${segment(id)}/follow-ups`,s.followUpSchema,{method:"POST",body,etag,signal}),
 complete:(id:string,body:CommandInput,etag:string,signal?:AbortSignal)=>validated(`/follow-ups/${segment(id)}/complete`,s.followUpSchema,{method:"POST",body,etag,signal}),
 adverse:(id:string,body:CommandInput,signal?:AbortSignal)=>validated(`/treatments/${segment(id)}/adverse-events`,s.adverseSchema,{method:"POST",body,signal}),
 updateAdverse:(id:string,body:CommandInput,etag:string,signal?:AbortSignal)=>validated(`/adverse-events/${segment(id)}`,s.adverseSchema,{method:"PATCH",body,etag,signal}),
 outcome:(id:string,body:CommandInput,etag:string,signal?:AbortSignal)=>validated(`/treatments/${segment(id)}/outcome`,s.outcomeSchema,{method:"POST",body,etag,signal}),
};
