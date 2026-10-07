"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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
 return <><h1 className="text-2xl font-semibold">Detail rujukan</h1><Link href="/referrals" className="text-primary underline">Daftar rujukan</Link>{saved&&<p role="status">Tindakan tersimpan.</p>}{query.isError&&<QueryState query={query}/>}<DisplayFields values={[["Pasien",r.patient.fullName],["Kategori/status kasus",`${r.tbCase.categoryCode??"—"} / ${r.tbCase.status}`],["Jenis",label(ref.data?.data.referralTypes,r.referralType)],["Status",label(ref.data?.data.referralStatuses,r.status)],["Sumber",r.sourceFacility.name],["Tujuan",r.destinationFacility.name],["Dikirim",r.sentAt],["Diterima",r.receivedAt],["Dilaporkan datang",r.patientReportedAt],["Dibatalkan",r.cancelledAt],["Catatan",r.notes],["Alasan batal",r.cancelReason],["Alasan kembali",r.returnReason]]}/>{r.treatment&&<DisplayFields values={[["Episode",r.treatment.id],["Status pengobatan",r.treatment.status],["Paduan",r.treatment.regimenName??r.treatment.regimenCode],["Mulai",r.treatment.startDate],["Akhir rencana",r.treatment.plannedEndDate]]}/>}<div className="flex flex-wrap gap-3">{canContinuity(user,"CASE_READ")&&<Link href={`/cases/${r.tbCase.id}`} className="text-primary underline">Buka kasus</Link>}{r.treatment&&canContinuity(user,"TREATMENT_READ")&&<Link href={`/treatments/${r.treatment.id}`} className="text-primary underline">Buka pengobatan</Link>}{actions.map(action=><Button key={action} disabled={!available||!!editor} onClick={()=>{setSaved(false);setEditor(action as ReferralAction);}}>{titles[action as ReferralAction]}</Button>)}</div>
 {editor&&<Confirmation title={titles[editor]} onClose={()=>setEditor(null)}><ContinuityForm confirmation initial={initial} schema={transitionSchema(editor)} available={available&&actions.includes(editor)} submitLabel="Simpan tindakan rujukan" context={{caseId:r.tbCase.id,treatmentId:r.treatment?.id}} onClose={()=>setEditor(null)} onSuccess={()=>{setSaved(true);setEditor(null);}} save={(v,_,signal)=>continuityApi.referralTransition(id,editor,transitionInput(editor,v),query.data!.etag!,signal)}>{editor==="receive"?<><Field name="receivedAt" label="Waktu diterima (kosong: waktu server)" type="datetime-local"/><Field name="notes" label="Catatan penerimaan" multiline/></>:editor==="return"?<><p>Pengembalian mengakhiri handoff saat ini.</p><Field name="returnReason" label="Alasan pengembalian" required multiline/></>:editor==="cancel"?<><p>Pembatalan mengakhiri handoff saat ini.</p><Field name="cancelReason" label="Alasan pembatalan" required multiline/><CheckField name="confirmed" label="Saya mengonfirmasi pembatalan rujukan"/></>:<><p>Pelaporan pasien datang memindahkan kepemilikan klinis ke fasilitas tujuan.</p><Field name="patientReportedAt" label="Waktu pasien datang (kosong: waktu server)" type="datetime-local"/><CheckField name="confirmed" label="Saya mengonfirmasi pemindahan kepemilikan klinis"/></>}</ContinuityForm></Confirmation>}
 </>;
}
