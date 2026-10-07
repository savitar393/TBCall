"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, ME_QUERY_KEY } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { portalKeys } from "./queries";
export function usePortalCommand() {
    const session = useSession(), client = useQueryClient();
    const mounted = useRef(true), busy = useRef(false), abort = useRef<AbortController | null>(null);
    const [pending, setPending] = useState(false), [error, setError] = useState<ApiError | null>(null), [success, setSuccess] = useState(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
    async function run<T>(operation: (signal: AbortSignal, current: () => boolean) => Promise<T>, onSuccess?: (result: T) => void) {
        if (busy.current || !session.user)
            return;
        const actor = session.user, snapshot = JSON.stringify(actor), controller = new AbortController();
        abort.current = controller;
        const current = () => mounted.current && !controller.signal.aborted && JSON.stringify(client.getQueryData(ME_QUERY_KEY)) === snapshot;
        const unsubscribe = client.getQueryCache().subscribe(() => { if (JSON.stringify(client.getQueryData(ME_QUERY_KEY)) !== snapshot)
            controller.abort(); });
        // Cache context can change before React's observer rerenders an old click handler.
        if (!current()) {
            controller.abort();
            unsubscribe();
            return;
        }
        busy.current = true;
        setPending(true);
        setError(null);
        setSuccess(false);
        try {
            const result = await operation(controller.signal, current);
            if (!current())
                return;
            await client.invalidateQueries({ queryKey: portalKeys(actor.id), refetchType: "active", predicate: q => q.queryKey[2] !== "references" });
            if (!current())
                return;
            setSuccess(true);
            onSuccess?.(result);
            return result;
        }
        catch (failure) {
            if (!current())
                return;
            const safe = failure instanceof ApiError ? failure : new ApiError({ status: 503, title: "Layanan belum tersedia" });
            setError(safe);
            if (current() && ["authentication", "forbidden", "csrf"].includes(safe.kind))
                await session.handleFailure(safe, false);
        }
        finally {
            unsubscribe();
            busy.current = false;
            if (current())
                setPending(false);
        }
    }
    return { run, pending, error, success };
}
