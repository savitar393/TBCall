"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/session";
import { canClinical } from "@/features/clinical-intake/permissions";
import { QueryState } from "@/features/clinical-intake/components/query-state";
import { canOperationalDashboard, dashboardPermissions, type DashboardPage } from "./contracts";
import { dashboardQuery, type DashboardPages } from "./queries";

const dateTime = (value: string) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const restricted = <p>Bagian ini memerlukan izin baca yang sesuai.</p>;
export function OperationalDashboardPage() { return <SessionBoundary><Guard /></SessionBoundary>; }
function Guard() {
  const { user } = useSession();
  return <AppShell>{canOperationalDashboard(user) ? <DashboardView key={JSON.stringify(user)} />
    : <section><h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1><p>Pemantauan operasional memerlukan peran petugas TBC, fasilitas aktif, dan izin baca yang sesuai.</p></section>}</AppShell>;
}
function Queue<T>({ title, page, busy, change, children }: { title: string; page: DashboardPage<T>; busy: boolean; change(page: number): void; children: ReactNode }) {
  return <section aria-label={title} className="space-y-3 rounded-lg border p-4">
    <h2 className="text-xl font-semibold">{title}</h2><p>Total: {page.totalElements}</p>
    {page.content.length ? children : <p>Tidak ada catatan pada halaman ini.</p>}
    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={busy || page.page === 0} onClick={() => change(page.page - 1)}>Sebelumnya</Button>
      <span>Halaman {page.page + 1}</span><Button variant="outline" disabled={busy || (page.page + 1) * page.size >= page.totalElements} onClick={() => change(page.page + 1)}>Berikutnya</Button></div>
  </section>;
}
function DashboardView() {
  const { user } = useSession();
  const permissions = dashboardPermissions(user);
  const [pages, setPages] = useState<DashboardPages>({ upcomingPage: 0, overduePage: 0, labPage: 0 });
  const query = useQuery(dashboardQuery(user!.id, pages));
  const change = (key: keyof DashboardPages) => (page: number) => setPages(value => ({ ...value, [key]: page }));
  const header = <header className="space-y-2"><h1 className="text-3xl font-semibold">Pemantauan operasional</h1>
    <p>Fasilitas aktif yang ditugaskan: {user!.activeFacilities.map(f => f.name).join(", ")}</p>
    <p>Ringkasan status dan jadwal tercatat; bukan penilaian risiko atau kesimpulan pengobatan.</p></header>;
  if (query.isPending || query.error || !query.data) return <div className="space-y-6">{header}<QueryState query={query} /></div>;
  const data = query.data;
  return <div className="space-y-6">{header}
    <p>Snapshot: {dateTime(data.asOf)} (waktu lokal perangkat). <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Perbarui</Button></p>
    <section aria-label="Kasus" className="space-y-3 rounded-lg border p-4"><h2 className="text-xl font-semibold">Kasus</h2>
      <p>Episode kasus berstatus ACTIVE atau COMPLETED dengan fasilitas penanggung jawab saat ini yang ditugaskan. REFERRED tidak dihitung.</p>
      {permissions.cases && data.cases.state === "AVAILABLE" ? <><dl className="grid gap-4 sm:grid-cols-2"><div><dt>Kasus aktif (ACTIVE)</dt><dd className="text-3xl font-semibold">{data.cases.data.active}</dd></div><div><dt>Kasus selesai (COMPLETED)</dt><dd className="text-3xl font-semibold">{data.cases.data.completed}</dd></div></dl>
        <div className="flex flex-wrap gap-4"><Link className="text-primary underline" href="/cases/history">Riwayat kasus selesai</Link>{canClinical(user, "PATIENT_READ") && <Link className="text-primary underline" href="/patients">Daftar pasien saat ini</Link>}</div></> : restricted}
    </section>
    <section aria-label="Tindak lanjut" className="space-y-3"><h2 className="text-xl font-semibold">Tindak lanjut</h2>
      <p>Hanya SCHEDULED yang belum diselesaikan pada pengobatan ACTIVE. Fasilitas pengobatan dan fasilitas kasus saat ini harus berada dalam penugasan Anda.</p>
      <p>Terlambat: jadwal sebelum snapshot. Mendatang: dari snapshot sampai {dateTime(data.upcomingUntil)} (7 × 24 jam, termasuk batas akhir). Status tidak diubah otomatis.</p>
      {permissions.followUps && data.followUps.state === "AVAILABLE" ? (["overdue", "upcoming"] as const).map(key => {
        const page = data.followUps.state === "AVAILABLE" ? data.followUps.data[key] : null;
        if (!page) return null;
        return <Queue key={key} title={key === "overdue" ? "Tindak lanjut terlambat" : "Tindak lanjut mendatang"} page={page} busy={query.isFetching} change={change(key === "overdue" ? "overduePage" : "upcomingPage")}>
          <ul className="space-y-3">{page.content.map(row => <li key={row.id}><Link className="text-primary underline" href={`/treatments/${row.treatmentId}`}>{row.patientName} — {row.followUpType}</Link><p>{dateTime(row.scheduledAt)} · Fasilitas tindak lanjut tercatat: {row.facility?.name ?? "Belum dicatat"}</p></li>)}</ul>
        </Queue>;
      }) : restricted}
    </section>
    <section aria-label="Laboratorium" className="space-y-3"><h2 className="text-xl font-semibold">Laboratorium</h2>
      <p>Permintaan REQUESTED, SENT, RECEIVED, atau PARTIAL pada fasilitas pemohon yang ditugaskan; petugas yang juga berperan LAB_STAFF dapat membaca sesuai fasilitas pemeriksa. Hasil pemeriksaan tidak ditampilkan.</p>
      {permissions.laboratory && data.laboratory.state === "AVAILABLE" ? <Queue title="Pekerjaan laboratorium tertunda" page={data.laboratory.data} busy={query.isFetching} change={change("labPage")}>
        <ul className="space-y-3">{data.laboratory.data.content.map(row => <li key={row.id}><Link className="text-primary underline" href={`/laboratory/requests/${row.id}`}>{row.patientName} — {row.status}</Link><p>{row.requestedAt ? dateTime(row.requestedAt) : "Waktu permintaan belum dicatat"} · {row.requestingFacility.name} → {row.testingFacility.name}</p></li>)}</ul>
      </Queue> : restricted}
    </section>
  </div>;
}
