"use client";
import { useState } from "react";
import { Card, CardTitle, Chip, DemoBanner, GhostButton, PrimaryButton, SelectField, SubTabs, WorkspacePage } from "@/components/tbc/ui";

/* ============================================================
   Ruang Nakes/Dokter (mockup: Pasien & Registrasi, Laboratorium,
   Pengobatan, Tindak Lanjut, Kontinuitas, Pemantauan/After Verifikasi)
   ============================================================ */

const MODULES = [
  { key: "pasien", label: "Pasien & Registrasi" },
  { key: "lab", label: "Laboratorium" },
  { key: "pengobatan", label: "Pengobatan" },
  { key: "tindak", label: "Tindak Lanjut" },
  { key: "kontinuitas", label: "Kontinuitas" },
  { key: "pemantauan", label: "Pemantauan" },
] as const;

export function RuangNakes() {
  return (
    <WorkspacePage
      modules={MODULES} userName="dr. Kalvari, Sp.P" userRole="Nakes/Dokter · TB_OFFICER"
      facility="Puskemas Candilama, Kota Semarang" facilitySub="Fasilitas aktif yang ditugaskan · akses sesuai izin dan cakupan fasilitas"
      facilityTag="Data demo" roleTag="TB_OFFICER" notif
      footerLeft="TB Call Center · Ruang Nakes/Dokter" footerRight="Data demo fiktif · 8 Oktober 2026 · Tidak menyimpan data klinis di peramban"
      renderModule={(mod) => <NakesModule mod={mod} />}
    />
  );
}

function NakesModule({ mod }: { mod: string }) {
  if (mod === "lab") return <Laboratorium />;
  if (mod === "pengobatan") return <Pengobatan />;
  if (mod === "tindak") return <TindakLanjut />;
  if (mod === "kontinuitas") return <Kontinuitas />;
  if (mod === "pemantauan") return <Pemantauan />;
  return <PasienRegistrasi />;
}

/* ---------- Modul 1: Pasien & Registrasi (mockup Daftar Pasien) ---------- */

const SUB_PASIEN = [
  { key: "daftar", label: "Daftar Pasien" },
  { key: "registrasi", label: "Registrasi Baru" },
  { key: "diagnosis", label: "Diagnosis & Kasus" },
] as const;

const PASIEN_ROWS = [
  { id: "P•••• G••••", nik: "•••• 0891", reg: "R-0891", tgl: "01 Sep 2026", kasus: "K-0891" },
  { id: "S•••• A••••", nik: "•••• 0214", reg: "R-0214", tgl: "04 Sep 2026", kasus: "K-0214" },
  { id: "D•••• P••••", nik: "•••• 0418", reg: "R-0418", tgl: "10 Sep 2026", kasus: "K-0418" },
  { id: "H•••• S••••", nik: "•••• 0312", reg: "R-0312", tgl: "18 Sep 2026", kasus: "K-0312" },
  { id: "A•••• W••••", nik: "•••• 0523", reg: "R-0523", tgl: "25 Sep 2026", kasus: "K-0523" },
] as const;

