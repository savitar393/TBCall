import Link from "next/link";
import { Fields, Panel } from "@/features/administration/display";
import type { IntegrationSummary, RunSummary } from "./types";
export function IntegrationNotice() {
    return <div role="note" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
    <p>Integrasi pada tahap ini hanya menampilkan metadata lokal TBCall. Belum ada konektor, kredensial, sinkronisasi aktif, impor, write-back, atau resolusi konflik melalui antarmuka ini.</p>
    <p>Status &quot;aktif&quot; adalah metadata TBCall dan tidak berarti konektor sudah dikonfigurasi atau terhubung.</p>
    </div>;
}
export function RunFields({ run, code, link = false }: {
    run: RunSummary;
    code: string;
    link?: boolean;
}) {
    return <div className="space-y-3">
    <Fields values={{ "ID proses": run.id, "Arah": run.direction, "Status": run.status, "Mulai": run.startedAt, "Selesai": run.finishedAt, "Diterima": run.recordsReceived, "Dibuat": run.recordsCreated, "Diperbarui": run.recordsUpdated, "Gagal": run.recordsFailed, "Kursor": run.cursorValue, "Ringkasan kesalahan aman": run.errorSummary }}/>{link && <Link className="text-primary underline" href={`/integrations/${encodeURIComponent(code)}/sync-runs/${run.id}`}>Buka detail proses</Link>}</div>;
}
export function IntegrationFields({ data }: {
    data: IntegrationSummary;
}) {
    return <Panel title={data.name}>
    <Fields values={{ "Kode": data.code, "Aktif (metadata)": data.active, "Status konfigurasi": data.configurationStatus, "Deskripsi": data.description, "Jumlah identitas eksternal": data.identifierCount, "Jumlah otoritas aktif": data.activeAuthorityCount }}/>{data.latestSyncRun && <>
        <h3 className="font-semibold">Proses terakhir</h3>
        <RunFields run={data.latestSyncRun} code={data.code} link/>
        </>}</Panel>;
}
