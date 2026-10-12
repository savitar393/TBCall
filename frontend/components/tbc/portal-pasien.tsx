"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, CardTitle, Chip, GhostButton, PrimaryButton, WorkspacePage } from "@/components/tbc/ui";

/* ============================================================
   Portal Pasien (mockup: Beranda Native, Kontak & TPT, Chat,
   Lab Dahak, Lapor Efek Samping, Panduan PMO)
   ============================================================ */

const MODULES = [
  { key: "jadwal", label: "Jadwal Obat Saya" },
  { key: "gejala", label: "Lapor Gejala & Efek" },
  { key: "kontak", label: "Kontak & TPT" },
  { key: "lab", label: "Lab Dahak & Catatan" },
  { key: "pmo", label: "Panduan PMO" },
  { key: "chat", label: "Chat Faskes" },
] as const;

export function PortalPasien() {
  return (
    <WorkspacePage
      modules={MODULES} userName="Prabowo Gunawan" userRole="Pasien TB Sensitif Obat (Bulan Ke-2)"
      facility="Puskemas Candilama, Kota Semarang" facilitySub="Fasilitas pengobatan Anda · Data demo" facilityTag="Data demo" roleTag="Pasien" notif
      footerLeft="© 2025 Dinas Kesehatan Provinsi Jawa Tengah." footerRight="TB Call · Portal Pasien · Data demo"
      renderModule={(mod) => <PortalModule mod={mod} />}
    />
  );
}

function PortalModule({ mod }: { mod: string }) {
  if (mod === "gejala") return <LaporGejala />;
  if (mod === "kontak") return <KontakTPT />;
  if (mod === "lab") return <LabDahak />;
  if (mod === "pmo") return <PanduanPMO />;
  if (mod === "chat") return <ChatFaskes />;
  return <JadwalObat />;
}

/* ---------- Modul 1: Jadwal Minum OAT (mockup Beranda Native) ---------- */

