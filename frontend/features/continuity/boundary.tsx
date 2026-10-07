"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth/session";
import { canContinuity } from "./permissions";
export function ContinuityBoundary({children,permission}:{children:ReactNode;permission:string}){return <SessionBoundary><Guard permission={permission}>{children}</Guard></SessionBoundary>;}
function Guard({children,permission}:{children:ReactNode;permission:string}){const {user}=useSession();return <AppShell>{canContinuity(user,permission)?<div key={JSON.stringify(user)} className="space-y-6">{children}</div>:<section><h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1><p>Alur kontinuitas memerlukan peran petugas TBC dan izin tindakan yang sesuai.</p><Link href="/" className="text-primary underline">Kembali ke beranda</Link></section>}</AppShell>;}
