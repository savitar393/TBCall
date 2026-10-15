"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSection, AppStatusBadge } from "@/components/application-patterns";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ME_QUERY_KEY, useSession } from "@/lib/auth/session";
import { patientOnly } from "@/lib/application-navigation";
import { ApiError } from "@/lib/api/problem";
import type { Me } from "@/lib/auth/types";
import { reminderApi, validReminderZone, type ReminderInput, type ReminderJob, type ReminderPreferences } from "./api";

const prefix = "medication-reminders";
const snapshot = (user: Me | null | undefined) => JSON.stringify(user ?? null);
const denied = (error: unknown) => error instanceof ApiError && [401, 403].includes(error.problem.status);
function safeError(error: unknown) { return error instanceof ApiError ? error : new ApiError({ status: 503, title: "Layanan belum tersedia" }); }

export function MedicationReminders() {
  const { user } = useSession(), client = useQueryClient();
  // Observe the authoritative cache, including changes before SessionProvider rerenders.
  const current = useSyncExternalStore(callback => client.getQueryCache().subscribe(callback), () => snapshot(client.getQueryData<Me | null>(ME_QUERY_KEY)), () => "null");
  if (!user || current !== snapshot(user) || !user.patientLink || !patientOnly(user)) return null;
  return <ScopedReminders key={current} user={user} scope={current}/>;
}

function ScopedReminders({ user, scope }: { user: Me; scope: string }) {
  const session = useSession(), client = useQueryClient();
  const key = [prefix, user.id, user.patientLink!.id, user.patientLink!.version, scope];
  const [blocked, setBlocked] = useState(false), [reloadRequired, setReloadRequired] = useState(false);
  const [writeError, setWriteError] = useState<ApiError | null>(null), [saved, setSaved] = useState(false), [pending, setPending] = useState(false);
  const active = useRef(new Set<AbortController>()), mounted = useRef(true), busy = useRef(false), revoked = useRef(false);
  const current = () => mounted.current && !revoked.current && snapshot(client.getQueryData<Me | null>(ME_QUERY_KEY)) === scope;
  useEffect(() => {
    mounted.current = true;
    const controllers = active.current;
    const unsubscribe = client.getQueryCache().subscribe(() => {
      if (!revoked.current && snapshot(client.getQueryData<Me | null>(ME_QUERY_KEY)) !== scope) {
        revoked.current = true;
        for (const controller of controllers) controller.abort();
        setBlocked(true);
        client.removeQueries({ queryKey: [prefix, user.id] });
      }
    });
    return () => { mounted.current = false; unsubscribe(); for (const controller of controllers) controller.abort(); };
  }, [client, scope, user.id]);
  async function scoped<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController(); active.current.add(controller);
    const abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true });
    if (!current() || signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) throw new DOMException("Session changed", "AbortError");
      const result = await operation(controller.signal);
      if (controller.signal.aborted || !current()) throw new DOMException("Session changed", "AbortError");
      return result;
    } catch (error) {
      if (current() && !controller.signal.aborted && denied(error)) {
        setBlocked(true);
        client.removeQueries({ queryKey: [prefix, user.id] });
        void session.handleFailure(error, false);
      }
      throw error;
    } finally { signal?.removeEventListener("abort", abort); active.current.delete(controller); }
  }
  const fresh = { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false };
  const preferences = useQuery({ ...fresh, queryKey: [...key, "preferences"], queryFn: ({ signal }) => scoped(reminderApi.preferences, signal), enabled: !blocked && !reloadRequired });
  const history = useQuery({ ...fresh, queryKey: [...key, "history", 0, 10], queryFn: ({ signal }) => scoped(reminderApi.history, signal), enabled: !blocked && !reloadRequired && preferences.data?.data.bindingCurrent === true });
  const readError = denied(preferences.error) ? preferences.error : denied(history.error) ? history.error : null;
  async function save(body: ReminderInput) {
    if (busy.current || !current() || !preferences.data || blocked || reloadRequired) return;
    busy.current = true; setPending(true); setWriteError(null); setSaved(false);
    try {
      const response = await scoped(signal => reminderApi.save(body, preferences.data!.etag, signal));
      if (!current()) return;
      client.setQueryData([...key, "preferences"], response);
      setSaved(true);
      await client.invalidateQueries({ queryKey: [...key, "history"] });
    } catch (error) {
      if (!current()) return;
      const failure = safeError(error); setWriteError(failure);
      if ([409, 412, 428].includes(failure.problem.status)) {
        setReloadRequired(true); client.removeQueries({ queryKey: [prefix, user.id] });
      }
    } finally { busy.current = false; if (current()) setPending(false); }
  }
  const unavailable = blocked || readError;
  const savedZone = preferences.data?.data.timeZone;
  const historyZone = savedZone && validReminderZone(savedZone) ? savedZone : "UTC";
  return <AppSection title="Pengingat" description="Atur persetujuan dan waktu pengingat obat untuk akun Anda.">
    {unavailable ? <p role="alert">Akses pengingat tidak tersedia. Periksa kembali sesi akun Anda.</p>
      : reloadRequired ? <div role="alert"><p>Pengaturan telah berubah. Muat ulang dan periksa kembali sebelum menyimpan.</p><Button variant="outline" onClick={() => { setWriteError(null); setReloadRequired(false); }}>Muat ulang pengingat</Button></div>
      : preferences.isPending ? <p role="status">Memuat pengingat…</p>
      : preferences.error ? <><ApiFeedback error={safeError(preferences.error)}/><Button variant="outline" onClick={() => void preferences.refetch()}>Muat ulang pengingat</Button></>
      : preferences.data && <>
        <ReminderForm key={`${preferences.data.data.version}:${preferences.data.etag}`} value={preferences.data.data} pending={pending} onSave={save}/>
        {writeError && <ApiFeedback error={writeError}/>}
        {saved && <p role="status">Pengaturan pengingat disimpan.</p>}
        {preferences.data.data.bindingCurrent && <div className="space-y-3"><h3 className="font-semibold">Aktivitas pengingat terbaru</h3>
          {history.isPending ? <p role="status">Memuat aktivitas…</p> : history.error ? <><ApiFeedback error={safeError(history.error)}/><Button variant="outline" onClick={() => void history.refetch()}>Muat ulang aktivitas</Button></>
            : history.data?.data.content.length ? <ul className="clinical-record-list">{history.data.data.content.map(job => <li key={job.id} className="clinical-record-row"><span>{job.channel === "WHATSAPP" ? "WhatsApp" : "SMS"} · <time dateTime={job.scheduledAt}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: historyZone }).format(new Date(job.scheduledAt))}</time> ({historyZone})</span><AppStatusBadge>{jobLabel(job)}</AppStatusBadge></li>)}</ul>
              : <p className="text-sm text-muted-foreground">Belum ada aktivitas pengingat.</p>}
          <p className="text-sm text-muted-foreground">Maksimal 10 aktivitas terbaru. Status ini mencatat proses pengingat dan tidak membuktikan obat diminum.</p>
        </div>}
      </>}
  </AppSection>;
}

