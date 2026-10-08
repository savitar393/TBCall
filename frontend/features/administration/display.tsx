"use client";
import type { ReactNode } from "react";
import { ApiFeedback } from "@/components/api-feedback";
import { ApiError } from "@/lib/api/problem";
import { Button } from "@/components/ui/button";
export function Fields({ values }: {
    values: Record<string, string | number | boolean | null | undefined>;
}) {
    return <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(values).map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="break-all text-sm">{value === null || value === undefined ? "—" : typeof value === "boolean" ? value ? "Ya" : "Tidak" : String(value)}</dd>
        </div>)}</dl>;
}
export function Panel({ title, children }: {
    title: string;
    children: ReactNode;
}) {
    return <section className="space-y-4 rounded-xl border bg-white p-5">
    <h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
}
export function QueryState({ pending, error }: {
    pending: boolean;
    error: Error | null;
}) { return <div aria-live="polite">{pending && <p>Memuat data…</p>}<ApiFeedback error={error instanceof ApiError ? error : null}/>{error && !(error instanceof ApiError) && <p>Layanan belum tersedia.</p>}</div>; }
export function Refresh({ busy, onClick }: {
    busy: boolean;
    onClick: () => void;
}) { return <Button variant="outline" disabled={busy} onClick={onClick}>Muat ulang</Button>; }
export function Pagination({ page, size, total, onPage }: {
    page: number;
    size: number;
    total: number;
    onPage: (page: number) => void;
}) {
    return <nav aria-label="Halaman data" className="flex flex-wrap items-center gap-3">
    <Button type="button" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>Sebelumnya</Button>
    <span>Halaman {page + 1} · {total} data</span>
    <Button type="button" variant="outline" disabled={(page + 1) * size >= total} onClick={() => onPage(page + 1)}>Berikutnya</Button>
    </nav>;
}
