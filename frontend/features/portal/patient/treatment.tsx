"use client";
import Link from "next/link";
import { votDocumentNavigation } from "@/features/vot/navigation";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppDisclosure, AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { useLocalClock } from "@/lib/use-local-clock";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { Fields, PortalState, Refresh } from "../display";
import { DoseEvidence } from "./dose-evidence";
import type { PatientTreatment as PatientTreatmentData, SupporterTreatment } from "../types";
export function TreatmentFields({ treatment, nextActivity }: { treatment: PatientTreatmentData | SupporterTreatment; nextActivity?: ReactNode }) {
  const refs = usePortalReferences();
  return <>
    <section className="clinical-context" aria-label="Ringkasan pengobatan">
      <div className="clinical-context-heading"><div><p className="eyebrow">Pengobatan sesuai catatan</p><h2>{treatment.regimen?.name ?? "Paduan belum dicantumkan"}</h2></div><AppStatusBadge>{label(refs.data?.data.treatmentStatuses, treatment.status)}</AppStatusBadge></div>
      <p className="text-sm text-muted-foreground">Dimulai {formatDate(treatment.startDate)}</p>
      <AppDisclosure title="Tanggal dan hasil pengobatan"><Fields items={{ "Tanggal mulai": treatment.startDate, "Rencana akhir": treatment.plannedEndDate, ...("actualEndDate" in treatment ? { "Tanggal akhir": treatment.actualEndDate } : {}) }}/>
        {"outcome" in treatment && treatment.outcome && <div><h3 className="mb-3 font-semibold">Hasil sesuai catatan petugas</h3><Fields items={{ Hasil: treatment.outcome.outcomeName, Tanggal: treatment.outcome.outcomeDate }}/></div>}
      </AppDisclosure>
    </section>
    {nextActivity}
    <AppSection title="Obat sesuai catatan">
      {!treatment.drugs.length && <p className="text-sm text-muted-foreground">Belum ada rincian obat.</p>}
      <ul className="clinical-record-list">{treatment.drugs.map((drug, i) => <li key={i} className="clinical-record-row"><h3>{drug.drugName}</h3><p className="text-sm text-muted-foreground">Dosis tercatat: {drug.doseValue ?? "Belum diisi"} {drug.doseUnit ?? ""}</p>
        <AppDisclosure title="Rincian obat"><Fields items={{ Fase: drug.treatmentPhase, "Dosis tercatat": drug.doseValue, Satuan: drug.doseUnit, "Frekuensi tercatat per minggu": drug.frequencyPerWeek, "Tanggal mulai": drug.startDate, "Tanggal akhir": drug.endDate }}/></AppDisclosure>
      </li>)}</ul>
    </AppSection>
    {"adverseEvents" in treatment && treatment.adverseEvents.length > 0 && <AppDisclosure title={`Kejadian sesuai catatan (${treatment.adverseEvents.length})`}><ul className="clinical-record-list">{treatment.adverseEvents.map((event, i) => <li key={i} className="clinical-record-row"><Fields items={{ Jenis: event.eventType, Keparahan: event.severity, Serius: event.serious ? "Ya" : "Tidak", "Dilaporkan pada": event.reportedAt, Dimulai: event.startedAt, Berakhir: event.endedAt }}/></li>)}</ul></AppDisclosure>}
  </>;
}
export function PatientTreatment() {
  const { user } = useSession(), query = useQuery(portalQueries.treatment(user!.id)), t = query.data?.data;
  const nextActivity = user!.permissions.includes("FOLLOW_UP_READ") ? <FollowUps/> : null;
  return <div className="clinical-workspace"><AppPageHeader title="Pengobatan" actions={<Refresh onClick={() => query.refetch()}/>}/>
    {query.isPending || query.error ? <PortalState query={query}/> : !t ? <p>Belum ada catatan pengobatan.</p> : <TreatmentFields treatment={t} nextActivity={nextActivity}/>}
    {(query.isPending || query.error || !t) && nextActivity}
    {user!.permissions.includes("VOT_SELF_READ") && <AppSection title="Video Pengobatan (VOT)"><p>Video sintetis untuk peninjauan petugas. Pengiriman video tidak otomatis mencatat dosis.</p><Link className="text-primary underline" href="/portal/vot" onNavigate={event => votDocumentNavigation("/portal/vot", event)}>Buka Video Pengobatan (VOT)</Link></AppSection>}
    {t && (user!.permissions.includes("ADHERENCE_READ") || user!.permissions.includes("ADHERENCE_RECORD")) && <DoseEvidence target={{ kind: "patient" }} active={t.status === "ACTIVE"} startDate={t.startDate}/>}
  </div>;
}
function FollowUps() {
  const { user } = useSession(), now = useLocalClock(), query = useQuery(portalQueries.followUps(user!.id)), refs = usePortalReferences();
  if (query.isPending || query.error) return <AppSection title="Tindak lanjut"><PortalState query={query}/></AppSection>;
  const records = [...(query.data?.data ?? [])].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const next = records.find(f => f.status === "SCHEDULED" && !f.completedAt && new Date(f.scheduledAt).getTime() >= now.getTime());
  const others = records.filter(f => f.id !== next?.id);
  return <AppSection title="Tindak lanjut berikutnya" actions={<Link href="/portal/calendar" className="text-sm font-semibold text-primary underline">Buka kalender</Link>}>
    {next ? <div className="clinical-record-row"><div className="clinical-context-heading"><p className="font-semibold text-primary">{formatDateTime(next.scheduledAt)}</p><AppStatusBadge>{label(refs.data?.data.followUpStatuses, next.status)}</AppStatusBadge></div><p>{next.facility?.name ?? "Fasilitas belum dicantumkan"}</p><p>{next.followUpType}</p></div>
      : <p className="text-sm text-muted-foreground">Belum ada tindak lanjut mendatang yang terjadwal.</p>}
    {!records.length && <p className="text-sm text-muted-foreground">Belum ada tindak lanjut.</p>}
    {others.length > 0 && <AppDisclosure title={`Riwayat dan kunjungan lainnya (${others.length})`}><ul className="clinical-record-list">{others.map(f => <li key={f.id} className="clinical-record-row"><div className="clinical-context-heading"><p>{formatDateTime(f.scheduledAt)}</p><AppStatusBadge>{label(refs.data?.data.followUpStatuses, f.status)}</AppStatusBadge></div><AppDisclosure title={f.followUpType}><Fields items={{ Selesai: f.completedAt, Fasilitas: f.facility?.name }}/></AppDisclosure></li>)}</ul></AppDisclosure>}
  </AppSection>;
}
