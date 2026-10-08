"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, ME_QUERY_KEY } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { administrationKeys } from "./queries";
export function useAdministrationCommand() {
    const session = useSession(), client = useQueryClient(), mounted = useRef(true), busy = useRef(false), abort = useRef<AbortController | null>(null);
    const [pending, setPending] = useState(false), [error, setError] = useState<ApiError | null>(null), [success, setSuccess] = useState(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
    async function run<T>(operation: (signal: AbortSignal) => Promise<T>, options: {
        selfTarget?: string;
        onSuccess?: (result: T, current: () => boolean) => void | Promise<void>;
        onError?: (error: ApiError, current: () => boolean) => void | Promise<void>;
    } = {}) {
        if (busy.current || !session.user)
            return;
        const actor = session.user, snapshot = JSON.stringify(actor), controller = new AbortController();
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
        setSuccess(false);
        try {
            const result = await operation(controller.signal);
            if (!current())
                return;
            if (options.selfTarget === actor.id) {
                await session.refresh();
                if (!current())
                    return;
            }
            await client.invalidateQueries({ queryKey: administrationKeys(actor), predicate: q => q.queryKey.at(-1) !== "references", refetchType: "all" });
            if (!current())
                return;
            await options.onSuccess?.(result, current);
            if (current())
                setSuccess(true);
            return result;
        }
        catch (failure) {
            if (!current())
                return;
            const safe = failure instanceof ApiError ? failure : new ApiError({ status: 503, title: "Layanan belum tersedia" });
            setError(safe);
            await options.onError?.(safe, current);
            if (!current())
                return;
            if (["authentication", "forbidden", "csrf"].includes(safe.kind))
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
