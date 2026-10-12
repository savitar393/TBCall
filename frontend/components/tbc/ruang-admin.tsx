"use client";
import { useState } from "react";
import { BarChart, Card, CardTitle, Chip, DemoBanner, GhostButton, PrimaryButton, SelectField, SubTabs, WorkspacePage } from "@/components/tbc/ui";

/* ============================================================
   Ruang Admin Faskes (mockup: Command Center Ringkasan/Tren/
   Kohort, Logistik OAT, Tenaga Medis, Faskes & Akun, Integrasi & Audit)
   ============================================================ */

const MODULES = [
  { key: "command", label: "Command Center" },
  { key: "logistik", label: "Logistik OAT" },
  { key: "nakes", label: "Tenaga Medis" },
  { key: "faskes", label: "Faskes & Akun" },
  { key: "integrasi", label: "Integrasi & Audit" },
] as const;

export function RuangAdmin() {
  return (
    <WorkspacePage
      modules={MODULES} userName="Admin Candilama" userRole="Admin Faskes"
      facility="Puskemas Candilama · Kota Semarang" facilitySub="Penugasan aktif · akses administratif hanya pada fasilitas yang ditugaskan"
      facilityTag="Data demo" roleTag="Admin Faskes" notif
      footerLeft="TB Call Center · Ruang administrasi" footerRight="Mockup desktop · Data demo · Bukan layanan operasional"
      renderModule={(mod) => <AdminModule mod={mod} />}
    />
  );
}

function AdminModule({ mod }: { mod: string }) {
  if (mod === "logistik") return <LogistikOAT />;
  if (mod === "nakes") return <TenagaMedis />;
  if (mod === "faskes") return <FaskesAkun />;
  if (mod === "integrasi") return <IntegrasiAudit />;
  return <CommandCenter />;
}

/* ---------- Modul 1: Command Center (Ringkasan / Tren Kasus / Kohort) ---------- */

const SUB_COMMAND = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "tren", label: "Tren Kasus" },
  { key: "kohort", label: "Kohort Pengobatan" },
] as const;

