"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AppPageHeader, AppSection, AppState, AppStatusBadge, AppDisclosure, AppTable } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { canClinical } from "@/features/clinical-intake/permissions";
import { QueryState } from "@/features/clinical-intake/components/query-state";
import { canOperationalDashboard, dashboardPermissions, type DashboardPage } from "./contracts";
import { dashboardQuery, type DashboardPages } from "./queries";

const dateTime = (value: string) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const restricted = <AppState kind="restricted" title="Bagian ini memerlukan izin baca yang sesuai."/>;
export function OperationalDashboardPage() { return <SessionBoundary><Guard /></SessionBoundary>; }
function Guard() {
  const { user } = useSession();
  return <AppShell>{canOperationalDashboard(user) ? <OperationalDashboard key={JSON.stringify(user)} />
    : <section><h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1><p>Pemantauan operasional memerlukan peran petugas TBC, fasilitas aktif, dan izin baca yang sesuai.</p></section>}</AppShell>;
}
function Queue<T>({ title, page, busy, change, children }: { title: string; page: DashboardPage<T>; busy: boolean; change(page: number): void; children: ReactNode }) {
  return <AppSection title={title} actions={<AppStatusBadge>{page.totalElements} catatan</AppStatusBadge>}>
    {page.content.length ? children : <AppState kind="empty" title="Tidak ada catatan pada halaman ini."/>}
    <nav aria-label={`Halaman ${title.toLowerCase()}`} className="app-actions border-t pt-4"><Button variant="outline" disabled={busy || page.page === 0} onClick={() => change(page.page - 1)}>Sebelumnya</Button>
      <span className="text-sm text-muted-foreground">Halaman {page.page + 1} · Total: {page.totalElements}</span><Button variant="outline" disabled={busy || (page.page + 1) * page.size >= page.totalElements} onClick={() => change(page.page + 1)}>Berikutnya</Button></nav>
  </AppSection>;
}
export function OperationalDashboard({embedded = false}: {embedded?: boolean} = {}) {
  const { user } = useSession();
  const permissions = dashboardPermissions(user);
  const [pages, setPages] = useState<DashboardPages>({ upcomingPage: 0, overduePage: 0, labPage: 0 });
  const query = useQuery(dashboardQuery(user!.id, pages));
  const change = (key: keyof DashboardPages) => (page: number) => setPages(value => ({ ...value, [key]: page }));
  const description = <>Fasilitas aktif yang ditugaskan: {user!.activeFacilities.map(f => f.name).join(", ")}. Ringkasan status dan jadwal tercatat; bukan penilaian risiko atau kesimpulan pengobatan.</>;
  const header = embedded ? <div><h2 className="section-title">Pemantauan operasional</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div> : <AppPageHeader title="Pemantauan operasional" description={description}/>;
  if (query.isPending || query.error || !query.data) return <div className="space-y-6">{header}<QueryState query={query} /></div>;
  const data = query.data;
  return <div className="space-y-6">{header}
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><p>Snapshot: {dateTime(data.asOf)} (waktu lokal perangkat).</p> <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Perbarui</Button></div>
    <section aria-label="Kasus" className="surface space-y-4"><h2 className="text-xl font-semibold">Kasus</h2>
      <AppDisclosure title="Cara membaca jumlah kasus"><p className="text-sm leading-6 text-muted-foreground">Episode kasus berstatus ACTIVE atau COMPLETED dengan fasilitas penanggung jawab saat ini yang ditugaskan. REFERRED tidak dihitung.</p></AppDisclosure>
      {permissions.cases && data.cases.state === "AVAILABLE" ? <><dl className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border bg-secondary/40 p-5"><dt className="text-sm font-medium text-muted-foreground">Kasus aktif (ACTIVE)</dt><dd className="mt-3 text-4xl font-semibold text-primary">{data.cases.data.active}</dd></div><div className="rounded-xl border bg-background p-5"><dt className="text-sm font-medium text-muted-foreground">Kasus selesai (COMPLETED)</dt><dd className="mt-3 text-4xl font-semibold">{data.cases.data.completed}</dd></div></dl>
        <div className="flex flex-wrap gap-4"><Link className="text-primary underline" href="/cases/history">Riwayat kasus selesai</Link>{canClinical(user, "PATIENT_READ") && <Link className="text-primary underline" href="/patients">Daftar pasien saat ini</Link>}</div></> : restricted}
    </section>
    <section aria-label="Tindak lanjut" className="space-y-3"><h2 className="text-xl font-semibold">Tindak lanjut</h2>
      <AppDisclosure title="Batas dan status tindak lanjut"><p className="text-sm leading-6 text-muted-foreground">Hanya SCHEDULED yang belum diselesaikan pada pengobatan ACTIVE. Fasilitas pengobatan dan fasilitas kasus saat ini harus berada dalam penugasan Anda.</p>
      <p>Terlambat: jadwal sebelum snapshot. Mendatang: dari snapshot sampai {dateTime(data.upcomingUntil)} (7 × 24 jam, termasuk batas akhir). Status tidak diubah otomatis.</p></AppDisclosure>
      {permissions.followUps && data.followUps.state === "AVAILABLE" ? (["overdue", "upcoming"] as const).map(key => {
        const page = data.followUps.state === "AVAILABLE" ? data.followUps.data[key] : null;
        if (!page) return null;
        return <Queue key={key} title={key === "overdue" ? "Tindak lanjut terlambat" : "Tindak lanjut mendatang"} page={page} busy={query.isFetching} change={change(key === "overdue" ? "overduePage" : "upcomingPage")}>
          <ul className="space-y-3">{page.content.map(row => <li className="app-queue-row" key={row.id}><Link className="text-primary underline" href={`/treatments/${row.treatmentId}`}>{row.patientName} — {row.followUpType}</Link><p>{dateTime(row.scheduledAt)} · Fasilitas tindak lanjut tercatat: {row.facility?.name ?? "Belum dicatat"}</p></li>)}</ul>
        </Queue>;
      }) : restricted}
    </section>
    <section aria-label="Laboratorium" className="space-y-3"><h2 className="text-xl font-semibold">Laboratorium</h2>
      <AppDisclosure title="Lingkup pekerjaan laboratorium"><p className="text-sm leading-6 text-muted-foreground">Permintaan REQUESTED, SENT, RECEIVED, atau PARTIAL pada fasilitas pemohon yang ditugaskan; petugas yang juga berperan LAB_STAFF dapat membaca sesuai fasilitas pemeriksa. Hasil pemeriksaan tidak ditampilkan.</p></AppDisclosure>
      {permissions.laboratory && data.laboratory.state === "AVAILABLE" ? <Queue title="Pekerjaan laboratorium tertunda" page={data.laboratory.data} busy={query.isFetching} change={change("labPage")}>
        <AppTable caption="Permintaan laboratorium tertunda"><thead><tr><th scope="col">Pasien & permintaan</th><th scope="col">Fasilitas</th></tr></thead><tbody>{data.laboratory.data.content.map(row => <tr key={row.id}><td><Link className="font-medium text-primary underline" href={`/laboratory/requests/${row.id}`}>{row.patientName} — {row.status}</Link><p className="mt-2 text-xs text-muted-foreground">{row.requestedAt ? dateTime(row.requestedAt) : "Waktu permintaan belum dicatat"}</p></td><td>{row.requestingFacility.name} → {row.testingFacility.name}</td></tr>)}</tbody></AppTable>
      </Queue> : restricted}
    </section>
  </div>;
}
