"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { continuityQueries as q } from "../queries";
import { continuityApi } from "../api";
import { canContinuity } from "../permissions";
import { QueryState,DisplayFields,label } from "../display";
import { ContinuityForm } from "../form";
import { Confirmation } from "../confirmation";
import { Field,CheckField } from "../fields";
import { tptValues,tptEditSchema,tptPatch,closureValues,closureSchema,closureInput,type Closure } from "./forms";
import { TptFields } from "./fields";
const titles={complete:"Selesaikan TPT",stop:"Hentikan TPT","lost-to-follow-up":"Catat putus tindak lanjut TPT"};
export function TptDetail({id}:{id:string}){
 const {user}=useSession(),query=useQuery(q.tpt(user!.id,id)),ref=useQuery(q.tptReferences(user!.id)),[editor,setEditor]=useState<"edit"|Closure|null>(null),[saved,setSaved]=useState(false),initial=useMemo(()=>tptValues(query.data?.data),[query.data?.data]),closure=useMemo(()=>closureValues(),[]),t=query.data?.data;
 if(!t)return <QueryState query={query}/>;const available=!!query.data?.etag&&!query.isFetching&&!query.isError&&t.status==="ACTIVE"&&canContinuity(user,"TPT_WRITE"),context={caseId:t.indexCaseId??undefined,contactId:t.contactId};
 return <><h1 className="text-2xl font-semibold">Detail TPT</h1>{saved&&<p role="status">TPT tersimpan.</p>}{query.isError&&<QueryState query={query}/>}<DisplayFields values={[["Status",label(ref.data?.data.tptStatuses,t.status)],["Fasilitas",t.facility.name],["Paduan katalog",t.regimenName??t.regimenCode],["Deskripsi individual",t.regimenDescription],["Mulai",t.startDate],["Akhir rencana",t.plannedEndDate],["Akhir aktual",t.actualEndDate],["Durasi",t.durationValue],["Satuan",t.durationUnit?label(ref.data?.data.durationUnits,t.durationUnit):null],["Berat (kg)",t.weightKg],["Sumber obat",t.drugSource],["Catatan",t.notes],["Alasan penutupan",t.closureReason]]}/><div className="flex flex-wrap gap-3">{canContinuity(user,"CONTACT_READ")&&<Link href={`/contacts/${t.contactId}`} className="text-primary underline">Buka kontak</Link>}{t.indexCaseId&&canContinuity(user,"CASE_READ")&&<Link href={`/cases/${t.indexCaseId}`} className="text-primary underline">Buka kasus indeks</Link>}{t.status==="ACTIVE"&&canContinuity(user,"TPT_WRITE")&&<><Button disabled={!available||!!editor||!ref.data||ref.isError} onClick={()=>setEditor("edit")}>Ubah TPT</Button>{(["complete","stop","lost-to-follow-up"] as const).map(action=><Button key={action} disabled={!available||!!editor} onClick={()=>setEditor(action)}>{titles[action]}</Button>)}</>}</div>
 {editor==="edit"&&<ContinuityForm initial={initial} schema={tptEditSchema(t)} available={available&&!!ref.data&&!ref.isError} context={context} submitLabel="Simpan perubahan TPT" onClose={()=>setEditor(null)} onSuccess={()=>{setSaved(true);setEditor(null);}} save={(v,dirty,signal)=>continuityApi.updateTpt(id,tptPatch(v,dirty),query.data!.etag!,signal)}><TptFields units={ref.data?.data.durationUnits??[]}/></ContinuityForm>}
 {editor&&editor!=="edit"&&<Confirmation title={titles[editor]} onClose={()=>setEditor(null)}><ContinuityForm confirmation initial={closure} schema={closureSchema(editor,t.startDate)} available={available} context={context} submitLabel="Konfirmasi penutupan TPT" onClose={()=>setEditor(null)} onSuccess={()=>{setSaved(true);setEditor(null);}} save={(v,_,signal)=>continuityApi.closeTpt(id,editor,closureInput(v),query.data!.etag!,signal)}><p>Tindakan ini menutup episode TPT. Tidak memetakan hasil ke kode outcome nasional.</p><Field name="actualEndDate" label="Tanggal akhir aktual (kosong: tanggal server)" type="date"/><Field name="closureReason" label="Alasan penutupan" required={editor==="stop"} multiline/><CheckField name="confirmed" label="Saya mengonfirmasi penutupan episode TPT"/></ContinuityForm></Confirmation>}
 </>;
}
