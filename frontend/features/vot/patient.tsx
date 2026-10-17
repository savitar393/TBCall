"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppPageHeader, AppSection } from "@/components/application-patterns";
import { AppConfirmation } from "@/components/application-confirmation";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/session";
import { useLocalClock } from "@/lib/use-local-clock";
import { scheduleApi } from "@/features/medication-schedule/api";
import { portalQueries } from "@/features/portal/queries";
import { Pagination } from "@/features/portal/display";
import { votApi, type VotPolicy } from "./api";
import { canSelfVot } from "./permissions";
import { VotRecorder } from "./recorder";
import { useVotCommand, VotFacts, VotPlayback, VotReadState } from "./shared";

export function PatientVot() {
  const { user } = useSession();
  if (!canSelfVot(user)) return <p>Akses video pengobatan tidak diizinkan. Hubungi petugas untuk memeriksa izin dan tautan akun.</p>;
  return <PatientVotContent key={JSON.stringify(user)}/>;
}
function PatientVotContent() {
  const { user } = useSession(), policy = useQuery({ queryKey: ["vot", user!.id, "policy"], queryFn: ({ signal }) => votApi.policy(signal), retry: false });
  return <div className="clinical-workspace"><AppPageHeader title="Video Pengobatan (VOT)" description="Video sintetis untuk peninjauan petugas TBC, terpisah dari laporan bukti dosis."/>
    {policy.isPending || policy.error ? <VotReadState pending={policy.isPending} error={policy.error} retry={policy.refetch}/> : !policy.data?.data.enabled ? <p>VOT belum diaktifkan. Anda tetap dapat menggunakan fungsi portal lainnya.</p> : <><PatientVotUpload policy={policy.data.data}/><PatientVotHistory/></>}
  </div>;
}
function PatientVotUpload({ policy }: { policy: VotPolicy }) {
  const { user } = useSession(), client = useQueryClient(), now = useLocalClock();
  const allowed = canSelfVot(user, true) && user!.permissions.includes("TREATMENT_READ");
  const treatment = useQuery({ ...portalQueries.treatment(user!.id), enabled: allowed });
  const schedule = useQuery({ queryKey: ["vot", user!.id, "schedule"], queryFn: ({ signal }) => scheduleApi.patient(signal), enabled: allowed && treatment.data?.data.status === "ACTIVE", retry: false });
  const prescription = !schedule.isError ? schedule.data?.data : undefined, revision = prescription?.currentRevision;
  const zone = revision?.timeZone ?? "Asia/Jakarta";
  const localDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const from = localDate(new Date(now.getTime() - 7 * 86400000)), to = localDate(now);
  const active = allowed && !treatment.isError && treatment.data?.data.status === "ACTIVE" && prescription?.status === "ACTIVE" && prescription.lifecycle.futureExpectationsAllowed && revision?.status === "ACTIVE" && (!revision.endDate || revision.endDate >= to);
  const calendar = useQuery({ queryKey: ["vot", user!.id, "occurrences", revision?.id, from, to], queryFn: ({ signal }) => scheduleApi.patientOccurrences(from, to, signal), enabled: !!active, retry: false });
  const occurrences = active && !calendar.isError ? (calendar.data?.data.content ?? []).filter(item => item.treatmentId === treatment.data?.data.id && item.revisionId === revision?.id && Date.parse(item.scheduledAt) <= now.getTime() && Date.parse(item.scheduledAt) >= now.getTime() - 7 * 86400000) : [];
  return <AppSection title="Kirim video untuk jadwal obat">
    {!allowed ? <p>Izin mengirim video atau membaca jadwal belum tersedia. Hubungi petugas.</p> : treatment.isPending || treatment.error ? <VotReadState pending={treatment.isPending} error={treatment.error} retry={treatment.refetch}/> : treatment.data?.data.status !== "ACTIVE" ? <p>Belum ada pengobatan aktif. Riwayat video tetap dapat dibaca.</p> : schedule.isPending || schedule.error ? <VotReadState pending={schedule.isPending} error={schedule.error} retry={schedule.refetch}/> : !active ? <p>Belum ada jadwal obat aktif. Hubungi petugas untuk memeriksa jadwal.</p> : calendar.isPending || calendar.error ? <VotReadState pending={calendar.isPending} error={calendar.error} retry={calendar.refetch}/> : !occurrences.length ? <p>Belum ada kejadian terjadwal yang dapat dipilih. Pilihan hanya mencakup jadwal aktif yang sudah lewat dalam tujuh hari terakhir.</p> : <VotRecorder key={revision?.id} occurrences={occurrences} policy={policy} onSaved={() => void client.invalidateQueries({ queryKey: ["vot", user!.id, "history"] })}/>}
  </AppSection>;
}
function PatientVotHistory() {
  const { user } = useSession(), [page, setPage] = useState(0), [selected, setSelected] = useState("");
  const query = useQuery({ queryKey: ["vot", user!.id, "history", page], queryFn: ({ signal }) => votApi.list("patient", page, undefined, undefined, signal), retry: false });
  const detail = useQuery({ queryKey: ["vot", user!.id, "detail", selected], queryFn: ({ signal }) => votApi.detail("patient", selected, signal), enabled: !!selected, retry: false });
  const command = useVotCommand(), item = !detail.isError && detail.data?.data;
  return <AppSection title="Riwayat video" actions={<Button variant="outline" disabled={query.isFetching || command.pending} onClick={() => { setSelected(""); void query.refetch(); }}>Perbarui riwayat video</Button>}>
    {query.isPending || query.error ? <VotReadState pending={query.isPending} error={query.error} retry={query.refetch}/> : <><ul className="clinical-record-list">{query.data?.data.content.map((entry, index) => <li key={entry.id} className="clinical-record-row space-y-3"><VotFacts item={entry}/><Button variant="outline" onClick={() => setSelected(entry.id)}>Rincian video {page * 20 + index + 1}</Button></li>)}</ul>{!query.data?.data.content.length && <p>Belum ada video yang dikirim.</p>}<Pagination page={page} total={query.data?.data.totalElements ?? 0} onPage={next => { setPage(next); setSelected(""); }}/></>}
    {selected && <section aria-label="Rincian video pasien" className="space-y-4"><Button variant="outline" disabled={command.pending} onClick={() => setSelected("")}>Tutup rincian video</Button>{detail.isPending || detail.error ? <VotReadState pending={detail.isPending} error={detail.error} retry={detail.refetch}/> : item && <><VotFacts item={item}/><VotPlayback key={item.id} audience="patient" item={item}/>{item.status === "PENDING_REVIEW" && canSelfVot(user, true) && <AppConfirmation label="Batalkan pengiriman video" description="Batalkan video yang masih menunggu peninjauan? Metadata tetap disimpan untuk audit. Video tidak akan ditinjau sebagai bukti aktivitas." disabled={command.pending || detail.isFetching} onConfirm={() => void command.run(signal => votApi.cancel(item.id, item.version, signal), () => setSelected(""))}/>}</>}{command.error && <p role="alert">{command.error}</p>}</section>}
  </AppSection>;
}
