"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppDisclosure, AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/date-format";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
import { portalApi } from "../api";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { usePortalCommand } from "../use-command";
import { Fields, Pagination, PortalState, Refresh } from "../display";
import type { PortalTarget } from "../types";
export function SafeAlerts({ target }: { target: PortalTarget }) {
  const { user } = useSession(), [page, setPage] = useState(0), query = useQuery(portalQueries.alerts(user!.id, target, page)), refs = usePortalReferences(), command = usePortalCommand();
  return <AppSection title="Peringatan" actions={<Refresh onClick={() => query.refetch()}/>}>
    <ApiFeedback error={command.error}/>{command.success && <p role="status">Peringatan telah ditandai sudah diketahui oleh Anda.</p>}
    {query.isPending || query.error ? <PortalState query={query}/> : query.data && <>
      <ul className="clinical-record-list">{query.data.data.content.map(alert => <li key={alert.id} className="clinical-record-row">
        <div className="clinical-context-heading"><h3>{label(refs.data?.data.alertTypes, alert.alertType)}</h3><AppStatusBadge>{label(refs.data?.data.alertSeverities, alert.severity)}</AppStatusBadge></div>
        <p>{alert.message}</p><p>Dicatat pada: {formatDateTime(alert.triggeredAt)}</p>
        <div className="clinical-record-actions"><span className="text-sm">{alert.acknowledged ? "Sudah diketahui oleh Anda" : "Belum ditandai oleh Anda"}</span>
          {!alert.acknowledged && user!.permissions.includes("ALERT_ACKNOWLEDGE") && <Button disabled={command.pending} onClick={() => void command.run(signal => portalApi.acknowledge(target, alert.id, signal))}>Tandai sudah diketahui</Button>}
        </div>
        <AppDisclosure title="Catatan petugas"><Fields items={{ "Status catatan petugas": label(refs.data?.data.alertStatuses, alert.status), "Jatuh tempo": alert.dueAt, Pemantauan: label(refs.data?.data.treatmentMonitoringEventTypes, alert.eventType) }}/></AppDisclosure>
      </li>)}</ul>
      {!query.data.data.content.length && <p>Belum ada peringatan.</p>}
      <Pagination page={page} total={query.data.data.totalElements} onPage={setPage}/>
    </>}
  </AppSection>;
}
export function PatientAlerts() { return <div className="clinical-workspace"><AppPageHeader title="Peringatan Saya"/><SafeAlerts target={{ kind: "patient" }}/></div>; }
