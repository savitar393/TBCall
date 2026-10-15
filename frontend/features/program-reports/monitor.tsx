"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, Building2, ChartNoAxesCombined, CheckCheck, ClipboardList, Layers3, Pill, RefreshCw } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { AppDisclosure, AppPageHeader, AppSection, AppState, AppStatusBadge, AppTable } from "@/components/application-patterns";
import { Button } from "@/components/ui/button";
import { reportApi, type Geography, type Indicator, type ReportBundle } from "./api";
import { canMonitor } from "./permissions";

export const indicatorLabels: Record<Indicator, { label: string; unit: string; detail: string }> = {
  caseEpisodes: { label: "Episode kasus", unit: "episode kasus", detail: "Seluruh episode kasus yang teratribusi; bukan jumlah pasien unik atau insidensi." },
  activeCaseEpisodes: { label: "Kasus aktif", unit: "episode kasus", detail: "Status kasus ACTIVE; tidak termasuk REFERRED." },
  completedCaseEpisodes: { label: "Kasus selesai", unit: "episode kasus", detail: "Status kasus COMPLETED; bukan kesembuhan atau keberhasilan pengobatan." },
  activeTreatmentEpisodes: { label: "Pengobatan aktif", unit: "episode pengobatan", detail: "Status pengobatan ACTIVE; PLANNED dan PAUSED tidak dihitung." },
  recordedTreatmentOutcomes: { label: "Hasil akhir tercatat", unit: "catatan hasil akhir", detail: "Catatan hasil akhir eksplisit; bukan angka keberhasilan atau rasio." },
  representedFacilities: { label: "Fasilitas terwakili", unit: "fasilitas", detail: "Fasilitas penanggung jawab dari kasus teratribusi; bukan cakupan seluruh fasilitas." },
};
const metrics = Object.keys(indicatorLabels) as Indicator[];
const icons = [Layers3, ClipboardList, CheckCheck, Pill, ClipboardList, Building2];
const number = (value: number) => value.toLocaleString("id-ID");
const same = (a: Geography, b: Geography) => a.scope === b.scope && a.code === b.code;
const key = (g: Geography) => `${g.scope}:${g.code ?? ""}`;
export const reportDisclaimer = "Data yang tercatat dalam TBCall — bukan statistik surveilans nasional resmi.";

