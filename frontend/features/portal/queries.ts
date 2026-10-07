import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/problem";
import { portalApi as api } from "./api";
import type { PortalTarget } from "./types";
export const portalKeys = (userId: string) => ["portal", userId] as const;
const explicit = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false } as const;
async function expectedEmpty<T>(read: () => Promise<T>): Promise<T | null> { try {
    return await read();
}
catch (error) {
    if (error instanceof ApiError && error.problem.status === 404)
        return null;
    throw error;
} }
export const portalQueries = {
    references: (u: string) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "references"], queryFn: ({ signal }) => api.references(signal) }),
    patient: (u: string) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "patient"], queryFn: ({ signal }) => api.patient(signal) }),
    treatment: (u: string) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "treatment"], queryFn: ({ signal }) => expectedEmpty(() => api.patientTreatment(signal)) }),
    supporterTreatment: (u: string, id: string) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "supporter-treatment", id], queryFn: ({ signal }) => expectedEmpty(() => api.supporterTreatment(id, signal)) }),
    tpt: (u: string) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "tpt"], queryFn: ({ signal }) => expectedEmpty(() => api.tpt(signal)) }),
    followUps: (u: string) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "follow-ups"], queryFn: ({ signal }) => api.followUps(signal) }),
    doses: (u: string, target: PortalTarget, page: number) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "doses", target, page], queryFn: ({ signal }) => api.doses(target, page, signal) }),
    monitoring: (u: string, target: PortalTarget, page: number) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "monitoring", target, page], queryFn: ({ signal }) => api.monitoring(target, page, signal) }),
    alerts: (u: string, target: PortalTarget, page: number) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "alerts", target, page], queryFn: ({ signal }) => api.alerts(target, page, signal) }),
    notifications: (u: string, page: number) => queryOptions({ ...explicit, queryKey: [...portalKeys(u), "notifications", page], queryFn: ({ signal }) => api.notifications(page, signal) }),
};
