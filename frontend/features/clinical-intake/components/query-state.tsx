"use client";
import { ApiError } from "@/lib/api/problem";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
export function QueryState({ query }: { query: { isPending: boolean; error: unknown; refetch(): unknown } }) {
  if (query.isPending) return <p role="status">Memuat data…</p>;
  return <div className="space-y-3"><ApiFeedback error={query.error instanceof ApiError ? query.error : new ApiError({ status: 503, title: "Layanan belum tersedia" })} /><Button variant="outline" onClick={() => void query.refetch()}>Coba kembali</Button></div>;
}
