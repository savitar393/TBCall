"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ME_QUERY_KEY, useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
/** Local commands deliberately never enter TanStack's mutation cache. */
export function useLinkingCommand() {
    const session = useSession(), client = useQueryClient(), mounted = useRef(true), busy = useRef(false), abort = useRef<AbortController | null>(null);
    const [pending, setPending] = useState(false), [error, setError] = useState<ApiError | null>(null);
    const [errorPurpose, setErrorPurpose] = useState<"resolve" | "resource">("resource");
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
    async function run<T>(operation: (signal: AbortSignal, current: () => boolean) => Promise<T>, onSuccess?: (result: T, current: () => boolean) => void | Promise<void>, onError?: (error: ApiError, current: () => boolean) => void | Promise<void>, purpose: "resolve" | "resource" = "resource") {
        if (busy.current || !session.user)
            return;
        const snapshot = JSON.stringify(session.user), controller = new AbortController();
        abort.current = controller;
        const current = () => mounted.current && !controller.signal.aborted && JSON.stringify(client.getQueryData(ME_QUERY_KEY)) === snapshot;
        const unsubscribe = client.getQueryCache().subscribe(() => {
            if (JSON.stringify(client.getQueryData(ME_QUERY_KEY)) !== snapshot)
                controller.abort();
        });
        if (!current()) {
            unsubscribe();
            controller.abort();
            return;
        }
        busy.current = true;
        setPending(true);
        setError(null);
        try {
            const result = await operation(controller.signal, current);
            if (current())
                await onSuccess?.(result, current);
        }
        catch (failure) {
            if (!current())
                return;
            const safe = failure instanceof ApiError ? failure : new ApiError({ status: 503, title: "Layanan belum tersedia" });
            setErrorPurpose(purpose);
            setError(safe);
            await onError?.(safe, current);
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
    return { run, pending, error, errorPurpose, clearError: () => setError(null) };
}
