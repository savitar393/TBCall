"use client";
import { useState } from "react";
import {
  CATALOG, errText, fmtDate, fmtDateTime, RequireSession, today, useLive, useLiveMutation, usePermissions,
  type PatientTreatment, type SafeFollowUp, type SafeTpt, type Page, type SafeAlert, type NotificationDetail,
  type SelfPatient, type SafeDose,
} from "./api";
import { apiRequest } from "@/lib/api/client";
import { Card, CardTitle, Chip, DemoBanner, FooterBar, GhostButton, TopNav, Field, inputClass } from "../ui";

/* ============================================================
   Portal Pasien — LIVE (terintegrasi backend via /me/*)
   ============================================================ */

const MODULES = [
  { key: "jadwal", label: "Jadwal Obat Saya" },
  { key: "kepatuhan", label: "Bukti Minum Obat" },
  { key: "tindak", label: "Tindak Lanjut" },
  { key: "tpt", label: "TPT Saya" },
  { key: "peringatan", label: "Peringatan & Notifikasi" },
  { key: "profil", label: "Data Saya" },
] as const;

export function PortalPasienLive() {
  return (
    <RequireSession anyPermission={["PATIENT_READ", "TREATMENT_READ", "ADHERENCE_RECORD"]}>
      {() => <PortalInner />}
    </RequireSession>
  );
}

