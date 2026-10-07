"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Field } from "@/features/continuity/fields";
import { QueryState, DisplayFields, Pagination } from "@/features/continuity/display";
import { monitoringQueries as q } from "../queries";
import { monitoringApi } from "../api";
import { canMonitoring } from "../permissions";
import { eventTypes, label } from "../references";
import { MonitoringForm } from "../form";
import type { TargetType } from "../types";
import { createSchema, emptyPlan, eventInput } from "./forms";
import { InitialEvents } from "./fields";
export function TargetMonitoring({
  id,
  type
}: {
  id: string;
  type: TargetType;
}) {
  const {
    user
  } = useSession();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState(false);
  const target = useQuery(q.target(user!.id, type, id));
  const history = useQuery(q.history(user!.id, type, id, page));
  const refs = useQuery(q.references(user!.id));
  const activeCheck = useQuery({
    ...q.activePlan(user!.id, type, id),
    enabled: canMonitoring(user, "MONITORING_MANAGE") && target.data?.data.status === "ACTIVE"
  });
  if (!target.data) return <QueryState query={target} />;
  if (!history.data) return <QueryState query={history} />;
  if (!refs.data) return <QueryState query={refs} />;
  const t = target.data.data;
  const ref = refs.data.data;
  const types = eventTypes(ref, type);
  const active = history.data.data.content.some(p => p.status === "ACTIVE") || activeCheck.data === true;
  const available = canMonitoring(user, "MONITORING_MANAGE") && activeCheck.data === false && t.status === "ACTIVE" && !active && !activeCheck.isError && !activeCheck.isFetching && !target.isError && !history.isError && !refs.isError && !target.isFetching && !history.isFetching;
  return <>
  <h1 className="text-2xl font-semibold"> Pemantauan {type === "TPT" ? "TPT" : "pengobatan"}</h1>
  <DisplayFields values={[["Jenis target", label(ref.alertTargetTypes, type)], ["Status target", t.status], ["Mulai target", t.startDate], ["Akhir rencana target", t.plannedEndDate]]} />
  <Button variant="outline" disabled={target.isFetching || history.isFetching} onClick={() => {
      void target.refetch();
      void history.refetch();
      if (canMonitoring(user, "MONITORING_MANAGE") && t.status === "ACTIVE") void activeCheck.refetch();
      if (refs.isError) void refs.refetch();
    }}>Muat ulang pemantauan</Button>
  {target.isError && <QueryState query={target} />}
  {history.isError && <QueryState query={history} />}
  {refs.isError && <QueryState query={refs} />}
  {(t.status !== "ACTIVE" || active) && <p>Rencana aktif baru belum dapat dibuat: target harus aktif dan belum memiliki rencana aktif.</p>}
  {canMonitoring(user, "MONITORING_MANAGE") && t.status === "ACTIVE" && activeCheck.isPending && <p role="status">Memeriksa riwayat rencana…</p>}
  {activeCheck.isError && <QueryState query={activeCheck} />}
  {available && canMonitoring(user, "MONITORING_MANAGE") && <Button disabled={editor} onClick={() => setEditor(true)}>Buat rencana pemantauan</Button>}
  {editor && <MonitoringForm initial={emptyPlan()} schema={createSchema(types, t)} available={available && canMonitoring(user, "MONITORING_MANAGE")} submitLabel="Simpan rencana baru" onClose={() => setEditor(false)} save={(v, _, signal) => monitoringApi.create(type, id, {
      startDate: v.startDate,
      ...(v.endDate ? {
        endDate: v.endDate
      } : {}),
      ...(v.notes ? {
        notes: v.notes
      } : {}),
      events: v.events.map(eventInput)
    }, signal)} onSuccess={r => router.push(`/monitoring-plans/${r.data.id}`)}>
    <Field name="startDate" label="Tanggal mulai rencana" type="date" required />
    <Field name="endDate" label="Tanggal akhir rencana" type="date" />
    <Field name="notes" label="Catatan rencana" multiline />
    <InitialEvents types={types} />
  </MonitoringForm>}
  <section aria-label="Riwayat rencana" className="space-y-4">
    <h2 className="font-semibold">Riwayat rencana</h2>
    {!history.data.data.content.length && <p>Belum ada rencana.</p>}
    {history.data.data.content.map(p => <article key={p.id} className="rounded-xl border bg-white p-4">
      <Link className="text-primary underline" href={`/monitoring-plans/${p.id}`}>Buka rencana</Link>
      <DisplayFields values={[["Status", label(ref.planStatuses, p.status)], ["Mulai", p.startDate], ["Akhir", p.endDate], ["Versi aturan (metadata)", p.rulesVersion], ...Object.entries(p.eventCounts).map(([status, count]) => [label(ref.eventStatuses, status), count] as [string, number])]} />
    </article>)}
  </section>
  <Pagination page={page} total={history.data.data.totalElements} setPage={setPage} />
</>;
}
