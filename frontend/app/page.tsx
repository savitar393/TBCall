"use client";
import { AppShell } from "@/components/app-shell";
import { StaffHome } from "@/components/staff-home";
import { SessionBoundary } from "@/components/session-boundary";
import { LandingPage } from "@/features/public/landing";
import { PatientHome } from "@/features/portal/patient/home";
import { useSession } from "@/lib/auth/session";
export default function HomePage() {
  const session = useSession();
  if (session.status === 'anonymous') return <LandingPage/>;
  const patientOnly = !!session.user?.roles.length && session.user.roles.every(role => role.code === 'PATIENT');
  return <SessionBoundary><AppShell>{patientOnly ? <PatientHome/> : <StaffHome/>}</AppShell></SessionBoundary>;
}