function PasienRegistrasi() {
  const [sub, setSub] = useState("daftar");
  const [terpilih, setTerpilih] = useState(0);
  return (
    <>
      <SubTabs tabs={SUB_PASIEN} active={sub} onChange={setSub} />
      {sub === "daftar" && (
        <>
          <section>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">Daftar pasien dalam cakupan Anda</h1>
            <p className="mt-2 text-[#5b6478]">Cari pada daftar berizin, lalu buka pasien dan registrasi yang relevan. Identitas daftar tetap tersamar.</p>
          </section>
          <Card>
            <CardTitle>Pencarian &amp; filter</CardTitle>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block"><span className="text-sm font-semibold text-[#123524]">Nama pasien</span>
                <input className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]" placeholder="Belum diisi" />
                <span className="mt-1.5 block text-xs text-[#5b6478]">Minimal 3 karakter; bukan pencarian lintas-faskes.</span></label>
              <label className="block"><span className="text-sm font-semibold text-[#123524]">NIK 16 digit / BPJS persis</span>
                <input className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]" placeholder="Belum diisi" />
                <span className="mt-1.5 block text-xs text-[#5b6478]">Cocok persis, bukan sebagian nomor.</span></label>
              <SelectField label="Fasilitas" options={["Puskemas Candilama"]} value="Puskemas Candilama" onChange={() => {}} locked />
              <SelectField label="Status registrasi" options={["Semua status", "OPEN", "DIAGNOSED"]} value="Semua status" onChange={() => {}} />
              <SelectField label="Status kasus" options={["ACTIVE", "REFERRED", "Semua"]} value="ACTIVE" onChange={() => {}} />
              <SelectField label="Halaman & jumlah per halaman" options={["1 · 5 catatan", "1 · 10 catatan"]} value="1 · 5 catatan" onChange={() => {}} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PrimaryButton>Terapkan filter</PrimaryButton>
              <GhostButton>Bersihkan</GhostButton>
              <p className="text-xs text-[#5b6478]">Filter diterapkan: fasilitas aktif · kasus ACTIVE</p>
            </div>
          </Card>
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <Card>
              <CardTitle right={<Chip tone="gray">5 catatan di halaman ini · daftar demo</Chip>}>Pasien terdaftar</CardTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Identitas tersamar</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Registrasi</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Konteks kasus</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Aksi berizin</th></tr></thead>
                  <tbody className="divide-y">
                    {PASIEN_ROWS.map((r, i) => (
                      <tr key={r.reg} onClick={() => setTerpilih(i)} className={`cursor-pointer transition ${terpilih === i ? "bg-[#E7F7EA]" : "hover:bg-[#F3F4FB]"}`}>
                        <td className="px-4 py-4 font-semibold text-[#123524]">{r.id}<br /><span className="text-xs font-normal text-[#8a90a5]">NIK {r.nik}</span></td>
                        <td className="px-4 py-4 text-[#5b6478]">{r.reg}<br /><span className="text-xs">{r.tgl}</span></td>
                        <td className="px-4 py-4 text-[#5b6478]">{r.kasus} · ACTIVE</td>
                        <td className="px-4 py-4 font-semibold text-[#1B7A3E]">{terpilih === i ? "Detail dipilih" : "Buka detail →"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-[#5b6478]">1–5 dari 12 hasil berizin · Halaman 1 / 3</span>
                <div className="flex gap-2"><GhostButton disabled>Sebelumnya</GhostButton><GhostButton>Berikutnya</GhostButton></div>
              </div>
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#EEF0FA] px-4 py-3.5">
                <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-[#0B5A2A]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z" /></svg>
                <p className="text-sm leading-relaxed text-[#3f4660]"><strong className="font-bold text-[#123524]">Pencarian aman</strong><br />Tidak ada pencarian identitas universal. Filter mengikuti data registrasi/kasus dan fasilitas yang dapat diakses. Hasil kosong tidak berarti pasien tidak terdaftar di fasilitas lain.</p>
              </div>
            </Card>
            <div className="space-y-6">
              <Card>
                <CardTitle right={<Chip>Detail berizin · data demo</Chip>}>Pasien terpilih</CardTitle>
                <p className="text-sm text-[#5b6478]">Nama pasien</p>
                <p className="mt-1 text-lg font-bold text-[#123524]">Prabowo Gunawan</p>
                <p className="mt-3 text-sm text-[#5b6478]">Identitas</p>
                <p className="font-bold text-[#123524]">ID •••• 0891 · NIK tetap tersamar</p>
                <p className="mt-3 text-sm text-[#5b6478]">Registrasi dan kasus terpisah</p>
                <p className="font-bold text-[#123524]">R-0891 → diagnosis D-0891 → K-0891</p>
                <p className="mt-3 text-sm text-[#5b6478]">Fasilitas pemilik kasus</p>
                <p className="font-bold text-[#123524]">Puskemas Candilama</p>
                <PrimaryButton className="mt-4">Diagnosis &amp; kasus →</PrimaryButton>
                <p className="mt-3 text-xs text-[#8a90a5]">Nama lengkap hanya pada panel detail setelah pemeriksaan izin pasien.</p>
              </Card>
              <Card>
                <CardTitle>Mulai dari registrasi</CardTitle>
                <p className="text-sm leading-relaxed text-[#5b6478]">Pendaftaran pasien dan pencatatan registrasi adalah dua langkah berbeda. Gunakan pencocokan identitas persis untuk pasien yang sudah ada.</p>
                <GhostButton className="mt-3">Registrasi baru →</GhostButton>
              </Card>
            </div>
          </div>
          <div className="rounded-2xl bg-[#EEF0FA] px-5 py-4">
            <p className="text-sm leading-relaxed text-[#3f4660]"><strong className="font-bold text-[#123524]">🛡 Hak pada halaman ini</strong><br />PATIENT baca daftar/detail, REGISTRATION baca, dan CASE baca diperiksa masing-masing. Penugasan fasilitas dan izin sumber daya diperiksa terpisah; gelar Dokter tidak memberi akses menyeluruh.</p>
          </div>
        </>
      )}
      {sub === "registrasi" && (
        <>
          <section>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">Registrasi pasien baru</h1>
            <p className="mt-2 text-[#5b6478]">Pendaftaran pasien dan pencatatan registrasi adalah dua langkah berbeda. Contoh rancangan, tanpa penyimpanan.</p>
          </section>
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardTitle>Formulir registrasi · draf</CardTitle>
              <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block"><span className="text-sm font-semibold text-[#123524]">NIK 16 digit *</span><input className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]" inputMode="numeric" placeholder="Cocok persis" /></label>
                  <label className="block"><span className="text-sm font-semibold text-[#123524]">Konfirmasi identitas sekunder *</span>
                    <select className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]"><option>Nomor BPJS</option><option>Tanggal lahir</option><option>Nama ibu kandung</option></select></label>
                  <label className="block"><span className="text-sm font-semibold text-[#123524]">Nama lengkap *</span><input className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]" placeholder="Sesuai identitas" /></label>
                  <SelectField label="Fasilitas pelayanan" options={["Puskemas Candilama"]} value="Puskemas Candilama" onChange={() => {}} locked />
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-[#E7F7EA] px-4 py-3.5 text-sm text-[#1f7a3f]">
                  <span>🛡</span><p><strong className="font-bold text-[#0B5A2A]">Pencocokan wajib</strong><br />Identitas lookup memerlukan TB_OFFICER, identitas persis plus konfirmasi sekunder, dan penugasan fasilitas aktif.</p>
                </div>
                <PrimaryButton type="submit">Simpan registrasi</PrimaryButton>
              </form>
            </Card>
            <Card>
              <CardTitle>Ringkasan aturan</CardTitle>
              <ul className="space-y-3 text-sm leading-relaxed text-[#5b6478]">
                <li>• Registrasi baru bersifat atomik untuk pasien baru.</li>
                <li>• Konfirmasi transisi DIAGNOSED → CONVERTED_TO_CASE.</li>
                <li>• NOT_TREATED/UNKNOWN tidak dapat mengonfirmasi kasus.</li>
                <li>• REFERRED mempertahankan fasilitas sumber saat ini.</li>
              </ul>
            </Card>
          </div>
        </>
      )}
      {sub === "diagnosis" && (
        <>
          <section>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">Diagnosis &amp; kasus</h1>
            <p className="mt-2 text-[#5b6478]">Pasien, registrasi, diagnosis, dan kasus tetap menjadi catatan terpisah.</p>
          </section>
          <DemoBanner title="Konsep pengembangan · Data demo">Rincian diagnosis berikut adalah contoh rancangan; bukan hasil pemeriksaan nyata.</DemoBanner>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              { t: "K-0891 · ACTIVE", rows: [["Status kasus", "ACTIVE"], ["Kategori", "Sensitif obat"], ["Fasilitas", "Puskemas Candilama"], ["Mulai pengobatan", "01 Sep 2026"]] },
              { t: "D-0891 · Diagnosis", rows: [["Tipe", "Paru BTA+"], ["Konfirmasi", "GeneXpert TCM"], ["Resistensi", "Tidak terdeteksi RR"], ["Tanggal", "20 Sep 2026"]] },
              { t: "R-0891 · Registrasi", rows: [["Status", "CONVERTED_TO_CASE"], ["Sumber", "Skrining aktif"], ["Pasien", "•••• 0891"], ["Tanggal", "01 Sep 2026"]] },
            ].map((c) => (
              <Card key={c.t}>
                <CardTitle right={<Chip>Data demo</Chip>}>{c.t}</CardTitle>
                <dl className="space-y-3 text-sm">{c.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b pb-2"><dt className="text-[#5b6478]">{k}</dt><dd className="font-semibold text-[#123524]">{v}</dd></div>)}</dl>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ---------- Modul 2: Laboratorium (Permintaan, Spesimen, Hasil & Koreksi) ---------- */

const SUB_LAB = [
  { key: "permintaan", label: "Permintaan Lab" },
  { key: "spesimen", label: "Spesimen" },
  { key: "hasil", label: "Hasil & Koreksi" },
] as const;

function Laboratorium() {
  const [sub, setSub] = useState("permintaan");
  return (
    <>
      <SubTabs tabs={SUB_LAB} active={sub} onChange={setSub} />
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {sub === "permintaan" ? "Permintaan pemeriksaan laboratorium" : sub === "spesimen" ? "Pencatatan spesimen" : "Hasil & koreksi tercatat"}
        </h1>
        <p className="mt-2 text-[#5b6478]">
          {sub === "permintaan" ? "TB officer membuat permintaan dalam cakupan fasilitas pengirim."
            : sub === "spesimen" ? "Petugas laboratorium menerima dan mencatat spesimen dalam cakupan fasilitas penguji."
            : "Hasil dimasukkan laboratorium; koreksi bersifat append-only dan tidak mengubah diagnosis otomatis."}
        </p>
      </section>
      <DemoBanner title="Konsep pengembangan · Data demo">Modul laboratorium adalah contoh rancangan. Hasil tidak otomatis mengubah diagnosis, resistensi, status kasus, atau pengobatan.</DemoBanner>
      {sub === "permintaan" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Permintaan aktif</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Permintaan</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Pasien</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Jenis</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Status</th></tr></thead>
                <tbody className="divide-y">
                  {[["L-2201", "•••• 0891", "GeneXpert TCM", "Menunggu spesimen", "amber"], ["L-2187", "•••• 0214", "Mikroskopis BTA", "Spesimen diterima", "blue"], ["L-2150", "•••• 0418", "TCM Follow-up", "Selesai", "green"]].map(([id, p, j, s, tone]) => (
                    <tr key={id}><td className="px-4 py-4 font-semibold text-[#123524]">{id}</td><td className="px-4 py-4 text-[#5b6478]">{p}</td><td className="px-4 py-4 text-[#5b6478]">{j}</td><td className="px-4 py-4"><Chip tone={tone as "amber" | "blue" | "green"}>{s}</Chip></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PrimaryButton className="mt-5">+ Permintaan baru</PrimaryButton>
          </Card>
          <Card>
            <CardTitle>Aturan cakupan</CardTitle>
            <ul className="space-y-3 text-sm leading-relaxed text-[#5b6478]">
              <li>• Permintaan dibuat TB officer pada fasilitas pengirim.</li>
              <li>• ETag diperlukan untuk perubahan data terkunci versi.</li>
              <li>• Garis waktu spesimen bersifat historis.</li>
            </ul>
          </Card>
        </div>
      )}
      {sub === "spesimen" && (
        <Card>
          <CardTitle right={<Chip>Data demo</Chip>}>Garis waktu spesimen</CardTitle>
          <ol className="relative space-y-6 border-l-2 border-[#e4e8f4] pl-6">
            {[["Spesimen diambil", "13 Nov 2026 · 08:20 WIB", "green", "Dahak pagi · volume memadai"], ["Diterima laboratorium", "13 Nov 2026 · 10:05 WIB", "blue", "Puskemas lab unit · kondisi baik"], ["Pemeriksaan dimulai", "13 Nov 2026 · 10:40 WIB", "gray", "GeneXpert cartridge S/N demo"], ["Hasil dimasukkan", "13 Nov 2026 · 13:15 WIB", "green", "Terdeteksi · MTB detected, RR not detected"]].map(([t, w, tone, d]) => (
              <li key={t} className="relative">
                <span className={`absolute -left-[31px] top-1 size-4 rounded-full ring-4 ring-white ${tone === "green" ? "bg-[#1B7A3E]" : tone === "blue" ? "bg-[#1d4f91]" : "bg-[#9aa1b5]"}`} aria-hidden="true" />
                <p className="font-bold text-[#123524]">{t} <span className="ml-2 text-xs font-normal text-[#8a90a5]">{w}</span></p>
                <p className="mt-1 text-sm text-[#5b6478]">{d}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {sub === "hasil" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Hasil &amp; riwayat koreksi</CardTitle>
            <dl className="space-y-3 text-sm">
              {[["Pemeriksaan", "L-2201 · GeneXpert TCM"], ["Pasien", "•••• 0891"], ["Hasil", "MTB DETECTED · RR NOT DETECTED"], ["Dibuat", "13 Nov 2026 · 13:15 WIB · Lab Technologist"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b pb-2"><dt className="text-[#5b6478]">{k}</dt><dd className="font-semibold text-[#123524]">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-5 rounded-xl bg-[#FDEBD3] px-4 py-3.5 text-sm text-[#8a5a12]"><strong className="font-bold">Koreksi append-only</strong><br />Perbaikan ditambahkan sebagai catatan baru; nilai lama tidak dihapus dan tidak mengubah keputusan klinis otomatis.</div>
            <GhostButton className="mt-4">Tambah koreksi · belum tersedia</GhostButton>
          </Card>
          <Card>
            <CardTitle>Interpretasi</CardTitle>
            <p className="text-sm leading-relaxed text-[#5b6478]">Interpretasi klinis spesifik tes tidak dikodekan di sistem. Keputusan tetap pada dokter pemeriksa berdasarkan konteks lengkap.</p>
          </Card>
        </div>
      )}
    </>
  );
}

/* ---------- Modul 3: Pengobatan (Episode, Mulai & Rencana, Bukti Minum) ---------- */

const SUB_PENGOBATAN = [
  { key: "episode", label: "Episode Pengobatan" },
  { key: "mulai", label: "Mulai & Rencana" },
  { key: "bukti", label: "Bukti Minum Obat" },
] as const;

function Pengobatan() {
  const [sub, setSub] = useState("episode");
  return (
    <>
      <SubTabs tabs={SUB_PENGOBATAN} active={sub} onChange={setSub} />
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {sub === "episode" ? "Episode pengobatan" : sub === "mulai" ? "Mulai pengobatan & metadata rencana" : "Bukti minum obat"}
        </h1>
        <p className="mt-2 text-[#5b6478]">
          {sub === "episode" ? "Ringkasan episode T-0901 untuk kasus K-0891."
            : sub === "mulai" ? "Dua mode terpisah: mulai episode dengan keputusan manual, atau edit metadata rencana episode yang telah berjalan."
            : "Rekaman konfirmasi kepatuhan harian dari portal pasien dan PMO."}
        </p>
      </section>
      {sub === "episode" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle right={<Chip>ACTIVE</Chip>}>T-0901 · Fase intensif</CardTitle>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {[["Kasus", "K-0891 · ACTIVE"], ["Regimen", "Sensitif obat (4KDT)"], ["Tanggal mulai", "01 Sep 2026"], ["Rencana akhir", "28 Feb 2027"], ["Fasilitas kerja", "Puskemas Candilama"], ["Hari pengobatan", "48 / 180"]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><dt className="text-xs font-semibold text-[#5b6478]">{k}</dt><dd className="mt-1 font-bold text-[#123524]">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardTitle>Baris obat (snapshot)</CardTitle>
            <ul className="space-y-2 text-sm">
              {[["Isoniazid", "300 mg · 1×/hari"], ["Rifampisin", "450 mg · 1×/hari"], ["Pirazinamid", "500 mg · 2 kaplet"], ["Etambutol", "400 mg · 2 kaplet"]].map(([o, d]) => (
                <li key={o} className="flex justify-between rounded-xl bg-[#F3F4FB] px-4 py-3"><strong className="text-[#123524]">{o}</strong><span className="text-[#5b6478]">{d}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[#8a90a5]">Klinisi menambahkan 1–20 baris obat secara mandiri; dosis tidak dihitung sistem.</p>
          </Card>
        </div>
      )}
      {sub === "mulai" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle right={<Chip tone="green">Mode mulai · sebelum T-0901 dibuat</Chip>}>Mulai episode · draf belum disimpan</CardTitle>
            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-semibold text-[#123524]">Regimen * · dipilih klinisi</span>
                  <select className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]"><option>Regimen sensitif obat · katalog demo</option><option>Regimen kat 2 · katalog demo</option></select>
                  <span className="mt-1.5 block text-xs text-[#5b6478]">Katalog sesuai kategori kasus. Pemilihan tidak mengisi obat/dosis.</span></label>
                <label className="block"><span className="text-sm font-semibold text-[#123524]">Tanggal mulai *</span><input type="date" className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]" defaultValue="2026-09-01" /></label>
                <label className="block"><span className="text-sm font-semibold text-[#123524]">Rencana akhir · opsional, manual</span><input type="date" className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm outline-none focus:border-[#1B7A3E]" defaultValue="2027-02-28" /></label>
                <SelectField label="Fasilitas kerja *" options={["Puskemas Candilama"]} value="Puskemas Candilama" onChange={() => {}} />
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-[#E7F7EA] px-4 py-3.5 text-sm text-[#1f7a3f]">
                <span>🛡</span><p><strong className="font-bold text-[#0B5A2A]">Tidak ada kalkulasi resep</strong><br />Klinisi menambahkan 1–20 baris obat secara mandiri. Dosis, satuan, frekuensi, komposisi, dan tanggal akhir tidak diisis dari regimen atau berat badan.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Obat dipilih *</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Dosis · opsional</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Satuan · opsional</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Frekuensi · opsional</th></tr></thead>
                  <tbody className="divide-y">
                    {["Isoniazid", "Rifampisin", "Pirazinamid", "Etambutol"].map((o) => (
                      <tr key={o}>
                        <td className="px-2 py-2"><select aria-label={`Obat ${o}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-3 text-sm"><option>{o}</option><option>—</option></select></td>
                        <td className="px-2 py-2"><input aria-label={`Dosis ${o}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-3 text-sm" placeholder="Belum diisi" /></td>
                        <td className="px-2 py-2"><input aria-label={`Satuan ${o}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-3 text-sm" placeholder="Belum diisi" /></td>
                        <td className="px-2 py-2"><input aria-label={`Frekuensi ${o}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-3 text-sm" placeholder="Belum diisi" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-3">
                <GhostButton>+ Tambah baris obat</GhostButton>
                <GhostButton>− Hapus baris terpilih</GhostButton>
                <p className="self-center text-xs text-[#5b6478]">4 dari maksimum 20 baris</p>
              </div>
              <label className="block"><span className="text-sm font-semibold text-[#123524]">Catatan rencana</span>
                <textarea className="mt-2 min-h-24 w-full rounded-xl border border-[#d8dcea] px-4 py-3 text-sm outline-none focus:border-[#1B7A3E]" defaultValue="Rencana dimasukkan manual oleh klinisi setelah tinjauan kasus." /></label>
              <label className="flex items-center gap-3 text-sm text-[#3f4660]"><input type="checkbox" className="size-4" />Saya meninjau regimen, setiap baris obat, tanggal, dan fasilitas kerja.</label>
              <div className="flex gap-3"><PrimaryButton type="submit">Tinjau &amp; mulai episode</PrimaryButton><GhostButton>Kembali ke kasus</GhostButton></div>
            </form>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardTitle right={<Chip tone="green">Syarat awal terpenuhi · contoh</Chip>}>Tinjauan awal</CardTitle>
              <dl className="space-y-3 text-sm">{[["Kasus", "K-0891 · ACTIVE"], ["Episode terbuka", "Tidak ada PLANNED / ACTIVE / PAUSED"], ["Hasil akhir", "Belum ada"], ["Sumber pilihan", "dr. Kalvari · input manual"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b pb-2"><dt className="text-[#5b6478]">{k}</dt><dd className="font-semibold text-[#123524]">{v}</dd></div>
              ))}</dl>
              <p className="mt-4 text-sm leading-relaxed text-[#5b6478]">Memulai episode membekukan regimen, tanggal mulai, dan snapshot baris obat. Tinjau kembali sebelum konfirmasi.</p>
            </Card>
            <Card>
              <CardTitle right={<Chip tone="blue">T-0901 ACTIVE · keadaan setelah mulai</Chip>}>Mode edit metadata · terpisah</CardTitle>
              <div className="space-y-4 text-sm">
                <div className="rounded-xl bg-[#EEF0FA] px-4 py-3 font-medium text-[#3f4660]">🔒 Regimen / mulai / status / obat — dikunci setelah mulai</div>
                <label className="block"><span className="font-semibold text-[#123524]">Rencana akhir · edit manual</span><input className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4" defaultValue="28 Feb 2027" /></label>
                <label className="block"><span className="font-semibold text-[#123524]">Catatan rencana · edit metadata</span><textarea className="mt-2 min-h-20 w-full rounded-xl border border-[#d8dcea] px-4 py-3" defaultValue="Kontrol berikutnya ditinjau saat kunjungan." /></label>
                <GhostButton>Simpan metadata saja</GhostButton>
              </div>
            </Card>
          </div>
        </div>
      )}
      {sub === "bukti" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Konfirmasi kepatuhan · 7 hari terakhir</CardTitle>
            <div className="grid grid-cols-7 gap-2 text-center text-xs">
              {["SEN", "SEL", "RAB", "KAM", "JUM", "SAB", "MIN"].map((d) => (
                <div key={d} className="rounded-xl bg-[#F3F4FB] py-3"><p className="font-bold text-[#5b6478]">{d}</p><p className="mt-1 text-sm text-[#1B7A3E]">3/3 ✓</p></div>
              ))}
            </div>
            <p className="mt-4 text-sm text-[#5b6478]">Sumber: konfirmasi portal pasien (self) dan pencatatan PMO. Sinkron otomatis, tanpa pengubah manual pada rancangan ini.</p>
          </Card>
          <Card>
            <CardTitle>Ringkasan</CardTitle>
            <p className="text-3xl font-extrabold text-[#0B5A2A]">100%</p>
            <p className="text-sm text-[#5b6478]">Kepatuhan 48 jam terakhir · streak aktif</p>
            <Chip tone="green">Phase 3B validated</Chip>
          </Card>
        </div>
      )}
    </>
  );
}

/* ---------- Modul 4: Tindak Lanjut (Jadwal & Kunjungan, Efek Samping, Hasil Akhir) ---------- */

const SUB_TINDAK = [
  { key: "jadwal", label: "Jadwal & Kunjungan" },
  { key: "efek", label: "Efek Samping" },
  { key: "hasil", label: "Hasil Akhir" },
] as const;

function TindakLanjut() {
  const [sub, setSub] = useState("jadwal");
  return (
    <>
      <SubTabs tabs={SUB_TINDAK} active={sub} onChange={setSub} />
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {sub === "jadwal" ? "Jadwal & kunjungan tindak lanjut" : sub === "efek" ? "Tindak lanjut efek samping" : "Hasil akhir pengobatan"}
        </h1>
        <p className="mt-2 text-[#5b6478]">{sub === "jadwal" ? "Kelola agenda kunjungan pasien dalam cakupan fasilitas." : sub === "efek" ? "Tinjau laporan efek samping dari portal pasien dan catat tindak lanjut." : "Catat hasil akhir episode pengobatan setelah evaluasi."}</p>
      </section>
      {sub === "jadwal" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Kunjungan terjadwal</CardTitle>
            <ul className="space-y-3 text-sm">
              {[["Kamis, 14 Nov 2026 · 09:00 WIB", "Kunjungan rumah — •••• 0891", "green", "Terkonfirmasi"], ["Selasa, 19 Nov 2026 · 08:00 WIB", "Kontrol bulanan di faskes — •••• 0214", "blue", "Terjadwal"], ["Jumat, 21 Nov 2026 · 10:00 WIB", "Pengambilan obat — •••• 0418", "gray", "Menunggu konfirmasi"]].map(([w, t, tone, s]) => (
                <li key={w} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F3F4FB] px-4 py-4">
                  <span><strong className="block text-[#123524]">{w}</strong><span className="text-[#5b6478]">{t}</span></span>
                  <span className="flex items-center gap-3"><Chip tone={tone as "green" | "blue" | "gray"}>{s}</Chip><GhostButton className="!min-h-10 !px-4 text-xs">Detail</GhostButton></span>
                </li>
              ))}
            </ul>
            <PrimaryButton className="mt-5">+ Jadwalkan kunjungan</PrimaryButton>
          </Card>
          <Card>
            <CardTitle>Agenda hari ini</CardTitle>
            <p className="text-sm leading-relaxed text-[#5b6478]">2 kunjungan rumah dan 3 pengambilan obat di fasilitas. Konfirmasi kehadiran memperbarui riwayat tindak lanjut tanpa mengubah data klinis lain.</p>
          </Card>
        </div>
      )}
      {sub === "efek" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Laporan efek samping masuk</CardTitle>
            <ul className="space-y-3 text-sm">
              {[["Hari ini · 13:10 WIB", "•••• 0891", "Mual ringan setelah dosis siang", "amber", "Ditinjau"], ["3 hari lalu", "•••• 0214", "Nyeri sendi ringan, berlanjut 2 hari", "amber", "Ditinjau"], ["1 minggu lalu", "•••• 0418", "Mati rasa ujung jari (dosis ETM)", "red", "Eskalasi ke dokter"]].map(([w, p, t, tone, s]) => (
                <li key={t} className="rounded-xl bg-[#F3F4FB] px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[#123524]">{t}</strong><Chip tone={tone as "amber" | "red"}>{s}</Chip></div>
                  <p className="mt-1 text-xs text-[#8a90a5]">{w} · pasien {p}</p>
                  <div className="mt-3 flex gap-2"><GhostButton className="!min-h-10 !px-4 text-xs">Catat tindak lanjut</GhostButton><GhostButton className="!min-h-10 !px-4 text-xs">Hubungi pasien</GhostButton></div>
                </li>
              ))}
            </ul>
          </Card>
          <div className="rounded-2xl bg-[#FDE3E1] p-5 text-sm leading-relaxed text-[#b42318]">
            <p className="font-bold">Gejala bahaya (eskalasi segera)</p>
            <ul className="mt-2 list-disc pl-5"><li>Ikterus / urin sangat gelap</li><li>Gangguan penglihatan mendadak</li><li>Reaksi kulit berat</li><li>Sesak napas berat</li></ul>
          </div>
        </div>
      )}
      {sub === "hasil" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>Catat hasil akhir episode</CardTitle>
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <SelectField label="Hasil akhir" options={["CURED", "COMPLETED", "TREATMENT_FAILED", "DIED", "LOST_TO_FOLLOW_UP"]} value="CURED" onChange={() => {}} />
              <label className="block"><span className="text-sm font-semibold text-[#123524]">Tanggal hasil *</span><input type="date" className="mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] px-4 text-sm" /></label>
              <label className="block"><span className="text-sm font-semibold text-[#123524]">Catatan</span><textarea className="mt-2 min-h-24 w-full rounded-xl border border-[#d8dcea] px-4 py-3 text-sm" placeholder="Ringkasan evaluasi akhir…" /></label>
              <PrimaryButton type="submit">Simpan hasil akhir</PrimaryButton>
            </form>
          </Card>
          <Card>
            <CardTitle>Aturan</CardTitle>
            <ul className="space-y-3 text-sm leading-relaxed text-[#5b6478]">
              <li>• Hasil akhir menutup episode; tidak dapat diubah tanpa alur koreksi.</li>
              <li>• Memerlukan TB_OFFICER izin tulis dan fasilitas kerja sesuai.</li>
              <li>• ETag/If-Match berlaku untuk mencegah konflik versi.</li>
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

/* ---------- Modul 5: Kontinuitas (Rujukan & Transfer, Kontak & Investigasi, TPT) ---------- */

const SUB_KONT = [
  { key: "rujukan", label: "Rujukan & Transfer" },
  { key: "kontak", label: "Kontak & Investigasi" },
  { key: "tpt", label: "TPT" },
] as const;

function Kontinuitas() {
  const [sub, setSub] = useState("rujukan");
  return (
    <>
      <SubTabs tabs={SUB_KONT} active={sub} onChange={setSub} />
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {sub === "rujukan" ? "Rujukan & transfer kelanjutan rawat" : sub === "kontak" ? "Investigasi kontak" : "Terapi Pencegahan TBC (TPT)"}
        </h1>
        <p className="mt-2 text-[#5b6478]">{sub === "rujukan" ? "Kelola rujukan antar fasilitas dan transfer kelanjutan pengobatan." : sub === "kontak" ? "Susun daftar kontak serumah dan catat investigasi." : "Kelola kelayakan dan pemberian TPT bagi kontak dan populasi lain."}</p>
      </section>
      <DemoBanner title="Konsep pengembangan · Data demo">Modul kontinuitas (Phase 4A/4B) berupa contoh rancangan; tidak ada rujukan atau investigasi nyata yang dibuat.</DemoBanner>
      {sub === "rujukan" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Daftar rujukan / transfer</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Ref</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Pasien</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Jenis</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Tujuan</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Status</th></tr></thead>
                <tbody className="divide-y">
                  {[["RF-101", "•••• 0891", "TRANSFER KELANJUTAN", "RSUD Kota Semarang", "DIJAWALKAN", "blue"], ["RF-098", "•••• 0214", "RUJUKAN TCM", "Lab daerah", "SELESAI", "green"]].map(([r, p, j, t, s, tone]) => (
                    <tr key={r}><td className="px-4 py-4 font-semibold text-[#123524]">{r}</td><td className="px-4 py-4 text-[#5b6478]">{p}</td><td className="px-4 py-4 text-[#5b6478]">{j}</td><td className="px-4 py-4 text-[#5b6478]">{t}</td><td className="px-4 py-4"><Chip tone={tone as "blue" | "green"}>{s}</Chip></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-[#8a90a5]">REFERRED mempertahankan fasilitas sumber saat ini; transfer membuat kelanjutan di fasilitas tujuan.</p>
          </Card>
          <Card>
            <CardTitle>Buat rujukan</CardTitle>
            <div className="space-y-4">
              <SelectField label="Jenis" options={["Rujukan TCM", "Transfer kelanjutan", "Rujukan rumah sakit"]} value="Rujukan TCM" onChange={() => {}} />
              <SelectField label="Fasilitas tujuan" options={["Lab daerah", "RSUD Kota Semarang", "RS paru"]} value="Lab daerah" onChange={() => {}} />
              <label className="block"><span className="text-sm font-semibold text-[#123524]">Alasan</span><textarea className="mt-2 min-h-20 w-full rounded-xl border border-[#d8dcea] px-4 py-3 text-sm" placeholder="Alasan rujukan…" /></label>
              <PrimaryButton>Buat draf rujukan</PrimaryButton>
            </div>
          </Card>
        </div>
      )}
      {sub === "kontak" && (
        <Card>
          <CardTitle right={<Chip tone="amber">Data demo · 4 kontak</Chip>}>Daftar kontak &amp; investigasi</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Kontak</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Relasi</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Skrining</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Tindak lanjut</th></tr></thead>
              <tbody className="divide-y">
                {[["Kontak A ••••", "Anak · serumah", "Belum", "Jadwalkan skrining"], ["Kontak B ••••", "Pasangan · serumah", "Gejala ringan", "Evaluasi klinis"], ["Kontak C ••••", "Kakek · serumah", "Tidak ada gejala", "Edukasi & monitor"], ["Kontak D ••••", "Lainnya · serumah", "Terdeteksi TB", "Registrasi penunjang"]].map(([k, r, s, f]) => (
                  <tr key={k}><td className="px-4 py-4 font-semibold text-[#123524]">{k}</td><td className="px-4 py-4 text-[#5b6478]">{r}</td><td className="px-4 py-4"><Chip tone={s === "Terdeteksi TB" ? "red" : s === "Belum" ? "gray" : s.includes("gejala") ? "amber" : "green"}>{s}</Chip></td><td className="px-4 py-4 font-semibold text-[#1B7A3E]">{f} →</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {sub === "tpt" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle>Kelayakan &amp; regimen TPT</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Kontak</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Kelayakan</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Regimen</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Status</th></tr></thead>
                <tbody className="divide-y">
                  {[["Kontak B ••••", "Layak", "3HP · 12 dosis", "DIJADWALKAN", "blue"], ["Kontak C ••••", "Layak", "6H · 6 bulan", "AKTIF", "green"], ["Kontak A ••••", "Menunggu skrining", "—", "EVALUASI", "gray"]].map(([k, l, r, s, tone]) => (
                    <tr key={k}><td className="px-4 py-4 font-semibold text-[#123524]">{k}</td><td className="px-4 py-4 text-[#5b6478]">{l}</td><td className="px-4 py-4 text-[#5b6478]">{r}</td><td className="px-4 py-4"><Chip tone={tone as "blue" | "green" | "gray"}>{s}</Chip></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardTitle>Prinsip</CardTitle>
            <ul className="space-y-3 text-sm leading-relaxed text-[#5b6478]">
              <li>• Kelayakan dan keputusan TPT ditentukan tenaga kesehatan.</li>
              <li>• Pasien melihat status TPT hanya baca di portal.</li>
              <li>• Kontak dibuat lewat alur investigasi, bukan input bebas.</li>
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

/* ---------- Modul 6: Pemantauan (Rencana & Kegiatan, Peringatan, Notifikasi, After Verifikasi) ---------- */

const SUB_PEMANTAUAN = [
  { key: "rencana", label: "Rencana & Kegiatan" },
  { key: "peringatan", label: "Peringatan" },
  { key: "notifikasi", label: "Notifikasi" },
  { key: "after", label: "After Verifikasi" },
] as const;

function Pemantauan() {
  const [sub, setSub] = useState("rencana");
  const [tahap, setTahap] = useState("H-5");
  return (
    <>
      <SubTabs tabs={SUB_PEMANTAUAN} active={sub} onChange={setSub} />
      {sub !== "after" && (
        <section>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
            {sub === "rencana" ? "Rencana & kegiatan pemantauan" : sub === "peringatan" ? "Peringatan overdue kegiatan" : "Notifikasi terkirim"}
          </h1>
          <p className="mt-2 text-[#5b6478]">{sub === "rencana" ? "Susun rencana pemantauan manual MANUAL_V1." : sub === "peringatan" ? "Kegiatan melewati batas waktu menjadi explicit overdue." : "Notifikasi pengguna saat ini hanya IN_APP/DELIVERED."}</p>
        </section>
      )}
      {sub === "rencana" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardTitle right={<Chip tone="gray">MANUAL_V1</Chip>}>Kegiatan pemantauan</CardTitle>
            <ul className="space-y-3 text-sm">
              {[["Kepatuhan harian", "Otomatis via portal & PMO", "green", "Aktif"], ["Kunjungan rumah bulanan", "Manual · petugas", "blue", "Terjadwal"], ["Evaluasi bulan ke-2", "Manual · dokter", "amber", "Menunggu"]].map(([k, s, tone, v]) => (
                <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F3F4FB] px-4 py-3"><span><strong className="text-[#123524]">{k}</strong><span className="block text-xs text-[#8a90a5]">{s}</span></span><Chip tone={tone as "green" | "blue" | "amber"}>{v}</Chip></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>Batasan</CardTitle>
            <p className="text-sm leading-relaxed text-[#5b6478]">Acknowledge/resolve tidak menyelesaikan kegiatan klinis. Peringatan overdue bersifat eksplisit dan terpisah dari notifikasi.</p>
          </Card>
        </div>
      )}
      {sub === "peringatan" && (
        <Card>
          <CardTitle right={<Chip tone="red">2 overdue</Chip>}>Peringatan kegiatan melewati batas</CardTitle>
          <ul className="space-y-3 text-sm">
            {[["Evaluasi bulan ke-2 — •••• 0418", "Lewat 2 hari", "red"], ["Pengambilan obat — •••• 0523", "Lewat 5 jam", "amber"]].map(([t, w, tone]) => (
              <li key={t} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FDEBD3] px-4 py-3"><strong className="text-[#8a5a12]">{t}</strong><Chip tone={tone as "red" | "amber"}>{w}</Chip></li>
            ))}
          </ul>
        </Card>
      )}
      {sub === "notifikasi" && (
        <Card>
          <CardTitle right={<Chip>IN_APP · DELIVERED</Chip>}>Notifikasi terkirim</CardTitle>
          <ul className="space-y-3 text-sm">
            {[["Pengingat pencatatan H-5 · •••• 0891", "13:55 WIB", "Terkirim"], ["Hasil TCM tersedia · •••• 0214", "10:12 WIB", "Terkirim"], ["Pengingat H-90 · •••• 0418", "Kemarin 12:30 WIB", "Terkirim"]].map(([t, w, s]) => (
              <li key={t} className="flex items-center justify-between rounded-xl bg-[#F3F4FB] px-4 py-3"><span><strong className="text-[#123524]">{t}</strong><span className="block text-xs text-[#8a90a5]">{w}</span></span><Chip tone="green">{s}</Chip></li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-[#8a90a5]">Outbox WhatsApp, template, receipt dan retry belum tersedia pada rancangan ini.</p>
        </Card>
      )}
      {sub === "after" && (
        <>
          <section>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">Antrean Pengiriman · {tahap} menit</h1>
            <p className="mt-2 text-[#5b6478]">Skenario A · belum ada laporan pada snapshot 13.55 WIB. Pengingat akhir pencatatan, bukan peringatan darurat klinis.</p>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-[#3f4660]">Tahap waktu:</span>
            {["H-90", "H-5", "Overdue"].map((t) => (
              <button key={t} type="button" onClick={() => setTahap(t)} className={`min-h-11 rounded-full px-5 text-sm font-semibold ${tahap === t ? "bg-[#0B5A2A] text-white" : "bg-[#EEF0FA] text-[#3f4660]"}`}>{t}</button>
            ))}
            <span className="ml-auto text-xs text-[#8a90a5]">Mockup statis · 08 Oktober 2026 · WIB / Asia Jakarta</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[["H-90 menit", "12.30 WIB", "Awal pengingat pencatatan", "green"], ["H-5 menit", "13.55 WIB", "Cek laporan sebelum kirim", "amber"], ["Overdue", "> 14.00 WIB", "Contoh pemeriksaan 14.01", "gray"]].map(([t, w, d, tone]) => (
              <div key={t} className={`rounded-2xl border bg-white p-5 ${tahap === t ? "border-2 border-[#f2a33c]" : "border-[#e4e8f4]"}`}>
                <div className="flex items-center justify-between"><Chip tone={tone as "green" | "amber" | "gray"}>{t}</Chip><span aria-hidden="true">🕐</span></div>
                <p className="mt-2 text-2xl font-extrabold text-[#123524]">{w}</p><p className="mt-1 text-sm text-[#5b6478]">{d}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-[#FDEBD3] px-5 py-4 text-sm text-[#8a5a12]" role="note">
            <span aria-hidden="true">⚠️</span>
            <p><strong className="font-bold">Batas pencatatan mendekat · 14.00 WIB</strong><br />Snapshot demo 13.55 WIB. Belum ada laporan berkorelasi; cek ulang sebelum kirim. Ini tidak menyatakan dosis terlewat atau diagnosis pasien.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <div className="space-y-6">
              <Card>
                <CardTitle right={<Chip tone="amber">Semua state provider · Simulasi</Chip>}>Antrean {tahap} · status diperiksa ulang</CardTitle>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Referensi aman</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Tahap waktu</th><th className="px-4 py-3 font-semibold text-[#3f4660]">State provider</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Laporan klinis</th></tr></thead>
                    <tbody className="divide-y">
                      <tr className="bg-[#E7F7EA]"><td className="px-4 py-4 font-semibold text-[#0B5A2A]">Jadwal A · terpilih</td><td className="px-4 py-4 text-[#123524]">{tahap}<br /><span className="text-xs">13.55 WIB</span></td><td className="px-4 py-4 text-[#123524]">Antre<br /><span className="text-xs">Cek ulang wajib</span></td><td className="px-4 py-4 text-[#123524]">Belum tercatat</td></tr>
                      {[["Jadwal E · contoh lain", "Dibatalkan · Laporan masuk", "Tercatat 13.54 · Laporan mandiri"], ["Jadwal F", "Dilewati · Nomor belum valid", "Belum tercatat"], ["Jadwal G", "Ditekan · Kebijakan tidak aktif", "Tidak dinilai"]].map(([r, s, l]) => (
                        <tr key={r}><td className="px-4 py-4 font-semibold text-[#123524]">{r}</td><td className="px-4 py-4 text-[#5b6478]">{tahap}<br /><span className="text-xs">13.55 WIB</span></td><td className="px-4 py-4 text-[#5b6478]">{s.split(" · ")[0]}<br /><span className="text-xs">{s.split(" · ")[1]}</span></td><td className="px-4 py-4 text-[#5b6478]">{l}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-[#8a90a5]">Jadwal E adalah skenario terpisah, bukan laporan 13.56 pada Jadwal A. Antrean lama tetap hanya memuat informasi aman.</p>
              </Card>
              <Card>
                <CardTitle>Jadwal A · keputusan sebelum pengiriman</CardTitle>
                <div className="grid gap-4 text-sm sm:grid-cols-3">
                  {[["Tahap waktu", "H-5 · 13.55 WIB"], ["Provider · simulasi", "Antre · belum ada receipt"], ["Laporan klinis", "Belum ada laporan"]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><dt className="text-xs font-semibold text-[#5b6478]">{k}</dt><dd className="mt-1 font-bold text-[#123524]">{v}</dd></div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl bg-[#FDEBD3] px-4 py-3.5 text-sm text-[#8a5a12]"><strong className="font-bold">Recheck tepat sebelum kirim</strong><br />Jika laporan yang berkorelasi tiba, batalkan tahap yang belum terkirim. Jangan mengirim H-5 lalu mengulang hitung mundur; satu entri per jadwal/penerima/tahap.</div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <GhostButton>Tinjau status laporan · usulan</GhostButton>
                  <GhostButton>Kirim WA · belum tersedia</GhostButton>
                </div>
              </Card>
              <Card>
                <CardTitle>Contoh pembatalan saat laporan masuk</CardTitle>
                <div className="grid gap-4 text-sm sm:grid-cols-3">
                  {[["Jadwal E · 13.54", "Laporan pasien tercatat"], ["Cek korelasi jadwal", "Penerima & sumber cocok"], ["13.55 · Simulasi", "H-5 belum dikirim → batal"]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><dt className="text-xs font-semibold text-[#5b6478]">{k}</dt><dd className="mt-1 font-bold text-[#123524]">{v}</dd></div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-[#8a90a5]">Pembatalan tidak memvalidasi dosis, mengubah bukti, menyelesaikan kegiatan atau resolve alert. Pesan yang sudah dikirim tidak dijanjikan bisa ditarik kembali.</p>
              </Card>
              <Card>
                <CardTitle>Pemeriksaan sebelum pengiriman</CardTitle>
                <p className="text-sm text-[#5b6478]">Syarat wajib · contoh: <strong className="text-[#123524]">Opt-in + nomor eligible terverifikasi + provider berizin</strong></p>
                <p className="mt-2 text-sm leading-relaxed text-[#5b6478]">Periksa ulang tepat sebelum kirim: laporan yang benar-benar berkorelasi, persetujuan, nomor, kebijakan aktif dan kesesuaian provider.</p>
                <div className="mt-4 rounded-xl bg-[#FDEBD3] px-4 py-3.5 text-sm text-[#8a5a12]"><strong className="font-bold">Lewati atau blokir bila syarat gagal</strong><br />Persetujuan dicabut / nomor belum terverifikasi → dilewati. Provider tidak tersedia → diblokir; portal IN_APP tetap dapat dipakai.</div>
              </Card>
            </div>
            <div className="space-y-6">
              <Card>
                <CardTitle right={<Chip tone="blue">Drilldown sumber daya · Simulasi</Chip>}>Detail penerima · akses berizin</CardTitle>
                <div className="space-y-3 text-sm">
                  <p className="text-[#5b6478]">Penerima terpilih</p><p className="font-bold text-[#123524]">Prabowo Gunawan · pengobatan sendiri</p>
                  <p className="text-[#5b6478]">Nomor tujuan</p><p className="font-bold text-[#123524]">+62 812 •••• •19 · verifikasi contoh</p>
                  <p className="text-[#5b6478]">Persetujuan pasien</p><p className="font-bold text-[#123524]">Opt-in eksplisit · contoh disetujui</p>
                  <p className="text-[#5b6478]">Status laporan klinis</p><p className="font-bold text-[#123524]">Belum ada laporan yang berkorelasi</p>
                  <p className="text-[#5b6478]">Keslaparan provider nyata</p><p className="font-bold text-[#123524]">Belum dikonfigurasi · belum ada pengiriman</p>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-[#8a90a5]">Detail ini hanya terlihat setelah izin target dan fasilitas lolos. Izin alat pengirim baru masuk usulan, tidak otomatis diberikan oleh TB_OFFICER.</p>
              </Card>
              <Card>
                <CardTitle right={<Chip tone="blue">Usulan template untuk persetujuan</Chip>}>Pratinjau template WhatsApp</CardTitle>
                <div className="rounded-xl bg-[#EEF0FA] p-5">
                  <p className="text-xs font-semibold text-[#5b6478]">Pengingat portal · Simulasi</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#3f4660]">Ada jadwal pencatatan yang perlu Anda tinjau. Buka portal untuk melihat detail.</p>
                  <GhostButton className="mt-4 w-full !bg-white">Buka portal pasien →</GhostButton>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#8a90a5]">Tujuan usulan: login → Jadwal Obat Saya → After Verifikasi, hanya catatan pemikir akun. Tanpa hostname nyata, ID atau token di query yang terlihat.</p>
              </Card>
              <div className="rounded-2xl bg-[#E7F7EA] p-5 text-sm leading-relaxed text-[#1f7a3f]">
                <p className="font-bold text-[#0B5A2A]">🛡 Aman pada layar kunci</p>
                <p className="mt-1.5">Tidak memuat diagnosis TB, NIK, regimen, dosis, atau detail medis. Nama pasien hanya di detail portal berizin, bukan di pesan eksternal.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 rounded-2xl bg-[#E9EBF7] p-6 sm:grid-cols-2">
            <div><p className="text-xs font-bold tracking-wide text-[#4c5470]">HANDOFF DEVELOPER · UI STATIS, BUKAN ENDPOINT AKTIF — SUDAH DIDUKUNG</p><p className="mt-1.5 text-sm text-[#3f4660]">Monitoring manual MANUAL_V1, alert overdue kegiatan eksplisit, notifikasi pengguna saat ini hanya IN_APP/DELIVERED.</p></div>
            <div><p className="text-xs font-bold tracking-wide text-[#4c5470]">PERLU PENGEMBANGAN BARU</p><p className="mt-1.5 text-sm text-[#3f4660]">Aturan obat H-90/H-5, korelasi laporan & pembatalan, opt-in/nomor terverifikasi, outbox, provider WA, template, receipt dan retry. Belum ada kontrak/endpoint modul ini; bukan rencana event monitoring.</p></div>
          </div>
        </>
      )}
    </>
  );
}
