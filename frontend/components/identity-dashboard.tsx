"use client";
import Link from "next/link";
import { Building2, Link2, ShieldCheck, Stethoscope, LayoutDashboard, UserRound } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader } from "./ui/card";

function portalLinks(user: { roles: { code: string }[] }): { href: string; label: string; desc: string }[] {
  const roles = new Set(user.roles.map((r) => r.code));
  const links: { href: string; label: string; desc: string }[] = [];
  if (roles.has("PATIENT")) links.push({ href: "/portal", label: "Portal Pasien", desc: "Jadwal obat, catat kepatuhan, TPT & notifikasi" });
  if (roles.has("TB_OFFICER") || roles.has("LAB_STAFF")) links.push({ href: "/nakes", label: "Ruang Nakes/Dokter", desc: "Pasien, registrasi, lab, pengobatan & kontinuitas" });
  if (roles.has("FACILITY_ADMIN") || roles.has("SYSTEM_ADMIN")) links.push({ href: "/admin", label: "Ruang Admin", desc: "Pengguna, fasilitas & integrasi" });
  return links;
}

export function IdentityDashboard() {
  const { user } = useSession();
  if (!user) return null;
  const links = portalLinks(user);
  return <>
    <div><p className="mb-2 text-sm font-medium text-primary">Beranda</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Selamat datang</h1><p className="mt-3 text-muted-foreground">{user.email ?? user.phone ?? "Pengguna TBCall"}</p></div>
    {links.length > 0 && (
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => <Link key={l.href} href={l.href} className="flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {l.href === "/portal" ? <UserRound aria-hidden="true" className="size-5" /> : l.href === "/nakes" ? <Stethoscope aria-hidden="true" className="size-5" /> : <LayoutDashboard aria-hidden="true" className="size-5" />}
          </span>
          <span><span className="block text-sm font-semibold">{l.label}</span><span className="block text-xs text-muted-foreground">{l.desc}</span></span>
        </Link>)}
      </section>
    )}
    <div className="grid gap-5 md:grid-cols-3">
      <Card className="shadow-sm"><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck aria-hidden="true" className="size-5" /></div></CardHeader><CardContent><h2 className="font-semibold">Peran Anda</h2><div className="mt-3 flex flex-wrap gap-2">{user.roles.length ? user.roles.map(role => <span key={role.code} className="rounded-full bg-secondary px-3 py-1 text-sm">{role.name}</span>) : <p className="text-sm text-muted-foreground">Belum ada peran aktif</p>}</div></CardContent></Card>
      <Card className="shadow-sm"><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Link2 aria-hidden="true" className="size-5" /></div></CardHeader><CardContent><h2 className="font-semibold">Tautan pasien</h2><p className="mt-3 text-sm">{user.patientLink ? "SELF terverifikasi" : "Belum tertaut"}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Status tautan akun Anda dengan data pasien.</p></CardContent></Card>
      <Card className="shadow-sm"><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound aria-hidden="true" className="size-5" /></div></CardHeader><CardContent><h2 className="font-semibold">Pendampingan</h2><p aria-label="Jumlah kasus pendampingan tertaut" className="mt-2 text-3xl font-semibold">{user.supporterCaseIds.length}</p><p className="mt-2 text-xs text-muted-foreground">Kasus pendampingan tertaut pada akun Anda.</p></CardContent></Card>
    </div>
    <section id="akun" className="scroll-mt-24 rounded-2xl border bg-white p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Akun &amp; konteks akses</h2><p className="mt-2 text-sm text-muted-foreground">Akses Anda mengikuti peran dan penugasan akun.</p>
      <dl className="mt-6 grid gap-6 border-b pb-6 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Identitas akun</dt><dd className="mt-2 break-all font-medium">{user.email ?? user.phone ?? "Pengguna TBCall"}</dd></div><div><dt className="text-sm text-muted-foreground">Status akun</dt><dd className="mt-2 flex items-center gap-2 font-medium"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />{user.status === "ACTIVE" ? "Aktif" : "Status belum diketahui"}</dd></div></dl>
      <h3 className="mt-6 font-medium">Fasilitas aktif</h3>
      {user.activeFacilities.length ? <ul className="mt-3 grid gap-3 sm:grid-cols-2">{user.activeFacilities.map(facility => <li key={facility.id} className="flex items-center gap-3 rounded-xl bg-background p-4 text-sm"><Building2 aria-hidden="true" className="size-5 shrink-0 text-primary" />{facility.name}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Belum ada fasilitas aktif</p>}
    </section>
  </>;
}
