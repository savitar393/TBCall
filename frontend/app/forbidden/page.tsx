import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SessionBoundary } from "@/components/session-boundary";
import { buttonVariants } from "@/components/ui/button";

export default function ForbiddenPage() {
  return <SessionBoundary><AppShell><section className="rounded-2xl border bg-white p-8 text-center sm:p-16"><ShieldAlert aria-hidden="true" className="mx-auto mb-6 size-12 text-primary" /><h1 className="text-3xl font-semibold">Akses tidak diizinkan</h1><p className="mx-auto mb-8 mt-4 max-w-md text-muted-foreground">Akun Anda tidak memiliki akses ke halaman atau tindakan ini. Hubungi administrator bila penugasan perlu diperbarui.</p><Link href="/" className={buttonVariants()}>Kembali ke beranda</Link></section></AppShell></SessionBoundary>;
}
