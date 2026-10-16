"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSection, AppStatusBadge } from "@/components/application-patterns";
import { ApiFeedback } from "@/components/api-feedback";
import { AppConfirmation } from "@/components/application-confirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ME_QUERY_KEY, useSession } from "@/lib/auth/session";
import { patientOnly } from "@/lib/application-navigation";
import { ApiError } from "@/lib/api/problem";
import type { Me } from "@/lib/auth/types";
import { reminderApi, validReminderZone, type ReminderInput, type ReminderJob, type ReminderPreferences, type TelegramLink } from "./api";

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
  const [link, setLink] = useState<TelegramLink | null>(null);
  const active = useRef(new Set<AbortController>()), mounted = useRef(true), busy = useRef(false), revoked = useRef(false);
  const current = () => mounted.current && !revoked.current && snapshot(client.getQueryData<Me | null>(ME_QUERY_KEY)) === scope;
  useEffect(() => {
    mounted.current = true;
    const controllers = active.current;
    const unsubscribe = client.getQueryCache().subscribe(() => {
      if (!revoked.current && snapshot(client.getQueryData<Me | null>(ME_QUERY_KEY)) !== scope) {
        revoked.current = true;
        for (const controller of controllers) controller.abort();
        setLink(null);
        setBlocked(true);
        client.removeQueries({ queryKey: [prefix, user.id] });
      }
    });
    return () => { mounted.current = false; unsubscribe(); for (const controller of controllers) controller.abort(); };
  }, [client, scope, user.id]);
  useEffect(() => {
    if (!link) return;
    const expire = () => { if (Date.parse(link.expiresAt) <= Date.now()) setLink(null); };
    const timer = setTimeout(() => setLink(null), Math.max(0, Date.parse(link.expiresAt) - Date.now()));
    window.addEventListener("focus", expire); document.addEventListener("visibilitychange", expire);
    return () => { clearTimeout(timer); window.removeEventListener("focus", expire); document.removeEventListener("visibilitychange", expire); };
  }, [link]);
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
        setLink(null);
        setBlocked(true);
        client.removeQueries({ queryKey: [prefix, user.id] });
        void session.handleFailure(error, false);
      }
      throw error;
    } finally { signal?.removeEventListener("abort", abort); active.current.delete(controller); }
  }
  const fresh = { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false };
  const preferences = useQuery({ ...fresh, queryKey: [...key, "preferences"], queryFn: ({ signal }) => scoped(reminderApi.preferences, signal), enabled: !blocked && !reloadRequired });
  const telegram = useQuery({ ...fresh, queryKey: [...key, "telegram"], queryFn: ({ signal }) => scoped(reminderApi.telegram, signal), enabled: !blocked && !reloadRequired });
  const hasHistory = !!preferences.data && (preferences.data.data.bindingCurrent || preferences.data.data.emailBindingCurrent || preferences.data.data.telegramBindingCurrent);
  const history = useQuery({ ...fresh, queryKey: [...key, "history", 0, 10], queryFn: ({ signal }) => scoped(reminderApi.history, signal), enabled: !blocked && !reloadRequired && hasHistory });
  const readError = [preferences.error, history.error, telegram.error].find(denied);
  function mutationError(error: unknown) {
    setLink(null);
    const failure = safeError(error); setWriteError(failure);
    if ([409, 412, 428].includes(failure.problem.status)) {
      setReloadRequired(true); client.removeQueries({ queryKey: [prefix, user.id] });
    }
  }
  async function refreshBindings() {
    // Each explicit check refreshes the authoritative versions before another mutation.
    const status = await scoped(reminderApi.telegram);
    const response = await scoped(reminderApi.preferences);
    if (!current()) return;
    client.setQueryData([...key, "telegram"], status);
    client.setQueryData([...key, "preferences"], response);
    await client.invalidateQueries({ queryKey: [...key, "history"] });
  }
  async function telegramAction(action: "link" | "check" | "unlink") {
    if (busy.current || !current() || (!telegram.data && action !== "check") || blocked || reloadRequired) return;
    busy.current = true; setPending(true); setWriteError(null); setSaved(false); setLink(null);
    try {
      if (action === "link") {
        if (!telegram.data?.data.available || !telegram.data.data.botUsername) return;
        const result = await scoped(signal => reminderApi.linkTelegram(telegram.data!.etag, telegram.data!.data.botUsername!, signal));
        await refreshBindings();
        if (current() && Date.parse(result.expiresAt) > Date.now()) setLink(result);
      } else {
        if (action === "unlink") await scoped(signal => reminderApi.unlinkTelegram(telegram.data!.etag, signal));
        await refreshBindings();
      }
    } catch (error) { if (current()) mutationError(error); }
    finally { busy.current = false; if (current()) setPending(false); }
  }
  async function save(body: ReminderInput) {
    if (busy.current || !current() || !preferences.data || blocked || reloadRequired) return;
    busy.current = true; setPending(true); setWriteError(null); setSaved(false); setLink(null);
    try {
      const response = await scoped(signal => reminderApi.save(body, preferences.data!.etag, signal));
      if (!current()) return;
      client.setQueryData([...key, "preferences"], response);
      setSaved(true);
      await client.invalidateQueries({ queryKey: [...key, "history"] });
    } catch (error) {
      if (!current()) return;
      mutationError(error);
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
        <div className="space-y-3 text-sm" aria-label="Tautan Telegram">
          {telegram.isPending ? <p role="status">Memuat tautan Telegram…</p> : telegram.error ? <><ApiFeedback error={safeError(telegram.error)}/><Button variant="outline" disabled={pending} onClick={() => void telegramAction("check")}>Muat ulang tautan Telegram</Button></> : telegram.data && <>
            <p>{telegram.data.data.linked ? `Telegram terhubung: ${telegram.data.data.maskedChat ?? "Chat pribadi terverifikasi"}` : "Telegram belum terhubung. Buka bot dan kirim /start melalui tautan untuk menghubungkan chat pribadi Anda."}</p>
            {!telegram.data.data.available && <p>Penghubungan Telegram belum tersedia.</p>}
            {!telegram.data.data.linked && <Button variant="outline" disabled={pending || !telegram.data.data.available || !telegram.data.data.botUsername} onClick={() => void telegramAction("link")}>Hubungkan Telegram</Button>}
            <Button variant="outline" disabled={pending} onClick={() => void telegramAction("check")}>Periksa tautan</Button>
            {telegram.data.data.linked && <AppConfirmation label="Putuskan tautan Telegram" description="Putuskan tautan chat pribadi dan cabut persetujuan pengingat Telegram?" disabled={pending} onConfirm={() => void telegramAction("unlink")}/>}
            {link && <div role="status"><a href={link.deepLink} target="_blank" rel="noreferrer noopener" className="underline">Buka bot Telegram</a><p>Tautan sekali pakai berlaku sampai <time dateTime={link.expiresAt}>{new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(new Date(link.expiresAt))}</time> (maksimal 5 menit). Setelah mengirim /start, pilih Periksa tautan. Persetujuan pengingat tetap perlu diaktifkan.</p></div>}
          </>}
        </div>
        {writeError && <ApiFeedback error={writeError}/>}
        {saved && <p role="status">Pengaturan pengingat disimpan.</p>}
        {hasHistory && <div className="space-y-3"><h3 className="font-semibold">Aktivitas pengingat terbaru</h3>
          {history.isPending ? <p role="status">Memuat aktivitas…</p> : history.error ? <><ApiFeedback error={safeError(history.error)}/><Button variant="outline" onClick={() => void history.refetch()}>Muat ulang aktivitas</Button></>
            : history.data?.data.content.length ? <ul className="clinical-record-list">{history.data.data.content.map(job => <li key={job.id} className="clinical-record-row"><span>{channelName(job.channel)} · <time dateTime={job.scheduledAt}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: historyZone }).format(new Date(job.scheduledAt))}</time> ({historyZone})</span><AppStatusBadge>{jobLabel(job)}</AppStatusBadge></li>)}</ul>
              : <p className="text-sm text-muted-foreground">Belum ada aktivitas pengingat.</p>}
          <p className="text-sm text-muted-foreground">Maksimal 10 aktivitas terbaru. Status ini mencatat proses pengingat dan tidak membuktikan obat diminum.</p>
        </div>}
      </>}
  </AppSection>;
}