function jobLabel(job: ReminderJob) {
  if (job.mode === "SIMULATED") {
    if (job.state === "ACCEPTED") return "Diterima oleh simulasi";
    if (job.state === "DELIVERED") return "Selesai dalam simulasi";
  }
  const names: Record<ReminderJob["state"], string> = { SCHEDULED: "Dijadwalkan", ELIGIBLE: "Memenuhi syarat", SUPPRESSED: "Tidak diproses", DISPATCHED: "Diproses", ACCEPTED: "Diterima penyedia", DELIVERED: "Terkirim", FAILED: "Gagal", CANCELLED: "Dibatalkan", UNCERTAIN: "Hasil belum pasti" };
  return `${names[job.state]}${job.mode === "SIMULATED" ? " · simulasi" : " · pengiriman tidak tersedia"}`;
}
function ReminderForm({ value, pending, onSave }: { value: ReminderPreferences; pending: boolean; onSave: (input: ReminderInput) => Promise<void> }) {
  const [whatsapp, setWhatsapp] = useState(value.bindingCurrent && value.whatsappConsent), [sms, setSms] = useState(value.bindingCurrent && value.smsConsent);
  const [preferred, setPreferred] = useState(value.preferredChannel), [fallback, setFallback] = useState(value.bindingCurrent && value.smsFallback);
  const [zone, setZone] = useState(value.timeZone ?? ""), [from, setFrom] = useState(value.permittedFrom ?? ""), [until, setUntil] = useState(value.permittedUntil ?? "");
  const [allDay, setAllDay] = useState(value.allDay), [acknowledged, setAcknowledged] = useState(false);
  const enabled = whatsapp || sms, channelValid = preferred === "WHATSAPP" ? whatsapp : sms;
  const hoursValid = allDay || (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(from) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(until) && from !== until);
  const canSave = !enabled || (value.verifiedPhone && validReminderZone(zone) && hoursValid && channelValid && acknowledged && (!fallback || (whatsapp && sms && preferred === "WHATSAPP")));
  function submit(event: FormEvent) {
    event.preventDefault(); if (!canSave || pending) return;
    void onSave({ whatsappConsent: whatsapp, smsConsent: sms, preferredChannel: preferred, smsFallback: fallback && whatsapp && sms && preferred === "WHATSAPP", timeZone: validReminderZone(zone) ? zone : null, permittedFrom: allDay ? null : from || null, permittedUntil: allDay ? null : until || null, allDay, policyVersion: "MEDICATION_REMINDERS_V1", riskAcknowledged: acknowledged });
  }
  const field = "grid gap-2 text-sm";
  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-muted-foreground">{value.mode === "SIMULATED" ? "Simulasi: pengingat ini tidak mengirim pesan WhatsApp atau SMS." : "Pengiriman WhatsApp dan SMS belum tersedia. Persetujuan tetap dapat disimpan."}</p>
    <p className="text-sm">{value.verifiedPhone ? <>Nomor terverifikasi: <span className="font-medium">{value.maskedPhone ?? "Tidak ditampilkan"}</span></> : "Nomor telepon belum terverifikasi. Verifikasi nomor akun sebelum mengaktifkan pengingat."}</p>
    {!value.bindingCurrent && <p role="status">Tautan akun atau nomor telah berubah. Berikan persetujuan baru untuk mengaktifkan kembali pengingat.</p>}
    <fieldset disabled={pending} className="space-y-4">
      <legend className="sr-only">Persetujuan pengingat</legend>
      <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input type="checkbox" checked={whatsapp} disabled={!value.verifiedPhone && !whatsapp} onChange={event => { setWhatsapp(event.target.checked); setAcknowledged(false); if (!event.target.checked) setFallback(false); }}/>Izinkan WhatsApp</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={sms} disabled={!value.verifiedPhone && !sms} onChange={event => { setSms(event.target.checked); setAcknowledged(false); if (!event.target.checked) setFallback(false); }}/>Izinkan SMS</label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Kanal utama<select className="app-input" value={preferred} onChange={event => { setPreferred(event.target.value as ReminderInput["preferredChannel"]); setFallback(false); }}><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option></select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={fallback} disabled={!whatsapp || !sms || preferred !== "WHATSAPP"} onChange={event => setFallback(event.target.checked)}/>Gunakan SMS sebagai cadangan</label></div>
      <p className="text-sm text-muted-foreground">SMS cadangan hanya dapat digunakan setelah persetujuan SMS diberikan secara terpisah.</p>
      <label className={field}>Zona waktu (IANA)<Input value={zone} placeholder="Asia/Jakarta" autoComplete="off" onChange={event => setZone(event.target.value)}/></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={allDay} onChange={event => setAllDay(event.target.checked)}/>Izinkan sepanjang hari</label>
      {!allDay && <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Mulai<Input type="time" value={from} onChange={event => setFrom(event.target.value)}/></label><label className={field}>Sampai<Input type="time" value={until} onChange={event => setUntil(event.target.value)}/></label></div>}
      <p className="text-sm text-muted-foreground">Jam mengikuti zona waktu yang dipilih. Rentang melewati tengah malam diperbolehkan; jam mulai dan sampai harus berbeda.</p>
      {enabled && (!validReminderZone(zone) || !hoursValid || !channelValid) && <p className="text-sm" role="status">Pilih kanal utama yang disetujui, zona waktu IANA yang valid, dan jam yang diizinkan.</p>}
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/><span>Saya memahami bahwa nama TBCall pada pesan atau notifikasi dapat mengungkapkan kaitan saya dengan TBC kepada orang yang melihat telepon, dan saya menyetujui risiko ini untuk kanal yang dipilih.</span></label>
      <Button type="submit" disabled={pending || !canSave}>{pending ? "Menyimpan…" : "Simpan pengingat"}</Button>
    </fieldset>
  </form>;
}
