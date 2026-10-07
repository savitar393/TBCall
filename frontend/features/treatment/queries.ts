import { queryOptions } from "@tanstack/react-query";
import { clinicalApi } from "@/features/clinical-intake/api";
import { treatmentApi } from "./api";
export const treatmentKeys=(userId:string)=>["treatment",userId] as const;
export const treatmentQueries={
 references:(userId:string)=>queryOptions({queryKey:[...treatmentKeys(userId),"references"],queryFn:({signal})=>treatmentApi.references(signal),staleTime:5*60*1000}),
 episodes:(userId:string,id:string)=>queryOptions({queryKey:[...treatmentKeys(userId),"case",id,"episodes"],queryFn:({signal})=>treatmentApi.episodes(id,signal)}),
 detail:(userId:string,id:string)=>queryOptions({queryKey:[...treatmentKeys(userId),"detail",id],queryFn:({signal})=>treatmentApi.detail(id,signal)}),
 doses:(userId:string,id:string,page=0,size=20)=>queryOptions({queryKey:[...treatmentKeys(userId),"doses",id,page,size],queryFn:({signal})=>treatmentApi.doses(id,page,size,signal)}),
 caseContext:(userId:string,id:string)=>queryOptions({queryKey:[...treatmentKeys(userId),"case",id,"context"],queryFn:({signal})=>clinicalApi.tbCase(id,signal)}),
};
