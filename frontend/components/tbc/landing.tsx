"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart, DarkFooter, PrimaryButton, TBC_ROUTES, StatTile, TbcLogo } from "@/components/tbc/ui";

/* Halaman utama TB Call Center Jawa Tengah (mockup: Main.png) */

const STATS = [
  { value: "47.2K", label: "Total Notifikasi", delta: "8.3% vs 2022", icon: "users" },
  { value: "89.4%", label: "Success Rate", delta: "2.1% peningkatan", icon: "check" },
  { value: "76.8%", label: "Pemeriksaan Dahak", delta: "4.5% peningkatan", icon: "micro" },
  { value: "2.1K", label: "Kasus TB-RO/MDR", delta: "5.2% penurunan", icon: "alert" },
  { value: "4.2%", label: "Case Fatality Rate", delta: "0.8% terkendali", icon: "heart" },
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const KASUS_2023 = [28, 31, 26, 30, 34, 29, 32, 35, 38, 33, 37, 36];
const KASUS_2022 = [33, 36, 31, 35, 38, 34, 36, 39, 42, 37, 41, 40];

const EDUKASI = [
  { tag: "Gejala Dini", judul: "Kenali Gejala TBC Sejak Dini", desc: "Batuk berdurus terus-menerus ≥ 2 minggu disertai malam hari, nafsu makan turun…", baca: "3 mnt baca" },
  { tag: "Kepatuhan OAT", judul: "Patuh Minum OAT Tiap Hari", desc: "Mengapa pengobatan 6 bulan tidak boleh tertunda demi mencegah resistensi kuman…", baca: "5 mnt baca" },
  { tag: "Pencegahan", judul: "Etika Batuk & Ventilasi Rumah", desc: "Langkah mudah melindungi keluarga dari serumah dan tata ruang sirkulasi udara…", baca: "4 mnt baca" },
  { tag: "Pediatrik / Anak", judul: "TBC Anak: Kenali Ciri-cirinya", desc: "Berat badan tidak naik berbulan-bulan, lesi, dan pentingnya Terapi Pencegahan TBC…", baca: "6 mnt baca" },
] as const;

function Icon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", className: "size-5", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  if (name === "users") return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 19c1.3-3 3.5-4.5 6-4.5s4.7 1.5 6 4.5" strokeLinecap="round" /><path d="M16 5a3 3 0 0 1 0 6M18.5 14.5c1.6.7 2.9 2.1 3.5 4.5" strokeLinecap="round" /></svg>;
  if (name === "check") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "micro") return <svg {...common}><path d="M6 18 18 6" strokeLinecap="round" /><path d="M9 4h6l-2 4 2 4h-6l2-4-2-4Z" strokeLinejoin="round" /><path d="M11 18h4M13 16v4" strokeLinecap="round" /></svg>;
  if (name === "alert") return <svg {...common}><path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" /><path d="M12 10v4m0 3h.01" strokeLinecap="round" /></svg>;
  return <svg {...common}><path d="M12 21s-7.5-4.6-9.5-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.5 12c-2 4.4-9.5 9-9.5 9Z" strokeLinejoin="round" /></svg>;
}

