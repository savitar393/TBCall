"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppSection } from "@/components/application-patterns";
import { AppConfirmation } from "@/components/application-confirmation";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/session";
import { useLocalClock } from "@/lib/use-local-clock";
import { Pagination } from "@/features/portal/display";
import { votApi, votStatuses, type VotDecision, type VotStatus } from "./api";
import { canReviewVot } from "./permissions";
import { useVotCommand, VotFacts, VotPlayback, VotReadState } from "./shared";

export function StaffVot({ treatmentId }: { treatmentId?: string }) {
  const { user } = useSession();
  if (!canReviewVot(user)) return <p>Akses peninjauan VOT tidak diizinkan. Diperlukan izin petugas TBC dan penugasan fasilitas aktif.</p>;
  return <StaffVotContent key={JSON.stringify(user) + treatmentId} treatmentId={treatmentId}/>;
}
function StaffVotContent({ treatmentId }: { treatmentId?: string }) {
  const { user } = useSession(), [status, setStatus] = useState<VotStatus>("PENDING_REVIEW"), [page, setPage] = useState(0), [selected, setSelected] = useState(""), [decision, setDecision] = useState<VotDecision | "">(""), [notes, setNotes] = useState(""), [saved, setSaved] = useState(false);
  const query = useQuery({ queryKey: ["vot", user!.id, "queue", treatmentId, status, page], queryFn: ({ signal }) => votApi.list("staff", page, status, treatmentId, signal), retry: false });
  const detail = useQuery({ queryKey: ["vot", user!.id, "review", selected], queryFn: ({ signal }) => votApi.detail("staff", selected, signal), enabled: !!selected, retry: false });
  const now = useLocalClock(), command = useVotCommand(), item = !detail.isError && detail.data?.data;
  const write = canReviewVot(user, true);
  return <section id="treatment-vot"><AppSection title="Peninjauan VOT" description="Demo sintetis. Hanya video dalam lingkup fasilitas penugasan Anda. Keputusan tidak otomatis membuat catatan dosis atau menyatakan kepatuhan." actions={<Button variant="outline" disabled={command.pending || query.isFetching} onClick={() => { setSelected(""); void query.refetch(); }}>Perbarui antrean VOT</Button>}>
    <label className="block">Status video<select aria-label="Status video" className="mt-1 min-h-11 w-full rounded border p-2" disabled={command.pending} value={status} onChange={event => { setStatus(event.target.value as VotStatus); setPage(0); setSelected(""); setSaved(false); }}>{Object.entries(votStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {saved && <p role="status">Peninjauan tersimpan.</p>}
    {query.isPending || query.error ? <VotReadState pending={query.isPending} error={query.error} retry={query.refetch}/> : <><ul className="clinical-record-list">{query.data?.data.content.map((entry, index) => <li key={entry.id} className="clinical-record-row space-y-3"><VotFacts item={entry}/><Button variant="outline" disabled={command.pending} onClick={() => { setSelected(entry.id); setDecision(""); setNotes(""); setSaved(false); }}>Tinjau video {page * 20 + index + 1}</Button></li>)}</ul>{!query.data?.data.content.length && <p>Tidak ada video dengan status ini dalam lingkup fasilitas Anda.</p>}<Pagination page={page} total={query.data?.data.totalElements ?? 0} onPage={next => { setPage(next); setSelected(""); }}/></>}
    {selected && <section aria-label="Rincian peninjauan VOT" className="clinical-editor space-y-4"><h3 className="font-semibold">Rincian video terpilih</h3><Button variant="outline" disabled={command.pending} onClick={() => setSelected("")}>Tutup peninjauan</Button>
      {detail.isPending || detail.error ? <VotReadState pending={detail.isPending} error={detail.error} retry={detail.refetch}/> : item && <><VotFacts item={item}/><VotPlayback key={item.id} audience="staff" item={item}/>{item.status === "PENDING_REVIEW" && write && <><label className="block">Keputusan peninjauan<select aria-label="Keputusan peninjauan" className="mt-1 min-h-11 w-full rounded border p-2" disabled={command.pending} value={decision} onChange={event => setDecision(event.target.value as VotDecision | "")}><option value="">Pilih keputusan</option><option value="OBSERVED">Aktivitas teramati</option><option value="NOT_VERIFIABLE">Tidak dapat diverifikasi</option></select></label><label className="block">Catatan peninjauan (opsional)<textarea aria-label="Catatan peninjauan" maxLength={2000} disabled={command.pending} className="mt-1 w-full rounded border p-2" value={notes} onChange={event => setNotes(event.target.value)}/></label><AppConfirmation label="Simpan peninjauan" description={`Simpan keputusan ${decision ? votStatuses[decision] : "yang dipilih"}${notes.trim() ? ` dengan catatan: ${notes.trim()}` : ""}? Keputusan akan dicatat bersama identitas petugas dan waktu peninjauan.`} disabled={!decision || command.pending || detail.isFetching || !!item.mediaDeletedAt || Date.parse(item.retentionExpiresAt) <= now.getTime()} onConfirm={() => { if (decision) void command.run(signal => votApi.review(item.id, { decision, ...(notes.trim() ? { notes: notes.trim() } : {}) }, item.version, signal), () => { setSelected(""); setSaved(true); }); }}/></>}{!write && <p>Izin mencatat keputusan peninjauan tidak tersedia.</p>}</>}
      {command.error && <p role="alert">{command.error}</p>}
    </section>}
  </AppSection></section>;
}
