"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth/session";
import { canLabRead, canLabSource } from "../permissions";
export function LaboratoryBoundary({ mode = "read", children }: { mode?: "read" | "source"; children: ReactNode }) { return <SessionBoundary><Guard mode={mode}>{children}</Guard></SessionBoundary>; }
function Guard({ mode, children }: { mode: "read" | "source"; children: ReactNode }) {
  const { user } = useSession(); const allowed = mode === "read" ? canLabRead(user) : canLabSource(user);
  return <AppShell>{allowed ? <div key={JSON.stringify(user)} className="space-y-7">{children}</div> : <section className="space-y-4"><h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1><p>Modul ini memerlukan peran laboratorium, izin dan penugasan aktif yang sesuai.</p><Link href="/" className="text-primary underline">Kembali ke beranda</Link></section>}</AppShell>;
}
