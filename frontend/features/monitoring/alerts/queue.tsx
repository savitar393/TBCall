"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { AppPageHeader, AppSection, AppFormSection } from "@/components/application-patterns";
import { QueryState } from "@/features/continuity/display";
import { monitoringQueries as q } from "../queries";
import { AlertFields } from "./display";
export function AlertQueue() {
  const {
    user
  } = useSession();
  const [status, setStatus] = useState("");
  const [target, setTarget] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const query = useQuery(q.alerts(user!.id, status, target, page, size));
  const refs = useQuery(q.references(user!.id));
  return <div className="clinical-workspace">
  <AppPageHeader title="Peringatan petugas" eyebrow="Pemantauan" actions={<Button variant="outline" disabled={query.isFetching} onClick={() => {
      void query.refetch();
      if (refs.isError) void refs.refetch();
    }}>Muat ulang peringatan</Button>} />
  <AppFormSection title="Filter peringatan"><div className="grid gap-4 sm:grid-cols-3">
    <label> Status peringatan <select className="block min-h-11 w-full rounded-lg border p-2" value={status} disabled={!refs.data || refs.isError} onChange={e => {
          setStatus(e.target.value);
          setPage(0);
        }}>
        <option value="">Semua status</option>
        {refs.data?.data.alertStatuses.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
      </select></label>
    <label> Jenis target <select className="block min-h-11 w-full rounded-lg border p-2" value={target} disabled={!refs.data || refs.isError} onChange={e => {
          setTarget(e.target.value);
          setPage(0);
        }}>
        <option value="">Semua target</option>
        {refs.data?.data.alertTargetTypes.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
      </select></label>
    <label> Jumlah per halaman <select className="block min-h-11 w-full rounded-lg border p-2" value={size} onChange={e => {
          setSize(Number(e.target.value));
          setPage(0);
        }}>{[10, 20, 50].map(n => <option key={n}>{n}</option>)}</select></label>
  </div></AppFormSection>
  {refs.isError && <QueryState query={refs} />}
  {query.isError || !query.data ? <QueryState query={query} /> : <>
    <AppSection title="Daftar peringatan">
      {!query.data.data.content.length && <p className="clinical-empty">Belum ada peringatan.</p>}
      <div className="clinical-record-list">{query.data.data.content.map((a, i) => <article key={a.id} className="clinical-record-row">
        <AlertFields alert={a} references={refs.data?.data} />
        <div className="clinical-record-actions"><Link className="text-primary underline" href={`/alerts/${a.id}`}> Buka peringatan {i + 1}</Link></div>
      </article>)}</div>
    {(page > 0 || query.data.data.totalElements > size) && <nav aria-label="Halaman peringatan" className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
      <p> Halaman {page + 1} · {query.data.data.totalElements} catatan </p>
      <Button variant="outline" disabled={(page + 1) * size >= query.data.data.totalElements} onClick={() => setPage(page + 1)}>Berikutnya</Button>
    </nav>}
    </AppSection>
  </>}
</div>;
}
