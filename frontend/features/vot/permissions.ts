import type { Me } from "@/lib/auth/types";
export const canSelfVot = (user: Me | null, write = false) => !!user?.patientLink && user.roles.some(role => role.code === "PATIENT") && user.permissions.includes(write ? "VOT_SELF_WRITE" : "VOT_SELF_READ");
export const canReviewVot = (user: Me | null, write = false) => !!user && user.roles.some(role => role.code === "TB_OFFICER") && user.activeFacilities.length > 0 && user.permissions.includes(write ? "VOT_REVIEW_WRITE" : "VOT_REVIEW_READ");