function JadwalObat() {
  const [minumSiang, setMinumSiang] = useState(false);
  return (
    <>
      {/* notifikasi aman phase 4C */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FDEBD3] px-5 py-4" role="status">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f7dcb4] text-[#8a5a12]" aria-hidden="true">🔔</span>
          <div>
            <p className="text-sm"><span className="rounded-full bg-[#f7dcb4] px-2 py-0.5 text-[11px] font-bold text-[#8a5a12]">PEMBERITAHUAN AMAN PHASE 4C</span> <strong className="font-bold text-[#8a5a12]">Mendekati Batas Waktu Minum OAT Siang</strong></p>
            <p className="mt-1 text-sm text-[#8a5a12]/90">Dosis Vitamin B6 terjadwal sebelum 14:00 WIB. Segera konfirmasi untuk menjaga skor kepatuhan 100%.</p>
          </div>
        </div>
        <button type="button" aria-label="Tutup notifikasi" className="text-[#8a5a12]">✕</button>
      </div>

      {/* sapaan + status */}
      <section className="rounded-2xl border border-[#e4e8f4] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-[#0B5A2A] text-3xl text-white" aria-hidden="true">🛡️</span>
            <div>
              <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-[#123524]">Halo, Prabowo 👋 <Chip>Terhubung SITB Jawa Tengah</Chip></h1>
              <p className="mt-1 text-sm text-[#5b6478]">Fase Intensif 4KDT (Hari 48 / 180) · Kasus ID: TBC-2025-SMG-0891</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { t: "KEPATUHAN", v: "100% Streak (48h)", i: "🎯" },
              { t: "TCM DAHAK KE-2", v: "18 Nov 2025", i: "🔬" },
              { t: "WA BOT NOTIF", v: "Aktif (0812-4819-xx)", i: "💬" },
            ].map((s) => (
              <div key={s.t} className="flex items-center gap-3 rounded-xl bg-[#E7F7EA] px-4 py-3">
                <span className="text-xl" aria-hidden="true">{s.i}</span>
                <div><p className="text-[10px] font-bold tracking-wide text-[#1f7a3f]">{s.t}</p><p className="text-sm font-extrabold text-[#0B5A2A]">{s.v}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          {/* kartu dosis */}
          <div className="grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border-t-4 border-[#1B7A3E] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><Chip>PAGI · 06:30</Chip><span className="flex size-7 items-center justify-center rounded-full bg-[#DCF2DF] text-sm text-[#0B5A2A]" aria-label="Sudah terverifikasi">✓</span></div>
              <h3 className="mt-3 font-bold text-[#123524]">Rifampisin + INH</h3>
              <p className="mt-1 text-sm text-[#5b6478]">450mg / 300mg · 1 Kapsul Merah</p>
              <p className="mt-3 rounded-lg bg-[#EEF0FA] px-3 py-2 text-xs font-medium text-[#3f4660]">🕐 Diminum: 06:42 WIB</p>
              <GhostButton className="mt-4 w-full" disabled>✓ Telah Terverifikasi</GhostButton>
            </article>
            <article className="rounded-2xl border-t-4 border-[#f2a33c] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><Chip tone="amber">SIANG · 12:30</Chip><span aria-hidden="true" className="text-lg">⏳</span></div>
              <h3 className="mt-3 font-bold text-[#123524]">Vitamin B6 (Piridoksin)</h3>
              <p className="mt-1 text-sm text-[#5b6478]">50mg · 1 Tablet Putih Kecil</p>
              <p className="mt-3 rounded-lg bg-[#FDEBD3] px-3 py-2 text-xs font-medium text-[#8a5a12]">⚠ Jeda toleransi: 90 menit lagi</p>
              <button type="button" onClick={() => setMinumSiang(true)} disabled={minumSiang}
                className={`mt-4 min-h-12 w-full rounded-full text-sm font-bold text-white transition ${minumSiang ? "bg-[#1B7A3E]" : "bg-[#123524] hover:bg-[#1d4a33]"}`}>
                {minumSiang ? "✓ Tercatat — Terima kasih!" : "✓ Minum Sekarang"}
              </button>
            </article>
            <article className="rounded-2xl border-t-4 border-[#9aa1b5] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><Chip tone="gray">MALAM · 20:00</Chip><span aria-hidden="true" className="text-lg">🔒</span></div>
              <h3 className="mt-3 font-bold text-[#123524]">Pirazinamid & EMB</h3>
              <p className="mt-1 text-sm text-[#5b6478]">500mg / 400mg · 2 Kaplet</p>
              <p className="mt-3 rounded-lg bg-[#EEF0FA] px-3 py-2 text-xs font-medium text-[#3f4660]">🌙 Tersedia pukul 20:00 WIB</p>
              <GhostButton className="mt-4 w-full" disabled>⏳ Belum Waktunya</GhostButton>
            </article>
          </div>

          {/* tren kepatuhan */}
          <Card>
            <CardTitle sub="Sinkron otomatis dengan pencatatan PMO Faskes Puskemas Candilama" right={<Chip>Phase 3B Validated</Chip>}>Tren Kepatuhan 7 Hari Terakhir</CardTitle>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
              {[["SEN", "3/3"], ["SEL", "3/3"], ["RAB", "3/3"], ["KAM", "3/3"], ["JUM", "3/3"], ["SAB", "3/3"]].map(([d, v]) => (
                <div key={d} className="rounded-xl bg-[#F3F4FB] py-4 text-center">
                  <p className="text-[11px] font-bold tracking-wide text-[#5b6478]">{d}</p>
                  <span className="mx-auto mt-2 flex size-9 items-center justify-center rounded-full bg-[#1B7A3E] text-sm text-white" aria-label={`${d}: lengkap ${v}`}>✓</span>
                  <p className="mt-2 text-xs font-semibold text-[#123524]">{v}</p>
                </div>
              ))}
              <div className="rounded-xl border-2 border-[#1B7A3E] bg-[#E7F7EA] py-4 text-center">
                <p className="text-[11px] font-bold tracking-wide text-[#0B5A2A]">HARI INI</p>
                <span className="mx-auto mt-2 flex size-9 items-center justify-center rounded-full border-2 border-[#1B7A3E] text-sm font-bold text-[#0B5A2A]">1/3</span>
                <p className="mt-2 text-xs font-semibold text-[#0B5A2A]">1 Aktif</p>
              </div>
            </div>
          </Card>
        </div>

        {/* kolom kanan */}
        <div className="space-y-6">
          <Card>
            <CardTitle right={<Chip>Paskes Aktif</Chip>}>PENGAWAS MENELAN OBAT (PMO)</CardTitle>
            <div className="flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-full bg-[#E9F8EC] text-2xl" aria-hidden="true">👩‍⚕️</span>
              <div><p className="font-bold text-[#123524]">Ns. Siti Rahayu, S.Kep</p><p className="text-sm text-[#5b6478]">Perawat Koordinator TB Puskemas</p><p className="text-xs font-semibold text-[#123524]">Puskemas Candilama, Kota Semarang</p></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <PrimaryButton className="!px-3 text-sm">💬 Chat WA</PrimaryButton>
              <GhostButton className="!px-3 text-sm">📞 Telepon</GhostButton>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-[#EEF0FA] px-4 py-3 text-sm">
              <span className="font-medium text-[#3f4660]">📅 Kunjungan Rumah / Faskes<br /><strong className="font-bold text-[#123524]">Kamis, 14 Nov 2025</strong></span>
              <span className="font-bold text-[#123524]">09:00 WIB</span>
            </div>
          </Card>
          <div className="flex items-center gap-4 rounded-2xl bg-[#FDE3E1] p-5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#b42318] text-xl text-white" aria-hidden="true">✱</span>
            <div className="min-w-0 flex-1"><p className="font-bold text-[#b42318]">Batuk Darah Masif / Sesak?</p><p className="text-xs text-[#b42318]/90">Bantuan Cepat Darurat Jateng</p></div>
            <a href="tel:119" className="shrink-0 rounded-full bg-[#b42318] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#9c1d13]">Call 119 (ext 8)</a>
          </div>
          <Card>
            <CardTitle>💡 Tips Pengobatan TBC</CardTitle>
            <p className="text-sm leading-relaxed text-[#5b6478]">Air seni berwarna kemerahan adalah tanda normal penguraian Rifampicin dalam tubuh. Jangan menghentikan obat sebelum konsultasi dokter!</p>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ---------- Modul 2: Lapor Gejala & Efek Samping ---------- */

function LaporGejala() {
  const [terkirim, setTerkirim] = useState(false);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardTitle sub="Laporkan keluhan hari ini. Petugas faskes akan meninjau laporan Anda.">Lapor Gejala &amp; Efek Samping</CardTitle>
        {terkirim ? (
          <div role="status" className="rounded-2xl bg-[#E7F7EA] p-6 text-center">
            <p className="text-2xl" aria-hidden="true">✅</p>
            <p className="mt-2 font-bold text-[#0B5A2A]">Laporan contoh terkirim (simulasi)</p>
            <p className="mt-1 text-sm text-[#1f7a3f]">Petugas akan meninjau pada jam layanan. Untuk kondisi darurat, gunakan tombol darurat di samping.</p>
            <GhostButton className="mt-4" onClick={() => setTerkirim(false)}>Buat laporan lain</GhostButton>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setTerkirim(true); }}>
            <fieldset>
              <legend className="text-sm font-semibold text-[#123524]">Gejala yang dirasakan <span className="font-normal text-[#8a90a5]">(pilih semua yang sesuai)</span></legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {["Batuk ≥ 2 minggu", "Demam / keringat malam", "Nafsu makan turun", "Berat badan turun", "Mual / muntah", "Nyeri sendi / otot", "Pandangan kabur", "Air seni kemerahan", "Pusing berat", "Mati rasa / kesemutan"].map((g) => (
                  <label key={g} className="flex min-h-12 items-center gap-3 rounded-xl bg-[#F3F4FB] px-4 text-sm font-medium text-[#3f4660]">
                    <input type="checkbox" className="size-4" />{g}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="text-sm font-semibold text-[#123524]">Catatan tambahan</span>
              <textarea className="mt-2 min-h-28 w-full rounded-xl border border-[#d8dcea] px-4 py-3 text-sm outline-none focus:border-[#1B7A3E] focus:ring-2 focus:ring-[#1B7A3E]/25" placeholder="Jelaskan keluhan Anda, sejak kapan, dan seberapa berat…" />
            </label>
            <div className="flex items-start gap-3 rounded-xl bg-[#FDE3E1] px-4 py-3.5">
              <span aria-hidden="true" className="text-lg">🚨</span>
              <p className="text-sm leading-relaxed text-[#b42318]"><strong className="font-bold">Darurat?</strong> Sesak napas berat, batuk darah banyak, atau pingsan — jangan menunggu balasan, segera <a href="tel:119" className="font-bold underline">hubungi 119</a> atau ke IGD terdekat.</p>
            </div>
            <PrimaryButton type="submit">Kirim laporan</PrimaryButton>
          </form>
        )}
      </Card>
      <div className="space-y-6">
        <Card>
          <CardTitle>Riwayat laporan</CardTitle>
          <ul className="space-y-3 text-sm">
            {[["Hari ini", "Mual ringan setelah minum obat", "amber"], ["3 hari lalu", "Nyeri sendi ringan", "amber"], ["1 minggu lalu", "Tidak ada keluhan", "green"]].map(([w, t, tone]) => (
              <li key={w} className="flex items-center justify-between rounded-xl bg-[#F3F4FB] px-4 py-3"><span><strong className="block text-[#123524]">{t}</strong><span className="text-xs text-[#8a90a5]">{w}</span></span><Chip tone={tone as "amber" | "green"}>{tone === "green" ? "Baik" : "Ditinjau"}</Chip></li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>💡 Catatan efek samping umum</CardTitle>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#5b6478]">
            <li>Air seni oranye-merah normal karena Rifampisin.</li>
            <li>Mual ringan dapat dikurangi minum obat setelah makan.</li>
            <li>Segera laporkan pandangan kabur (ETM) atau mati rasa.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Modul 3: Kontak & TPT (mockup) ---------- */

function KontakTPT() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FDEBD3] px-5 py-4" role="note">
        <p className="text-sm text-[#8a5a12]"><strong className="font-bold">Data demo</strong> · Persiapkan kunjungan berikutnya ke faskes. Lihat jadwal tindak lanjut Anda. Jika ada perubahan atau keluhan, hubungi petugas melalui kanal resmi faskes.</p>
      </div>
      <section className="rounded-2xl border border-[#e4e8f4] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-[#0B5A2A] text-2xl text-white" aria-hidden="true">🛡️</span>
            <div><h1 className="text-2xl font-extrabold text-[#123524]">Kontak &amp; TPT (4)</h1><p className="text-sm text-[#5b6478]">Pahami tindak lanjut bagi kontak serumah dan bedakan informasi TPT Anda.</p></div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[["Pengobatan", "Dalam pengobatan", "🩺"], ["Tindak lanjut", "18 Nov 2025", "📅"], ["Pemberitahuan", "Dalam aplikasi", "🔔"]].map(([t, v, i]) => (
              <div key={t} className="flex items-center gap-3 rounded-xl bg-[#E7F7EA] px-4 py-3"><span aria-hidden="true">{i}</span><div><p className="text-[10px] font-bold tracking-wide text-[#1f7a3f]">{t.toUpperCase()}</p><p className="text-sm font-extrabold text-[#0B5A2A]">{v}</p></div></div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardTitle right={<Chip>Data demo · hanya baca</Chip>}>TPT Saya</CardTitle>
            <div className="flex items-start gap-3 rounded-xl bg-[#E7F7EA] px-4 py-4">
              <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-[#0B5A2A]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z" /></svg>
              <p className="text-sm leading-relaxed text-[#1f7a3f]"><strong className="font-bold text-[#0B5A2A]">Belum ada data TPT untuk Anda</strong><br />Anda sedang menjalani pengobatan TB aktif. TPT adalah terapi pencegahan, bukan pengganti pengobatan TB aktif. Kelayakan dan pemberian TPT ditentukan oleh tenaga kesehatan.</p>
            </div>
            <p className="mt-3 text-xs text-[#8a90a5]">Pasien tidak dapat memulai, mengubah TPT, atau mencatat dosis TPT melalui portal.</p>
          </Card>
          <Card>
            <CardTitle right={<Chip tone="amber">Konsep pengembangan · 4 contoh kontak</Chip>}>Pratinjau kontak serumah</CardTitle>
            <div className="flex items-start gap-3 rounded-xl bg-[#FDEBD3] px-4 py-3.5 text-sm text-[#8a5a12]">
              <p><strong className="font-bold">Konsep pengembangan</strong><br />Belum tersedia di TB Call saat ini. Akses daftar keluarga bagi pasien belum tersedia. Empat kartu berikut sepenuhnya fiktif, bukan kontak dari kasus Anda.</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {["A", "B", "C", "D"].map((n) => (
                <div key={n} className="rounded-xl bg-[#EEF0FA] p-4">
                  <p className="flex items-center justify-between font-bold text-[#123524]"><span>👤 Anggota {n} ••••</span><Chip tone="amber">Fiktif</Chip></p>
                  <p className="mt-2 text-sm leading-relaxed text-[#5b6478]">Pratinjau anggota rumah tangga anonim. Tidak memuat hasil pemeriksaan atau status kelayakan TPT.</p>
                  <p className="mt-2 text-xs text-[#8a90a5]">Daftar keluarga belum tersedia untuk pasien</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <GhostButton disabled>Kelola kontak · belum tersedia</GhostButton>
              <p className="text-xs text-[#5b6478]">Tidak ada hasil skrining, keputusan TPT, atau data kasus lain yang dibagikan.</p>
            </div>
          </Card>
          <Card>
            <CardTitle>Apa yang dapat Anda lakukan sekarang?</CardTitle>
            <div className="flex items-start gap-4 rounded-xl bg-[#EEF0FA] p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#1B7A3E]" aria-hidden="true">👥</span>
              <div><p className="font-bold text-[#123524]">Diskusikan kontak serumah saat kunjungan</p><p className="mt-1 text-sm text-[#5b6478]">Tanyakan kepada petugas tentang pemeriksaan bagi orang yang tinggal bersama Anda. Petugas mengatur investigasi kontak dan menilai kebutuhan TPT.</p></div>
            </div>
            <p className="mt-4 text-xs text-[#8a90a5]">Jaga privasi keluarga. Jangan mengirim identitas atau hasil kesehatan orang lain melalui rancangan formulir ini.</p>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle right={<Chip>Informasi faskes</Chip>}>PENDAMPING PENGOBATAN</CardTitle>
            <div className="flex items-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-xl bg-[#E9F8EC] text-xl" aria-hidden="true">👥</span>
              <div><p className="font-bold text-[#123524]">Tim TB Puskemas</p><p className="text-sm text-[#5b6478]">Puskemas Candilama, Kota Semarang</p></div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[#5b6478]">Untuk keluhan atau perubahan jadwal, gunakan kontak resmi yang diberikan faskes saat kunjungan.</p>
            <GhostButton className="mt-4 w-full">Panduan menghubungi faskes</GhostButton>
          </Card>
          <div className="rounded-2xl bg-[#FDE3E1] p-5">
            <p className="font-bold text-[#b42318]">Keluhan berat? Jangan menunggu balasan.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#b42318]/90">Jika sesak berat, batuk darah banyak, atau kesadaran menurun, segera cari pertolongan medis di fasilitas terdekat.</p>
          </div>
          <Card>
            <CardTitle>💡 Tips Pengobatan TBC</CardTitle>
            <p className="text-sm leading-relaxed text-[#5b6478]">Ikuti petunjuk tenaga kesehatan. Jangan mengubah obat atau jadwal sendiri. Catat keluhan dan bawa daftar pertanyaan saat kunjungan.</p>
          </Card>
          <p className="flex items-start gap-2 text-xs text-[#8a90a5]">🔒 Portal menampilkan data Anda sendiri sesuai hak akses. Jaga kerahasiaan akun.</p>
        </div>
      </div>
    </>
  );
}

/* ---------- Modul 4: Lab Dahak & Catatan ---------- */

function LabDahak() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardTitle sub="Hasil pemeriksaan dahak Anda sesuai catatan faskes.">Hasil Lab Dahak &amp; Catatan</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-[#EEF0FA] text-left"><th className="rounded-l-lg px-4 py-3 font-semibold text-[#3f4660]">Pemeriksaan</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Tanggal</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Metode</th><th className="rounded-r-lg px-4 py-3 font-semibold text-[#3f4660]">Hasil</th></tr></thead>
            <tbody className="divide-y">
              {[["TCM Dahak Ke-2", "18 Nov 2025", "GeneXpert TCM", "Terdeteksi · sensitif Rifampisin", "green"], ["TCM Dahak Ke-1", "02 Okt 2025", "GeneXpert TCM", "Terdeteksi · sensitif Rifampisin", "green"], ["Dahak BTA Awal", "20 Sep 2025", "Mikroskopis", "Positif ++", "amber"]].map(([n, t, m, h, tone]) => (
                <tr key={n}><td className="px-4 py-4 font-semibold text-[#123524]">{n}</td><td className="px-4 py-4 text-[#5b6478]">{t}</td><td className="px-4 py-4 text-[#5b6478]">{m}</td><td className="px-4 py-4"><Chip tone={tone as "green" | "amber"}>{h}</Chip></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-[#8a90a5]">Data demo · interpretasi klinis selalu melalui dokter pemeriksa Anda.</p>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardTitle>Catatan PMO &amp; Kunjungan</CardTitle>
          <ul className="space-y-3 text-sm">
            {[["14 Nov 2025", "Kunjungan rumah terjadwal 09:00 WIB — Ns. Siti Rahayu."], ["02 Nov 2025", "Berat badan naik 2 kg. Kepatuhan 100%."], ["18 Okt 2025", "Evaluasi bulan ke-2 fase intensif."]].map(([t, d]) => (
              <li key={t} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><strong className="text-[#123524]">{t}</strong><p className="mt-0.5 text-[#5b6478]">{d}</p></li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>📅 Jadwal berikutnya</CardTitle>
          <p className="text-sm text-[#5b6478]">Kontrol bulanan &amp; pengambilan obat</p>
          <p className="mt-2 text-xl font-extrabold text-[#0B5A2A]">Kamis, 14 Nov 2025 · 09:00 WIB</p>
          <p className="mt-2 text-sm text-[#5b6478]">Puskemas Candilama, Kota Semarang</p>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Modul 5: Panduan PMO ---------- */

function PanduanPMO() {
  const panduan = [
    { t: "Sebelum minum obat", i: "🌅", p: ["Cuci tangan dengan sabun.", "Siapkan segelas air putih.", "Periksa nama obat dan dosis sesuai kartu pengobatan."] },
    { t: "Saat minum obat", i: "💊", p: ["Telan seluruh tablet dengan air, jangan diunyah.", "Minum obat pada jam yang sama setiap hari.", "Biarkan PMO menyaksikan (DOT) bila diatur faskes."] },
    { t: "Setelah minum obat", i: "✅", p: ["Catat di kartu pengobatan / konfirmasi di portal.", "Perhatikan efek samping dan laporkan bila muncul.", "Simpan obat di tempat sejuk dan terhindar dari anak."] },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        {panduan.map((s) => (
          <Card key={s.t}>
            <CardTitle>{s.i} {s.t}</CardTitle>
            <ol className="space-y-3">
              {s.p.map((p, i) => (
                <li key={p} className="flex items-start gap-4 rounded-xl bg-[#F3F4FB] px-4 py-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0B5A2A] text-xs font-bold text-white">{i + 1}</span>
                  <span className="text-sm leading-relaxed text-[#3f4660]">{p}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <div className="space-y-6">
        <Card>
          <CardTitle>FAQ singkat</CardTitle>
          <div className="space-y-4 text-sm">
            {[["Lupa minum obat?", "Minum segera bila masih jauh dari jadwal berikutnya. Jangan minum dobel; hubungi PMO Anda."], ["Obat membuat mual?", "Minum setelah makan ringan dan laporkan lewat modul Lapor Gejala."], ["Boleh berhenti jika sudah merasa sehat?", "Tidak. Pengobatan harus tuntas sesuai durasi dari dokter untuk mencegah resistensi."]].map(([q, a]) => (
              <details key={q} className="rounded-xl bg-[#F3F4FB] p-4"><summary className="cursor-pointer font-bold text-[#123524]">{q}</summary><p className="mt-2 leading-relaxed text-[#5b6478]">{a}</p></details>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Butuh bantuan?</CardTitle>
          <p className="text-sm leading-relaxed text-[#5b6478]">Hubungi PMO Anda (Ns. Siti Rahayu) melalui WhatsApp atau telepon di kartu Pengawas di jadwal obat.</p>
          <Link href="/portal" className="mt-3 inline-block text-sm font-bold text-[#1B7A3E] hover:underline">← Kembali ke jadwal obat</Link>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Modul 6: Chat Faskes ---------- */

function ChatFaskes() {
  const [pesan, setPesan] = useState("");
  const [riwayat, setRiwayat] = useState([
    { dari: "petugas", teks: "Selamat pagi, Pak Prabowo. Kami ingatkan jadwal kontrol Kamis, 14 Nov pukul 09:00 WIB." },
    { dari: "pasien", teks: "Selamat pagi, Bu. Baik, siap. Terima kasih pengingatnya." },
    { dari: "petugas", teks: "Silakan bawa kartu pengobatan dan hasil lab terakhir ya. 🙏" },
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <Card className="!p-0">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <span className="flex size-11 items-center justify-center rounded-full bg-[#E9F8EC] text-xl" aria-hidden="true">👩‍⚕️</span>
          <div><p className="font-bold text-[#123524]">Ns. Siti Rahayu, S.Kep</p><p className="text-xs text-[#1f7a3f]">● Online · Perawat Koordinator TB</p></div>
        </div>
        <div className="space-y-4 p-6" aria-live="polite">
          {riwayat.map((p, i) => (
            <div key={i} className={`flex ${p.dari === "pasien" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-md rounded-2xl px-4 py-3 text-sm leading-relaxed ${p.dari === "pasien" ? "rounded-br-sm bg-[#0B5A2A] text-white" : "rounded-bl-sm bg-[#EEF0FA] text-[#3f4660]"}`}>{p.teks}</p>
            </div>
          ))}
        </div>
        <form className="flex gap-3 border-t p-4" onSubmit={(e) => {
          e.preventDefault();
          if (!pesan.trim()) return;
          setRiwayat((r) => [...r, { dari: "pasien", teks: pesan }, { dari: "petugas", teks: "Terima kasih! Pesan Anda diterima dan akan dibalas petugas pada jam layanan (simulasi)." }]);
          setPesan("");
        }}>
          <input aria-label="Tulis pesan" value={pesan} onChange={(e) => setPesan(e.target.value)} placeholder="Tulis pesan…" className="min-h-12 flex-1 rounded-full border border-[#d8dcea] px-5 text-sm outline-none focus:border-[#1B7A3E] focus:ring-2 focus:ring-[#1B7A3E]/25" />
          <PrimaryButton type="submit">Kirim</PrimaryButton>
        </form>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardTitle>Panduan chat</CardTitle>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#5b6478]">
            <li>Gunakan chat untuk pertanyaan non-darurat.</li>
            <li>Jangan bagikan kode verifikasi atau kata sandi.</li>
            <li>Kondisi darurat: hubungi 119 atau ke IGD terdekat.</li>
          </ul>
        </Card>
        <div className="rounded-2xl bg-[#FDE3E1] p-5">
          <p className="font-bold text-[#b42318]">Darurat medis?</p>
          <p className="mt-1.5 text-sm text-[#b42318]/90">Chat mungkin tidak segera dibalas. Untuk keadaan gawat darurat, segera cari pertolongan medis.</p>
        </div>
      </div>
    </div>
  );
}
