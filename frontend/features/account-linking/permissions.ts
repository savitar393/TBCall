import type { Me } from "@/lib/auth/types";
export function canLink(user: Me | null, permission: "PATIENT_LINK_VERIFY" | "SUPPORTER_LINK_MANAGE"): boolean {
    return !!user && user.roles.some(r => r.code === "TB_OFFICER") && user.permissions.includes(permission);
}
export function canAddSupporter(caseStatus: string): boolean { return caseStatus === "ACTIVE" || caseStatus === "REFERRED"; }
