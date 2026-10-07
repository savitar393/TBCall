"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ME_QUERY_KEY, useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import type { Me } from "@/lib/auth/types";
import { clinicalKeys } from "./queries";

// Sensitive inputs never become TanStack mutation variables or persisted state.
export function useClinicalCommand() {
  const session = useSession(); const client = useQueryClient();
  const mounted = useRef(true); const controller = useRef<AbortController | null>(null); const busy = useRef(false);
  const [pending, setPending] = useState(false); const [error, setError] = useState<ApiError | null>(null);
  const [locked, setLocked] = useState(false); const [reviewRequired, setReviewRequired] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function run<T>(operation: (signal: AbortSignal) => Promise<T>, options: { invalidate?: boolean; onSuccess?: (result: T) => void } = {}): Promise<T | undefined> {
    if (busy.current || locked || reviewRequired || !session.user) return;
    const actor = session.user; const snapshot = JSON.stringify(actor);
    const current = () => mounted.current && JSON.stringify(client.getQueryData<Me | null>(ME_QUERY_KEY)) === snapshot;
    busy.current = true; setPending(true); setError(null);
    controller.current = new AbortController();
    try {
      const result = await operation(controller.current.signal);
      if (!current()) return;
      if (options.invalidate !== false) await client.invalidateQueries({ queryKey: clinicalKeys(actor.id) });
      if (!current()) return;
      options.onSuccess?.(result); return result;
    } catch (failure) {
      if (!current() || controller.current.signal.aborted) return;
      const safe = failure instanceof ApiError ? failure : new ApiError({ status: 503, title: "Layanan belum tersedia" });
      setError(safe);
      if (safe.kind === "source-authority") setLocked(true);
      if (safe.kind === "stale" || safe.problem.code === "CLINICAL_STATE_CONFLICT") {
        setReviewRequired(true);
        await client.invalidateQueries({ queryKey: clinicalKeys(actor.id) });
      }
      if (["authentication", "forbidden", "csrf"].includes(safe.kind)) await session.handleFailure(safe, false);
    } finally { busy.current = false; if (current()) setPending(false); }
  }
  return { run, pending, error, locked, reviewRequired, reviewed: () => { setReviewRequired(false); setError(null); session.dismissError(); } };
}
