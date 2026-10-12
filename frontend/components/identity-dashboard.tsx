"use client";
import Link from "next/link";
import { AppDisclosure, AppPageHeader, AppStatusBadge } from "./application-patterns";
import { applicationNavigation } from "@/lib/application-navigation";
import { UnlinkedAccount } from "@/features/onboarding/unlinked-account";
import { ArrowUpRight, Building2 } from "lucide-react";
import { useSession } from "@/lib/auth/session";

export function IdentityDashboard({ contextOnly = false }: {contextOnly?: boolean} = {}) {
  const { user } = useSession();
  if (!user) return null;
  const destinations = applicationNavigation(user).flatMap(group => group.links).filter(link => !["/", "/#akun"].includes(link.href));
  const patient = user.roles.some(role => role.code === "PATIENT");
  const supporter = user.roles.some(role => role.code === "TREATMENT_SUPPORTER");
  return <div className="clinical-workspace"><UnlinkedAccount/>
    {!contextOnly && <><AppPageHeader title="Selamat datang" eyebrow="Beranda"/>
      {destinations.length > 0 && <nav aria-label="Mulai dari sini" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{destinations.map(link => <Link key={link.href} href={link.href} aria-label={`Buka ${link.label}`} className="app-workflow-link items-center"><span className="font-semibold">{link.label}</span><ArrowUpRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground"/></Link>)}</nav>}</>}
    <section id="akun" className="surface scroll-mt-24 space-y-4">
      <h2 className="section-title">Akun &amp; konteks akses</h2>
      <dl className="clinical-data-grid text-sm"><div><dt className="text-muted-foreground">Identitas akun</dt><dd className="mt-1 break-words font-medium">{user.email ?? user.phone ?? "Pengguna TBCall"}</dd></div><div><dt className="text-muted-foreground">Status akun</dt><dd className="mt-1"><AppStatusBadge>{user.status === "ACTIVE" ? "Aktif" : "Status belum diketahui"}</AppStatusBadge></dd></div></dl>
      <div><h3 className="mb-2 text-sm font-medium">Peran Anda</h3><div className="flex flex-wrap gap-2">{user.roles.length ? user.roles.map(role => <AppStatusBadge key={role.code}>{role.name}</AppStatusBadge>) : <p className="text-sm text-muted-foreground">Belum ada peran aktif</p>}</div></div>
      <div><h3 className="mb-2 text-sm font-medium">Fasilitas aktif</h3>{user.activeFacilities.length ? <ul className="space-y-2">{user.activeFacilities.map(facility => <li key={facility.id} className="flex items-center gap-2 text-sm"><Building2 aria-hidden="true" className="size-4 shrink-0 text-primary"/>{facility.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">Belum ada fasilitas aktif</p>}</div>
      {!contextOnly && <AppDisclosure title="Tautan akun" open={patient || supporter}><p className="text-sm">Tautan pasien: <span>{user.patientLink ? "SELF terverifikasi" : "Belum tertaut"}</span></p>
      {(supporter || user.supporterCaseIds.length > 0) && <p className="text-sm">Kasus pendampingan tertaut: <span aria-label="Jumlah kasus pendampingan tertaut" className="font-semibold">{user.supporterCaseIds.length}</span></p>}</AppDisclosure>}
    </section>
  </div>;
}
