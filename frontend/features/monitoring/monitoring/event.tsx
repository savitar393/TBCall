"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { QueryState, DisplayFields } from "@/features/continuity/display";
import { Field, CheckField } from "@/features/continuity/fields";
import { monitoringQueries as q } from "../queries";
import { monitoringApi } from "../api";
import { canMonitoring } from "../permissions";
import { eventTypes, label } from "../references";
import { MonitoringForm } from "../form";
import type { Event, References, TargetType } from "../types";
import { rescheduleValues, rescheduleSchema, eventPatch, completionSchema, confirmationSchema } from "./forms";
import { localDateTimeToIso as completionTime } from "../time";
export function EventPanel({
  id,
  parentActive,
  parentReady,
  references: ref,
  targetType,
  onClose
}: {
  id: string;
  parentActive: boolean;
  parentReady: boolean;
  references?: References;
  targetType: TargetType;
  onClose(): void;
}) {
  const {
    user
  } = useSession();
  const query = useQuery(q.event(user!.id, id));
  const [editor, setEditor] = useState<"reschedule" | "complete" | "cancel" | null>(null);
  const [observed, setObserved] = useState<{
    event: Event;
    etag?: string;
  } | null>(null);
  if (!query.data) return <QueryState query={query} />;
  const e = query.data.data;
  const manage = parentActive && canMonitoring(user, "MONITORING_MANAGE");
  const openStatus = ["SCHEDULED", "DUE", "OVERDUE"].includes(e.status);
  const reschedulable = ["SCHEDULED", "DUE"].includes(e.status);
  const available = manage && parentReady && !query.isError && !query.isFetching && !!query.data.etag;
  const choose = (kind: typeof editor) => {
    setObserved({
      event: e,
      etag: query.data?.etag
    });
    setEditor(kind);
  };
  const review = () => setObserved({
    event: e,
    etag: query.data?.etag
  });
  return <div className="space-y-4">
  <DisplayFields values={[["Jenis kegiatan", label(ref ? eventTypes(ref, targetType) : undefined, e.eventType)], ["Status", label(ref?.eventStatuses, e.status)], ["Jadwal terbaru", e.scheduledAt], ["Batas waktu terbaru", e.dueAt], ["Selesai", e.completedAt]]} />
  {query.isError && <QueryState query={query} />}
  <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Muat ulang kegiatan</Button>
  {manage && openStatus && !editor && <div className="flex flex-wrap gap-3">
    {reschedulable && <Button disabled={!available} onClick={() => choose("reschedule")}>Jadwalkan ulang</Button>}
    <Button disabled={!available} onClick={() => choose("complete")}>Selesaikan kegiatan</Button>
    <Button disabled={!available} onClick={() => choose("cancel")}>Batalkan kegiatan</Button>
  </div>}
  {observed && editor === "reschedule" && <MonitoringForm initial={rescheduleValues(observed.event)} schema={rescheduleSchema(observed.event)} available={available && reschedulable && !!observed.etag} onReview={review} submitLabel="Simpan jadwal" onClose={() => setEditor(null)} onSuccess={onClose} save={(v, dirty, signal) => monitoringApi.reschedule(id, eventPatch(v, dirty), observed.etag, signal)}>
    <Field name="scheduledAt" label="Jadwal kegiatan" type="datetime-local" required />
    <Field name="dueAt" label="Batas waktu kegiatan" type="datetime-local" />
  </MonitoringForm>}
  {observed && editor === "complete" && <MonitoringForm initial={{
      completedAt: ""
    }} schema={completionSchema(e)} available={available && openStatus && !!observed.etag} onReview={review} submitLabel="Simpan penyelesaian" onClose={() => setEditor(null)} onSuccess={onClose} save={(v, _, signal) => monitoringApi.eventAction(id, "complete", v.completedAt ? {
      completedAt: completionTime(v.completedAt)
    } : {}, observed.etag, signal)}>
    <p>Kosong berarti waktu server saat kegiatan diselesaikan. Browser hanya memeriksa waktu yang diisi.</p>
    <Field name="completedAt" label="Waktu selesai (opsional)" type="datetime-local" />
  </MonitoringForm>}
  {observed && editor === "cancel" && <MonitoringForm initial={{
      confirmed: false
    }} schema={confirmationSchema} available={available && openStatus && !!observed.etag} onReview={review} submitLabel="Konfirmasi pembatalan kegiatan" onClose={() => setEditor(null)} onSuccess={onClose} save={(_, __, signal) => monitoringApi.eventAction(id, "cancel", {}, observed.etag, signal)}>
    <p>Membatalkan kegiatan dapat menyelesaikan peringatan terlambat yang terkait.</p>
    <CheckField name="confirmed" label="Saya mengonfirmasi pembatalan kegiatan" />
  </MonitoringForm>}
  {!editor && <Button variant="outline" onClick={onClose}>Tutup detail kegiatan</Button>}
</div>;
}
