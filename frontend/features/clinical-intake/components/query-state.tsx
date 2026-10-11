"use client";
import { ApiError } from "@/lib/api/problem";
import { ApiFeedback, usePresentedApiError } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
type QueryStateProps = { query: { isPending: boolean; error: unknown; refetch(): unknown }; deduplicate?: boolean };
export function QueryState({ query, deduplicate = false }: QueryStateProps) {
  const presentedError = usePresentedApiError();
  const duplicate = deduplicate && query.error instanceof ApiError && query.error === presentedError;
  if (query.isPending) return <p role="status">Memuat data…</p>;
  return <div className="space-y-3">{!duplicate && <ApiFeedback error={query.error instanceof ApiError ? query.error : new ApiError({ status: 503, title: "Layanan belum tersedia" })} />}<Button variant="outline" onClick={() => void query.refetch()}>Coba kembali</Button></div>;
}

export function DeduplicatedQueryState({ query }: Pick<QueryStateProps, "query">) {
  return <QueryState query={query} deduplicate />;
}
