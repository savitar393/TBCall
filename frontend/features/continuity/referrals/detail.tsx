"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppDisclosure,AppPageHeader,AppSection,AppStatusBadge } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { continuityQueries as q } from "../queries";
import { continuityApi } from "../api";
import { canContinuity,referralActions } from "../permissions";
import { QueryState,DisplayFields,label } from "../display";
import { ContinuityForm } from "../form";
import { Confirmation } from "../confirmation";
import { Field,CheckField } from "../fields";
import { transitionValues,transitionSchema,transitionInput,type ReferralAction } from "./forms";
const titles={cancel:"Batalkan rujukan",receive:"Terima rujukan",return:"Kembalikan rujukan",report:"Laporkan pasien datang"};
export function ReferralDetail({id}:{id:string}){
 const {user}=useSession(),query=useQuery(q.referral(user!.id,id)),ref=useQuery(q.referralReferences(user!.id)),[editor,setEditor]=useState<ReferralAction|null>(null),[saved,setSaved]=useState(false),initial=useMemo(()=>transitionValues(),[]),r=query.data?.data;
 if(!r)return <QueryState query={query}/>;const actions=referralActions(user,r),available=!!query.data?.etag&&!query.isError&&!query.isFetching;
 return <div className="clinical-workspace"><AppPageHeader title="Detail rujukan" eyebrow="Kelanjutan layanan" description="Pengiriman dan penerimaan rujukan dalam satu rekam." actions={<Link href="/referrals" className="text-primary underline">Daftar rujukan</Link>}/>
 <section aria-label="Konteks rujukan" className="clinical-context"><div className="clinical-context-heading"><div><h2>{r.patient.fullName}</h2><p>{label(undefined,r.tbCase.categoryCode??"—")} · {label(undefined,r.tbCase.status)}</p></div><AppStatusBadge>{label(ref.data?.data.referralStatuses,r.status)}</AppStatusBadge></div><p>{label(ref.data?.data.referralTypes,r.referralType)}</p><p>{r.sourceFacility.name} → {r.destinationFacility.name}</p><div className="clinical-record-actions">{canContinuity(user,"CASE_READ")&&<Link href={`/cases/${r.tbCase.id}`} className="text-primary underline">Buka kasus</Link>}{r.treatment&&canContinuity(user,"TREATMENT_READ")&&<Link href={`/treatments/${r.treatment.id}`} className="text-primary underline">Buka pengobatan</Link>}</div></section>
 {saved&&<p role="status" className="clinical-saved">Tindakan tersimpan.</p>}{query.isError&&<QueryState query={query}/>}
 <AppSection title="Tindakan rujukan" description="Tindakan mengikuti status rujukan dan kewenangan fasilitas Anda."><div className="app-actions">{actions.map(action=><Button key={action} disabled={!available||!!editor} onClick={()=>{setSaved(false);setEditor(action as ReferralAction);}}>{titles[action as ReferralAction]}</Button>)}{!actions.length&&<p>Belum ada tindakan rujukan yang tersedia untuk Anda.</p>}</div></AppSection>
 <div className="clinical-section"><AppSection title="Perjalanan rujukan"><DisplayFields values={[["Dikirim",r.sentAt],["Diterima",r.receivedAt],["Dilaporkan datang",r.patientReportedAt],["Dibatalkan",r.cancelledAt],["Catatan",r.notes],["Alasan batal",r.cancelReason],["Alasan kembali",r.returnReason]]}/></AppSection></div>
 {r.treatment&&<div className="clinical-section"><AppSection title="Pengobatan yang dirujuk"><DisplayFields values={[["Status pengobatan",label(undefined,r.treatment.status)],["Paduan",r.treatment.regimenName??r.treatment.regimenCode],["Mulai",r.treatment.startDate],["Akhir rencana",r.treatment.plannedEndDate]]}/><AppDisclosure title="Identitas episode pengobatan"><DisplayFields values={[["Episode",r.treatment.id]]}/></AppDisclosure></AppSection></div>}

 {editor&&<Confirmation title={titles[editor]} onClose={()=>setEditor(null)}><ContinuityForm confirmation initial={initial} schema={transitionSchema(editor)} available={available&&actions.includes(editor)} submitLabel="Simpan tindakan rujukan" context={{caseId:r.tbCase.id,treatmentId:r.treatment?.id}} onClose={()=>setEditor(null)} onSuccess={()=>{setSaved(true);setEditor(null);}} save={(v,_,signal)=>continuityApi.referralTransition(id,editor,transitionInput(editor,v),query.data!.etag!,signal)}>{editor==="receive"?<><Field name="receivedAt" label="Waktu diterima (kosong: waktu server)" type="datetime-local"/><Field name="notes" label="Catatan penerimaan" multiline/></>:editor==="return"?<><p>Pengembalian mengakhiri handoff saat ini.</p><Field name="returnReason" label="Alasan pengembalian" required multiline/></>:editor==="cancel"?<><p>Pembatalan mengakhiri handoff saat ini.</p><Field name="cancelReason" label="Alasan pembatalan" required multiline/><CheckField name="confirmed" label="Saya mengonfirmasi pembatalan rujukan"/></>:<><p>Pelaporan pasien datang memindahkan kepemilikan klinis ke fasilitas tujuan.</p><Field name="patientReportedAt" label="Waktu pasien datang (kosong: waktu server)" type="datetime-local"/><CheckField name="confirmed" label="Saya mengonfirmasi pemindahan kepemilikan klinis"/></>}</ContinuityForm></Confirmation>}
 </div>;
}
