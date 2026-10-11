"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { tbDistricts, tbPublicSource, tbPublicTotal } from "./tb-statistics-data";
const number = (value: number) => new Intl.NumberFormat("id-ID").format(value);
export function TbPublicStatistics() {
  const [all, setAll] = useState(false);
  const ranked = [...tbDistricts].sort((a,b) => b.count-a.count || a.code.localeCompare(b.code));
  const shown = all ? ranked : ranked.slice(0,6);
  const axisMax = 8000; // Shared scale above the validated maximum of 6,992.
  const ticks = [0, 2000, 4000, 6000, 8000];
  return <section id="statistik" className="scroll-mt-8 border-y bg-[#f4f8f5]"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
    <div data-reveal className="flex flex-wrap items-end justify-between gap-6"><div className="max-w-2xl"><p className="eyebrow">Data publik · {tbPublicSource.year}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">TBC dalam catatan Jawa Tengah.</h2><p className="page-description">Jumlah kasus TBC yang ditemukan pada dataset Dinas Kesehatan, menurut kabupaten/kota. Data publik ini terpisah dari catatan pasien TBCall.</p></div><div className="rounded-2xl border bg-white px-6 py-5"><p className="text-3xl font-semibold text-primary">{number(tbPublicTotal)}</p><p className="mt-2 text-sm">Total penemuan pada 35 kabupaten/kota</p><p className="mt-1 text-xs text-muted-foreground">Penjumlahan baris dataset · tahun 2024</p></div></div>
    <figure data-reveal className="mt-8 rounded-2xl border bg-white p-5 sm:p-7" aria-label="Jumlah penemuan kasus TBC per kabupaten atau kota tahun 2024">
      <figcaption className="mb-6 flex flex-wrap items-center justify-between gap-3"><span className="font-semibold">{all ? "Seluruh 35 kabupaten/kota" : "Enam kabupaten/kota dengan jumlah penemuan tertinggi"}</span><span className="text-xs text-muted-foreground">Satuan: kasus · batang dimulai dari nol</span></figcaption>
      <div className="district-chart">
        <div className="chart-axis"><span className="text-xs text-muted-foreground">Kabupaten / kota</span><svg role="img" aria-label="Diagram batang horizontal: sumbu jumlah kasus dari 0 sampai 8.000" width="100%" height="28">{ticks.map((tick,i)=><text key={tick} x={`${i*25}%`} y="18" textAnchor={i===0 ? "start" : i===4 ? "end" : "middle"} fill="currentColor" fontSize="11">{number(tick)}</text>)}</svg><span className="text-right text-xs text-muted-foreground">Kasus</span></div>
        <ol className="space-y-3">{shown.map(d=><li key={d.code} className="chart-row"><span className="text-sm leading-5">{d.name}</span><svg aria-hidden="true" viewBox="0 0 800 32" preserveAspectRatio="none" className="h-8 w-full overflow-visible">{ticks.map(tick=><line key={tick} x1={tick/axisMax*800} x2={tick/axisMax*800} y1="-6" y2="38" stroke={tick===0 ? "#576c65" : "#dfe8e3"} strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}<rect x="0" y="5" width={d.count/axisMax*800} height="22" rx="2" fill="#176b48"/></svg><span className="text-right text-sm font-semibold tabular-nums">{number(d.count)}</span></li>)}</ol>
      </div>
      <details className="disclosure mt-6"><summary>Lihat tabel data</summary><div className="overflow-x-auto"><table className="mt-3 w-full text-left text-sm"><caption className="sr-only">Penemuan kasus TBC menurut kabupaten/kota, Jawa Tengah 2024</caption><thead><tr><th scope="col" className="py-3">Kabupaten / kota</th><th scope="col" className="py-3 text-right">Jumlah kasus</th></tr></thead><tbody>{shown.map(d=><tr key={d.code} className="border-t"><th scope="row" className="py-3 pr-3 font-normal">{d.name}</th><td className="py-3 text-right tabular-nums">{number(d.count)}</td></tr>)}</tbody></table></div></details>
      <Button className="mt-7" variant="outline" aria-expanded={all} onClick={()=>setAll(!all)}>{all ? "Tampilkan enam wilayah" : "Lihat seluruh 35 wilayah"}</Button>
      <p className="mt-5 text-xs leading-6 text-muted-foreground">Panjang batang menunjukkan jumlah absolut, bukan persentase atau risiko. Perbedaan populasi dan pelaporan tidak disesuaikan. Angka ini bukan estimasi insiden, jumlah pasien unik, atau ukuran keberhasilan pengobatan.</p>
    </figure>
    <p className="mt-5 text-xs leading-6 text-muted-foreground">Sumber: <a className="font-medium text-primary underline" href={tbPublicSource.url} target="_blank" rel="noopener noreferrer">{tbPublicSource.publisher} · Portal Data Jawa Tengah (tab baru)</a>. Cakupan: {tbPublicSource.geography}; tahun pelaporan {tbPublicSource.year}. Kolom: jumlah_penemuan_kasus. Dataset diperbarui 23 Oktober 2025; diverifikasi 11 Oktober 2026. Salinan statis {tbPublicSource.version}; lisensi {tbPublicSource.license}. Tidak menyiratkan kemitraan resmi.</p>
  </div></section>;
}
