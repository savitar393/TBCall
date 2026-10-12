"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppDisclosure, AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/date-format";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { Fields, Pagination, PortalState, Refresh } from "../display";
import type { PortalTarget } from "../types";
export function SafeMonitoring({ target }: { target: PortalTarget }) {
  const { user } = useSession(), [page, setPage] = useState(0), query = useQuery(portalQueries.monitoring(user!.id, target, page)), refs = usePortalReferences();
  return <AppSection title="Pemantauan" actions={<Refresh onClick={() => query.refetch()}/>}>
    {query.isPending || query.error ? <PortalState query={query}/> : query.data && <>
      <ul className="clinical-record-list">{query.data.data.content.map((event, i) => <li key={i} className="clinical-record-row">
        <div className="clinical-context-heading"><h3>{label(event.targetType === "TPT" ? refs.data?.data.tptMonitoringEventTypes : refs.data?.data.treatmentMonitoringEventTypes, event.eventType)}</h3><AppStatusBadge>{label(refs.data?.data.monitoringEventStatuses, event.status)}</AppStatusBadge></div>
        <p>Jadwal: {formatDateTime(event.scheduledAt)}</p>
        <AppDisclosure title="Rincian pemantauan"><Fields items={{ Target: event.targetType, "Jatuh tempo": event.dueAt, Selesai: event.completedAt }}/></AppDisclosure>
      </li>)}</ul>
      {!query.data.data.content.length && <p>Belum ada jadwal pemantauan.</p>}
      <Pagination page={page} total={query.data.data.totalElements} onPage={setPage}/>
    </>}
  </AppSection>;
}
export function PatientMonitoring() { return <div className="clinical-workspace"><AppPageHeader title="Pemantauan Saya"/><SafeMonitoring target={{ kind: "patient" }}/></div>; }
