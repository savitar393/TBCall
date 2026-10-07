import type { Me } from "@/lib/auth/types";
const role = (user: Me | null, code: string) => !!user?.roles.some(r => r.code === code);
const scope = (user: Me | null, facilityId?: string) => !!user?.activeFacilities.some(f => facilityId === undefined || f.id === facilityId);
export function canLabRead(user: Me | null): boolean { return !!user && (role(user, "TB_OFFICER") || role(user, "LAB_STAFF")) && user.permissions.includes("LAB_REQUEST_READ") && scope(user); }
export function canLabSource(user: Me | null, facilityId?: string): boolean { return !!user && role(user, "TB_OFFICER") && user.permissions.includes("LAB_REQUEST_WRITE") && scope(user, facilityId); }
export function canLabTesting(user: Me | null, facilityId?: string): boolean { return !!user && role(user, "LAB_STAFF") && user.permissions.includes("LAB_RESULT_WRITE") && scope(user, facilityId); }
export function laboratoryNavigation(user: Me | null) { return canLabRead(user) ? [{ href: "/laboratory", label: "Laboratorium", permissions: ["LAB_REQUEST_READ"] }] : []; }
