"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth/session";
import { canTreatment } from "../permissions";
export function TreatmentBoundary({children}:{children:ReactNode}) {return <SessionBoundary><Guard>{children}</Guard></SessionBoundary>;}
function Guard({children}:{children:ReactNode}){const {user}=useSession();return <AppShell>{canTreatment(user)?<div key={JSON.stringify(user)} className="space-y-7">{children}</div>:<section className="space-y-4"><h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1><p>Pengobatan memerlukan peran petugas TBC dan izin membaca pengobatan.</p><Link href="/" className="text-primary underline">Kembali ke beranda</Link></section>}</AppShell>;}
