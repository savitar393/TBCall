"use client";
import Link from "next/link";
import { ArrowUpRight, ClipboardPlus, UsersRound, CalendarClock } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { canClinical } from "@/features/clinical-intake/permissions";
import { canOperationalDashboard } from "@/features/operational-dashboard/contracts";
import { OperationalDashboard } from "@/features/operational-dashboard/dashboard";
import { AppPageHeader } from "./application-patterns";
import { IdentityDashboard } from "./identity-dashboard";

export function StaffHome() {
  const { user } = useSession();
  if (!canOperationalDashboard(user)) return <IdentityDashboard/>;
  const actions = [
    ...(canClinical(user, "PATIENT_READ") ? [{ href: "/patients", label: "Daftar pasien", text: "Buka kasus, pengobatan, dan jadwal obat melalui catatan pasien.", icon: UsersRound }] : []),
    ...(canClinical(user, "PATIENT_CREATE", "REGISTRATION_WRITE") ? [{ href: "/intake/new", label: "Registrasi baru", text: "Mulai pencatatan pasien dan episode pelayanan baru.", icon: ClipboardPlus }] : []),
    { href: "/dashboard", label: "Pemantauan operasional", text: "Tinjau tindak lanjut dan pekerjaan yang tercatat sesuai izin baca.", icon: CalendarClock },
  ];
  return <>
    <AppPageHeader title="Pelayanan hari ini" eyebrow="Beranda petugas" description="Mulai dari daftar pasien, lanjutkan pelayanan, atau tinjau pekerjaan yang perlu diperiksa."/>
    <section aria-label="Mulai pelayanan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{actions.map(({ href, label, text, icon: Icon }) => <Link key={href} href={href} className="app-workflow-link"><Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary"/><div className="min-w-0"><h2 className="font-semibold">{label}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div><ArrowUpRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground"/></Link>)}</section>
    <OperationalDashboard embedded key={JSON.stringify(user)}/>
    <IdentityDashboard contextOnly/>
  </>;
}
