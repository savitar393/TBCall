import Link from "next/link";
import { AppDisclosure, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { Fields } from "@/features/administration/display";
import { formatDateTime } from "@/lib/date-format";
import type { IntegrationSummary, RunSummary } from "./types";
const labels: Record<string, string> = { UNCONFIGURED: "Belum dikonfigurasi", INBOUND: "Masuk", OUTBOUND: "Keluar", RUNNING: "Berjalan", SUCCEEDED: "Selesai", PARTIAL: "Sebagian", FAILED: "Gagal", CANCELLED: "Dibatalkan", PENDING: "Menunggu", SKIPPED: "Dilewati", CREATE: "Buat", UPDATE: "Ubah", UPSERT: "Buat / ubah", DELETE: "Hapus", IGNORE: "Abaikan", OPEN: "Terbuka", RESOLVED: "Diselesaikan" };
export function integrationLabel(value: string) { return labels[value] ?? value; }
export function IntegrationNotice() {
  return <p role="note" className="text-sm text-muted-foreground">Metadata lokal TBCall · bukan koneksi SITB</p>;
}
export function RunFields({ run, code, link = false }: { run: RunSummary; code: string; link?: boolean }) {
  return <div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><AppStatusBadge tone={run.status === "FAILED" ? "warning" : "neutral"}>{integrationLabel(run.status)}</AppStatusBadge><span className="text-sm">{integrationLabel(run.direction)}</span></div>
    <Fields values={{ "Mulai": formatDateTime(run.startedAt), "Selesai": run.finishedAt ? formatDateTime(run.finishedAt) : null, "Diterima": run.recordsReceived, "Dibuat": run.recordsCreated, "Diperbarui": run.recordsUpdated, "Gagal": run.recordsFailed }} />
    {run.errorSummary && <Fields values={{ "Ringkasan kesalahan aman": run.errorSummary }} />}
    <AppDisclosure title="Identitas dan kursor proses"><Fields values={{ "ID proses": run.id, "Kursor": run.cursorValue }} /></AppDisclosure>
    {link && <Link className="text-primary underline" href={`/integrations/${encodeURIComponent(code)}/sync-runs/${run.id}`}>Buka detail proses</Link>}
  </div>;
}
export function IntegrationFields({ data }: { data: IntegrationSummary }) {
  return <AppSection title={data.name}><div className="flex flex-wrap gap-2"><AppStatusBadge>{integrationLabel(data.configurationStatus)}</AppStatusBadge><AppStatusBadge>{data.active ? "Metadata aktif" : "Metadata nonaktif"}</AppStatusBadge></div>
    <Fields values={{ "Identitas eksternal": data.identifierCount, "Otoritas aktif": data.activeAuthorityCount }} />
    <AppDisclosure title="Identitas sumber"><Fields values={{ "Kode": data.code, "Deskripsi": data.description }} /></AppDisclosure>
    {data.latestSyncRun && <section aria-label="Proses terakhir" className="border-t pt-4"><h3 className="mb-3 text-sm font-semibold">Proses terakhir</h3><RunFields run={data.latestSyncRun} code={data.code} link /></section>}
  </AppSection>;
}
