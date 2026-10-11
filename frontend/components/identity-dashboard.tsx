"use client";
import Link from "next/link";
import { AppPageHeader, AppStatusBadge } from "./application-patterns";
import { applicationNavigation } from "@/lib/application-navigation";
import { UnlinkedAccount } from "@/features/onboarding/unlinked-account";
import { Building2, Link2, ShieldCheck, UsersRound } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader } from "./ui/card";

export function IdentityDashboard({ contextOnly = false }: {contextOnly?: boolean} = {}) {
  const { user } = useSession();
  if (!user) return null;
  const destinations = applicationNavigation(user).flatMap(group => group.links).filter(link => !["/", "/#akun"].includes(link.href));
  return <><UnlinkedAccount/>
    {!contextOnly && <><AppPageHeader title="Selamat datang" description="Pilih kegiatan sesuai peran dan penugasan akun Anda." eyebrow="Beranda"/>
      {destinations.length > 0 && <section aria-label="Mulai dari sini" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{destinations.map(link => <Link key={link.href} href={link.href} className="app-workflow-link"><div><h2 className="font-semibold">{link.label}</h2><p className="mt-2 text-xs text-muted-foreground">Buka ruang kerja yang tersedia untuk akun Anda →</p></div></Link>)}</section>}</>}
    {!contextOnly && <div className="grid gap-5 md:grid-cols-3">
      <Card className="shadow-sm"><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck aria-hidden="true" className="size-5" /></div></CardHeader><CardContent><h2 className="font-semibold">Peran Anda</h2><div className="mt-3 flex flex-wrap gap-2">{user.roles.length ? user.roles.map(role => <AppStatusBadge key={role.code}>{role.name}</AppStatusBadge>) : <p className="text-sm text-muted-foreground">Belum ada peran aktif</p>}</div></CardContent></Card>
      <Card className="shadow-sm"><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Link2 aria-hidden="true" className="size-5" /></div></CardHeader><CardContent><h2 className="font-semibold">Tautan pasien</h2><p className="mt-3 text-sm">{user.patientLink ? "SELF terverifikasi" : "Belum tertaut"}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Status tautan akun Anda dengan data pasien.</p></CardContent></Card>
      <Card className="shadow-sm"><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UsersRound aria-hidden="true" className="size-5" /></div></CardHeader><CardContent><h2 className="font-semibold">Pendampingan</h2><p aria-label="Jumlah kasus pendampingan tertaut" className="mt-2 text-3xl font-semibold">{user.supporterCaseIds.length}</p><p className="mt-2 text-xs text-muted-foreground">Kasus pendampingan tertaut pada akun Anda.</p></CardContent></Card>
    </div>}
    <section id="akun" className="scroll-mt-24 rounded-2xl border bg-white p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Akun &amp; konteks akses</h2><p className="mt-2 text-sm text-muted-foreground">Akses Anda mengikuti peran dan penugasan akun.</p>
      <dl className="mt-6 grid gap-6 border-b pb-6 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Identitas akun</dt><dd className="mt-2 break-all font-medium">{user.email ?? user.phone ?? "Pengguna TBCall"}</dd></div><div><dt className="text-sm text-muted-foreground">Status akun</dt><dd className="mt-2 flex items-center gap-2 font-medium"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />{user.status === "ACTIVE" ? "Aktif" : "Status belum diketahui"}</dd></div></dl>
      <h3 className="mt-6 font-medium">Fasilitas aktif</h3>
      {user.activeFacilities.length ? <ul className="mt-3 grid gap-3 sm:grid-cols-2">{user.activeFacilities.map(facility => <li key={facility.id} className="flex items-center gap-3 rounded-xl bg-background p-4 text-sm"><Building2 aria-hidden="true" className="size-5 shrink-0 text-primary" />{facility.name}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Belum ada fasilitas aktif</p>}
    </section>
  </>;
}
