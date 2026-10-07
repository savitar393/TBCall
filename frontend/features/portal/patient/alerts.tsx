"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
import { portalApi } from "../api";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { usePortalCommand } from "../use-command";
import { card, Fields, Pagination, PortalState, Refresh } from "../display";
import type { PortalTarget } from "../types";
export function SafeAlerts({ target }: {
    target: PortalTarget;
}) {
    const { user } = useSession(), [page, setPage] = useState(0), query = useQuery(portalQueries.alerts(user!.id, target, page)), refs = usePortalReferences(), command = usePortalCommand();
    return <section className={card}><h2 className="text-lg font-semibold">Peringatan</h2><p>Penanda sudah diketahui adalah catatan pribadi Anda; status peringatan petugas tetap terpisah.</p><Refresh onClick={() => query.refetch()}/><ApiFeedback error={command.error}/>{command.success && <p role="status">Peringatan telah ditandai sudah diketahui oleh Anda.</p>}
    {!query.data ? <PortalState query={query}/> : <>{query.data.data.content.map(a => <article key={a.id} className={card}><Fields items={{ Jenis: label(refs.data?.data.alertTypes, a.alertType), Keparahan: label(refs.data?.data.alertSeverities, a.severity), "Status catatan petugas": label(refs.data?.data.alertStatuses, a.status), "Dicatat pada": a.triggeredAt, "Jatuh tempo": a.dueAt, Pemantauan: label(refs.data?.data.treatmentMonitoringEventTypes, a.eventType) }}/><p>{a.message}</p><p>{a.acknowledged ? "Sudah diketahui oleh Anda" : "Belum ditandai oleh Anda"}</p>
    {!a.acknowledged && user!.permissions.includes("ALERT_ACKNOWLEDGE") && <Button disabled={command.pending} onClick={() => void command.run(signal => portalApi.acknowledge(target, a.id, signal))}>Tandai sudah diketahui</Button>}</article>)}{!query.data.data.content.length && <p>Belum ada peringatan.</p>}<Pagination page={page} total={query.data.data.totalElements} onPage={setPage}/></>}
  </section>;
}
export function PatientAlerts() { return <><h1 className="text-2xl font-semibold">Peringatan Saya</h1><SafeAlerts target={{ kind: "patient" }}/></>; }
