import { apiRequest,type ApiOptions } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as s from "./schemas";
import type { Body,Side } from "./types";
const segment=encodeURIComponent;
async function request<S extends z.ZodType>(path:string,schema:S,options:ApiOptions={}){const response=await apiRequest<unknown>(`/v1${path}`,options);const parsed=schema.safeParse(response.data);if(!parsed.success)throw new ApiError({status:502,title:"Respons layanan tidak valid",code:"INVALID_RESPONSE"});return {...response,data:parsed.data as z.infer<S>};}
const paging=(page:number)=>`page=${page}&size=20`;
export const continuityApi={
 preparation:(id:string,signal?:AbortSignal)=>request(`/cases/${segment(id)}/referral-preparation`,s.preparationSchema,{signal}),
 facilities:(query:string,page:number,signal?:AbortSignal)=>request(`/continuity-facilities?${new URLSearchParams({query,page:String(page),size:"20"})}`,s.facilityPageSchema,{signal}),
 referralReferences:(signal?:AbortSignal)=>request("/referral-reference-data",s.referralReferencesSchema,{signal}),
 contactReferences:(signal?:AbortSignal)=>request("/contact-reference-data",s.contactReferencesSchema,{signal}),
 tptReferences:(signal?:AbortSignal)=>request("/tpt-reference-data",s.tptReferencesSchema,{signal}),
 referrals:(side:Side,page:number,signal?:AbortSignal)=>request(`/referrals/${side}?${paging(page)}`,s.referralPageSchema,{signal}),
 referral:(id:string,signal?:AbortSignal)=>request(`/referrals/${segment(id)}`,s.referralSchema,{signal}),
 send:(id:string,body:Body,signal?:AbortSignal)=>request(`/cases/${segment(id)}/referrals`,s.referralSchema,{method:"POST",body,signal}),
 referralTransition:(id:string,action:string,body:Body,etag:string,signal?:AbortSignal)=>request(`/referrals/${segment(id)}/${segment(action)}`,s.referralSchema,{method:"POST",body,etag,signal}),
 contacts:(id:string,page:number,signal?:AbortSignal)=>request(`/cases/${segment(id)}/contacts?${paging(page)}`,s.contactPageSchema,{signal}),
 contact:(id:string,signal?:AbortSignal)=>request(`/contacts/${segment(id)}`,s.contactSchema,{signal}),
 createContact:(id:string,body:Body,signal?:AbortSignal)=>request(`/cases/${segment(id)}/contacts`,s.contactSchema,{method:"POST",body,signal}),
 updateContact:(id:string,body:Body,etag:string,signal?:AbortSignal)=>request(`/contacts/${segment(id)}`,s.contactSchema,{method:"PATCH",body,etag,signal}),
 resolve:(body:Body,signal?:AbortSignal)=>request("/patients/resolve",s.identityConfirmationSchema,{method:"POST",body,signal}),
 link:(id:string,body:Body,etag:string,signal?:AbortSignal)=>request(`/contacts/${segment(id)}/link-patient`,s.contactSchema,{method:"POST",body,etag,signal}),
 investigations:(side:Side,page:number,signal?:AbortSignal)=>request(`/contact-investigations/${side}?${paging(page)}`,s.investigationPageSchema,{signal}),
 investigation:(id:string,signal?:AbortSignal)=>request(`/contact-investigations/${segment(id)}`,s.investigationSchema,{signal}),
 investigationTransition:(id:string,action:string,body:Body,etag:string,signal?:AbortSignal)=>request(`/contact-investigations/${segment(id)}/${segment(action)}`,s.investigationSchema,{method:"POST",body,etag,signal}),
 history:(id:string,page:number,signal?:AbortSignal)=>request(`/contacts/${segment(id)}/tpt?${paging(page)}`,s.tptPageSchema,{signal}),
 tpt:(id:string,signal?:AbortSignal)=>request(`/preventive-treatments/${segment(id)}`,s.tptSchema,{signal}),
 startTpt:(id:string,body:Body,signal?:AbortSignal)=>request(`/contact-investigations/${segment(id)}/tpt`,s.tptSchema,{method:"POST",body,signal}),
 updateTpt:(id:string,body:Body,etag:string,signal?:AbortSignal)=>request(`/preventive-treatments/${segment(id)}`,s.tptSchema,{method:"PATCH",body,etag,signal}),
 closeTpt:(id:string,action:string,body:Body,etag:string,signal?:AbortSignal)=>request(`/preventive-treatments/${segment(id)}/${segment(action)}`,s.tptSchema,{method:"POST",body,etag,signal}),
};
