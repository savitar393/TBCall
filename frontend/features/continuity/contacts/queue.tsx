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
export function InvestigationQueue(){
 const {user}=useSession(),[side,setSide]=useState<Side>("incoming"),[page,setPage]=useState(0),query=useQuery(q.investigations(user!.id,side,page)),ref=useQuery(q.contactReferences(user!.id));
 return <div className="clinical-workspace"><AppPageHeader title="Investigasi kontak" eyebrow="Kelanjutan layanan" description="Tinjau investigasi yang dirujuk antar fasilitas dan buka rekam kontak yang terkait."/>
 <AppSection title="Daftar investigasi rujukan" actions={<div className="flex gap-3" role="group" aria-label="Arah investigasi">{(["incoming","outgoing"] as const).map(s=><Button key={s} variant={side===s?"default":"outline"} aria-pressed={side===s} onClick={()=>{setSide(s);setPage(0);}}>{s==="incoming"?"Masuk":"Keluar"}</Button>)}</div>}>
 <p>Investigasi internal dibuka melalui detail kontak.</p>{ref.isError&&<QueryState query={ref}/>}<p role="status">Daftar {side==="incoming"?"masuk":"keluar"}</p>{query.isPending||query.isError?<QueryState query={query}/>:<>{!query.data.data.content.length&&<p className="clinical-empty">Belum ada investigasi rujukan.</p>}<ul className="clinical-record-list">{query.data.data.content.map(i=><li key={i.id} className="clinical-record-row"><div className="clinical-record-main"><div className="clinical-context-heading"><h2 className="font-semibold">{i.contact.fullName}</h2><AppStatusBadge>{label(ref.data?.data.investigationStatuses,i.status)}</AppStatusBadge></div><p>{formatDate(i.contact.birthDate)} · {i.contact.sexCode??"—"} · {i.contact.phone??"—"}</p><p>{label(ref.data?.data.workflowTypes,i.workflowType)} · Kategori kasus indeks: {label(undefined,i.indexCase.categoryCode??"—")}</p><p>{i.sourceFacility.name} → {i.destinationFacility?.name??"—"}</p><p>Diminta: {formatDateTime(i.requestedAt)} · Diterima: {formatDateTime(i.receivedAt)} · Diinvestigasi: {formatDateTime(i.investigatedAt)}</p></div><div className="clinical-record-actions"><Button asChild variant="outline"><Link href={`/contact-investigations/${i.id}`}>Buka investigasi</Link></Button></div><AppDisclosure title="Identitas rekam kasus indeks"><p>Kasus indeks: {i.indexCase.id}</p></AppDisclosure></li>)}</ul><Pagination page={page} total={query.data.data.totalElements} setPage={setPage}/></>}
 </AppSection><AppDisclosure title="Tentang investigasi kontak"><p>Hasil dan penilaian kelayakan diisi secara eksplisit pada detail investigasi sesuai keputusan klinis.</p></AppDisclosure></div>;
}
