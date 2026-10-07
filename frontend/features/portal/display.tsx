"use client";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/problem";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
export function PortalState({ query, empty = "Belum ada catatan." }: {
    query: {
        isPending: boolean;
        error: unknown;
        refetch(): unknown;
    };
    empty?: string;
}) {
    if (query.isPending)
        return <p role="status">Memuat data…</p>;
    if (query.error instanceof ApiError && query.error.problem.status === 404)
        return <p>{empty}</p>;
    if (query.error instanceof ApiError && query.error.problem.status === 409)
        return <div role="alert"><p>{query.error.problem.code === "ACTIVE_TPT_AMBIGUOUS" ? "Terdapat lebih dari satu catatan TPT aktif. Hubungi petugas untuk memastikan catatan yang sesuai." : "Keadaan catatan telah berubah. Muat ulang dan periksa sebelum mencoba kembali."}</p><Button variant="outline" onClick={() => void query.refetch()}>Muat ulang</Button></div>;
    return <div><ApiFeedback error={query.error instanceof ApiError ? query.error : new ApiError({ status: 503, title: "Layanan belum tersedia" })}/><Button variant="outline" onClick={() => void query.refetch()}>Coba kembali</Button></div>;
}
export function Fields({ items }: {
    items: Record<string, ReactNode>;
}) { return <dl className="grid gap-4 sm:grid-cols-2">{Object.entries(items).map(([name, value]) => <div key={name}><dt className="text-sm text-muted-foreground">{name}</dt><dd className="mt-1 break-words">{value ?? "—"}</dd></div>)}</dl>; }
export function Pagination({ page, total, onPage }: {
    page: number;
    total: number;
    onPage: (page: number) => void;
}) { return <nav aria-label="Halaman daftar" className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>Sebelumnya</Button><span>Halaman {page + 1}</span><Button variant="outline" disabled={(page + 1) * 20 >= total} onClick={() => onPage(page + 1)}>Berikutnya</Button></nav>; }
export function Refresh({ onClick }: {
    onClick: () => unknown;
}) { return <Button variant="outline" onClick={() => void onClick()}>Muat ulang catatan</Button>; }
export const card = "space-y-4 rounded-xl border bg-white p-5";
export const doseGuidance = "Catatan ini merekam laporan dosis. TBCall tidak menghitung skor kepatuhan atau menentukan keberhasilan pengobatan dari catatan ini.";
export const monitoringGuidance = "Jadwal ini ditampilkan sesuai catatan petugas. Status jadwal tidak dengan sendirinya menunjukkan kondisi klinis.";
