"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ME_QUERY_KEY, useSession } from "@/lib/auth/session";
import type { Me } from "@/lib/auth/types";
import { ApiError } from "@/lib/api/problem";
import { labKeys } from "./queries";
export const labStateConflicts = new Set(["LAB_REQUEST_STATE_CONFLICT", "LAB_SPECIMEN_STATE_CONFLICT", "LAB_RESULT_STATE_CONFLICT", "LAB_RESULT_NOT_LATEST", "LAB_RESULT_ALREADY_EXISTS"]);
export function useLabCommand() {
  const session = useSession(); const client = useQueryClient(); const mounted = useRef(true); const busy = useRef(false); const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState<ApiError | null>(null); const [locked, setLocked] = useState(false); const [reviewRequired, setReviewRequired] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function run<T>(operation: (signal: AbortSignal) => Promise<T>, options: { onSuccess?(result: T): void; onConflict?(): Promise<unknown> } = {}): Promise<T | undefined> {
    if (busy.current || locked || reviewRequired || !session.user) return;
    const actor = session.user; const snapshot = JSON.stringify(actor);
    const current = () => mounted.current && JSON.stringify(client.getQueryData<Me | null>(ME_QUERY_KEY)) === snapshot;
    const refresh = () => client.invalidateQueries({ queryKey: labKeys(actor.id), predicate: q => q.queryKey[2] !== "references" });
    controller.current = new AbortController(); busy.current = true; setPending(true); setError(null);
    try {
      const result = await operation(controller.current.signal); if (!current()) return;
      await refresh(); if (!current()) return;
      options.onSuccess?.(result); return result;
    } catch (failure) {
      if (!current() || controller.current.signal.aborted) return;
      const safe = failure instanceof ApiError ? failure : new ApiError({ status: 503, title: "Layanan belum tersedia" });
      setError(safe); if (safe.kind === "source-authority") setLocked(true);
      if (safe.kind === "stale" || safe.kind === "precondition" || labStateConflicts.has(safe.problem.code ?? "")) {
        setReviewRequired(true); await refresh(); if (current()) await options.onConflict?.();
      }
      if (["authentication", "forbidden", "csrf"].includes(safe.kind) && current()) await session.handleFailure(safe, false);
    } finally { busy.current = false; if (current()) setPending(false); }
  }
  return { run, pending, error, locked, reviewRequired, reviewed: () => { setReviewRequired(false); setError(null); session.dismissError(); } };
}
