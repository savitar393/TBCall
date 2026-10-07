"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, ME_QUERY_KEY } from "@/lib/auth/session";
import type { Me } from "@/lib/auth/types";
import { ApiError } from "@/lib/api/problem";
import { monitoringKeys } from "./queries";
export type RefreshScope = "monitoring" | "alerts" | "notifications";
export function useMonitoringCommand(scope: RefreshScope = "monitoring") {
  const session = useSession();
  const client = useQueryClient();
  const mounted = useRef(true);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [locked, setLocked] = useState(false);
  const [reviewRequired, setReview] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);
  async function run<T>(operation: (signal: AbortSignal, current: () => boolean) => Promise<T>, onSuccess?: (result: T) => void): Promise<T | undefined> {
    if (busy.current || locked || reviewRequired || !session.user) return;
    const actor = session.user;
    const snapshot = JSON.stringify(actor);
    const current = () => mounted.current && !abort.current?.signal.aborted && JSON.stringify(client.getQueryData<Me | null>(ME_QUERY_KEY)) === snapshot;
    const invalidate = async () => {
      if (!current()) return;
      await client.invalidateQueries({
        queryKey: monitoringKeys(actor.id),
        refetchType: scope === "notifications" ? "all" : "active",
        predicate: q => scope === "notifications" ? ["notifications", "notification"].includes(String(q.queryKey[2])) : scope === "alerts" ? ["alerts", "alert"].includes(String(q.queryKey[2])) : !["references", "notifications", "notification"].includes(String(q.queryKey[2]))
      });
    };
    abort.current = new AbortController();
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await operation(abort.current.signal, current);
      if (!current()) return;
      await invalidate();
      if (!current()) return;
      onSuccess?.(result);
      return result;
    } catch (failure) {
      if (!current()) return;
      const safe = failure instanceof ApiError ? failure : new ApiError({
        status: 503,
        title: "Layanan belum tersedia"
      });
      setError(safe);
      if (safe.kind === "source-authority") setLocked(true);else if (safe.kind === "stale" || safe.kind === "precondition" || safe.problem.status === 409) {
        setReview(true);
        await invalidate();
      }
      if (current() && ["authentication", "forbidden", "csrf"].includes(safe.kind)) await session.handleFailure(safe, false);
    } finally {
      busy.current = false;
      if (current()) setPending(false);
    }
  }
  return {
    run,
    pending,
    error,
    locked,
    reviewRequired,
    reviewed: () => {
      setReview(false);
      setError(null);
      session.dismissError();
    }
  };
}