function CommandCenter() {
  const [sub, setSub] = useState("ringkasan");
  return (
    <>
      <SubTabs tabs={SUB_COMMAND} active={sub} onChange={setSub} />
      {sub === "ringkasan" && (
        <>
          <section>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">Selamat datang di ruang administrasi</h1>
            <p className="mt-2 text-[#5b6478]">Mulai dari prioritas fasilitas, lalu buka analisis yang Anda perlukan di subtab terpisah.</p>
          </section>
          <DemoBanner title="Konsep pengembangan · Data demo">Ringkasan dan analitik wilayah belum terhubung ke sumber agregat. Angka berikut hanya contoh rancangan, bukan surveilans atau hasil AI.</DemoBanner>
          <div className="grid gap-5 sm:grid-cols-3">
            {[["Fasilitas dalam konteks", "1", "Candilama · contoh penugasan aktif"], ["Prioritas administrasi", "3", "Daftar kerja demo · bukan notifikasi sistem"], ["Permintaan logistik", "2", "Menunggu telaah · konsep, data demo"]].map(([t, n, d]) => (
              <Card key={t}><p className="text-sm font-semibold text-[#3f4660]">{t}</p><p className="mt-2 text-5xl font-extrabold text-[#123524]">{n}</p><p className="mt-2 text-xs text-[#8a90a5]">{d}</p></Card>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardTitle sub={`Daftar kerja contoh · 8 Oktober 2026`}>Prioritas hari ini</CardTitle>
              <ul className="space-y-3 text-sm">
                {[["Tinjau penugasan pengguna", "Pastikan kandidat aktif, kontak terverifikasi, dan fasilitas utama sesuai.", "Penugasan Faskes →"], ["Telaah kebutuhan OAT", "Dua permintaan contoh perlu pemeriksaan jumlah dan satuan manual.", "Kebutuhan Faskes →"], ["Lengkapi profil fasilitas", "Periksa wilayah administratif dan koordinat pada draf contoh.", "Profil Faskes →"]].map(([t, d, a]) => (
                  <li key={t} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#EEF0FA] px-5 py-4">
                    <span><strong className="text-[#123524]">👥 {t}</strong><span className="block text-[#5b6478]">{d}</span></span>
                    <a href="#prioritas" className="font-bold text-[#1B7A3E] hover:underline">{a}</a>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="space-y-6">
              <Card>
                <CardTitle right={<Chip tone="green">Konteks fasilitas aktif</Chip>}>Fasilitas atau wilayah?</CardTitle>
                <p className="text-sm leading-relaxed text-[#5b6478]">Admin Faskes mengelola keanggotaan pada fasilitas yang ditugaskan. Peran ini tidak membuka direktori pasien regional.</p>
                <p className="mt-3 text-sm leading-relaxed text-[#5b6478]">Analisis Kota Semarang di Tren Kasus adalah contoh wilayah fiktif. Cakupan regional belum menjadi kewenangan atau layanan aktif.</p>
              </Card>
              <div className="rounded-2xl bg-[#EEF0FA] p-5 text-sm leading-relaxed text-[#3f4660]">
                <p className="font-bold text-[#123524]">🛡 Akses tetap terpisah</p>
                <p className="mt-1.5">Profil fasilitas, status akun global, dan integrasi memerlukan hak Admin Sistem. Tidak ada tombol beralih hak akses.</p>
              </div>
            </div>
          </div>
          <Card>
            <CardTitle>Agenda administratif</CardTitle>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[#5b6478]">Contoh agenda: konfirmasi penugasan → telaah draf fasilitas → koordinasi kebutuhan logistik. Belum ada riwayat aktivitas operasional yang dimuat.</p>
              <GhostButton>Panduan hak akses</GhostButton>
            </div>
          </Card>
        </>
      )}
      {sub === "tren" && <TrenKasus />}
      {sub === "kohort" && <KohortPengobatan />}
    </>
  );
}

function TrenKasus() {
  const [cakupan, setCakupan] = useState("Fasilitas · Puskemas Candilama");
  return (
    <>
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">Tren kasus, satu tampilan yang jelas</h1>
        <p className="mt-2 text-[#5b6478]">Bandingkan pola bulanan tanpa menumpuk peta, diagram, atau prediksi pada satu layar.</p>
      </section>
      <DemoBanner title="Konsep pengembangan · Data demo">Belum ada layanan agregat yang disetujui. Grafik dan tabel sepenuhnya fiktif; bukan angka pelaporan atau data SITB.</DemoBanner>
      <Card>
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block"><span className="text-sm font-semibold text-[#123524]">Periode demo</span><input readOnly value="1 Jan – 30 Jun 2026" aria-label="Periode demo" className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] bg-white px-4 text-sm" /></label>
          <SelectField label="Cakupan analisis" options={["Fasilitas · Puskemas Candilama", "Wilayah · Kota Semarang (konsep)"]} value={cakupan} onChange={setCakupan} />
          <label className="block"><span className="text-sm font-semibold text-[#123524]">Wilayah contoh</span><input readOnly value="Kota Semarang · konsep regional" aria-label="Wilayah contoh" className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] bg-white px-4 text-sm" /></label>
        </div>
      </Card>
      <Card>
        <CardTitle right={<Chip tone="green">Total contoh: 90 kasus</Chip>} sub="● Candilama · data demo · Satuan: kasus contoh">Kasus baru per bulan</CardTitle>
        <BarChart data={[{ label: "Jan", value: 12 }, { label: "Feb", value: 14 }, { label: "Mar", value: 13 }, { label: "Apr", value: 16 }, { label: "Mei", value: 17 }, { label: "Jun", value: 18 }]} />
        <p className="mt-4 text-xs text-[#8a90a5]">Sumber: dataset rancangan fiktif · disusun 8 Okt 2026 · tidak diperbarui otomatis.</p>
      </Card>
      <Card>
        <CardTitle>Ringkasan periode demo</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-[#EEF0FA] text-left"><th className="rounded-l-lg px-4 py-3 font-semibold text-[#3f4660]">Periode</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Kasus contoh</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Rata-rata per bulan</th><th className="rounded-r-lg px-4 py-3 font-semibold text-[#3f4660]">Keterangan</th></tr></thead>
            <tbody className="divide-y">
              {[["Jan–Mar 2026", "39", "13", "Tiga bulan pertama"], ["Apr–Jun 2026", "51", "17", "Tiga bulan berikutnya"]].map((r) => (
                <tr key={r[0]}>{r.map((c, i) => <td key={i} className="px-4 py-4 text-[#3f4660]">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-[#8a90a5]">Perbedaan angka hanya mendemonstrasikan visualisasi. Tidak digunakan untuk keputusan epidemiologi atau prediksi.</p>
      </Card>
    </>
  );
}

function KohortPengobatan() {
  return (
    <>
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">Kohort pengobatan</h1>
        <p className="mt-2 text-[#5b6478]">Ringkasan hasil pengobatan kohort contoh, terpisah dari data kasus individual.</p>
      </section>
      <DemoBanner title="Konsep pengembangan · Data demo">Rekap kohort berikut fiktif untuk menilai tata letak, bukan hasil kohort resmi.</DemoBanner>
      <div className="grid gap-5 sm:grid-cols-3">
        {[["Kohort aktif", "24", "Episode dalam pengobatan"], ["Selesai tahun ini", "31", "CURED + COMPLETED"], ["Perlu telaah", "4", "LOST_TO_FOLLOW_UP kandidat"]].map(([t, n, d]) => (
          <Card key={t}><p className="text-sm font-semibold text-[#3f4660]">{t}</p><p className="mt-2 text-5xl font-extrabold text-[#123524]">{n}</p><p className="mt-2 text-xs text-[#8a90a5]">{d}</p></Card>
        ))}
      </div>
      <Card>
        <CardTitle>Hasil akhir per kategori · contoh</CardTitle>
        <div className="space-y-4">
          {[["CURED", 22, "bg-[#1B7A3E]"], ["COMPLETED", 9, "bg-[#0B5A2A]"], ["TREATMENT_FAILED", 2, "bg-[#f2a33c]"], ["LOST_TO_FOLLOW_UP", 4, "bg-[#b42318]"], ["DIED", 1, "bg-[#9aa1b5]"]].map(([k, n, c]) => (
            <div key={k as string}>
              <div className="flex justify-between text-sm"><span className="font-semibold text-[#123524]">{k}</span><span className="font-bold text-[#123524]">{n}</span></div>
              <div className="mt-1.5 h-2.5 rounded-full bg-[#EEF0FA]"><div className={`h-2.5 rounded-full ${c}`} style={{ width: `${((n as number) / 38) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------- Modul 2: Logistik OAT (Stok & Buffer / Kebutuhan Faskes / Alokasi & Riwayat) ---------- */

const SUB_LOGISTIK = [
  { key: "stok", label: "Stok & Buffer" },
  { key: "kebutuhan", label: "Kebutuhan Faskes" },
  { key: "alokasi", label: "Alokasi & Riwayat" },
] as const;

function LogistikOAT() {
  const [sub, setSub] = useState("stok");
  return (
    <>
      <SubTabs tabs={SUB_LOGISTIK} active={sub} onChange={setSub} />
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {sub === "stok" ? "Stok & buffer OAT" : sub === "kebutuhan" ? "Kebutuhan OAT fasilitas" : "Alokasi & riwayat distribusi"}
        </h1>
        <p className="mt-2 text-[#5b6478]">{sub === "stok" ? "Tinjau catatan persediaan contoh dengan satuan yang konsisten untuk setiap item." : sub === "kebutuhan" ? "Susun permintaan kebutuhan bulanan fasilitas untuk telaah admin." : "Riwayat alokasi masuk dan distribusi keluar contoh."}</p>
      </section>
      <DemoBanner title="Konsep pengembangan · Data demo">Seluruh modul logistik masih berupa usulan. Tidak ada layanan stok atau farmasi aktif; jumlah dan estimasi buffer diisi manual untuk demo.</DemoBanner>
      <Card>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField label="Fasilitas contoh" options={["Puskemas Candilama"]} value="Puskemas Candilama" onChange={() => {}} />
          <label className="block"><span className="text-sm font-semibold text-[#123524]">Tanggal catatan manual</span><input readOnly value="8 Oktober 2026 · data demo" aria-label="Tanggal catatan" className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] bg-white px-4 text-sm" /></label>
        </div>
      </Card>
      {sub === "stok" && (
        <>
          <Card>
            <CardTitle sub="Jumlah tersedia dan permintaan menggunakan satuan yang sama pada tiap item. Status adalah label manual demo.">Persediaan contoh</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#EEF0FA] text-left"><th className="rounded-l-lg px-4 py-3 font-semibold text-[#3f4660]">Item OAT</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Satuan</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Stok demo</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Buffer manual</th><th className="rounded-r-lg px-4 py-3 font-semibold text-[#3f4660]">Label stok</th></tr></thead>
                <tbody className="divide-y">
                  {[["4FDC dewasa", "Tablet", "2.400 tablet", "30 hari · estimasi", "Cukup · demo", "green"], ["2FDC dewasa", "Tablet", "1.800 tablet", "24 hari · estimasi", "Tinjau · demo", "amber"], ["3FDC dispersibel", "Tablet", "600 tablet", "18 hari · estimasi", "Tinjau · demo", "amber"], ["2FDC dispersibel", "Tablet", "900 tablet", "28 hari · estimasi", "Cukup · demo", "green"]].map((r) => (
                    <tr key={r[0]}>{r.slice(0, 4).map((c, i) => <td key={i} className="px-4 py-4 text-[#3f4660]">{i === 0 ? <strong className="text-[#123524]">{c}</strong> : c}</td>)}<td className="px-4 py-4"><Chip tone={r[5] as "green" | "amber"}>{r[4]}</Chip></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-[#8a90a5]">Buffer tidak dihitung dari regimen atau jumlah pasien. Tidak ada pembaruan otomatis, pemesanan, atau pengurangan stok.</p>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle right={<Chip tone="amber">Estimasi manual · Data demo</Chip>}>Catatan buffer</CardTitle>
              <p className="text-sm leading-relaxed text-[#5b6478]">Label &quot;cukup&quot; dan &quot;tinjau&quot; menggambarkan rancangan tampilan, bukan ambang klinis atau kebijakan pengadaan resmi.</p>
              <GhostButton className="mt-4" disabled>Ubah catatan · belum tersedia</GhostButton>
            </Card>
            <Card>
              <CardTitle>Belum ada inventori operasional</CardTitle>
              <p className="text-sm leading-relaxed text-[#5b6478]">Jika data nyata belum disediakan, tampilkan &quot;Belum ada catatan stok&quot;. Jangan menganggap nilai kosong sebagai nol persediaan.</p>
              <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#EEF0FA] px-4 py-3.5 text-sm text-[#3f4660]">
                <span>🛡</span><p><strong className="text-[#123524]">Batas penggunaan</strong><br />Gunakan prosedur logistik resmi fasilitas. Halaman ini bukan panduan pemberian obat atau pengelolaan rantai dingin.</p>
              </div>
            </Card>
          </div>
        </>
      )}
      {sub === "kebutuhan" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Permintaan menunggu telaah</CardTitle>
            <ul className="space-y-3 text-sm">
              {[["REQ-201", "4FDC dewasa · 1.200 tablet", "Periode Nov 2026", "amber", "Menunggu telaah"], ["REQ-202", "3FDC dispersibel · 400 tablet", "Periode Nov 2026", "amber", "Menunggu telaah"]].map(([id, item, p, tone, s]) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F3F4FB] px-4 py-4">
                  <span><strong className="text-[#123524]">{id} · {item}</strong><span className="block text-xs text-[#8a90a5]">{p}</span></span>
                  <span className="flex items-center gap-2"><Chip tone={tone as "amber"}>{s}</Chip><GhostButton className="!min-h-10 !px-4 text-xs">Telaah</GhostButton></span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>Aturan telaah</CardTitle>
            <ul className="space-y-3 text-sm leading-relaxed text-[#5b6478]">
              <li>• Periksa jumlah dan satuan secara manual.</li>
              <li>• Tidak ada kalkulasi otomatis dari jumlah pasien.</li>
              <li>• Persetujuan pengadaan di luar cakupan rancangan ini.</li>
            </ul>
          </Card>
        </div>
      )}
      {sub === "alokasi" && (
        <Card>
          <CardTitle right={<Chip tone="gray">Data demo</Chip>}>Riwayat distribusi</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#EEF0FA] text-left"><th className="rounded-l-lg px-4 py-3 font-semibold text-[#3f4660]">Tanggal</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Jenis</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Item</th><th className="rounded-r-lg px-4 py-3 font-semibold text-[#3f4660]">Jumlah</th></tr></thead>
              <tbody className="divide-y">
                {[["01 Okt 2026", "Alokasi masuk", "4FDC dewasa", "+1.200 tablet"], ["01 Okt 2026", "Alokasi masuk", "2FDC dewasa", "+600 tablet"], ["05 Okt 2026", "Distribusi keluar", "3FDC dispersibel", "−200 tablet"], ["08 Okt 2026", "Distribusi keluar", "4FDC dewasa", "−450 tablet"]].map((r) => (
                  <tr key={r[2] + r[3]}>{r.map((c, i) => <td key={i} className={`px-4 py-4 ${i === 3 ? c.startsWith("+") ? "font-semibold text-[#1B7A3E]" : "font-semibold text-[#b42318]" : "text-[#3f4660]"}`}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ---------- Modul 3: Tenaga Medis (Verifikasi STR / Cari Pengguna / Penugasan Faskes) ---------- */

const SUB_NAKES = [
  { key: "str", label: "Verifikasi STR" },
  { key: "cari", label: "Cari Pengguna" },
  { key: "penugasan", label: "Penugasan Faskes" },
] as const;

function TenagaMedis() {
  const [sub, setSub] = useState("str");
  return (
    <>
      <SubTabs tabs={SUB_NAKES} active={sub} onChange={setSub} />
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {sub === "str" ? "Verifikasi STR tenaga medis" : sub === "cari" ? "Cari pengguna" : "Penugasan fasilitas"}
        </h1>
        <p className="mt-2 text-[#5b6478]">{sub === "str" ? "Tinjau pengajuan verifikasi Surat Tanda Registrasi." : sub === "cari" ? "Temukan akun pengguna pada cakupan berizin." : "Kelola penugasan aktif tenaga medis pada fasilitas."}</p>
      </section>
      <DemoBanner title="Konsep pengembangan · Data demo">Modul tenaga medis berupa contoh rancangan; tidak ada perubahan akun nyata dari layar ini.</DemoBanner>
      {sub === "str" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Pengajuan verifikasi STR</CardTitle>
            <ul className="space-y-3 text-sm">
              {[["dr. Andi P••••", "STR 33.1.1•••••••", "Menunggu verifikasi", "amber"], ["Ns. Budi S••••", "STR 33.1.2•••••••", "Menunggu verifikasi", "amber"], ["dr. Citra L••••", "STR 33.1.1•••••••", "Terverifikasi", "green"]].map(([n, s, st, tone]) => (
                <li key={s} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F3F4FB] px-4 py-4">
                  <span><strong className="text-[#123524]">{n}</strong><span className="block text-xs text-[#8a90a5]">{s}</span></span>
                  <span className="flex items-center gap-2"><Chip tone={tone as "amber" | "green"}>{st}</Chip><GhostButton className="!min-h-10 !px-4 text-xs">Tinjau</GhostButton></span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>Catatan</CardTitle>
            <p className="text-sm leading-relaxed text-[#5b6478]">Verifikasi STR memeriksa dokumen dan kesesuaian nama. Gelar tidak otomatis memberi akses klinis menyeluruh; izin tetap mengikuti peran dan penugasan.</p>
          </Card>
        </div>
      )}
      {sub === "cari" && (
        <Card>
          <CardTitle sub="Hasil identitas tetap tersamar sampai detail dibuka dengan izin.">Pencarian pengguna</CardTitle>
          <div className="flex flex-wrap gap-3">
            <input aria-label="Kata kunci pencarian" placeholder="Nama atau identitas…" className="min-h-12 flex-1 rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]" />
            <PrimaryButton>Cari</PrimaryButton>
          </div>
          <ul className="mt-5 space-y-3 text-sm">
            {[["U•••• 1042", "TB_OFFICER", "Aktif", "green"], ["U•••• 1078", "ADMIN_FASKES", "Aktif", "green"], ["U•••• 1090", "LAB_TECHNOLOGIST", "Menunggu STR", "amber"]].map(([u, r, s, tone]) => (
              <li key={u} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F3F4FB] px-4 py-4">
                <span><strong className="text-[#123524]">{u}</strong><span className="block text-xs text-[#8a90a5]">{r}</span></span>
                <span className="flex items-center gap-2"><Chip tone={tone as "green" | "amber"}>{s}</Chip><GhostButton className="!min-h-10 !px-4 text-xs">Detail</GhostButton></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {sub === "penugasan" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Penugasan aktif di Puskemas Candilama</CardTitle>
            <ul className="space-y-3 text-sm">
              {[["U•••• 1042 · TB_OFFICER", "Sejak 12 Jan 2026", "green", "Aktif"], ["U•••• 1078 · ADMIN_FASKES", "Sejak 03 Mar 2026", "green", "Aktif"], ["U•••• 1090 · LAB_TECHNOLOGIST", "Menunggu verifikasi STR", "amber", "Kandidat"]].map(([u, s, tone, st]) => (
                <li key={u} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F3F4FB] px-4 py-4">
                  <span><strong className="text-[#123524]">{u}</strong><span className="block text-xs text-[#8a90a5]">{s}</span></span>
                  <span className="flex items-center gap-2"><Chip tone={tone as "green" | "amber"}>{st}</Chip><GhostButton className="!min-h-10 !px-4 text-xs">Kelola</GhostButton></span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>Prinsip</CardTitle>
            <ul className="space-y-3 text-sm leading-relaxed text-[#5b6478]">
              <li>• Penugasan aktif menentukan cakupan akses fasilitas.</li>
              <li>• Peran fasilitas ≠ peran global (Admin Sistem terpisah).</li>
              <li>• Tidak ada tombol beralih hak akses pada rancangan ini.</li>
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

/* ---------- Modul 4: Faskes & Akun (Daftar Faskes / Profil / Status & Peran Akun) ---------- */

const SUB_FASKES = [
  { key: "daftar", label: "Daftar Faskes" },
  { key: "profil", label: "Profil Faskes" },
  { key: "akun", label: "Status & Peran Akun" },
] as const;

function FaskesAkun() {
  const [sub, setSub] = useState("daftar");
  return (
    <>
      <SubTabs tabs={SUB_FASKES} active={sub} onChange={setSub} />
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {sub === "daftar" ? "Daftar fasilitas kesehatan" : sub === "profil" ? "Profil fasilitas" : "Status & peran akun"}
        </h1>
        <p className="mt-2 text-[#5b6478]">{sub === "daftar" ? "Fasilitas dalam cakupan administrasi Anda." : sub === "profil" ? "Lengkapi data fasilitas untuk konteks wilayah." : "Tinjau status global dan peran akun (hak Admin Sistem untuk perubahan)."}</p>
      </section>
      {sub === "daftar" && (
        <Card>
          <CardTitle right={<Chip tone="gray">1 fasilitas ditugaskan</Chip>}>Fasilitas</CardTitle>
          <ul className="space-y-3 text-sm">
            <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#E7F7EA] px-4 py-4">
              <span><strong className="text-[#0B5A2A]">Puskemas Candilama</strong><span className="block text-xs text-[#1f7a3f]">Kota Semarang · Jawa Tengah</span></span>
              <span className="flex items-center gap-2"><Chip tone="green">Aktif</Chip><GhostButton className="!min-h-10 !px-4 text-xs">Profil →</GhostButton></span>
            </li>
            <li className="rounded-xl bg-[#F3F4FB] px-4 py-3 text-xs text-[#8a90a5]">Fasilitas lain tidak ditampilkan — cakupan administratif terbatas pada penugasan aktif.</li>
          </ul>
        </Card>
      )}
      {sub === "profil" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>Data fasilitas · draf</CardTitle>
            <div className="space-y-4">
              {[["Nama", "Puskemas Candilama"], ["Kabupaten/Kota", "Kota Semarang"], ["Provinsi", "Jawa Tengah"], ["Koordinat", "-6.98, 110.44 (contoh)"], ["Jenis", "Puskesmas"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b pb-2 text-sm"><span className="text-[#5b6478]">{k}</span><strong className="text-[#123524]">{v}</strong></div>
              ))}
              <GhostButton>Lengkapi profil · belum tersedia</GhostButton>
            </div>
          </Card>
          <Card>
            <CardTitle>Petunjuk</CardTitle>
            <p className="text-sm leading-relaxed text-[#5b6478]">Periksa wilayah administratif dan koordinat pada draf contoh. Profil fasilitas lengkap diperlukan sebelum konteks regional dapat diusulkan.</p>
          </Card>
        </div>
      )}
      {sub === "akun" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Status & peran akun · cakupan fasilitas</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Akun</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Peran fasilitas</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Status</th></tr></thead>
                <tbody className="divide-y">
                  {[["U•••• 1042", "TB_OFFICER", "AKTIF", "green"], ["U•••• 1078", "ADMIN_FASKES", "AKTIF", "green"], ["U•••• 1090", "LAB_TECHNOLOGIST", "MENUNGGU", "amber"], ["U•••• 1101", "TB_OFFICER", "NONAKTIF", "gray"]].map(([u, r, s, tone]) => (
                    <tr key={u}><td className="px-4 py-4 font-semibold text-[#123524]">{u}</td><td className="px-4 py-4 text-[#5b6478]">{r}</td><td className="px-4 py-4"><Chip tone={tone as "green" | "amber" | "gray"}>{s}</Chip></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="rounded-2xl bg-[#EEF0FA] p-5 text-sm leading-relaxed text-[#3f4660]">
            <p className="font-bold text-[#123524]">🛡 Perubahan peran global</p>
            <p className="mt-1.5">Status global dan peran lintas fasilitas memerlukan hak Admin Sistem. Admin Faskes hanya mengelola keanggotaan fasilitasnya.</p>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Modul 5: Integrasi & Audit (Status / Identitas & Otoritas / Riwayat & Konflik) ---------- */

const SUB_INTEGRASI = [
  { key: "status", label: "Status Integrasi" },
  { key: "identitas", label: "Identitas & Otoritas" },
  { key: "riwayat", label: "Riwayat & Konflik" },
] as const;

function IntegrasiAudit() {
  const [sub, setSub] = useState("status");
  return (
    <>
      <SubTabs tabs={SUB_INTEGRASI} active={sub} onChange={setSub} />
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {sub === "status" ? "Status integrasi lokal" : sub === "identitas" ? "Identitas & otoritas sumber" : "Riwayat & konflik rekonsiliasi"}
        </h1>
        <p className="mt-2 text-[#5b6478]">{sub === "status" ? "Metadata integrasi lokal (Phase 5A) — bukan jaringan SITB." : sub === "identitas" ? "Tinjau sumber otoritas setiap entitas." : "Riwayat sinkronisasi dan konflik yang tertunda."}</p>
      </section>
      <DemoBanner title="Konsep pengembangan · Data demo">Tidak ada koneksi nyata ke SITB. Semua status di bawah adalah contoh metadata lokal.</DemoBanner>
      {sub === "status" && (
        <div className="grid gap-5 sm:grid-cols-3">
          {[["SITB Kemenkes RI", "BELUM TERHUBUNG", "gray"], ["Sumber lokal prototype", "AKTIF", "green"], ["Adapter eksternal", "TIDAK DIKONFIGURASI", "gray"]].map(([t, s, tone]) => (
            <Card key={t}><p className="text-sm font-semibold text-[#3f4660]">{t}</p><p className="mt-3"><Chip tone={tone as "green" | "gray"}>{s}</Chip></p><p className="mt-3 text-xs text-[#8a90a5]">Metadata contoh · bukan layanan aktif</p></Card>
          ))}
        </div>
      )}
      {sub === "identitas" && (
        <Card>
          <CardTitle>Sumber otoritas per entitas</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#EEF0FA] text-left"><th className="rounded-l-lg px-4 py-3 font-semibold text-[#3f4660]">Entitas</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Sumber otoritas</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Akses tulis</th><th className="rounded-r-lg px-4 py-3 font-semibold text-[#3f4660]">Keterangan</th></tr></thead>
              <tbody className="divide-y">
                {[["Pasien", "LOKAL prototype", "TB_OFFICER", "Prototype lokal diizinkan"], ["Registrasi/Kasus", "LOKAL prototype", "TB_OFFICER", "Kebijakan klinis tetap berlaku"], ["Laboratorium", "LOKAL prototype", "Lab staff", "LaboratorySourceAuthorityPolicy"], ["Integrasi SITB", "—", "—", "Belum terdefinisi"]].map((r) => (
                  <tr key={r[0]}>{r.map((c, i) => <td key={i} className="px-4 py-4 text-[#3f4660]">{i === 0 ? <strong className="text-[#123524]">{c}</strong> : c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {sub === "riwayat" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Riwayat sinkronisasi &amp; konflik</CardTitle>
            <ul className="space-y-3 text-sm">
              {[["01 Okt 2026 · 09:12", "Rekonsiliasi sumber lokal", "Selesai", "green"], ["28 Sep 2026 · 14:03", "Konflik versi registrasi R-0214", "Tertunda", "amber"], ["21 Sep 2026 · 08:40", "Snapshot metadata integrasi", "Selesai", "green"]].map(([w, t, s, tone]) => (
                <li key={t} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F3F4FB] px-4 py-4">
                  <span><strong className="text-[#123524]">{t}</strong><span className="block text-xs text-[#8a90a5]">{w}</span></span>
                  <Chip tone={tone as "green" | "amber"}>{s}</Chip>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>Prinsip rekonsiliasi</CardTitle>
            <p className="text-sm leading-relaxed text-[#5b6478]">Data yang dikendalikan sumber eksternal hanya dapat dibaca. Perubahan harus melalui alur rekonsiliasi yang disetujui; tidak ada penulisan langsung.</p>
          </Card>
        </div>
      )}
    </>
  );
}
