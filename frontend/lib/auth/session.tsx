"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { meSchema, type Me, type LoginInput } from "./types";
import { ApiError } from "@/lib/api/problem";
import { apiRequest } from "@/lib/api/client";

export const ME_QUERY_KEY = ["session", "me"] as const;
export type SessionState = {
  status: "loading" | "anonymous" | "authenticated" | "unavailable";
  user: Me | null; isPending: boolean; error: ApiError | null;
  login(input: LoginInput): Promise<void>; logout(): Promise<void>; refresh(): Promise<Me | null>;
  handleFailure(error: unknown, refetch?: boolean): Promise<void>;
  dismissError(): void;
};
const context = createContext<SessionState | null>(null);
const isSessionQuery = (key: readonly unknown[]) => key[0] === "session" && key[1] === "me";

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [isPending, setPending] = useState(false);
  const busy = useRef(false);

  const clearProtected = useCallback(async () => {
    const filter = { predicate: (query: { queryKey: readonly unknown[] }) => !isSessionQuery(query.queryKey) };
    await client.cancelQueries(filter);
    client.removeQueries(filter);
    client.getMutationCache().clear();
  }, [client]);

  const readMe = useCallback(async (signal?: AbortSignal): Promise<Me | null> => {
    let next: Me | null;
    try {
      const { data } = await apiRequest<unknown>("/v1/me", { signal });
      const parsed = meSchema.safeParse(data);
      if (!parsed.success) throw new ApiError({ status: 502, title: "Respons layanan tidak valid", code: "INVALID_RESPONSE" });
      next = parsed.data;
    } catch (error) {
      if (error instanceof ApiError && error.kind === "authentication") next = null;
      else throw error;
    }
    const previous = client.getQueryData<Me | null>(ME_QUERY_KEY);
    if (previous && JSON.stringify(previous) !== JSON.stringify(next)) {
      await clearProtected();
      if (!next) router.replace("/login");
    }
    return next;
  }, [client, clearProtected, router]);

  const session = useQuery({ queryKey: ME_QUERY_KEY, queryFn: ({ signal }) => readMe(signal), retry: false, staleTime: 0 });
  const refresh = useCallback(async () => {
    await client.cancelQueries({ queryKey: ME_QUERY_KEY });
    return client.fetchQuery({ queryKey: ME_QUERY_KEY, queryFn: ({ signal }) => readMe(signal), retry: false, staleTime: 0 });
  }, [client, readMe]);

  const handleFailure = useCallback(async (error: unknown, refetch = true) => {
    if (!(error instanceof ApiError)) return;
    setFailure(error);
    switch (error.kind) {
      case "authentication":
        await client.cancelQueries();
        await clearProtected();
        client.setQueryData(ME_QUERY_KEY, null);
        router.replace("/login");
        break;
      case "forbidden": router.replace("/forbidden"); break;
      case "csrf":
        try { await refresh(); } catch (refreshError) { if (refreshError instanceof ApiError) setFailure(refreshError); }
        break; // The failed mutation is never replayed.
      case "stale":
        // Mutation failures refetch; failed GETs are only marked stale to avoid loops.
        await client.invalidateQueries({ refetchType: refetch ? "active" : "none" });
        break;
    }
  }, [client, clearProtected, refresh, router]);

  useEffect(() => {
    const queries = client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error" && !isSessionQuery(event.query.queryKey))
        void handleFailure(event.action.error, false);
    });
    const mutations = client.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") void handleFailure(event.mutation.state.error);
    });
    return () => { queries(); mutations(); };
  }, [client, handleFailure]);

  const login = async (input: LoginInput) => {
    if (busy.current) return;
    busy.current = true; setPending(true); setFailure(null);
    try {
      // Login response is intentionally discarded; only /me establishes identity.
      await apiRequest("/v1/auth/login", { method: "POST", body: input });
      await client.cancelQueries();
      await clearProtected();
      client.setQueryData(ME_QUERY_KEY, null);
      const user = await refresh();
      if (!user) throw new ApiError({ status: 401, title: "Login diperlukan", code: "AUTHENTICATION_REQUIRED" });
      router.replace("/");
    } catch (error) { await handleFailure(error); throw error; }
    finally { busy.current = false; setPending(false); }
  };

  const logout = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setFailure(null);
    try {
      await apiRequest("/v1/auth/logout", { method: "POST" });
      // Refresh after cookie rotation, then discard authenticated state even if GET fails.
      try { await readMe(); }
      finally {
        await client.cancelQueries();
        await clearProtected();
        client.setQueryData(ME_QUERY_KEY, null);
        router.replace("/login");
      }
    } catch (error) { await handleFailure(error); throw error; }
    finally { busy.current = false; setPending(false); }
  };

  const user = session.isError ? null : session.data ?? null;
  const status = session.isPending ? "loading" : session.isError ? "unavailable" : user ? "authenticated" : "anonymous";
  const error = failure ?? (session.error instanceof ApiError ? session.error : null);
  return <context.Provider value={{ status, user, isPending, error, login, logout, refresh, handleFailure, dismissError: () => setFailure(null) }}>{children}</context.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(context);
  if (!value) throw new Error("SessionProvider is required");
  return value;
}
