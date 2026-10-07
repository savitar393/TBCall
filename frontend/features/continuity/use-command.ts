"use client";
import { useEffect,useRef,useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession,ME_QUERY_KEY } from "@/lib/auth/session";
import type { Me } from "@/lib/auth/types";
import { ApiError } from "@/lib/api/problem";
import { continuityKeys } from "./queries";
import { continuityProblemMessage } from "./errors";
import type { Context } from "./types";
export function useContinuityCommand(context:Context={}){
 const session=useSession(),client=useQueryClient(),mounted=useRef(true),busy=useRef(false),abort=useRef<AbortController|null>(null);
 const [pending,setPending]=useState(false),[error,setError]=useState<ApiError|null>(null),[locked,setLocked]=useState(false),[reviewRequired,setReview]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;abort.current?.abort();};},[]);
 async function run<T>(operation:(signal:AbortSignal)=>Promise<T>,onSuccess?:(result:T)=>void,refresh=true):Promise<T|undefined>{
  if(busy.current||locked||reviewRequired||!session.user)return;
  const actor=session.user,snapshot=JSON.stringify(actor),current=()=>mounted.current&&JSON.stringify(client.getQueryData<Me|null>(ME_QUERY_KEY))===snapshot;
  const invalidate=async()=>{
   if(!current())return;
   await client.invalidateQueries({queryKey:continuityKeys(actor.id),predicate:q=>!String(q.queryKey[2]).endsWith("References")&&q.queryKey[2]!=="facilities"});
   if(current()&&context.caseId)await client.invalidateQueries({queryKey:["clinical",actor.id,"case",context.caseId]});
   if(current()&&context.caseId)await client.invalidateQueries({queryKey:["treatment",actor.id]});
  };
  abort.current=new AbortController();busy.current=true;setPending(true);setError(null);
  try{const result=await operation(abort.current.signal);if(!current())return;if(refresh)await invalidate();if(!current())return;onSuccess?.(result);return result;}
  catch(failure){if(!current()||abort.current.signal.aborted)return;const safe=failure instanceof ApiError?failure:new ApiError({status:503,title:"Layanan belum tersedia"});setError(safe);
   if(safe.kind==="source-authority")setLocked(true);
   else if(safe.kind==="stale"||safe.kind==="precondition"||safe.problem.status===409||continuityProblemMessage(safe)){setReview(true);await invalidate();if(current()&&safe.problem.code==="REFERRAL_DESTINATION_INVALID")await client.invalidateQueries({queryKey:[...continuityKeys(actor.id),"facilities"]});}
   if(current()&&["authentication","forbidden","csrf"].includes(safe.kind))await session.handleFailure(safe,false);
  }finally{busy.current=false;if(current())setPending(false);}
 }
 return {run,pending,error,locked,reviewRequired,reviewed:()=>{setReview(false);setError(null);session.dismissError();}};
}
