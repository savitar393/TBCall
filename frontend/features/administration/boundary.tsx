"use client";
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth/session";
import { canFacilities, canUsers } from "./permissions";
import { canIntegration } from "@/features/integration/permissions";
export function F4Boundary({ kind, context, children }: {
    kind: "facilities" | "users" | "integration";
    context: string;
    children: ReactNode;
}) {
    return <SessionBoundary>
    <Guard kind={kind} context={context}>{children}</Guard>
    </SessionBoundary>;
}
function Guard({ kind, context, children }: {
    kind: "facilities" | "users" | "integration";
    context: string;
    children: ReactNode;
}) {
    const { user } = useSession();
    const client = useQueryClient(), snapshot = JSON.stringify(user);
    useEffect(() => {
        // A removed observer can briefly recreate its old query during /me refresh.
        // New screens use a full-context key; discard inactive F4 remnants after remount.
        client.removeQueries({ predicate: q => ["administration", "integration"].includes(String(q.queryKey[0])) && typeof q.queryKey[2] === "string" && q.queryKey[2].startsWith("{") && q.queryKey[2] !== snapshot && !q.isActive() });
    }, [client, snapshot]);
    const allowed = kind === "facilities" ? canFacilities(user) : kind === "users" ? canUsers(user) : canIntegration(user);
    return <AppShell>{allowed ? <div key={JSON.stringify(user) + context} className="space-y-6">{children}</div> : <section>
        <h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1>
        <p>Peran, izin, atau penugasan aktif tidak sesuai.</p>
        </section>}</AppShell>;
}