function channelName(channel: ReminderJob["channel"]) { return { WHATSAPP: "WhatsApp", EMAIL: "Email", TELEGRAM: "Telegram" }[channel]; }
function jobLabel(job: ReminderJob) {
  if (job.mode === "SIMULATED") {
    if (job.state === "ACCEPTED") return "Diterima oleh simulasi";
    if (job.state === "DELIVERED") return "Selesai dalam simulasi";
  }
  if (job.mode === "CLOUD_TEST") {
    if (job.state === "ACCEPTED") return "Diterima Meta, belum dikonfirmasi terkirim · uji WhatsApp";
    if (job.state === "DELIVERED") return "Terkirim, dikonfirmasi callback Meta · uji WhatsApp";
    if (job.state === "UNCERTAIN") return "Hasil belum pasti, tidak dicoba ulang otomatis · uji WhatsApp";
  }
  if (job.mode === "CHANNEL_TEST") {
    if (job.state === "ACCEPTED") return `Diterima penyedia, belum dikonfirmasi terkirim · uji ${channelName(job.channel)}`;
    if (job.state === "UNCERTAIN") return `Hasil belum pasti, tidak dicoba ulang otomatis · uji ${channelName(job.channel)}`;
  }
  const names: Record<ReminderJob["state"], string> = { SCHEDULED: "Dijadwalkan", ELIGIBLE: "Memenuhi syarat", SUPPRESSED: "Tidak diproses", DISPATCHED: "Diproses", ACCEPTED: "Diterima penyedia", DELIVERED: "Terkirim", FAILED: "Gagal", CANCELLED: "Dibatalkan", UNCERTAIN: "Hasil belum pasti" };
  return `${names[job.state]}${job.mode === "SIMULATED" ? " · simulasi" : job.mode === "CLOUD_TEST" ? " · uji WhatsApp" : job.mode === "CHANNEL_TEST" ? ` · uji ${channelName(job.channel)}` : " · pengiriman tidak tersedia"}`;
}
function ReminderForm({ value, pending, onSave }: { value: ReminderPreferences; pending: boolean; onSave: (input: ReminderInput) => Promise<void> }) {
  const [whatsapp, setWhatsapp] = useState(value.bindingCurrent && value.whatsappConsent);
  const [email, setEmail] = useState(value.emailBindingCurrent && value.emailConsent), [telegram, setTelegram] = useState(value.telegramBindingCurrent && value.telegramLinked && value.telegramConsent);
  const [zone, setZone] = useState(value.timeZone ?? ""), [from, setFrom] = useState(value.permittedFrom ?? ""), [until, setUntil] = useState(value.permittedUntil ?? "");
  const [allDay, setAllDay] = useState(value.allDay), [acknowledged, setAcknowledged] = useState(false);
  const [emailAck, setEmailAck] = useState(false), [telegramAck, setTelegramAck] = useState(false);
  const hoursValid = allDay || (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(from) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(until) && from !== until);
  const anyEnabled = whatsapp || email || telegram;
  const canSave = (!anyEnabled || (validReminderZone(zone) && hoursValid)) && (!whatsapp || (value.verifiedPhone && acknowledged)) && (!email || (value.verifiedEmail && emailAck)) && (!telegram || (value.telegramLinked && telegramAck));
  function submit(event: FormEvent) {
    event.preventDefault(); if (!canSave || pending) return;
    void onSave({ whatsappConsent: whatsapp, emailConsent: email, telegramConsent: telegram, emailRiskAcknowledged: emailAck, telegramRiskAcknowledged: telegramAck, timeZone: validReminderZone(zone) ? zone : null, permittedFrom: allDay ? null : from || null, permittedUntil: allDay ? null : until || null, allDay, policyVersion: "MEDICATION_REMINDERS_V1", riskAcknowledged: acknowledged });
  }
  const field = "grid gap-2 text-sm";
  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-muted-foreground">{value.mode === "SIMULATED" ? "Simulasi: pengingat ini tidak mengirim pesan WhatsApp. Email dan Telegram tidak dikirim dalam mode ini." : value.mode === "CLOUD_TEST" ? "Uji WhatsApp Meta terbatas: pengiriman hanya dipicu manual oleh operator. Bukan layanan produksi; tidak ada pengiriman otomatis. Email dan Telegram tidak dikirim dalam mode ini." : value.mode === "CHANNEL_TEST" ? "Uji Email dan Telegram terbatas: pengiriman hanya dipicu manual oleh operator. Bukan layanan produksi; tidak ada pengiriman otomatis. Pengiriman WhatsApp belum tersedia." : "Pengiriman WhatsApp belum tersedia. Semua pengiriman eksternal dinonaktifkan. Persetujuan tetap dapat disimpan."}</p>
    <p className="text-sm">{value.verifiedPhone ? <>Nomor terverifikasi: <span className="font-medium">{value.maskedPhone ?? "Tidak ditampilkan"}</span></> : "Nomor telepon belum terverifikasi. Verifikasi nomor akun sebelum mengaktifkan pengingat."}</p>
    {!value.bindingCurrent && <p role="status">Tautan akun atau nomor telah berubah. Berikan persetujuan baru untuk mengaktifkan kembali pengingat WhatsApp.</p>}
    <fieldset disabled={pending} className="space-y-4">
      <legend className="sr-only">Persetujuan pengingat</legend>
      <label className="flex items-center gap-2"><input type="checkbox" checked={whatsapp} disabled={!value.verifiedPhone && !whatsapp} onChange={event => { setWhatsapp(event.target.checked); setAcknowledged(false); }}/>Izinkan WhatsApp</label>
      <p className="text-sm">{value.verifiedEmail ? <>Email akun terverifikasi: <span className="font-medium">{value.maskedEmail ?? "Tidak ditampilkan"}</span></> : "Email akun belum terverifikasi. Verifikasi email akun sebelum mengaktifkan pengingat Email."}</p>
      {!value.emailAvailable && <p className="text-sm text-muted-foreground">Pengiriman Email belum tersedia.</p>}
      {!value.emailBindingCurrent && value.emailConsent && <p role="status">Email atau tautan akun telah berubah. Berikan persetujuan Email baru.</p>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={email} disabled={!value.verifiedEmail && !email} onChange={event => { setEmail(event.target.checked); setEmailAck(false); }}/>Izinkan Email</label>
      <p className="text-sm">{value.telegramLinked ? `Chat Telegram terhubung: ${value.maskedTelegram ?? "Tidak ditampilkan"}` : "Hubungkan chat pribadi Telegram sebelum mengaktifkan pengingat Telegram."}</p>
      {!value.telegramAvailable && <p className="text-sm text-muted-foreground">Pengiriman Telegram belum tersedia.</p>}
      {!value.telegramBindingCurrent && value.telegramConsent && <p role="status">Tautan Telegram telah berubah. Berikan persetujuan Telegram baru.</p>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={telegram} disabled={!value.telegramLinked && !telegram} onChange={event => { setTelegram(event.target.checked); setTelegramAck(false); }}/>Izinkan Telegram</label>
      <label className={field}>Zona waktu (IANA)<Input value={zone} placeholder="Asia/Jakarta" autoComplete="off" onChange={event => setZone(event.target.value)}/></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={allDay} onChange={event => setAllDay(event.target.checked)}/>Izinkan sepanjang hari</label>
      {!allDay && <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Mulai<Input type="time" value={from} onChange={event => setFrom(event.target.value)}/></label><label className={field}>Sampai<Input type="time" value={until} onChange={event => setUntil(event.target.value)}/></label></div>}
      <p className="text-sm text-muted-foreground">Jam mengikuti zona waktu yang dipilih. Rentang melewati tengah malam diperbolehkan; jam mulai dan sampai harus berbeda.</p>
      {anyEnabled && (!validReminderZone(zone) || !hoursValid) && <p className="text-sm" role="status">Pilih zona waktu IANA yang valid dan jam yang diizinkan.</p>}
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/><span>Saya memahami bahwa nama TBCall pada pesan atau notifikasi dapat mengungkapkan kaitan saya dengan TBC kepada orang yang melihat telepon, dan saya menyetujui risiko ini untuk pengingat WhatsApp.</span></label>
      {email && <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={emailAck} onChange={event => setEmailAck(event.target.checked)}/><span>Saya memahami bahwa nama TBCall pada email atau notifikasi dapat mengungkapkan kaitan saya dengan TBC kepada penyedia email dan orang yang melihat akun atau perangkat saya, dan saya menyetujui risiko ini untuk pengingat Email.</span></label>}
      {telegram && <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={telegramAck} onChange={event => setTelegramAck(event.target.checked)}/><span>Saya memahami bahwa nama TBCall pada pesan bot atau notifikasi dapat mengungkapkan kaitan saya dengan TBC kepada Telegram dan orang yang melihat akun atau perangkat saya, dan saya menyetujui risiko ini untuk pengingat Telegram.</span></label>}
      <Button type="submit" disabled={pending || !canSave}>{pending ? "Menyimpan…" : "Simpan pengingat"}</Button>
    </fieldset>
  </form>;
}
