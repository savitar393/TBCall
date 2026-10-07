"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/clinical-intake/components/query-state";
import type { TreatmentDetail,References } from "../types";
import { treatmentQueries } from "../queries";
export function DoseEvidence({treatment,references}:{treatment:TreatmentDetail;references?:References}){
 const {user}=useSession(),[page,setPage]=useState(0),query=useQuery(treatmentQueries.doses(user!.id,treatment.id,page,20)),data=query.data?.data;
 return <section aria-label="Bukti dosis" className="space-y-4"><h2 className="font-semibold">Bukti dosis</h2><p>Catatan bukti ditampilkan terpisah; tidak disimpulkan menjadi status kepatuhan harian.</p>{treatment.adherenceSummary&&<><p>Total laporan: {treatment.adherenceSummary.totalReports}</p><ul>{Object.entries(treatment.adherenceSummary.reportsByStatus).map(([status,count])=><li key={status}>{references?.staffDoseStatuses.find(o=>o.code===status)?.name??status}: {count} laporan</li>)}</ul></>}
 {query.isError&&<QueryState query={query}/>} {!data?<QueryState query={query}/>:<>{data.content.map(d=><article key={d.id} className="space-y-2 rounded-xl border bg-white p-4"><h3>{d.scheduledDate}</h3><p>{references?.staffDoseStatuses.find(o=>o.code===d.status)?.name??d.status} · {references?.administrationModes.find(o=>o.code===d.administrationMode)?.name??d.administrationMode??"—"}</p><p>{new Date(d.recordedAt).toLocaleString()} · {d.source}</p><p className="whitespace-pre-wrap break-words">{d.notes??"—"}</p></article>)}{!data.content.length&&<p>Belum ada bukti dosis.</p>}<div className="flex flex-wrap gap-3"><Button variant="outline" disabled={page===0||query.isFetching} onClick={()=>setPage(p=>p-1)}>Halaman dosis sebelumnya</Button><span>Halaman {page+1}</span><Button variant="outline" disabled={(page+1)*20>=data.totalElements||query.isFetching} onClick={()=>setPage(p=>p+1)}>Halaman dosis berikutnya</Button></div></>}
 </section>;
}
