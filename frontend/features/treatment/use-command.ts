"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ME_QUERY_KEY, useSession } from "@/lib/auth/session";
import type { Me } from "@/lib/auth/types";
import { ApiError } from "@/lib/api/problem";
import { treatmentKeys } from "./queries";
export function useTreatmentCommand(caseId?:string) {
 const session=useSession(),client=useQueryClient(),mounted=useRef(true),busy=useRef(false),controller=useRef<AbortController|null>(null);
 const [pending,setPending]=useState(false),[error,setError]=useState<ApiError|null>(null),[locked,setLocked]=useState(false),[reviewRequired,setReview]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 async function run<T>(operation:(signal:AbortSignal)=>Promise<T>,onSuccess?:(result:T)=>void):Promise<T|undefined>{
  if(busy.current||locked||reviewRequired||!session.user)return;const actor=session.user,snapshot=JSON.stringify(actor);
  const current=()=>mounted.current&&JSON.stringify(client.getQueryData<Me|null>(ME_QUERY_KEY))===snapshot;
  const refresh=async()=>{await client.invalidateQueries({queryKey:treatmentKeys(actor.id),predicate:q=>q.queryKey[2]!=="references"});if(current()&&caseId)await client.invalidateQueries({queryKey:["clinical",actor.id,"case",caseId]});};
  controller.current=new AbortController();busy.current=true;setPending(true);setError(null);
  try {const result=await operation(controller.current.signal);if(!current())return;await refresh();if(!current())return;onSuccess?.(result);return result;}
  catch(failure){if(!current()||controller.current.signal.aborted)return;const safe=failure instanceof ApiError?failure:new ApiError({status:503,title:"Layanan belum tersedia"});setError(safe);
   if(safe.kind==="source-authority")setLocked(true);
   else if(safe.kind==="stale"||safe.kind==="precondition"||safe.problem.status===409){setReview(true);await refresh();}
   if(current()&&["authentication","forbidden","csrf"].includes(safe.kind))await session.handleFailure(safe,false);
  } finally {busy.current=false;if(current())setPending(false);}
 }
 return {run,pending,error,locked,reviewRequired,reviewed:()=>{setReview(false);setError(null);session.dismissError();}};
}
