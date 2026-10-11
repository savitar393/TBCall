"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ME_QUERY_KEY, useSession } from "@/lib/auth/session";
import type { Me } from "@/lib/auth/types";
import { ApiError } from "@/lib/api/problem";
import { scheduleKeys } from "./queries";
import { treatmentKeys } from "@/features/treatment/queries";
export function useScheduleCommand(onClose:()=>void){
 const session=useSession(),client=useQueryClient(),mounted=useRef(true),busy=useRef(false),controller=useRef<AbortController|null>(null);
 const [pending,setPending]=useState(false),[error,setError]=useState<ApiError|null>(null),[conflict,setConflict]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 async function run(operation:(signal:AbortSignal)=>Promise<unknown>){if(busy.current||!session.user)return;const actor=session.user,snapshot=JSON.stringify(actor),requestController=new AbortController(),current=()=>mounted.current&&!requestController.signal.aborted&&JSON.stringify(client.getQueryData<Me|null>(ME_QUERY_KEY))===snapshot;
  controller.current=requestController;
  const unsubscribe=client.getQueryCache().subscribe(()=>{if(JSON.stringify(client.getQueryData<Me|null>(ME_QUERY_KEY))!==snapshot)requestController.abort();});
  // Session cache can change before React replaces a previously rendered click handler.
  if(!current()){requestController.abort();unsubscribe();return;}
  busy.current=true;setPending(true);setError(null);setConflict(false);setSaved(false);
  const refresh=async()=>{await client.invalidateQueries({queryKey:scheduleKeys(actor.id)});if(current())await client.invalidateQueries({queryKey:treatmentKeys(actor.id),predicate:q=>q.queryKey[2]!=="references"});};
  try{await operation(requestController.signal);if(!current())return;onClose();await refresh();if(current())setSaved(true);}
  catch(failure){if(!current())return;const safe=failure instanceof ApiError?failure:new ApiError({status:503,title:"Layanan belum tersedia"});setError(safe);if(safe.problem.status===409||safe.problem.status===428){onClose();setConflict(true);await refresh();}if(current()&&["authentication","forbidden","csrf"].includes(safe.kind)){onClose();await session.handleFailure(safe,false);}}
  finally{unsubscribe();busy.current=false;if(current())setPending(false);}
 }
 return {run,pending,error,conflict,saved,dismiss:()=>{setError(null);setConflict(false);setSaved(false);}};
}
