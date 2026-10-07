"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { QueryState, DisplayFields, Pagination } from "@/features/continuity/display";
import { Field, CheckField } from "@/features/continuity/fields";
import { Confirmation } from "@/features/continuity/confirmation";
import { monitoringQueries as q } from "../queries";
import { monitoringApi, targetPath } from "../api";
import { canMonitoring } from "../permissions";
import { eventTypes, label } from "../references";
import { MonitoringForm } from "../form";
import { emptyEvent, eventInput, eventInputSchema, planEditSchema, planPatch, confirmationSchema } from "./forms";
import { EventFields, manualGuidance } from "./fields";
import { EventPanel } from "./event";
export function PlanDetail({
  id
}: {
  id: string;
}) {
  const {
    user
  } = useSession();
  const [page, setPage] = useState(0);
  const query = useQuery(q.plan(user!.id, id));
  const events = useQuery(q.events(user!.id, id, page));
  const refs = useQuery(q.references(user!.id));
  const [editor, setEditor] = useState<"edit" | "cancel" | "add" | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | undefined>();
  if (!query.data) return <QueryState query={query} />;
  const p = query.data.data;
  const ref = refs.data?.data;
  const manage = canMonitoring(user, "MONITORING_MANAGE");
  const active = p.status === "ACTIVE";
  const available = active && manage && !!query.data.etag && !query.isFetching && !query.isError;
  const types = ref ? eventTypes(ref, p.targetType) : [];
  const open = (kind: typeof editor) => {
    // Keep a draft bound to its observed GET version until explicit conflict review.
    setTag(query.data?.etag);
    setEditor(kind);
  };
  return <>
  <h1 className="text-2xl font-semibold">Rencana pemantauan</h1>
  <DisplayFields values={[["Jenis target", label(ref?.alertTargetTypes, p.targetType)], ["ID target", p.targetId], ["Status", label(ref?.planStatuses, p.status)], ["Mulai", p.startDate], ["Akhir", p.endDate], ["Versi aturan (metadata)", p.rulesVersion], ["Catatan", p.notes], ...Object.entries(p.eventCounts).map(([status, count]) => [label(ref?.eventStatuses, status), count] as [string, number])]} />
  {canMonitoring(user, p.targetType === "TPT" ? "TPT_READ" : "TREATMENT_READ") && <Link className="text-primary underline" href={targetPath(p.targetType, p.targetId)}>Buka target</Link>}
  <Button variant="outline" disabled={query.isFetching || events.isFetching} onClick={() => {
      void query.refetch();
      void events.refetch();
      if (refs.isError) void refs.refetch();
    }}>Muat ulang rencana</Button>
  {query.isError && <QueryState query={query} />}
  {refs.isError && <QueryState query={refs} />}
  {active && manage && <div className="flex flex-wrap gap-3">
    <Button disabled={!available || !!editor || !!eventId} onClick={() => open("edit")}>Ubah rencana</Button>
    <Button disabled={!available || !!editor || !!eventId || !ref || refs.isError} onClick={() => open("add")}>Tambah kegiatan</Button>
    <Button disabled={!available || !!editor || !!eventId} onClick={() => open("cancel")}>Batalkan rencana</Button>
  </div>}
  {editor === "edit" && <MonitoringForm initial={{
      endDate: p.endDate ?? "",
      notes: p.notes ?? ""
    }} schema={planEditSchema(p.startDate)} available={available && !!tag} onReview={() => setTag(query.data?.etag)} submitLabel="Simpan rencana" onClose={() => setEditor(null)} onSuccess={() => setEditor(null)} save={(v, dirty, signal) => monitoringApi.patchPlan(id, planPatch(v, dirty), tag, signal)}>
    <Field name="endDate" label="Tanggal akhir rencana" type="date" />
    <Field name="notes" label="Catatan rencana" multiline />
  </MonitoringForm>}
  {editor === "add" && <MonitoringForm initial={emptyEvent()} schema={eventInputSchema(types)} available={available && !!tag && !!ref && !refs.isError} onReview={() => setTag(query.data?.etag)} submitLabel="Simpan kegiatan baru" onClose={() => setEditor(null)} onSuccess={() => setEditor(null)} save={(v, _, signal) => monitoringApi.addEvent(id, eventInput(v), tag, signal)}>
    <p>{manualGuidance}</p>
    <fieldset className="space-y-4">
      <legend>Kegiatan manual baru</legend>
      <EventFields types={types} />
    </fieldset>
  </MonitoringForm>}
  {editor === "cancel" && <Confirmation title="Batalkan rencana" onClose={() => setEditor(null)}>
    <MonitoringForm initial={{
        confirmed: false
      }} schema={confirmationSchema} available={available && !!tag} onReview={() => setTag(query.data?.etag)} submitLabel="Konfirmasi pembatalan rencana" onClose={() => setEditor(null)} onSuccess={() => setEditor(null)} save={(_, __, signal) => monitoringApi.cancelPlan(id, tag, signal)}>
      <p>Membatalkan rencana akan membatalkan kegiatan pemantauan yang masih terbuka dan menyelesaikan peringatan terkait.</p>
      <CheckField name="confirmed" label="Saya mengonfirmasi pembatalan rencana" />
    </MonitoringForm>
  </Confirmation>}
  <section aria-label="Kegiatan pemantauan" className="space-y-4">
    <h2 className="font-semibold">Kegiatan pemantauan</h2>
    {events.isError || !events.data ? <QueryState query={events} /> : <>
      {!events.data.data.content.length && <p>Belum ada kegiatan.</p>}
      {events.data.data.content.map((e, i) => <article key={e.id} className="rounded-xl border bg-white p-4">
        <DisplayFields values={[["Jenis kegiatan", label(ref ? eventTypes(ref, p.targetType) : undefined, e.eventType)], ["Status", label(ref?.eventStatuses, e.status)], ["Jadwal", e.scheduledAt], ["Batas waktu", e.dueAt], ["Selesai", e.completedAt]]} />
        <Button variant="outline" disabled={!!editor || !!eventId} onClick={() => setEventId(e.id)}> Buka kegiatan {i + 1}</Button>
      </article>)}
      <Pagination page={page} total={events.data.data.totalElements} setPage={setPage} />
    </>}
  </section>
  {eventId && <Confirmation title="Detail kegiatan pemantauan" onClose={() => setEventId(null)}>
    <EventPanel key={eventId} id={eventId} parentActive={active} parentReady={!query.isError && !query.isFetching} references={ref} targetType={p.targetType} onClose={() => setEventId(null)} />
  </Confirmation>}
</>;
}
