"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
import { canPortal } from "../permissions";
import { portalApi } from "../api";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { usePortalCommand } from "../use-command";
import { card, Fields, Pagination, PortalState, Refresh } from "../display";
export function PortalNotifications() {
    const session = useSession(), [page, setPage] = useState(0), query = useQuery(portalQueries.notifications(session.user!.id, page)), refs = usePortalReferences(), command = usePortalCommand();
    return <><h1 className="text-2xl font-semibold">Notifikasi Saya</h1><Refresh onClick={() => query.refetch()}/><ApiFeedback error={command.error}/>{command.success && <p role="status">Notifikasi ditandai dibaca.</p>}
    {!query.data ? <PortalState query={query}/> : <>{query.data.data.content.filter(n => n.channel === "IN_APP").map((n, i) => <article className={card} key={n.id}><Fields items={{ Kanal: label(refs.data?.data.notificationChannels, n.channel), Status: label(refs.data?.data.notificationStatuses, n.status), "Dijadwalkan pada": n.scheduledAt, "Terkirim pada": n.deliveredAt, "Dibaca pada": n.readAt, "Jenis peringatan": label(refs.data?.data.alertTypes, n.alertType), Keparahan: label(refs.data?.data.alertSeverities, n.severity) }}/>
    {["SENT", "DELIVERED"].includes(n.status) && <Button disabled={command.pending} onClick={() => void command.run(async (signal, current) => {
                        const detail = await portalApi.notification(n.id, signal);
                        if (!current())
                            throw new DOMException("Context changed", "AbortError");
                        if (!canPortal(session.user, "either", "NOTIFICATION_READ_SELF") || detail.data.id !== n.id || detail.data.channel !== "IN_APP" || !["SENT", "DELIVERED"].includes(detail.data.status))
                            throw new ApiError({ status: 409, title: "Keadaan notifikasi telah berubah" });
                        return await portalApi.readNotification(n.id, detail.etag, signal);
                    })}>Tandai notifikasi {i + 1} dibaca</Button>}</article>)}{!query.data.data.content.some(n => n.channel === "IN_APP") && <p>Belum ada notifikasi dalam aplikasi.</p>}<Pagination page={page} total={query.data.data.totalElements} onPage={setPage}/></>}
  </>;
}
