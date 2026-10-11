"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "@/lib/validation";
import { AppDisclosure,AppPageHeader,AppSection,AppStatusBadge } from "@/components/application-patterns";
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
 return <div className="clinical-workspace"><AppPageHeader title="Detail investigasi kontak" eyebrow="Investigasi kontak" description="Tinjau perjalanan investigasi dan penilaian klinis yang dicatat." actions={<Link href="/contact-investigations" className="text-primary underline">Daftar investigasi</Link>}/>
 <section aria-label="Konteks investigasi" className="clinical-context"><div className="clinical-context-heading"><div><h2>{i.contact.fullName}</h2><p>{label(ref.data?.data.workflowTypes,i.workflowType)} · {label(undefined,i.indexCase.categoryCode??"—")}</p></div><AppStatusBadge>{label(ref.data?.data.investigationStatuses,i.status)}</AppStatusBadge></div><p>{i.sourceFacility.name} → {i.destinationFacility?.name??"—"}</p><p>Telepon tersamarkan: {i.contact.phone??"—"}</p><div className="clinical-record-actions"><Link href={`/contacts/${i.contact.id}`} className="text-primary underline">Buka kontak</Link>{canContinuity(user,"CASE_READ")&&<Link href={`/cases/${i.indexCase.id}`} className="text-primary underline">Buka kasus indeks</Link>}</div></section>
 {saved&&<p role="status" className="clinical-saved">Investigasi tersimpan.</p>}{query.isError&&<QueryState query={query}/>}
 <AppSection title="Tindakan investigasi"><div className="app-actions">{actions.map(a=><Button key={a} disabled={!available||!!editor} onClick={()=>{setSaved(false);setEditor(a as Action);}}>{titles[a as Action]}</Button>)}{canStartTpt(user,i)&&<Button disabled={query.isError||query.isFetching||!!editor} onClick={()=>setEditor("tpt")}>Mulai TPT</Button>}{!actions.length&&!canStartTpt(user,i)&&<p>Belum ada tindakan investigasi yang tersedia untuk Anda.</p>}</div></AppSection>
 <div className="clinical-section"><AppSection title="Hasil dan penilaian investigasi"><DisplayFields values={[["Diinvestigasi",i.investigatedAt],["Penilaian kelayakan",i.eligibilityAssessedAt],["Kode hasil",i.resultCode],["TB aktif dikecualikan",i.activeTbExcluded],["Layak TPT",i.tptEligible],["Catatan",i.notes],["Alasan kembali",i.returnReason]]}/></AppSection></div>
 <div className="clinical-section"><AppSection title="Perjalanan investigasi"><DisplayFields values={[["Diminta",i.requestedAt],["Diterima",i.receivedAt]]}/><AppDisclosure title="Identitas rekam kasus indeks"><DisplayFields values={[["Kasus indeks",i.indexCase.id]]}/></AppDisclosure></AppSection></div>
 {editor&&editor!=="tpt"&&<Confirmation title={titles[editor]} onClose={()=>setEditor(null)}><ActionForm action={editor} id={id} etag={query.data?.etag} available={available&&actions.includes(editor)} onClose={()=>setEditor(null)} onSuccess={()=>{setSaved(true);setEditor(null);}}/></Confirmation>}{editor==="tpt"&&<TptStart investigation={i} available={!query.isFetching&&!query.isError&&canStartTpt(user,i)} onClose={()=>setEditor(null)}/>}</div>;
}
