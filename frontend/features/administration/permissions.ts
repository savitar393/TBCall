import type { Me } from "@/lib/auth/types";
import type { NavigationItem } from "@/lib/navigation";
export const canFacilities = (user: Me | null) => !!user && user.roles.some(r => r.code === "SYSTEM_ADMIN") && user.permissions.includes("FACILITY_MANAGE");
export const canUsers = (user: Me | null) => !!user && user.permissions.includes("USER_MANAGE_FACILITY") && (user.roles.some(r => r.code === "SYSTEM_ADMIN") || (user.roles.some(r => r.code === "FACILITY_ADMIN") && user.activeFacilities.length > 0));
export const canRoles = (user: Me | null) => !!user && user.roles.some(r => r.code === "SYSTEM_ADMIN") && user.permissions.includes("ROLE_MANAGE");
export const canStatuses = (user: Me | null) => !!user && user.roles.some(r => r.code === "SYSTEM_ADMIN") && user.permissions.includes("USER_ACCOUNT_MANAGE");
export function administrationNavigation(user: Me): NavigationItem[] {
    return [...(canFacilities(user) ? [{ label: "Fasyankes", href: "/admin/facilities" }] : []), ...(canUsers(user) ? [{ label: "Administrasi Pengguna", href: "/admin/users" }] : [])];
}
