"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth/session";
import { canClinical } from "../permissions";
export function ClinicalBoundary({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  return <SessionBoundary><Guard permissions={permissions}>{children}</Guard></SessionBoundary>;
}
function Guard({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const { user } = useSession();
  return <AppShell>{canClinical(user, ...permissions)
    ? <div key={JSON.stringify(user)} className="space-y-7">{children}</div>
    : <section className="space-y-4"><h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1><p>Modul ini memerlukan peran petugas TBC dan izin yang sesuai.</p><Link href="/" className="text-primary underline">Kembali ke beranda</Link></section>}</AppShell>;
}
