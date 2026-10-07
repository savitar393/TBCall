"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { Button } from "@/components/ui/button";
import { QueryState, DisplayFields, Pagination } from "@/features/continuity/display";
import { monitoringQueries as q } from "../queries";
import { monitoringApi, requireEtag } from "../api";
import { canMonitoring } from "../permissions";
import { channels, label } from "../references";
import { useMonitoringCommand } from "../use-command";
import { MonitoringFeedback } from "../feedback";
export function Notifications() {
  const {
    user
  } = useSession();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const query = useQuery(q.notifications(user!.id, page));
  const refs = useQuery(q.references(user!.id));
  const command = useMonitoringCommand("notifications");
  const detailQuery = useQuery({
    ...q.notification(user!.id, selectedId ?? ""),
    enabled: !!selectedId,
    staleTime: Infinity
  });
  return <>
  <h1 className="text-2xl font-semibold">Notifikasi petugas</h1>
  <Button variant="outline" disabled={query.isFetching || command.pending} onClick={() => {
      void query.refetch();
      if (selectedId && detailQuery.isError) void detailQuery.refetch();
      if (refs.isError) void refs.refetch();
    }}>Muat ulang notifikasi</Button>
  <MonitoringFeedback error={command.error} />
  {detailQuery.isError && <QueryState query={detailQuery} />}
  {command.reviewRequired && <Button disabled={query.isFetching || query.isError || detailQuery.isError || detailQuery.isFetching} onClick={command.reviewed}>Saya sudah meninjau data terbaru</Button>}
  {refs.isError && <QueryState query={refs} />}
  {query.isError || !query.data ? <QueryState query={query} /> : <>
    <section aria-label="Daftar notifikasi" className="space-y-4">
      {!query.data.data.content.length && <p>Belum ada notifikasi.</p>}
      {query.data.data.content.filter(n => n.channel === "IN_APP").map((n, i) => <article key={n.id} className="space-y-3 rounded-xl border bg-white p-4">
        <DisplayFields values={[["Kanal", label(refs.data ? channels(refs.data.data) : undefined, n.channel)], ["Status", label(refs.data?.data.notificationStatuses, n.status)], ["Jenis peringatan", n.alertType ? label(refs.data?.data.alertTypes, n.alertType) : null], ["Tingkat", n.severity ? label(refs.data?.data.alertSeverities, n.severity) : null], ["Dijadwalkan", n.scheduledAt], ["Terkirim", n.deliveredAt], ["Dibaca", n.readAt]]} />
        {n.alertId && canMonitoring(user, "ALERT_READ") && <Link className="text-primary underline" href={`/alerts/${n.alertId}`}>Buka peringatan terkait</Link>}
        {["SENT", "DELIVERED"].includes(n.status) && <Button disabled={command.pending || command.reviewRequired || command.locked || query.isFetching || query.isError || detailQuery.isError || detailQuery.isFetching} onClick={() => void command.run(async (signal, current) => {
            const detail = await monitoringApi.notification(n.id, signal);
            if (!current()) return;
            client.setQueryData(q.notification(user!.id, n.id).queryKey, detail);
            setSelectedId(n.id);
            if (detail.data.channel !== "IN_APP" || !["SENT", "DELIVERED"].includes(detail.data.status)) throw new ApiError({
              status: 409,
              title: "Status notifikasi telah berubah",
              code: "MONITORING_STATE_CONFLICT"
            });
            return await monitoringApi.read(n.id, requireEtag(detail.etag), signal);
          })}> Tandai notifikasi {i + 1} dibaca </Button>}
      </article>)}
    </section>
    <Pagination page={page} total={query.data.data.totalElements} setPage={setPage} />
  </>}
</>;
}
