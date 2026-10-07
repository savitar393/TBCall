"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "@/lib/validation";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { continuityQueries as q } from "../queries";
import { continuityApi } from "../api";
import { canContinuity,investigationActions,canStartTpt } from "../permissions";
import { QueryState,DisplayFields,label } from "../display";
import { ContinuityForm } from "../form";
import { Confirmation } from "../confirmation";
import { Field,CheckField } from "../fields";
import { completionValues,completionSchema,completionInput,localTime,required } from "./forms";
import { localDateTimeToIso } from "../time";
import { TptStart } from "../tpt/start";
type Action="receive"|"start"|"return"|"cancel"|"complete";
const titles={receive:"Terima investigasi",start:"Mulai investigasi",return:"Kembalikan investigasi",cancel:"Batalkan investigasi",complete:"Selesaikan investigasi"};
function ActionForm({action,id,etag,available,onClose,onSuccess}:{action:Action;id:string;etag?:string;available:boolean;onClose():void;onSuccess():void}){
 const initial=useMemo(()=>({...completionValues(),receivedAt:"",returnReason:"",confirmed:false}),[]);
 const schema=action==="complete"?completionSchema.safeExtend({receivedAt:z.string(),returnReason:z.string(),confirmed:z.boolean()}):z.object({investigatedAt:z.string(),resultCode:z.string(),activeTbExcluded:z.string(),tptEligible:z.string(),notes:z.string(),receivedAt:localTime,returnReason:action==="return"?required(Number.MAX_SAFE_INTEGER):z.string(),confirmed:z.boolean()}).refine(v=>!["cancel","start"].includes(action)||v.confirmed,{path:["confirmed"],message:"Konfirmasi tindakan diperlukan."});
 return <ContinuityForm confirmation initial={initial} schema={schema} available={available} submitLabel="Simpan tindakan investigasi" onClose={onClose} onSuccess={onSuccess} save={(v,_,signal)=>continuityApi.investigationTransition(id,action,action==="complete"?completionInput(v):action==="return"?{returnReason:v.returnReason.trim()}:action==="receive"&&v.receivedAt?{receivedAt:localDateTimeToIso(v.receivedAt)}:{},etag!,signal)}>{action==="complete"?<><p>Penyelesaian mencatat pengecualian TB aktif dan kelayakan secara eksplisit. Tidak membuat registrasi, kasus atau TPT.</p><Field name="investigatedAt" label="Waktu investigasi (kosong: waktu server)" type="datetime-local"/><Field name="resultCode" label="Kode hasil (teks opsional)"/><Field name="activeTbExcluded" label="TB aktif telah dikecualikan" required options={[{code:"true",name:"Ya"},{code:"false",name:"Tidak"}]}/><Field name="tptEligible" label="Layak TPT" required options={[{code:"true",name:"Ya"},{code:"false",name:"Tidak"}]}/><Field name="notes" label="Catatan penyelesaian investigasi" multiline/></>:action==="receive"?<Field name="receivedAt" label="Waktu diterima (kosong: waktu server)" type="datetime-local"/>:action==="return"?<><p>Pengembalian mengakhiri permintaan investigasi ini.</p><Field name="returnReason" label="Alasan pengembalian" required multiline/></>:<CheckField name="confirmed" label={action==="cancel"?"Saya mengonfirmasi pembatalan investigasi":"Saya mengonfirmasi mulai investigasi"}/>}</ContinuityForm>;
}
export function InvestigationDetail({id}:{id:string}){
 const {user}=useSession(),query=useQuery(q.investigation(user!.id,id)),ref=useQuery(q.contactReferences(user!.id)),[editor,setEditor]=useState<Action|"tpt"|null>(null),[saved,setSaved]=useState(false),i=query.data?.data;
 if(!i)return <QueryState query={query}/>;const actions=investigationActions(user,i),available=!!query.data?.etag&&!query.isFetching&&!query.isError;
 return <><h1 className="text-2xl font-semibold">Detail investigasi kontak</h1><Link href="/contact-investigations" className="text-primary underline">Daftar investigasi</Link>{saved&&<p role="status">Investigasi tersimpan.</p>}{query.isError&&<QueryState query={query}/>}<DisplayFields values={[["Kontak",i.contact.fullName],["Telepon tersamarkan",i.contact.phone],["Alur",label(ref.data?.data.workflowTypes,i.workflowType)],["Status",label(ref.data?.data.investigationStatuses,i.status)],["Sumber",i.sourceFacility.name],["Tujuan",i.destinationFacility?.name],["Kasus indeks",i.indexCase.id],["Kategori indeks",i.indexCase.categoryCode],["Diminta",i.requestedAt],["Diterima",i.receivedAt],["Diinvestigasi",i.investigatedAt],["Penilaian kelayakan",i.eligibilityAssessedAt],["Kode hasil",i.resultCode],["TB aktif dikecualikan",i.activeTbExcluded],["Layak TPT",i.tptEligible],["Catatan",i.notes],["Alasan kembali",i.returnReason]]}/><Link href={`/contacts/${i.contact.id}`} className="text-primary underline">Buka kontak</Link>{canContinuity(user,"CASE_READ")&&<Link href={`/cases/${i.indexCase.id}`} className="text-primary underline">Buka kasus indeks</Link>}<div className="flex flex-wrap gap-3">{actions.map(a=><Button key={a} disabled={!available||!!editor} onClick={()=>{setSaved(false);setEditor(a as Action);}}>{titles[a as Action]}</Button>)}{canStartTpt(user,i)&&<Button disabled={query.isError||query.isFetching||!!editor} onClick={()=>setEditor("tpt")}>Mulai TPT</Button>}</div>{editor&&editor!=="tpt"&&<Confirmation title={titles[editor]} onClose={()=>setEditor(null)}><ActionForm action={editor} id={id} etag={query.data?.etag} available={available&&actions.includes(editor)} onClose={()=>setEditor(null)} onSuccess={()=>{setSaved(true);setEditor(null);}}/></Confirmation>}{editor==="tpt"&&<TptStart investigation={i} available={!query.isFetching&&!query.isError&&canStartTpt(user,i)} onClose={()=>setEditor(null)}/>}</>;
}
