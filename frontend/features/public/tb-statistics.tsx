"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { tbDistricts, tbPublicSource, tbPublicTotal } from "./tb-statistics-data";
const number = (value: number) => new Intl.NumberFormat("id-ID").format(value);
export function TbPublicStatistics() {
  const [all, setAll] = useState(false);
  const ranked = [...tbDistricts].sort((a,b) => b.count-a.count || a.code.localeCompare(b.code));
  const shown = all ? ranked : ranked.slice(0,6);
  return <section id="statistik" className="scroll-mt-8 border-y bg-[#f4f8f5]"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-6"><div className="max-w-2xl"><p className="eyebrow">Data publik · {tbPublicSource.year}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">TBC dalam catatan Jawa Tengah.</h2><p className="page-description">Jumlah kasus TBC yang ditemukan pada dataset Dinas Kesehatan, menurut kabupaten/kota. Data publik ini terpisah dari catatan pasien TBCall.</p></div><div className="rounded-2xl border bg-white px-6 py-5"><p className="text-3xl font-semibold text-primary">{number(tbPublicTotal)}</p><p className="mt-2 text-sm">Total penemuan pada 35 kabupaten/kota</p><p className="mt-1 text-xs text-muted-foreground">Penjumlahan baris dataset · tahun 2024</p></div></div>
    <figure className="mt-8 rounded-2xl border bg-white p-5 sm:p-7" aria-label="Jumlah penemuan kasus TBC per kabupaten atau kota tahun 2024">
      <figcaption className="mb-6 flex flex-wrap items-center justify-between gap-3"><span className="font-semibold">{all ? "Seluruh 35 kabupaten/kota" : "Enam kabupaten/kota dengan jumlah penemuan tertinggi"}</span><span className="text-xs text-muted-foreground">Satuan: kasus · batang dimulai dari nol</span></figcaption>
      <ol className="grid gap-5 lg:grid-cols-2 lg:gap-x-10">{shown.map(d=><li key={d.code}><div className="mb-2 flex justify-between gap-4 text-sm"><span>{d.name}</span><span className="font-semibold tabular-nums">{number(d.count)}</span></div><div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{width:`${d.count/ranked[0].count*100}%`}}/></div></li>)}</ol>
      <Button className="mt-7" variant="outline" aria-expanded={all} onClick={()=>setAll(!all)}>{all ? "Tampilkan enam wilayah" : "Lihat seluruh 35 wilayah"}</Button>
      <p className="mt-5 text-xs leading-6 text-muted-foreground">Panjang batang menunjukkan jumlah absolut, bukan persentase atau risiko. Perbedaan populasi dan pelaporan tidak disesuaikan. Angka ini bukan estimasi insiden, jumlah pasien unik, atau ukuran keberhasilan pengobatan.</p>
    </figure>
    <p className="mt-5 text-xs leading-6 text-muted-foreground">Sumber: <a className="font-medium text-primary underline" href={tbPublicSource.url} target="_blank" rel="noopener noreferrer">{tbPublicSource.publisher} · Portal Data Jawa Tengah (tab baru)</a>. Cakupan: {tbPublicSource.geography}; tahun pelaporan {tbPublicSource.year}. Kolom: jumlah_penemuan_kasus. Dataset diperbarui 23 Oktober 2025; diverifikasi 11 Oktober 2026. Salinan statis {tbPublicSource.version}; lisensi {tbPublicSource.license}. Tidak menyiratkan kemitraan resmi.</p>
  </div></section>;
}