function PortalInner() {
  const [active, setActive] = useState("jadwal");
  const { can } = usePermissions();
  const self = useLive<SelfPatient>(["me", "patient"], can("PATIENT_READ") ? "/v1/me/patient" : null);
  const treatment = useLive<PatientTreatment>(["me", "treatment"], can("TREATMENT_READ") ? "/v1/me/treatment" : null);
  const name = self.data?.fullName ?? "Pasien TB";
  const statusChip = treatment.data?.status
    ? <Chip tone={treatment.data.status === "ACTIVE" ? "green" : "amber"}>Pengobatan {treatment.data.status}</Chip>
    : <Chip tone="gray">Belum ada episode pengobatan aktif</Chip>;

  return (
    <div className="min-h-dvh bg-[#F3F4FB]">
      <TopNav modules={MODULES} active={active} onSelect={setActive} userName={name} userRole="Portal Pasien · sesi terverifikasi" notif />
      <main id="main-content" className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-2xl border border-[#e4e8f4] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-[#0B5A2A] text-3xl text-white" aria-hidden="true">🛡️</span>
              <div>
                <h1 className="text-2xl font-extrabold text-[#123524]">Halo, {name} 👋</h1>
                <p className="mt-1 text-sm text-[#5b6478]">
                  {treatment.data ? `${treatment.data.regimen?.name ?? "Regimen"} · mulai ${fmtDate(treatment.data.startDate)}` : "Data pengobatan akan muncul setelah petugas memulai episode."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">{statusChip}
              <Chip tone="blue">Sumber data: backend TBCall</Chip>
            </div>
          </div>
        </section>
        {renderModule(active, self, treatment)}
      </main>
      <FooterBar left="© 2025 Dinas Kesehatan Provinsi Jawa Tengah." right="TB Call · Portal Pasien · data live dari backend" />
    </div>
  );
}

type SelfQ = ReturnType<typeof useLive<SelfPatient>>;
type TreatQ = ReturnType<typeof useLive<PatientTreatment>>;

function renderModule(mod: string, self: SelfQ, treatment: TreatQ) {
  if (mod === "kepatuhan") return <Kepatuhan />;
  if (mod === "tindak") return <TindakLanjutSaya />;
  if (mod === "tpt") return <TptSaya />;
  if (mod === "peringatan") return <PeringatanNotifikasi />;
  if (mod === "profil") return <ProfilSaya self={self} />;
  return <JadwalObat treatment={treatment} />;
}

/* ---------- Jadwal & pengobatan ---------- */

function JadwalObat({ treatment }: { treatment: TreatQ }) {
  const t = treatment.data;
  const catat = useLiveMutation<{ scheduledDate: string; status: string; administrationMode?: string }, unknown>((input) =>
    apiReq("/v1/me/treatment/dose-events", "POST", input), [["me", "treatment"], ["me", "doses"]]);
  const [tanggal, setTanggal] = useState(today());
  const [status, setStatus] = useState("TAKEN");
  const [mode, setMode] = useState("MANDIRI");


  if (treatment.isLoading) return <Card><p role="status" className="text-sm text-[#5b6478]">Memuat pengobatan Anda…</p></Card>;
  if (treatment.error) return <Card><p role="alert" className="text-sm text-[#b42318]">{errText(treatment.error).detail}</p></Card>;
  if (!t) return <EmptyTreatment />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardTitle sub={`Regimen ${t.regimen?.name ?? "—"} · mulai ${fmtDate(t.startDate)}${t.plannedEndDate ? ` · rencana akhir ${fmtDate(t.plannedEndDate)}` : ""}`} right={<Chip tone={t.status === "ACTIVE" ? "green" : "amber"}>{t.status}</Chip>}>
            Obat Anda saat ini
          </CardTitle>
          {t.drugs.length ? (
            <ul className="space-y-3">
              {t.drugs.map((d, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F3F4FB] px-4 py-3 text-sm">
                  <strong className="text-[#123524]">{d.drugName ?? "Obat"}{d.treatmentPhase ? ` · fase ${d.treatmentPhase}` : ""}</strong>
                  <span className="text-[#5b6478]">{[d.doseValue != null ? `${d.doseValue} ${d.doseUnit ?? ""}` : null, d.frequencyPerWeek ? `${d.frequencyPerWeek}×/pekan` : null].filter(Boolean).join(" · ") || "dosis sesuai petunjuk PMO"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#5b6478]">Belum ada baris obat tercatat.</p>}
          <p className="mt-4 text-xs leading-relaxed text-[#8a90a5]">Jangan mengubah obat/dosis sendiri. Hubungi PMO atau faskes bila jadwal perlu disesuaikan.</p>
        </Card>

        <Card>
          <CardTitle sub="Catatan tersimpan langsung di backend TBCall sebagai bukti kepatuhan (append-only).">Catat minum obat hari ini</CardTitle>
          <form className="grid gap-5 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); catat.mutate({ scheduledDate: tanggal, status, administrationMode: mode }); }}>
            <Field label="Tanggal"><input type="date" max={today()} value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputClass} /></Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                {CATALOG.doseStatus.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Mode pengambilan">
              <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
                <option value="MANDIRI">Mandiri</option><option value="DOT">Diawasi (DOT)</option>
              </select>
            </Field>
            <div className="sm:col-span-3 space-y-3">
              {catat.localError && <p role="alert" className="rounded-xl bg-[#FDE3E1] px-4 py-3 text-sm text-[#b42318]">{errText(catat.localError).detail}</p>}
              {catat.isSuccess && <p role="status" className="rounded-xl bg-[#E7F7EA] px-4 py-3 text-sm font-semibold text-[#0B5A2A]">✓ Dosis tercatat di backend ({fmtDate(tanggal)}).</p>}
              <button type="submit" disabled={catat.isPending} className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0B5A2A] px-6 text-sm font-bold text-white transition hover:bg-[#0e6b35] disabled:opacity-60">{catat.isPending ? "Menyimpan…" : "Simpan catatan dosis"}</button>
            </div>
          </form>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardTitle>Dosis terakhir tercatat</CardTitle>
          {t.recentDoseEvents.length ? (
            <ul className="space-y-3 text-sm">
              {t.recentDoseEvents.slice(0, 8).map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-xl bg-[#F3F4FB] px-4 py-3">
                  <span><strong className="text-[#123524]">{fmtDate(d.scheduledDate)}</strong><span className="block text-xs text-[#8a90a5]">{d.source === "PATIENT_SELF" ? "dicatat mandiri" : d.source.toLowerCase()}</span></span>
                  <Chip tone={d.status === "TAKEN" ? "green" : "red"}>{d.status}</Chip>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#5b6478]">Belum ada catatan dosis.</p>}
        </Card>
        {t.adverseEvents.length > 0 && (
          <Card>
            <CardTitle>Efek samping tercatat petugas</CardTitle>
            <ul className="space-y-2 text-sm">
              {t.adverseEvents.map((a, i) => (
                <li key={i} className="rounded-xl bg-[#FDEBD3] px-4 py-3"><strong className="text-[#8a5a12]">{a.eventType}</strong><span className="block text-xs text-[#8a5a12]/80">{a.severity ?? "tingkat tidak dicatat"} · {fmtDate(a.reportedAt)}</span></li>
              ))}
            </ul>
          </Card>
        )}
        <div className="rounded-2xl bg-[#FDE3E1] p-5 text-sm leading-relaxed text-[#b42318]">
          <p className="font-bold">Darurat medis?</p>
          <p className="mt-1.5">Sesak berat, batuk darah banyak, atau pingsan — segera hubungi 119 atau ke IGD terdekat.</p>
        </div>
      </div>
    </div>
  );
}

function EmptyTreatment() {
  return (
    <div className="space-y-6">
      <DemoBanner title="Belum ada episode pengobatan aktif">Episode pengobatan dibuat oleh petugas TBC faskes Anda setelah kasus dikonfirmasi. Setelah aktif, jadwal obat dan pencatatan kepatuhan akan muncul di sini.</DemoBanner>
      <Card><CardTitle>Apa yang bisa Anda lakukan?</CardTitle>
        <ul className="list-disc space-y-2 pl-5 text-sm text-[#5b6478]">
          <li>Hubungi PMO / petugas faskes untuk memastikan registrasi dan kasus Anda telah dikonfirmasi.</li>
          <li>Periksa tab &quot;Peringatan &amp; Notifikasi&quot; untuk pesan dari sistem.</li>
        </ul>
      </Card>
    </div>
  );
}

/* ---------- Bukti minum obat (riwayat) ---------- */

function Kepatuhan() {
  const doses = useLive<Page<SafeDose>>(["me", "doses"], "/v1/me/treatment/dose-events?page=0&size=100");
  const byDate = new Map<string, { taken: number; missed: number }>();
  for (const d of doses.data?.content ?? []) {
    const e = byDate.get(d.scheduledDate) ?? { taken: 0, missed: 0 };
    if (d.status === "TAKEN") e.taken += 1; else e.missed += 1;
    byDate.set(d.scheduledDate, e);
  }
  const last7Dates = useState(() => {
    const now = Date.now();
    return Array.from({ length: 7 }, (_, i) => new Date(now - (6 - i) * 86400000 + 7 * 3600 * 1000).toISOString().slice(0, 10));
  })[0];
  const last7 = last7Dates.map((d) => ({ date: d, ...(byDate.get(d) ?? { taken: 0, missed: 0 }) }));
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle sub="Data langsung dari catatan kepatuhan backend (append-only, tanpa skor otomatis).">Riwayat 7 hari terakhir</CardTitle>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
          {last7.map((d) => (
            <div key={d.date} className={`rounded-xl py-4 text-center ${d.taken ? "bg-[#E7F7EA]" : d.missed ? "bg-[#FDE3E1]" : "bg-[#F3F4FB]"}`}>
              <p className="text-[11px] font-bold text-[#5b6478]">{fmtDate(d.date).replace(" 2025", "").replace(" 2026", "")}</p>
              <p className={`mt-1 text-sm font-extrabold ${d.taken ? "text-[#0B5A2A]" : d.missed ? "text-[#b42318]" : "text-[#8a90a5]"}`}>{d.taken ? `${d.taken}✓` : d.missed ? `${d.missed}✗` : "—"}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardTitle right={<Chip tone="gray">{doses.data?.totalElements ?? 0} catatan</Chip>}>Semua catatan dosis</CardTitle>
        {doses.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
          : doses.data?.content.length ? (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-[#EEF0FA] text-left"><th className="rounded-l-lg px-4 py-3 font-semibold text-[#3f4660]">Tanggal</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Status</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Mode</th><th className="rounded-r-lg px-4 py-3 font-semibold text-[#3f4660]">Sumber</th></tr></thead>
              <tbody className="divide-y">{doses.data.content.map((d) => (
                <tr key={d.id}><td className="px-4 py-3 font-semibold text-[#123524]">{fmtDate(d.scheduledDate)}</td><td className="px-4 py-3"><Chip tone={d.status === "TAKEN" ? "green" : "red"}>{d.status}</Chip></td><td className="px-4 py-3 text-[#5b6478]">{d.administrationMode ?? "—"}</td><td className="px-4 py-3 text-[#5b6478]">{d.source}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="text-sm text-[#5b6478]">Belum ada catatan. Mulai dari tab &quot;Jadwal Obat Saya&quot;.</p>}
      </Card>
    </div>
  );
}

/* ---------- Tindak lanjut ---------- */

function TindakLanjutSaya() {
  const follows = useLive<SafeFollowUp[]>(["me", "followups"], "/v1/me/follow-ups");
  return (
    <Card>
      <CardTitle sub="Jadwal kontrol yang dibuat petugas untuk pengobatan Anda.">Tindak lanjut saya</CardTitle>
      {follows.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
        : follows.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(follows.error).detail}</p>
        : follows.data?.length ? (
          <ul className="space-y-3">
            {follows.data.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F3F4FB] px-4 py-3 text-sm">
                <span><strong className="text-[#123524]">{f.followUpType}</strong><span className="block text-xs text-[#8a90a5]">{fmtDateTime(f.scheduledAt)}{f.facility ? ` · ${f.facility.name}` : ""}</span></span>
                <Chip tone={f.completedAt ? "green" : f.status === "SCHEDULED" ? "blue" : "amber"}>{f.completedAt ? `Selesai ${fmtDate(f.completedAt)}` : f.status}</Chip>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-[#5b6478]">Belum ada jadwal tindak lanjut.</p>}
    </Card>
  );
}

/* ---------- TPT ---------- */

function TptSaya() {
  const tpt = useLive<SafeTpt>(["me", "tpt"], "/v1/me/tpt");
  return (
    <Card>
      <CardTitle sub="TPT adalah terapi pencegahan; kelayakan ditentukan tenaga kesehatan.">TPT saya</CardTitle>
      {tpt.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
        : tpt.data ? (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[["Status", tpt.data.status], ["Regimen", tpt.data.regimenDisplay ?? "—"], ["Mulai", fmtDate(tpt.data.startDate)], ["Rencana akhir", fmtDate(tpt.data.plannedEndDate)], ["Durasi", tpt.data.durationValue ? `${tpt.data.durationValue} ${tpt.data.durationUnit ?? ""}` : "—"], ["Fasilitas", tpt.data.facility?.name ?? "—"]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><dt className="text-xs font-semibold text-[#5b6478]">{k}</dt><dd className="mt-1 font-bold text-[#123524]">{v}</dd></div>
            ))}
          </dl>
        ) : <div className="flex items-start gap-3 rounded-xl bg-[#E7F7EA] px-4 py-4 text-sm text-[#1f7a3f]"><span>🛡</span><p><strong className="text-[#0B5A2A]">Belum ada data TPT untuk Anda</strong><br />TPT bukan pengganti pengobatan TB aktif. Kelayakan ditentukan oleh tenaga kesehatan.</p></div>}
    </Card>
  );
}

/* ---------- Peringatan & notifikasi ---------- */

function PeringatanNotifikasi() {
  const alerts = useLive<Page<SafeAlert>>(["me", "alerts"], "/v1/me/alerts?page=0&size=10");
  const notifs = useLive<Page<NotificationDetail>>(["me", "notifs"], "/v1/me/notifications?page=0&size=10");
  const ack = useLiveMutation<string, SafeAlert>((id) => apiReq(`/v1/me/alerts/${id}/acknowledge`, "POST", {}), [["me", "alerts"]]);
  const read = useLiveMutation<{ id: string; version: number }, NotificationDetail>(({ id, version }) => apiReq(`/v1/me/notifications/${id}/read`, "POST", {}, `"${version}"`), [["me", "notifs"]]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle sub="Peringatan tindak lanjut yang ditujukan kepada Anda.">Peringatan</CardTitle>
        {alerts.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
          : alerts.data?.content.length ? (
            <ul className="space-y-3">
              {alerts.data.content.map((a) => (
                <li key={a.id} className={`rounded-xl px-4 py-3 text-sm ${a.acknowledged ? "bg-[#F3F4FB]" : "bg-[#FDEBD3]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className={a.acknowledged ? "text-[#123524]" : "text-[#8a5a12]"}>{a.alertType}</strong>
                    <Chip tone={a.severity === "HIGH" ? "red" : "amber"}>{a.severity}</Chip>
                  </div>
                  <p className="mt-1 text-[#5b6478]">{a.message}</p>
                  <p className="mt-1 text-xs text-[#8a90a5]">{fmtDateTime(a.triggeredAt)}{a.dueAt ? ` · tenggat ${fmtDateTime(a.dueAt)}` : ""}</p>
                  {!a.acknowledged && <GhostButton className="mt-2 !min-h-10 !px-4 text-xs" onClick={() => ack.mutate(a.id)}>Tandai diketahui</GhostButton>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#5b6478]">Tidak ada peringatan aktif.</p>}
        {ack.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(ack.localError).detail}</p>}
      </Card>
      <Card>
        <CardTitle sub="Notifikasi IN_APP dari sistem (Phase 4C).">Notifikasi</CardTitle>
        {notifs.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
          : notifs.data?.content.length ? (
            <ul className="space-y-3">
              {notifs.data.content.map((n) => (
                <li key={n.id} className="rounded-xl bg-[#F3F4FB] px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[#123524]">{n.alertType ?? "Notifikasi"}</strong>
                    <Chip tone={n.readAt ? "gray" : "blue"}>{n.readAt ? "Sudah dibaca" : "Baru"}</Chip>
                  </div>
                  <p className="mt-1 text-xs text-[#8a90a5]">{n.channel} · {fmtDateTime(n.deliveredAt ?? n.scheduledAt)}</p>
                  {!n.readAt && <GhostButton className="mt-2 !min-h-10 !px-4 text-xs" onClick={() => read.mutate({ id: n.id, version: n.version })}>Tandai dibaca</GhostButton>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#5b6478]">Belum ada notifikasi.</p>}
        {read.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(read.localError).detail}</p>}
      </Card>
    </div>
  );
}

/* ---------- Profil ---------- */

function ProfilSaya({ self }: { self: SelfQ }) {
  const s = self.data;
  return (
    <Card>
      <CardTitle sub="Data diri sesuai proyeksi SELF — NIK/BPJS tidak ditampilkan pada portal.">Data saya</CardTitle>
      {self.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
        : s ? (
          <>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {[["Nama", s.fullName], ["Jenis kelamin", s.sex?.name ?? "—"], ["Tempat lahir", s.birthPlace ?? "—"], ["Tanggal lahir", s.birthDateUnknown ? "Tidak diketahui" : fmtDate(s.birthDate)], ["Telepon", s.phone ?? "—"], ["Alamat", s.address ?? "—"]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><dt className="text-xs font-semibold text-[#5b6478]">{k}</dt><dd className="mt-1 font-bold text-[#123524]">{v}</dd></div>
              ))}
            </dl>
            <h3 className="mt-6 font-bold text-[#123524]">Registrasi &amp; kasus</h3>
            <ul className="mt-3 space-y-3 text-sm">
              {s.registrations.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl bg-[#EEF0FA] px-4 py-3"><span>Registrasi {fmtDate(r.registrationDate)} · {r.facility.name}</span><Chip tone={r.status === "OPEN" ? "amber" : "blue"}>{r.status}</Chip></li>
              ))}
              {s.cases.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-xl bg-[#E7F7EA] px-4 py-3"><span>Kasus · {c.caseCategory?.name ?? "—"} · {c.currentFacility.name}</span><Chip tone="green">{c.status}</Chip></li>
              ))}
            </ul>
          </>
        ) : self.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(self.error).detail}</p>
        : <p className="text-sm text-[#5b6478]">Belum ada data pasien tertaut ke akun ini. Hubungi petugas faskes untuk pengaitan akun.</p>}
    </Card>
  );
}

/* ---------- helper request ---------- */

async function apiReq<T>(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, etag?: string) {
  return apiRequest<T>(path, { method, body, etag });
}
