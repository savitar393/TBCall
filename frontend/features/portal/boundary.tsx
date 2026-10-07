"use client";
import type { ReactNode } from "react";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth/session";
import { canPortal, canSupportCases, linkedCase, type PortalMode } from "./permissions";
export function PortalBoundary(props: {
    children: ReactNode;
    mode: PortalMode;
    permission?: string;
    requireLink?: boolean;
    caseId?: string;
    context: string;
}) { return <SessionBoundary><Guard {...props}/></SessionBoundary>; }
function Guard({ children, mode, permission, requireLink, caseId, context }: {
    children: ReactNode;
    mode: PortalMode;
    permission?: string;
    requireLink?: boolean;
    caseId?: string;
    context: string;
}) {
    const { user } = useSession();
    const allowed = canPortal(user, mode, permission) && (mode !== "supporter" || canSupportCases(user)) && (caseId === undefined || linkedCase(user, caseId));
    return <AppShell>{!allowed ? <section><h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1><p>Peran, izin, atau tautan pendampingan tidak sesuai.</p></section> : requireLink && !user?.patientLink ? <section><h1 className="text-2xl font-semibold">Akun belum terhubung</h1><p>Hubungi petugas untuk memeriksa tautan akun Anda.</p></section> : <div className="space-y-6" key={JSON.stringify(user) + context + (caseId ?? "")}>{children}</div>}</AppShell>;
}
