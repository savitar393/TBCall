"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock, CircleCheck, Clock3, FlaskConical, RefreshCw, UsersRound } from "lucide-react";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AppPageHeader, AppSection, AppState, AppStatusBadge, AppDisclosure } from "@/components/application-patterns";
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
function Metric({ title, count, icon: Icon, tone = "green", children }: { title: string; count: number | null; icon: typeof UsersRound; tone?: string; children?: ReactNode }) {
  return <div className="dashboard-metric" data-tone={tone}><div className="dashboard-metric-heading"><dt>{title}</dt><span className="dashboard-metric-icon"><Icon aria-hidden="true" className="size-5"/></span></div><dd>{count === null ? <span className="dashboard-count-restricted">Akses terbatas</span> : count}</dd>{children && <div className="dashboard-metric-caption">{children}</div>}</div>;
}
function Queue<T>({ title, description, empty, warning, page, busy, change, children }: { title: string; description: string; empty: string; warning?: boolean; page: DashboardPage<T>; busy: boolean; change(page: number): void; children: ReactNode }) {
  return <AppSection className="dashboard-queue" title={title} description={description} actions={<AppStatusBadge tone={warning && page.totalElements > 0 ? "warning" : "neutral"}>{page.totalElements} catatan</AppStatusBadge>}>
    {page.content.length ? children : <div className="dashboard-empty"><CircleCheck aria-hidden="true" className="size-5"/><p>{page.totalElements ? "Tidak ada catatan pada halaman ini." : empty}</p></div>}
    {page.totalElements > 0 && (page.totalElements > page.size || page.page > 0) && <nav aria-label={`Halaman ${title.toLowerCase()}`} className="app-actions border-t pt-4"><Button variant="outline" disabled={busy || page.page === 0} onClick={() => change(page.page - 1)}>Sebelumnya</Button>
      <span className="text-sm text-muted-foreground">Halaman {page.page + 1} · Total: {page.totalElements}</span><Button variant="outline" disabled={busy || (page.page + 1) * page.size >= page.totalElements} onClick={() => change(page.page + 1)}>Berikutnya</Button></nav>
    }
  </AppSection>;
}
export function OperationalDashboard({embedded = false}: {embedded?: boolean} = {}) {
  const { user } = useSession();
  const permissions = dashboardPermissions(user);
  const [pages, setPages] = useState<DashboardPages>({ upcomingPage: 0, overduePage: 0, labPage: 0 });
  const query = useQuery(dashboardQuery(user!.id, pages));
  const change = (key: keyof DashboardPages) => (page: number) => setPages(value => ({ ...value, [key]: page }));
  const description = "Pantau kasus dan pekerjaan berikutnya di fasilitas Anda.";
  const header = embedded ? <div><h2 className="section-title">Pemantauan operasional</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div> : <AppPageHeader eyebrow="Ruang pelayanan" title="Pemantauan operasional" description={description}/>;
  if (query.isPending || query.error || !query.data) return <div className="space-y-6">{header}<QueryState query={query} /></div>;
  const data = query.data;
  const cases = permissions.cases && data.cases.state === "AVAILABLE" ? data.cases.data : null;
  const followUps = permissions.followUps && data.followUps.state === "AVAILABLE" ? data.followUps.data : null;
  const laboratory = permissions.laboratory && data.laboratory.state === "AVAILABLE" ? data.laboratory.data : null;
  return <div className="dashboard-workspace">{header}
    <div className="dashboard-toolbar"><p><Clock3 aria-hidden="true" className="size-3.5"/>Data per {dateTime(data.asOf)} · waktu lokal</p><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw aria-hidden="true" className="size-4"/>Perbarui</Button></div>
    <section aria-label="Ringkasan pekerjaan" className="dashboard-metrics">
      <section aria-label="Kasus" className="dashboard-case-metrics"><h2 className="sr-only">Kasus</h2><dl>
        <Metric title="Kasus aktif" count={cases?.active ?? null} icon={UsersRound}>{cases && canClinical(user, "PATIENT_READ") ? <Link href="/patients">Daftar pasien saat ini <ArrowUpRight aria-hidden="true" className="size-3.5"/></Link> : "Status ACTIVE"}</Metric>
        <Metric title="Kasus selesai" count={cases?.completed ?? null} icon={CircleCheck} tone="blue">{cases ? <Link href="/cases/history">Riwayat kasus selesai <ArrowUpRight aria-hidden="true" className="size-3.5"/></Link> : "Status COMPLETED"}</Metric>
      </dl>{!cases && <div className="sr-only">{restricted}</div>}</section>
      <dl className="dashboard-task-metrics">
        <Metric title="Tindak lanjut terlambat" count={followUps?.overdue.totalElements ?? null} icon={CalendarClock} tone="amber">{followUps ? <a href="#dashboard-follow-ups">Lihat jadwal tercatat <ArrowUpRight aria-hidden="true" className="size-3.5"/></a> : "Izin tindak lanjut diperlukan"}</Metric>
        <Metric title="Laboratorium tertunda" count={laboratory?.totalElements ?? null} icon={FlaskConical} tone="purple">{laboratory ? <a href="#dashboard-laboratory">Lihat permintaan <ArrowUpRight aria-hidden="true" className="size-3.5"/></a> : "Izin laboratorium diperlukan"}</Metric>
      </dl>
    </section>
    <section id="dashboard-follow-ups" aria-label="Tindak lanjut" className="dashboard-section"><div className="dashboard-section-heading"><div><h2>Tindak lanjut</h2><p>Jadwal yang memerlukan perhatian dan kunjungan berikutnya.</p></div><span className="dashboard-period">7 hari ke depan</span></div>
      {permissions.followUps && data.followUps.state === "AVAILABLE" ? (["overdue", "upcoming"] as const).map(key => {
        const page = data.followUps.state === "AVAILABLE" ? data.followUps.data[key] : null;
        if (!page) return null;
        return <Queue key={key} title={key === "overdue" ? "Tindak lanjut terlambat" : "Tindak lanjut mendatang"} description={key === "overdue" ? "Jadwal terlewat, belum diselesaikan." : "Terjadwal dalam 7 hari ke depan."} empty={key === "overdue" ? "Tidak ada tindak lanjut terlambat." : "Belum ada jadwal dalam 7 hari ke depan."} warning={key === "overdue"} page={page} busy={query.isFetching} change={change(key === "overdue" ? "overduePage" : "upcomingPage")}>
          <ul className="dashboard-task-list">{page.content.map(row => <li key={row.id}><Link className="dashboard-task-link" href={`/treatments/${row.treatmentId}`}><span className="dashboard-task-date" data-overdue={key === "overdue"}><CalendarClock aria-hidden="true" className="size-5"/></span><span className="min-w-0"><span className="dashboard-task-name">{row.patientName}<span className="sr-only"> — {row.followUpType}</span></span><span className="dashboard-task-subtitle" aria-hidden="true">{row.followUpType}</span><time className="dashboard-task-time" dateTime={row.scheduledAt}>{dateTime(row.scheduledAt)}</time></span><ArrowUpRight aria-hidden="true" className="ml-auto size-4 shrink-0"/></Link><p className="dashboard-task-facility">Fasilitas tindak lanjut tercatat: {row.facility?.name ?? "Belum dicatat"}</p></li>)}</ul>
        </Queue>;
      }) : restricted}
    </section>
    <section id="dashboard-laboratory" aria-label="Laboratorium" className="dashboard-section"><div className="dashboard-section-heading"><div><h2>Laboratorium</h2><p>Permintaan pemeriksaan yang masih dalam proses.</p></div></div>
      {permissions.laboratory && data.laboratory.state === "AVAILABLE" ? <Queue title="Pekerjaan laboratorium tertunda" description="Buka permintaan untuk melihat tahap pemeriksaan." empty="Tidak ada permintaan laboratorium tertunda." page={data.laboratory.data} busy={query.isFetching} change={change("labPage")}>
        <ul className="dashboard-lab-list">{data.laboratory.data.content.map(row => <li key={row.id}><Link className="dashboard-lab-link" href={`/laboratory/requests/${row.id}`}><span className="dashboard-lab-icon"><FlaskConical aria-hidden="true" className="size-5"/></span><span className="min-w-0"><span className="dashboard-task-name">{row.patientName}<span className="sr-only"> — {row.status}</span></span><span className="dashboard-task-subtitle">{row.requestingFacility.name} → {row.testingFacility.name}</span></span><span className="dashboard-lab-meta"><AppStatusBadge>{({REQUESTED:"Diminta",SENT:"Dikirim",RECEIVED:"Diterima",PARTIAL:"Hasil sebagian"} as const)[row.status]}</AppStatusBadge><span>{row.requestedAt ? dateTime(row.requestedAt) : "Waktu permintaan belum dicatat"}</span></span><ArrowUpRight aria-hidden="true" className="size-4 shrink-0"/></Link></li>)}</ul>
      </Queue> : restricted}
    </section>
    <AppDisclosure title="Definisi & lingkup data"><p className="text-sm leading-6 text-muted-foreground">Episode kasus berstatus ACTIVE atau COMPLETED dengan fasilitas penanggung jawab saat ini yang ditugaskan. REFERRED tidak dihitung.</p><p>Hanya SCHEDULED yang belum diselesaikan pada pengobatan ACTIVE. Fasilitas pengobatan dan fasilitas kasus saat ini harus berada dalam penugasan Anda.</p><p>Terlambat: jadwal sebelum snapshot. Mendatang: dari snapshot sampai {dateTime(data.upcomingUntil)} (7 × 24 jam, termasuk batas akhir). Status tidak diubah otomatis.</p><p>Permintaan REQUESTED, SENT, RECEIVED, atau PARTIAL pada fasilitas pemohon yang ditugaskan; petugas yang juga berperan LAB_STAFF dapat membaca sesuai fasilitas pemeriksa. Hasil pemeriksaan tidak ditampilkan.</p><p>Fasilitas aktif yang ditugaskan: {user!.activeFacilities.map(f => f.name).join(", ")}. Bukan penilaian risiko atau kesimpulan pengobatan.</p></AppDisclosure>
  </div>;
}