export default function LandingPage() {
  const [tahun, setTahun] = useState<"2023" | "2022" | "2021" | "3 Tahun Tren">("2023");
  const data = useMemo(() => (tahun === "2022" ? KASUS_2022 : KASUS_2023).map((v, i) => ({ label: MONTHS[i]!, value: v })), [tahun]);

  return (
    <div className="min-h-dvh bg-[#FAFBF7]">
      {/* NAVBAR */}
      <header className="bg-[#FAFBF7]">
        <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <TbcLogo />
            <nav aria-label="Navigasi utama" className="hidden items-center gap-1 md:flex">
              <Link href="#statistik" className="rounded-full bg-[#0B5A2A] px-5 py-2.5 text-sm font-semibold text-white">Beranda</Link>
              <a href="#statistik" className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#14532d] hover:bg-[#E9F8EC]">Statistik &amp; GIS</a>
              <a href="#edukasi" className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#14532d] hover:bg-[#E9F8EC]">Edukasi OAT</a>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href={TBC_ROUTES.portal} className="hidden items-center gap-2 rounded-full bg-[#E9F8EC] px-4 py-2.5 text-sm font-semibold text-[#14532d] hover:bg-[#DCF2DF] sm:inline-flex">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.5-3.4 4-5 7-5s5.5 1.6 7 5" strokeLinecap="round" /></svg>
              Portal Pasien
            </Link>
            <Link href={TBC_ROUTES.nakes} className="hidden items-center gap-2 rounded-full bg-[#E9F8EC] px-4 py-2.5 text-sm font-semibold text-[#14532d] hover:bg-[#DCF2DF] lg:inline-flex">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v6m-3-3h6" strokeLinecap="round" /><circle cx="12" cy="14" r="7" /></svg>
              Dashboard Nakes
            </Link>
            <Link href={TBC_ROUTES.admin} className="hidden items-center gap-2 rounded-full bg-[#E9F8EC] px-4 py-2.5 text-sm font-semibold text-[#14532d] hover:bg-[#DCF2DF] xl:inline-flex">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M9 9v11" /></svg>
              Admin Faskes
            </Link>
            <Link href={TBC_ROUTES.masuk} className="relative inline-flex size-11 items-center justify-center rounded-full text-[#123524] hover:bg-[#E9F8EC]" aria-label="Notifikasi dan masuk">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 20a2.2 2.2 0 0 0 4 0" strokeLinecap="round" /></svg>
              <span className="absolute right-2 top-2 size-2.5 rounded-full bg-red-500 ring-2 ring-[#FAFBF7]" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B3B1E] via-[#116B33] to-[#1B7A3E] text-white">
        <div aria-hidden="true" className="absolute -left-32 top-10 size-96 rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute left-40 bottom-0 size-72 rounded-full border border-white/10" />
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Program Eliminasi TBC Jawa Tengah
            </p>
            <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight xl:text-6xl">
              TB Call Center<br /><span className="text-[#B7E8B0]">Jawa Tengah</span>
            </h1>
            <p className="mt-6 max-w-xl leading-relaxed text-white/80">
              Platform terintegrasi pemantauan, deteksi dini, dan manajemen data Tuberkulosis
              berbasis Artificial Intelligence (XGBoost + SHAP) di Provinsi Jawa Tengah.
              Memperkuat kolaborasi faskes, dokter, dan pasien secara presisi.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={TBC_ROUTES.daftar}><PrimaryButton className="!bg-white !text-[#0B5A2A] hover:!bg-[#E9F8EC]">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 19c1.3-3 3.5-4.5 6-4.5s4.7 1.5 6 4.5" strokeLinecap="round" /><path d="M19 8v6m3-3h-6" strokeLinecap="round" /></svg>
                Daftar Akun Pasien
              </PrimaryButton></Link>
              <a href="#statistik" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur hover:bg-white/20">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7" strokeLinecap="round" /></svg>
                Pantau GIS &amp; Statistik
              </a>
              <Link href={TBC_ROUTES.nakes} className="inline-flex min-h-12 items-center gap-2 px-4 text-sm font-semibold text-white/90 underline-offset-4 hover:underline">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M9 9v11" /></svg>
                Portal Nakes
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-xs font-medium text-white/65">
              <span className="inline-flex items-center gap-2"><svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>Enkripsi Standar Medis SATUSEHAT</span>
              <span>ISO 27001 Certified Ready</span>
            </div>
          </div>
          <div className="relative hidden justify-self-center lg:block" aria-hidden="true">
            <div className="relative flex h-80 w-72 items-end justify-center overflow-hidden rounded-b-[999px] rounded-t-full bg-gradient-to-b from-white/15 to-white/5">
              <span className="mb-16 flex size-36 items-center justify-center rounded-full bg-white/15 text-7xl">🧑‍⚕️</span>
            </div>
          </div>
        </div>
      </section>

      {/* TIGA PORTAL */}
      <section className="mx-auto -mt-10 grid max-w-[1200px] gap-6 px-4 sm:px-6 md:grid-cols-3">
        {[
          { badge: "Pasien Mandiri", title: "Portal Pasien TB", href: TBC_ROUTES.portal, cta: "Masuk Sebagai Pasien", icon: <circle cx="12" cy="8.5" r="3.5" />, icon2: <path d="M5 20c1.5-3.4 4-5 7-5s5.5 1.6 7 5" strokeLinecap="round" />, desc: "Jadwal minum OAT harian, notifikasi WhatsApp pintar, konsultasi efek samping obat, dan pelacakan status kesembuhan berbasis AI." },
          { badge: "Dokter & Perawat", title: "Dashboard Nakes", href: TBC_ROUTES.nakes, cta: "Akses Dashboard Nakes", icon: <path d="M12 3v6m-3-3h6" strokeLinecap="round" />, icon2: <circle cx="12" cy="14" r="7" />, desc: "Validasi kepatuhan OAT pasien, prediksi risiko putus obat via XGBoost + SHAP analysis, penyesuaian resep, dan rujukan TCM." },
          { badge: "Dinkes & Faskes", title: "Admin Faskes & GIS", href: TBC_ROUTES.admin, cta: "Kelola Data & Faskes", icon: <rect x="4" y="4" width="16" height="16" rx="2" />, icon2: <path d="M4 9h16M9 9v11" />, desc: "Agregasi insiden per kabupaten/kota, stok logistik obat FDC & Kat 1/Kat 2, pemantauan laboratorium TCM, dan audit Dinkes." },
        ].map((p) => (
          <article key={p.title} className="rounded-2xl border border-[#e4e8f4] bg-white p-7 shadow-[0_8px_30px_rgba(11,59,30,0.08)]">
            <div className="flex items-start justify-between">
              <span className="flex size-12 items-center justify-center rounded-xl bg-[#E9F8EC] text-[#1B7A3E]">
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{p.icon}{p.icon2}</svg>
              </span>
              <span className="rounded-full bg-[#0B5A2A] px-3 py-1 text-[11px] font-bold text-white">{p.badge}</span>
            </div>
            <h2 className="mt-5 text-xl font-bold text-[#123524]">{p.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#5b6478]">{p.desc}</p>
            <Link href={p.href} className="mt-6 inline-flex w-full min-h-12 items-center justify-between rounded-xl bg-[#EEF0FA] px-5 text-sm font-semibold text-[#123524] transition hover:bg-[#e2e5f4]">
              {p.cta}
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          </article>
        ))}
      </section>

      {/* STATISTIK */}
      <section id="statistik" className="mx-auto max-w-[1200px] scroll-mt-24 px-4 pt-20 sm:px-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-[#EEF0FA] px-4 py-2 text-xs font-bold tracking-wide text-[#4c5470]">DATA &amp; STATISTIK RESMI</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#123524]">Statistik TBC Jawa Tengah 2021–2023</h2>
            <p className="mt-2 text-[#5b6478]">Data komprehensif pelaporan kasus, penanganan, dan capaian program eliminasi terintegrasi.</p>
          </div>
          <div className="flex rounded-full bg-[#EEF0FA] p-1.5" role="tablist" aria-label="Pilih tahun statistik">
            {(["2023", "2022", "2021", "3 Tahun Tren"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tahun === t} onClick={() => setTahun(t)}
                className={`min-h-10 rounded-full px-4 text-sm font-semibold ${tahun === t ? "bg-[#0B5A2A] text-white" : "text-[#4c5470] hover:bg-white"}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {STATS.map((s) => <StatTile key={s.label} icon={<Icon name={s.icon} />} value={s.value} label={s.label} delta={s.delta} up={s.delta.includes("peningkatan")} />)}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-[#e4e8f4] bg-white p-6">
            <h3 className="text-lg font-bold text-[#123524]">Tren Kasus TBC per Bulan</h3>
            <p className="mb-6 mt-1 text-sm text-[#5b6478]">Distribusi penemuan kasus bulanan periode {tahun === "3 Tahun Tren" ? "2021–2023" : tahun}</p>
            <div className="mb-3 flex items-center gap-4 text-xs text-[#5b6478]"><span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-[#1B7A3E]" />{tahun}</span><span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed border-[#4c5470]" />2022 (dashed)</span></div>
            <BarChart data={data.filter((_, i) => i % 2 === 0)} />
          </div>
          <div className="rounded-2xl border border-[#e4e8f4] bg-white p-6">
            <h3 className="text-lg font-bold text-[#123524]">Distribusi Usia Pasien TBC</h3>
            <p className="mt-1 text-sm text-[#5b6478]">Breakdown kelompok usia terdampak di Jawa Tengah</p>
            <div className="mt-6 space-y-5">
              {[{ l: "Usia Produktif (15 - 44 th)", v: 54.2, w: "w-[85%]", c: "bg-[#1B7A3E]" }, { l: "Lansia (> 45 th)", v: 33.6, w: "w-[52%]", c: "bg-[#0B5A2A]" }, { l: "Anak (0 - 14 th)", v: 12.2, w: "w-[19%]", c: "bg-[#f2a33c]" }].map((r) => (
                <div key={r.l}>
                  <div className="flex items-center justify-between text-sm"><span className="font-semibold text-[#123524]">{r.l}</span><span className="font-bold text-[#123524]">{r.v}%</span></div>
                  <div className="mt-2 h-2.5 rounded-full bg-[#EEF0FA]"><div className={`h-2.5 rounded-full ${r.w} ${r.c}`} /></div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between border-t pt-4 text-sm"><span className="font-semibold text-[#5b6478]">Prioritas Skrining Aktif:</span><span className="font-bold text-[#123524]">Usia Kerja &amp; Buruh Pabrik</span></div>
          </div>
        </div>
      </section>

      {/* EDUKASI */}
      <section id="edukasi" className="mx-auto max-w-[1200px] scroll-mt-24 px-4 pt-20 sm:px-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-[#EEF0FA] px-4 py-2 text-xs font-bold tracking-wide text-[#4c5470]">MEDIA INFORMASI &amp; EDUKASI RESMI</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#123524]">Poster &amp; Infografis Kesehatan TBC</h2>
            <p className="mt-2 text-[#5b6478]">Materi edukasi visual terkini tentang pencegahan, deteksi dini, dan kepatuhan pengobatan OAT.</p>
          </div>
          <a href="#edukasi" className="inline-flex items-center gap-2 text-sm font-bold text-[#1B7A3E] hover:underline">Lihat Semua Materi (48) <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {EDUKASI.map((e, i) => (
            <article key={e.judul} className="overflow-hidden rounded-2xl border border-[#e4e8f4] bg-white shadow-sm transition hover:shadow-md">
              <div className={`flex h-44 items-center justify-center ${["bg-[#E9F8EC]", "bg-[#E3EDFB]", "bg-[#FDEBD3]", "bg-[#EEF0FA]"][i]}`} aria-hidden="true">
                <span className="text-5xl">{["🫁", "💊", "🏠", "🧒"][i]}</span>
              </div>
              <div className="p-5">
                <span className="rounded-full bg-[#DCF2DF] px-3 py-1 text-[11px] font-bold text-[#0B5A2A]">{e.tag}</span>
                <h3 className="mt-3 font-bold text-[#123524]">{e.judul}</h3>
                <p className="mt-1.5 line-clamp-2 text-sm text-[#5b6478]">{e.desc}</p>
                <div className="mt-4 flex items-center justify-between text-xs"><span className="inline-flex items-center gap-1.5 text-[#5b6478]"><svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></svg>{e.baca}</span><a href="#edukasi" className="font-bold text-[#1B7A3E] hover:underline">Pelajari →</a></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CALL CENTER DARURAT */}
      <section className="mx-auto max-w-[1200px] px-4 pb-4 pt-16 sm:px-6">
        <div className="flex flex-wrap items-center gap-6 rounded-3xl bg-gradient-to-r from-[#0B3B1E] to-[#116B33] px-8 py-10 text-white">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-3xl" aria-hidden="true">📞</span>
          <div className="min-w-64 flex-1">
            <p className="inline-block rounded-full bg-[#B7E8B0] px-3 py-1 text-[11px] font-bold text-[#0B3B1E]">BANTUAN BEBAS PULSA 24 JAM</p>
            <h2 className="mt-2 text-2xl font-extrabold">Pusat Panggilan Darurat TB Jawa Tengah</h2>
            <p className="mt-1 text-sm text-white/75">Butuh pendamping minum obat atau rujukan cepat tes GeneXpert TCM? Hubungi konselor Dinkes kami.</p>
          </div>
          <a href="tel:888999" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#0B5A2A] hover:bg-[#E9F8EC]">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" strokeLinejoin="round" /></svg>
            888-999-0 (TBC)
          </a>
          <span className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/25 px-6 text-sm font-semibold text-white/90">💬 WhatsApp Call Center</span>
        </div>
      </section>

      <DarkFooter />
    </div>
  );
}
