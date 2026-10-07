"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { card, Fields, PortalState, Refresh } from "../display";
export function PatientTpt() {
    const { user } = useSession(), query = useQuery(portalQueries.tpt(user!.id)), refs = usePortalReferences(), t = query.data?.data;
    return <><h1 className="text-2xl font-semibold">TPT Saya</h1><Refresh onClick={() => query.refetch()}/>{query.isPending || query.error ? <PortalState query={query}/> : !t ? <p>Belum ada catatan TPT.</p> : <section className={card}><Fields items={{ Status: label(refs.data?.data.tptStatuses, t.status), Regimen: t.regimenDisplay, Deskripsi: t.regimenDescription, "Tanggal mulai": t.startDate, "Rencana akhir": t.plannedEndDate, "Tanggal akhir": t.actualEndDate, "Durasi tercatat": t.durationValue, "Satuan durasi": t.durationUnit, Fasilitas: t.facility?.name }}/></section>}</>;
}
