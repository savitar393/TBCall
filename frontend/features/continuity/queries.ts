import { queryOptions } from "@tanstack/react-query";
import { clinicalApi } from "@/features/clinical-intake/api";
import { continuityApi as api } from "./api";
import type { Side } from "./types";
export const continuityKeys=(userId:string)=>["continuity",userId] as const;
export const continuityQueries={
 preparation:(u:string,id:string)=>queryOptions({queryKey:[...continuityKeys(u),"preparation",id],queryFn:({signal})=>api.preparation(id,signal)}),
 facilities:(u:string,query:string,page:number)=>queryOptions({queryKey:[...continuityKeys(u),"facilities",query,page],queryFn:({signal})=>api.facilities(query,page,signal)}),
 referralReferences:(u:string)=>queryOptions({queryKey:[...continuityKeys(u),"referralReferences"],queryFn:({signal})=>api.referralReferences(signal),staleTime:300000}),
 contactReferences:(u:string)=>queryOptions({queryKey:[...continuityKeys(u),"contactReferences"],queryFn:({signal})=>api.contactReferences(signal),staleTime:300000}),
 tptReferences:(u:string)=>queryOptions({queryKey:[...continuityKeys(u),"tptReferences"],queryFn:({signal})=>api.tptReferences(signal),staleTime:300000}),
 referrals:(u:string,side:Side,page:number)=>queryOptions({queryKey:[...continuityKeys(u),"referrals",side,page],queryFn:({signal})=>api.referrals(side,page,signal)}),
 referral:(u:string,id:string)=>queryOptions({queryKey:[...continuityKeys(u),"referral",id],queryFn:({signal})=>api.referral(id,signal)}),
 contacts:(u:string,id:string,page:number)=>queryOptions({queryKey:[...continuityKeys(u),"contacts",id,page],queryFn:({signal})=>api.contacts(id,page,signal)}),
 contact:(u:string,id:string)=>queryOptions({queryKey:[...continuityKeys(u),"contact",id],queryFn:({signal})=>api.contact(id,signal)}),
 investigations:(u:string,side:Side,page:number)=>queryOptions({queryKey:[...continuityKeys(u),"investigations",side,page],queryFn:({signal})=>api.investigations(side,page,signal)}),
 investigation:(u:string,id:string)=>queryOptions({queryKey:[...continuityKeys(u),"investigation",id],queryFn:({signal})=>api.investigation(id,signal)}),
 history:(u:string,id:string,page:number)=>queryOptions({queryKey:[...continuityKeys(u),"history",id,page],queryFn:({signal})=>api.history(id,page,signal)}),
 tpt:(u:string,id:string)=>queryOptions({queryKey:[...continuityKeys(u),"tpt",id],queryFn:({signal})=>api.tpt(id,signal)}),
 caseContext:(u:string,id:string)=>queryOptions({queryKey:[...continuityKeys(u),"caseContext",id],queryFn:({signal})=>clinicalApi.tbCase(id,signal)}),
 clinicalReferences:(u:string)=>queryOptions({queryKey:[...continuityKeys(u),"clinicalReferences"],queryFn:({signal})=>clinicalApi.references(signal),staleTime:300000}),
};
