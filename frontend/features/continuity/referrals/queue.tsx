"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatDate,formatDateTime } from "@/lib/date-format";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { AppDisclosure,AppPageHeader,AppSection,AppStatusBadge } from "@/components/application-patterns";
import { continuityQueries as q } from "../queries";
import { QueryState,Pagination,label } from "../display";
import type { Side } from "../types";
export function ReferralQueue(){
 const {user}=useSession(),[side,setSide]=useState<Side>("incoming"),[page,setPage]=useState(0),query=useQuery(q.referrals(user!.id,side,page)),ref=useQuery(q.referralReferences(user!.id));
 return <div className="clinical-workspace"><AppPageHeader title="Rujukan" eyebrow="Kelanjutan layanan" description="Tinjau pengiriman, penerimaan, dan kedatangan pasien di fasilitas tujuan."/>
 <AppSection title="Daftar rujukan" actions={<div className="flex gap-3" role="group" aria-label="Arah rujukan">{(["incoming","outgoing"] as const).map(s=><Button key={s} variant={side===s?"default":"outline"} aria-pressed={side===s} onClick={()=>{setSide(s);setPage(0);}}>{s==="incoming"?"Masuk":"Keluar"}</Button>)}</div>}>
 {ref.isError&&<QueryState query={ref}/>}<p role="status">Daftar {side==="incoming"?"masuk":"keluar"}</p>{query.isPending||query.isError?<QueryState query={query}/>:<>{!query.data.data.content.length&&<p className="clinical-empty">Belum ada rujukan.</p>}<ul className="clinical-record-list">{query.data.data.content.map(r=><li key={r.id} className="clinical-record-row"><div className="clinical-record-main"><div className="clinical-context-heading"><h2 className="font-semibold">{r.patient.fullName}</h2><AppStatusBadge>{label(ref.data?.data.referralStatuses,r.status)}</AppStatusBadge></div><p>{label(ref.data?.data.referralTypes,r.referralType)} · {label(undefined,r.tbCase.categoryCode??"—")} · {label(undefined,r.tbCase.status)}</p><p>{r.sourceFacility.name} → {r.destinationFacility.name}</p><p>Dikirim: {formatDateTime(r.sentAt)} · Diterima: {formatDateTime(r.receivedAt)}</p><p>Dilaporkan datang: {formatDateTime(r.patientReportedAt)} · Dibatalkan: {formatDateTime(r.cancelledAt)}</p>{r.treatment&&<p>{r.treatment.regimenName??r.treatment.regimenCode??"Paduan tercatat"} · {label(undefined,r.treatment.status)} · {formatDate(r.treatment.startDate)} – {formatDate(r.treatment.plannedEndDate)}</p>}</div><div className="clinical-record-actions"><Button asChild variant="outline"><Link href={`/referrals/${r.id}`}>Buka rujukan</Link></Button></div></li>)}</ul><Pagination page={page} total={query.data.data.totalElements} setPage={setPage}/></>}
 </AppSection><AppDisclosure title="Tentang daftar rujukan"><p>Daftar mengikuti arah rujukan dan cakupan fasilitas Anda. Tindakan penerimaan dan pelaporan kedatangan tersedia pada detail sesuai status yang tercatat.</p></AppDisclosure></div>;
}
