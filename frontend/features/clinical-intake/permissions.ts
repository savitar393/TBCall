import type { Me } from "@/lib/auth/types";
export function canClinical(user: Me | null, ...permissions: string[]): boolean {
  return !!user && user.roles.some(role => role.code === "TB_OFFICER") && permissions.every(permission => user.permissions.includes(permission));
}
export function clinicalNavigation(user: Me | null) {
  const dashboard = canClinical(user) && !!user?.activeFacilities.length && (user.permissions.includes("CASE_READ") || user.permissions.includes("LAB_REQUEST_READ") || (user.permissions.includes("TREATMENT_READ") && user.permissions.includes("FOLLOW_UP_READ")));
  return [
    ...(dashboard ? [{ label: "Pemantauan operasional", href: "/dashboard" }] : []),
    ...(canClinical(user, "PATIENT_READ") ? [{ label: "Daftar pasien", href: "/patients" }] : []),
    ...(canClinical(user, "CASE_READ") ? [{ label: "Riwayat kasus selesai", href: "/cases/history" }] : []),
    ...(canClinical(user, "PATIENT_CREATE", "REGISTRATION_WRITE") ? [{ label: "Registrasi baru", href: "/intake/new" }] : []),
  ];
}