type View = { context: string; scopes: Geography[]; trail: Geography[]; report: ReportBundle | null; loading: boolean; error: ApiError | null };
/** Reports live only in this mounted workspace, never a persisted/shared query cache. */
export function ProgramReports() {
  const session = useSession(), context = JSON.stringify(session.user);
  const [view, setView] = useState<View>({ context, scopes: [], trail: [], report: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const path = useRef<Geography[]>([]), previousContext = useRef(context);
  const reload = useRef<() => void>(() => {});
  useEffect(() => {
    if (previousContext.current !== context) path.current = [];
    previousContext.current = context;
    if (!canMonitor(session.user)) return;
    let active = true, generation = 0, controller: AbortController | null = null;
    async function load() {
      if (!active || !canMonitor(session.user)) return;
      const current = ++generation;
      controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      const valid = () => active && current === generation && !signal.aborted;
      // Retain the authorized view during an unchanged check; clear on observed denial/change.
      setView(previous => previous.context === context ? { ...previous, loading: true, error: null } : { context, scopes: [], trail: [], report: null, loading: true, error: null });
      let scopes: Geography[] = [];
      try {
        scopes = (await reportApi.scopes(signal)).data.scopes;
        if (!valid()) return;
        if (!scopes.length) { path.current = []; setView({ context, scopes, trail: [], report: null, loading: false, error: null }); return; }
        if (path.current.length && !scopes.some(g => same(g, path.current[0]))) {
          path.current = []; throw new ApiError({ status: 403, title: "Penugasan wilayah berubah" });
        }
        if (!path.current.length) path.current = [scopes[0]];
        const report = await reportApi.bundle(path.current.at(-1)!, signal);
        if (valid()) setView({ context, scopes, trail: [...path.current], report, loading: false, error: null });
      } catch (error) {
        if (!valid()) return;
        controller.abort();
        const safe = error instanceof ApiError ? error : new ApiError({ status: 503, title: "Laporan belum tersedia" });
        setView({ context, scopes: safe.problem.status === 403 ? [] : scopes, trail: [], report: null, loading: false, error: safe });
        if (safe.problem.status === 401) void session.handleFailure(safe, false);
      }
    }
    reload.current = () => { void load(); };
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(visible, 15_000);
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { active = false; ++generation; controller?.abort(); window.clearInterval(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
    // Account context is the complete /me response. A change cancels all old requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, revision]);
  const current = view.context === context ? view : { ...view, trail: [], report: null, scopes: [], loading: true, error: null };
  function choose(trail: Geography[]) { path.current = trail; setView(v => ({ ...v, report: null, loading: true, error: null })); setRevision(v => v + 1); }
  if (!canMonitor(session.user)) return <AppState kind="restricted" title="Akses laporan tidak tersedia" />;
  const errorTitle = current.error?.problem.status === 403 ? "Akses laporan tidak tersedia" : current.error?.problem.code === "REPORT_NOT_PUBLISHED" ? "Belum ada snapshot yang diterbitkan" : current.error?.problem.code === "REPORT_SNAPSHOT_CHANGED" ? "Snapshot sedang diperbarui" : "Laporan belum tersedia";
  return <div className="reporting-workspace space-y-6">
    <AppPageHeader eyebrow="Rekaman TBCall" title="Pemantauan program" description="Ringkasan wilayah dari snapshot yang telah disetujui." actions={<Button variant="outline" onClick={() => reload.current()} disabled={current.loading}><RefreshCw aria-hidden="true" className="size-4" />Perbarui</Button>} />
    <p className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary">{reportDisclaimer}</p>
    {!!current.scopes.length && <div className="flex flex-wrap items-end justify-between gap-4"><label className="grid min-w-0 gap-2 text-sm font-medium">Wilayah penugasan<select className="app-input w-full sm:min-w-72" value={current.trail[0] ? key(current.trail[0]) : ""} onChange={e => { const root = current.scopes.find(g => key(g) === e.target.value); if (root) choose([root]); }}>{current.scopes.map(g => <option key={key(g)} value={key(g)}>{g.name}</option>)}</select></label>{current.report && <p className="text-sm text-muted-foreground">Posisi data <time dateTime={current.report.summary.dataAsOf}>{new Date(current.report.summary.dataAsOf).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</time></p>}</div>}
    {current.loading && !current.report ? <AppState kind="loading" title="Memuat snapshot…" /> : current.error ? <AppState kind={current.error.problem.status === 403 ? "restricted" : "unavailable"} title={errorTitle} action={<Button variant="outline" onClick={() => reload.current()}>Coba kembali</Button>} /> : !current.scopes.length ? <AppState kind="empty" title="Belum ada penugasan wilayah">Hubungi administrator untuk penugasan pelaporan.</AppState> : null}
    {current.report && <>
      <nav aria-label="Lingkup laporan" className="flex flex-wrap items-center gap-2">{current.trail.map((g, i) => <Button key={key(g)} variant="ghost" aria-current={i === current.trail.length - 1 ? "location" : undefined} onClick={() => choose(current.trail.slice(0, i + 1))}>{i > 0 && <ArrowDownRight aria-hidden="true" className="size-4" />}{g.name}</Button>)}<AppStatusBadge tone="complete">Snapshot disetujui</AppStatusBadge></nav>
      <section aria-label="Indikator program" className="grid grid-cols-2 gap-3 xl:grid-cols-3">{metrics.map((metric, i) => { const Icon = icons[i], item = indicatorLabels[metric]; return <article key={metric} className="rounded-2xl border bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium text-muted-foreground">{item.label}</h2><Icon aria-hidden="true" className="size-5 text-primary/65" /></div><p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{number(current.report!.summary.summary.indicators[metric])}</p><p className="mt-1 text-xs text-muted-foreground">{item.unit}</p></article>; })}</section>
      <Comparison key={`${current.report.summary.snapshotId}:${key(current.report.breakdown.geography)}`} report={current.report} drill={g => choose([...path.current, g])} />
      <AppDisclosure title="Definisi, sumber & keterbatasan"><dl className="grid gap-4 sm:grid-cols-2">{metrics.map(m => <div key={m}><dt className="text-sm font-semibold">{indicatorLabels[m].label}</dt><dd className="mt-1 text-sm text-muted-foreground">{indicatorLabels[m].detail}</dd></div>)}</dl><p className="text-sm">Atribusi memakai fasilitas penanggung jawab saat snapshot. Transfer tidak dihitung ganda. Data ini bukan tren historis. Dukungan privasi minimum {current.report.metadata.minimumPatientSupport} pasien unik per kelompok kontribusi; bukan jaminan anonimitas.</p><p className="break-words text-xs text-muted-foreground">Katalog {current.report.metadata.catalogueVersion}. {current.report.metadata.unattributedCaseEpisodes === null ? "Kualitas atribusi hanya ditampilkan dalam lingkup nasional." : `${number(current.report.metadata.unattributedCaseEpisodes)} episode tanpa atribusi terverifikasi dikecualikan.`}</p><ul className="space-y-2 text-sm">{current.report.metadata.sources.map((s, i) => <li key={s.url}><a className="text-link" href={s.url} target="_blank" rel="noreferrer">Dokumen sumber Kemendagri {i + 1}</a></li>)}</ul></AppDisclosure>
    </>}
  </div>;
}
function Comparison({ report, drill }: { report: ReportBundle; drill(g: Geography): void }) {
  const [metric, setMetric] = useState<Indicator>("caseEpisodes"), [page, setPage] = useState(0);
  if (report.breakdown.state === "LEAF_SCOPE") return <AppState kind="empty" title="Lingkup kabupaten/kota">Rincian geografis berhenti di wilayah ini.</AppState>;
  const rows = report.breakdown.rows, ordered = [...rows].sort((a, b) => b.indicators[metric] - a.indicators[metric] || a.geography.name.localeCompare(b.geography.name, "id"));
  const chart = ordered.slice(0, 8), max = Math.max(1, ...chart.map(r => r.indicators[metric]));
  const ceiling = Math.max(1, Math.ceil(max / 4) * 4), width = 520;
  return <AppSection title="Perbandingan wilayah" description={`${rows.length} wilayah dalam lingkup ini. Grafik menampilkan hingga 8 nilai tertinggi.`} actions={<label className="grid gap-1 text-xs">Indikator<select className="app-input max-w-full" value={metric} onChange={e => { setMetric(e.target.value as Indicator); setPage(0); }}>{metrics.map(m => <option value={m} key={m}>{indicatorLabels[m].label}</option>)}</select></label>}>
    {rows.length ? <><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="min-w-0"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><ChartNoAxesCombined aria-hidden="true" className="size-4 text-primary" />{indicatorLabels[metric].label}</div><svg viewBox={`0 0 ${width} ${chart.length * 52 + 36}`} role="img" aria-label={`${indicatorLabels[metric].label}, perbandingan wilayah. Nilai lengkap tersedia pada tabel.`} className="hidden w-full sm:block"><title>Perbandingan wilayah dari nol</title>{[0, 1, 2, 3, 4].map(t => <g key={t}><line x1={190 + t * 70} x2={190 + t * 70} y1="0" y2={chart.length * 52} stroke="currentColor" opacity="0.1" /><text x={190 + t * 70} y={chart.length * 52 + 24} textAnchor="middle" fontSize="11" fill="currentColor">{number(ceiling * t / 4)}</text></g>)}{chart.map((r, i) => <g key={key(r.geography)}><text x="0" y={i * 52 + 20} fontSize="11" fill="currentColor">{r.geography.name.length > 25 ? `${r.geography.name.slice(0, 24)}…` : r.geography.name}</text><rect x="190" y={i * 52 + 5} height="24" width={r.indicators[metric] / ceiling * 280} rx="4" fill="var(--primary)" /><text x={198 + r.indicators[metric] / ceiling * 280} y={i * 52 + 22} fontSize="12" fill="currentColor">{number(r.indicators[metric])}</text></g>)}</svg><div className="space-y-4 sm:hidden" aria-label="Grafik perbandingan wilayah">{chart.map(r => <div key={key(r.geography)}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span>{r.geography.name}</span><span className="font-semibold tabular-nums">{number(r.indicators[metric])}</span></div><div className="h-3 border-l border-primary/30 bg-primary/5"><div className="h-full rounded-r bg-primary" style={{ width: `${r.indicators[metric] / ceiling * 100}%` }} /></div></div>)}<div className="flex justify-between border-t pt-2 text-xs tabular-nums text-muted-foreground">{[0, 1, 2, 3, 4].map(t => <span key={t}>{number(ceiling * t / 4)}</span>)}</div></div><p className="mt-2 text-xs text-muted-foreground">{indicatorLabels[metric].unit} · baseline 0 · bukan tren waktu</p></div><div className="min-w-0"><AppTable caption="Rincian wilayah"><thead><tr><th>Wilayah</th><th className="text-right">{indicatorLabels[metric].label}</th></tr></thead><tbody>{ordered.slice(page * 10, page * 10 + 10).map(r => <tr key={key(r.geography)}><td><button className="text-link text-left" onClick={() => drill(r.geography)}>{r.geography.name}</button></td><td className="text-right tabular-nums">{number(r.indicators[metric])}</td></tr>)}</tbody></AppTable>{rows.length > 10 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span>{page * 10 + 1}–{Math.min(rows.length, page * 10 + 10)} dari {rows.length}</span><div className="flex gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button><Button variant="outline" disabled={(page + 1) * 10 >= rows.length} onClick={() => setPage(p => p + 1)}>Berikutnya</Button></div></div>}</div></div></> : <AppState kind="empty" title="Tidak ada rincian wilayah" />}
  </AppSection>;
}
