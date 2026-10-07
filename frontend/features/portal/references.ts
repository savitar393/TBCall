"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "./queries";
import { canReference } from "./permissions";
import type { PortalReferenceData } from "./types";
export function usePortalReferences() { const { user } = useSession(); return useQuery({ ...portalQueries.references(user!.id), enabled: canReference(user) }); }
export function label(options: {
    code: string;
    name: string;
}[] | undefined, code: string | null | undefined) { return code == null ? "—" : options?.find(o => o.code === code)?.name ?? code; }
export function doseOptions(ref: PortalReferenceData, actor: "patient" | "supporter") {
    const allowed = actor === "patient" ? ["TAKEN_SELF_REPORTED", "MISSED", "UNKNOWN"] : ["TAKEN_OBSERVED", "TAKEN_SELF_REPORTED", "MISSED", "UNKNOWN"];
    return (actor === "patient" ? ref.patientDoseStatuses : ref.supporterDoseStatuses).filter(o => allowed.includes(o.code));
}
