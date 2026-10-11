import type { Me } from "@/lib/auth/types";
import { filterNavigation, foundationNavigation, type NavigationItem } from "./navigation";
import { clinicalNavigation, canClinical } from "@/features/clinical-intake/permissions";
import { laboratoryNavigation } from "@/features/laboratory/permissions";
import { continuityNavigation } from "@/features/continuity/permissions";
import { monitoringNavigation } from "@/features/monitoring/permissions";
import { patientNavigation, portalNavigation } from "@/features/portal/permissions";
import { administrationNavigation } from "@/features/administration/permissions";
import { integrationNavigation } from "@/features/integration/permissions";

export type NavigationGroup = { title: string; links: NavigationItem[] };
export const patientOnly = (user: Me) => user.roles.length > 0 && user.roles.every(role => role.code === "PATIENT");

/** Presentation groups compose the existing permission policies; they never grant access. */
export function applicationNavigation(user: Me): NavigationGroup[] {
  if (patientOnly(user)) {
    const links = patientNavigation(user);
    const secondary = new Set(["/portal/tpt", "/portal/alerts"]);
    return [
      { title: "Kegiatan Anda", links: links.filter(link => !secondary.has(link.href)) },
      { title: "Catatan lainnya", links: links.filter(link => secondary.has(link.href)) },
    ].filter(group => group.links.length);
  }
  const clinical = clinicalNavigation(user);
  const foundation = filterNavigation(foundationNavigation, user.permissions);
  return [
    { title: "Ruang kerja", links: [...foundation.filter(link => !link.href.includes("#")), ...clinical.filter(link => link.href === "/dashboard")] },
    { title: "Pelayanan TBC", links: [...clinical.filter(link => link.href !== "/dashboard"), ...laboratoryNavigation(user), ...continuityNavigation(user)] },
    { title: "Pemantauan", links: monitoringNavigation(user) },
    { title: "Pendampingan", links: portalNavigation(user) },
    { title: "Administrasi", links: [...administrationNavigation(user), ...integrationNavigation(user)] },
    { title: "Akun", links: foundation.filter(link => link.href.includes("#")) },
  ].filter(group => group.links.length);
}

export function navigationActive(pathname: string, href: string, user: Me): boolean {
  if (href.includes("#")) return false;
  if (pathname === "/" && patientOnly(user)) return href === "/portal";
  return pathname === href || (href !== "/" && href !== "/portal" && pathname.startsWith(href + "/"));
}

export type Breadcrumb = { label: string; href?: string };
const contextualLabels: Record<string, string> = {
  cases: "Kasus", treatments: "Pengobatan", registrations: "Registrasi", diagnoses: "Diagnosis",
  contacts: "Kontak", "contact-investigations": "Investigasi kontak", "preventive-treatments": "Terapi pencegahan",
  "monitoring-plans": "Rencana pemantauan", referrals: "Rujukan", alerts: "Peringatan",
};
const finalLabels: Record<string, string> = { new: "Tambah baru", summary: "Ringkasan kasus", monitoring: "Pemantauan", contacts: "Kontak kasus", treatments: "Pengobatan kasus", "sync-runs": "Riwayat sinkronisasi" };

/** Route labels use no clinical payload or inferred patient name. Ancestor links retain their own permission gates. */
export function applicationBreadcrumbs(pathname: string, user: Me): Breadcrumb[] {
  const home = { label: "Beranda", href: patientOnly(user) ? "/portal" : "/" };
  if (pathname === "/" || pathname === "/portal") return [{ label: "Beranda" }];
  const links = applicationNavigation(user).flatMap(group => group.links);
  const direct = links.find(link => link.href === pathname);
  if (direct) return [home, { label: direct.label }];
  const parent = links.filter(link => !link.href.includes("#") && link.href !== "/" && pathname.startsWith(link.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];
  const parts = pathname.split("/").filter(Boolean);
  const last = finalLabels[parts.at(-1)!] ?? (parts.includes("requests") ? "Permintaan pemeriksaan" : contextualLabels[parts[0]] ?? "Detail catatan");
  const crumbs: Breadcrumb[] = [home];
  if (parent) crumbs.push({ label: parent.label, href: parent.href });
  if (parts[0] === "cases" && parts.length > 2 && canClinical(user, "CASE_READ")) crumbs.push({ label: "Detail kasus", href: `/cases/${parts[1]}` });
  if (parts[0] === "treatments" && parts.length > 2 && canClinical(user, "TREATMENT_READ")) crumbs.push({ label: "Detail pengobatan", href: `/treatments/${parts[1]}` });
  crumbs.push({ label: last });
  return crumbs;
}
