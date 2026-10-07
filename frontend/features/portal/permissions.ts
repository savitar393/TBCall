import type { Me } from "@/lib/auth/types";
import type { NavigationItem } from "@/lib/navigation";
export type PortalMode = "patient" | "supporter" | "either";
export const relevantPermissions = ["TREATMENT_READ", "ADHERENCE_READ", "ADHERENCE_RECORD", "FOLLOW_UP_READ", "TPT_READ", "MONITORING_READ", "ALERT_READ", "ALERT_ACKNOWLEDGE", "NOTIFICATION_READ_SELF"] as const;
export function hasPortalRole(user: Me | null, mode: PortalMode): boolean {
    return !!user && user.roles.some(r => mode === "either" ? ["PATIENT", "TREATMENT_SUPPORTER"].includes(r.code) : r.code === (mode === "patient" ? "PATIENT" : "TREATMENT_SUPPORTER"));
}
export function canPortal(user: Me | null, mode: PortalMode, permission?: string): boolean {
    return hasPortalRole(user, mode) && (!permission || !!user?.permissions.includes(permission));
}
export function linkedCase(user: Me | null, caseId: string): boolean {
    return canPortal(user, "supporter") && !!user?.supporterCaseIds.includes(caseId);
}
export function canReference(user: Me | null): boolean {
    return canPortal(user, "either") && relevantPermissions.some(p => user?.permissions.includes(p));
}
export function portalNavigation(user: Me): NavigationItem[] {
    const links: NavigationItem[] = [];
    if (canPortal(user, "patient")) {
        links.push({ label: "Portal Saya", href: "/portal" });
        for (const [permission, label, href] of [
            ["TREATMENT_READ", "Pengobatan Saya", "/portal/treatment"],
            ["TPT_READ", "TPT Saya", "/portal/tpt"],
            ["MONITORING_READ", "Pemantauan Saya", "/portal/monitoring"],
            ["ALERT_READ", "Peringatan Saya", "/portal/alerts"],
        ])
            if (user.permissions.includes(permission))
                links.push({ label, href });
    }
    if (canPortal(user, "supporter"))
        links.push({ label: "Pendampingan", href: "/supporting-cases" });
    if (canPortal(user, "either", "NOTIFICATION_READ_SELF"))
        links.push({ label: "Notifikasi Saya", href: "/portal/notifications" });
    return links;
}
