"use client";
import { useMemo,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { continuityQueries as q } from "../queries";
import { continuityApi } from "../api";
import { canContinuity } from "../permissions";
import { QueryState } from "../display";
import { ContinuityForm } from "../form";
import type { Investigation } from "../types";
import { tptValues,tptStartSchema,tptInput } from "./forms";
import { TptFields } from "./fields";
export function TptStart({investigation:i,available,onClose}:{investigation:Investigation;available:boolean;onClose():void}){
 const {user}=useSession(),router=useRouter(),ref=useQuery(q.tptReferences(user!.id)),initial=useMemo(()=>tptValues(),[]),[saved,setSaved]=useState(false),regimens=ref.data?.data.preventiveRegimens.filter(r=>r.caseCategoryCode===i.indexCase.categoryCode)??[];
 if(!ref.data)return <QueryState query={ref}/>;
 return <><h2 className="font-semibold">Mulai TPT eksplisit</h2>{saved&&<p role="status">TPT tersimpan. Izin membaca TPT diperlukan untuk membuka detailnya.</p>}<ContinuityForm initial={initial} schema={tptStartSchema.refine(v=>!v.regimenCode||regimens.some(r=>r.code===v.regimenCode),{path:["regimenCode"],message:"Pilih paduan preventif sesuai kategori indeks."}).refine(v=>!v.durationUnit||ref.data.data.durationUnits.some(u=>u.code===v.durationUnit),{path:["durationUnit"],message:"Pilih satuan dari referensi."})} available={available&&!ref.isError&&!saved} submitLabel="Simpan TPT baru" context={{caseId:i.indexCase.id,contactId:i.contact.id}} onClose={onClose} onSuccess={(r:Awaited<ReturnType<typeof continuityApi.startTpt>>) =>{if(canContinuity(user,"TPT_READ"))router.push(`/preventive-treatments/${r.data.id}`);else setSaved(true);}} save={(v,_,signal)=>continuityApi.startTpt(i.id,tptInput(v),signal)}><TptFields start regimens={regimens} units={ref.data.data.durationUnits}/></ContinuityForm></>;
}
