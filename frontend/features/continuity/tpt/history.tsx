"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppSection,AppStatusBadge } from "@/components/application-patterns";
import { formatDate } from "@/lib/date-format";
import { useSession } from "@/lib/auth/session";
import { continuityQueries as q } from "../queries";
import { QueryState,Pagination,label } from "../display";
export function TptHistory({contactId}:{contactId:string}){const {user}=useSession(),[page,setPage]=useState(0),query=useQuery(q.history(user!.id,contactId,page)),ref=useQuery(q.tptReferences(user!.id));return <div className="clinical-section"><AppSection title="Riwayat TPT">{query.isPending||query.isError?<QueryState query={query}/>:<>{!query.data.data.content.length&&<p>Belum ada TPT yang dapat dibaca.</p>}{query.data.data.content.map(t=><article key={t.id} className="clinical-record-row"><div className="clinical-context-heading"><h3>{t.regimenName??t.regimenCode??"Paduan belum dicatat"}</h3><AppStatusBadge>{label(ref.data?.data.tptStatuses,t.status)}</AppStatusBadge></div><p>{t.facility.name} · Mulai: {formatDate(t.startDate)}</p><p>Akhir rencana: {formatDate(t.plannedEndDate)} · Akhir aktual: {formatDate(t.actualEndDate)}</p><p className="whitespace-pre-wrap">{t.regimenDescription??"Deskripsi belum dicatat"}</p><p>Alasan penutupan: {t.closureReason??"—"}</p><Link href={`/preventive-treatments/${t.id}`} className="text-primary underline">Buka TPT</Link></article>)}<Pagination page={page} total={query.data.data.totalElements} setPage={setPage}/></>}</AppSection></div>;}
