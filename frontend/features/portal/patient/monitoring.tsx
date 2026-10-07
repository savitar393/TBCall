"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { card, Fields, Pagination, PortalState, Refresh, monitoringGuidance } from "../display";
import type { PortalTarget } from "../types";
export function SafeMonitoring({ target }: {
    target: PortalTarget;
}) {
    const { user } = useSession(), [page, setPage] = useState(0), query = useQuery(portalQueries.monitoring(user!.id, target, page)), refs = usePortalReferences();
    return <section className={card}><h2 className="text-lg font-semibold">Pemantauan</h2><p>{monitoringGuidance}</p><Refresh onClick={() => query.refetch()}/>{!query.data ? <PortalState query={query}/> : <>{query.data.data.content.map((e, i) => <article key={i}><Fields items={{ Jenis: label(e.targetType === "TPT" ? refs.data?.data.tptMonitoringEventTypes : refs.data?.data.treatmentMonitoringEventTypes, e.eventType), Target: e.targetType, Status: label(refs.data?.data.monitoringEventStatuses, e.status), Jadwal: e.scheduledAt, "Jatuh tempo": e.dueAt, Selesai: e.completedAt }}/></article>)}{!query.data.data.content.length && <p>Belum ada jadwal pemantauan.</p>}<Pagination page={page} total={query.data.data.totalElements} onPage={setPage}/></>}</section>;
}
export function PatientMonitoring() { return <><h1 className="text-2xl font-semibold">Pemantauan Saya</h1><SafeMonitoring target={{ kind: "patient" }}/></>; }
