import type { Me } from "@/lib/auth/types";
const allows = (user: Me | null, role: string, permission: string) => !!user && user.status === "ACTIVE" && user.roles.some(r => r.code === role) && user.permissions.includes(permission);
export const canMonitor = (user: Me | null) => allows(user, "PROGRAM_MONITOR", "REPORT_READ");
export const canManageScopes = (user: Me | null) => allows(user, "SYSTEM_ADMIN", "REPORT_SCOPE_MANAGE");
export const canPublish = (user: Me | null) => allows(user, "SYSTEM_ADMIN", "REPORT_PUBLISH");
export const canLookup = (user: Me | null) => allows(user, "SYSTEM_ADMIN", "USER_MANAGE_FACILITY");
