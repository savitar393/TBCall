import type { Me } from "@/lib/auth/types";
export function canTreatment(user:Me|null,...permissions:string[]):boolean { return !!user && user.roles.some(r=>r.code==="TB_OFFICER") && user.permissions.includes("TREATMENT_READ") && permissions.every(p=>user.permissions.includes(p)); }
export const openTreatmentStatuses=["PLANNED","ACTIVE","PAUSED"];
