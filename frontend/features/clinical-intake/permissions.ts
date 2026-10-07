import type { Me } from "@/lib/auth/types";
export function canClinical(user: Me | null, ...permissions: string[]): boolean {
  return !!user && user.roles.some(role => role.code === "TB_OFFICER") && permissions.every(permission => user.permissions.includes(permission));
}
export function clinicalNavigation(user: Me | null) {
  return [
    ...(canClinical(user, "PATIENT_READ") ? [{ label: "Daftar pasien", href: "/patients" }] : []),
    ...(canClinical(user, "PATIENT_CREATE", "REGISTRATION_WRITE") ? [{ label: "Registrasi baru", href: "/intake/new" }] : []),
  ];
}
