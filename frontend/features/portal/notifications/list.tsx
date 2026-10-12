"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppDisclosure, AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/date-format";
import { ApiError } from "@/lib/api/problem";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
import { canPortal } from "../permissions";
import { portalApi } from "../api";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { usePortalCommand } from "../use-command";
import { Fields, Pagination, PortalState, Refresh } from "../display";
export function PortalNotifications() {
  const session = useSession(), [page, setPage] = useState(0), query = useQuery(portalQueries.notifications(session.user!.id, page)), refs = usePortalReferences(), command = usePortalCommand();
  return <div className="clinical-workspace"><AppPageHeader title="Notifikasi Saya" actions={<Refresh onClick={() => query.refetch()}/>}/>
    <ApiFeedback error={command.error}/>{command.success && <p role="status">Notifikasi ditandai dibaca.</p>}
    <AppSection title="Dalam aplikasi">
      {query.isPending || query.error ? <PortalState query={query}/> : query.data && <>
        <ul className="clinical-record-list">{query.data.data.content.filter(n => n.channel === "IN_APP").map((n, i) => <li className="clinical-record-row" key={n.id}>
          <div className="clinical-context-heading"><h3>{label(refs.data?.data.alertTypes, n.alertType)}</h3><AppStatusBadge>{label(refs.data?.data.notificationStatuses, n.status)}</AppStatusBadge></div>
          <p>Terkirim pada: {formatDateTime(n.deliveredAt)}</p>
          {["SENT", "DELIVERED"].includes(n.status) && <div className="clinical-record-actions"><Button disabled={command.pending} onClick={() => void command.run(async (signal, current) => {
            const detail = await portalApi.notification(n.id, signal);
            if (!current()) throw new DOMException("Context changed", "AbortError");
            if (!canPortal(session.user, "either", "NOTIFICATION_READ_SELF") || detail.data.id !== n.id || detail.data.channel !== "IN_APP" || !["SENT", "DELIVERED"].includes(detail.data.status))
              throw new ApiError({ status: 409, title: "Keadaan notifikasi telah berubah" });
            return await portalApi.readNotification(n.id, detail.etag, signal);
          })}>Tandai notifikasi {i + 1} dibaca</Button></div>}
          <AppDisclosure title="Rincian notifikasi"><Fields items={{ Kanal: label(refs.data?.data.notificationChannels, n.channel), "Dijadwalkan pada": n.scheduledAt, "Dibaca pada": n.readAt, Keparahan: label(refs.data?.data.alertSeverities, n.severity) }}/></AppDisclosure>
        </li>)}</ul>
        {!query.data.data.content.some(n => n.channel === "IN_APP") && <p>Belum ada notifikasi dalam aplikasi.</p>}
        <Pagination page={page} total={query.data.data.totalElements} onPage={setPage}/>
      </>}
    </AppSection>
  </div>;
}
