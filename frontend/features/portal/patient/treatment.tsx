"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { useLocalClock } from "@/lib/use-local-clock";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { card, Fields, PortalState, Refresh } from "../display";
import { DoseEvidence } from "./dose-evidence";
import type { PatientTreatment as PatientTreatmentData, SupporterTreatment } from "../types";
export function TreatmentFields({ treatment, nextActivity }: { treatment: PatientTreatmentData | SupporterTreatment; nextActivity?: ReactNode }) {
  const refs = usePortalReferences();
  return <>
    <section className={card} aria-label="Ringkasan pengobatan">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Pengobatan sesuai catatan</p><h2 className="mt-2 text-xl font-semibold">{treatment.regimen?.name ?? "Paduan belum dicantumkan"}</h2></div><span className="rounded-full bg-accent px-3 py-1 text-sm text-primary">{label(refs.data?.data.treatmentStatuses, treatment.status)}</span></div>
      <p className="text-sm text-muted-foreground">Dimulai {formatDate(treatment.startDate)}</p>
      <details className="disclosure"><summary>Tanggal dan hasil pengobatan</summary><div className="mt-3 space-y-5"><Fields items={{"Tanggal mulai": treatment.startDate,"Rencana akhir": treatment.plannedEndDate,...("actualEndDate" in treatment ? {"Tanggal akhir":treatment.actualEndDate}: {})}}/>
        {"outcome" in treatment && treatment.outcome && <div><h3 className="mb-3 font-semibold">Hasil sesuai catatan petugas</h3><Fields items={{Hasil:treatment.outcome.outcomeName,Tanggal:treatment.outcome.outcomeDate}}/></div>}
      </div></details>
    </section>
    {nextActivity}
    <section className={card}><h2 className="section-title">Obat sesuai catatan</h2>{!treatment.drugs.length && <p className="text-sm text-muted-foreground">Belum ada rincian obat.</p>}
      <div className="grid items-start gap-3 sm:grid-cols-2">{treatment.drugs.map((d,i)=><article key={i} className="rounded-xl border p-4"><h3 className="font-semibold">{d.drugName}</h3><p className="mt-2 text-sm text-muted-foreground">Dosis tercatat: {d.doseValue ?? "Belum diisi"} {d.doseUnit ?? ""}</p><details className="disclosure mt-4"><summary>Rincian obat</summary><div className="mt-3"><Fields items={{Fase:d.treatmentPhase,"Dosis tercatat":d.doseValue,Satuan:d.doseUnit,"Frekuensi tercatat per minggu":d.frequencyPerWeek,"Tanggal mulai":d.startDate,"Tanggal akhir":d.endDate}}/></div></details></article>)}</div>
      <p className="text-xs leading-5 text-muted-foreground">Rincian ini bukan jadwal waktu minum obat. Ikuti instruksi petugas.</p>
    </section>
    {"adverseEvents" in treatment && treatment.adverseEvents.length>0 && <section className={card}><details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Kejadian sesuai catatan ({treatment.adverseEvents.length})</summary><div className="mt-4 space-y-5">{treatment.adverseEvents.map((a,i)=><Fields key={i} items={{Jenis:a.eventType,Keparahan:a.severity,Serius:a.serious?"Ya":"Tidak","Dilaporkan pada":a.reportedAt,Dimulai:a.startedAt,Berakhir:a.endedAt}}/>)}</div></details></section>}
  </>;
}
export function PatientTreatment() {
  const {user}=useSession(), query=useQuery(portalQueries.treatment(user!.id)), t=query.data?.data;
  const nextActivity = user!.permissions.includes("FOLLOW_UP_READ") ? <FollowUps/> : null;
  return <><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Catatan perawatan</p><h1 className="page-title">Pengobatan</h1></div><Refresh onClick={()=>query.refetch()}/></div>
    {query.isPending||query.error ? <PortalState query={query}/> : !t ? <p>Belum ada catatan pengobatan.</p> : <>
      <TreatmentFields treatment={t} nextActivity={nextActivity}/>
    </>}
    {(query.isPending || query.error || !t) && nextActivity}
    {t && (user!.permissions.includes("ADHERENCE_READ") || user!.permissions.includes("ADHERENCE_RECORD")) && <DoseEvidence target={{kind:"patient"}} active={t.status==="ACTIVE"} startDate={t.startDate}/>}
  </>;
}
function FollowUps() {
  const {user}=useSession(), now=useLocalClock(), query=useQuery(portalQueries.followUps(user!.id)), refs=usePortalReferences();
  if(query.isPending||query.error) return <section className={card}><h2 className="section-title">Tindak lanjut</h2><PortalState query={query}/></section>;
  const records=[...(query.data?.data ?? [])].sort((a,b)=>new Date(a.scheduledAt).getTime()-new Date(b.scheduledAt).getTime());
  const next=records.find(f=>f.status==="SCHEDULED" && !f.completedAt && new Date(f.scheduledAt).getTime()>=now.getTime());
  const others=records.filter(f=>f.id!==next?.id);
  return <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">Tindak lanjut berikutnya</h2><Link href="/portal/calendar" className="text-sm font-semibold text-primary underline">Buka kalender</Link></div>
    {next ? <div className="rounded-xl bg-accent p-4"><p className="font-semibold text-primary">{formatDateTime(next.scheduledAt)}</p><p className="mt-2 text-sm">{next.facility?.name ?? "Fasilitas belum dicantumkan"}</p><p className="mt-1 text-sm">{next.followUpType} · {label(refs.data?.data.followUpStatuses,next.status)}</p></div> : <p className="text-sm text-muted-foreground">Belum ada tindak lanjut mendatang yang terjadwal.</p>}
    {!records.length && <p className="text-sm text-muted-foreground">Belum ada tindak lanjut.</p>}
    {others.length>0 && <details className="disclosure"><summary>Riwayat dan kunjungan lainnya ({others.length})</summary><div className="mt-3 space-y-2">{others.map(f=><details key={f.id} className="rounded-xl border px-4 py-2"><summary className="min-h-11 cursor-pointer py-2"><span className="block text-sm font-medium">{formatDateTime(f.scheduledAt)} · {label(refs.data?.data.followUpStatuses,f.status)}</span><span className="mt-1 block text-xs text-muted-foreground">{f.followUpType}</span></summary><div className="py-3"><Fields items={{Jenis:f.followUpType,Status:label(refs.data?.data.followUpStatuses,f.status),Jadwal:f.scheduledAt,Selesai:f.completedAt,Fasilitas:f.facility?.name}}/></div></details>)}</div></details>}
  </section>;
}
