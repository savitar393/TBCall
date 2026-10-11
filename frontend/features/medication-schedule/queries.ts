import { queryOptions } from "@tanstack/react-query";
import { scheduleApi } from "./api";
export const scheduleKeys=(userId:string)=>["medication-schedule",userId] as const;
const fresh={retry:false,gcTime:0,staleTime:0,refetchOnMount:"always" as const};
export const scheduleQueries={
 staff:(u:string,id:string)=>queryOptions({...fresh,queryKey:[...scheduleKeys(u),"staff",id],queryFn:({signal})=>scheduleApi.staff(id,signal)}),
 history:(u:string,id:string,page=0)=>queryOptions({...fresh,queryKey:[...scheduleKeys(u),"staff",id,"history",page,20],queryFn:({signal})=>scheduleApi.history(id,page,signal)}),
 patient:(u:string)=>queryOptions({...fresh,queryKey:[...scheduleKeys(u),"patient"],queryFn:({signal})=>scheduleApi.patient(signal)}),
 patientOccurrences:(u:string,from:string,to:string)=>queryOptions({...fresh,queryKey:[...scheduleKeys(u),"patient","occurrences",from,to],queryFn:({signal})=>scheduleApi.patientOccurrences(from,to,signal)}),
 supporter:(u:string,id:string)=>queryOptions({...fresh,queryKey:[...scheduleKeys(u),"supporter",id],queryFn:({signal})=>scheduleApi.supporter(id,signal)}),
 supporterOccurrences:(u:string,id:string,from:string,to:string)=>queryOptions({...fresh,queryKey:[...scheduleKeys(u),"supporter",id,"occurrences",from,to],queryFn:({signal})=>scheduleApi.supporterOccurrences(id,from,to,signal)}),
};
