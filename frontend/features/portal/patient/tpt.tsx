"use client";
import { useQuery } from "@tanstack/react-query";
import { AppDisclosure, AppPageHeader, AppStatusBadge } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/date-format";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { Fields, PortalState, Refresh } from "../display";
export function PatientTpt() {
  const { user } = useSession(), query = useQuery(portalQueries.tpt(user!.id)), refs = usePortalReferences(), t = query.data?.data;
  return <div className="clinical-workspace"><AppPageHeader title="TPT Saya" actions={<Refresh onClick={() => query.refetch()}/>}/>
    {query.isPending || query.error ? <PortalState query={query}/> : !t ? <p>Belum ada catatan TPT.</p> : <section className="clinical-context" aria-label="Catatan TPT">
      <div className="clinical-context-heading"><h2>{t.regimenDisplay ?? "Paduan belum tercatat"}</h2><AppStatusBadge>{label(refs.data?.data.tptStatuses, t.status)}</AppStatusBadge></div>
      <div className="clinical-context-meta"><span>Mulai: {formatDate(t.startDate)}</span><span>{t.facility?.name ?? "Fasilitas belum dicantumkan"}</span></div>
      <AppDisclosure title="Rincian TPT"><Fields items={{ Deskripsi: t.regimenDescription, "Rencana akhir": t.plannedEndDate, "Tanggal akhir": t.actualEndDate, "Durasi tercatat": t.durationValue, "Satuan durasi": t.durationUnit }}/></AppDisclosure>
    </section>}
  </div>;
}
