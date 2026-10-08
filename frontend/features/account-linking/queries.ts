import { queryOptions } from "@tanstack/react-query";
import { linkingApi as api } from "./api";
export const linkingKeys = (userId: string, context: string) => ["account-linking", userId, context] as const;
const explicit = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false } as const;
export const linkingQueries = {
    patient: (u: string, ctx: string, p: string) => queryOptions({ ...explicit, queryKey: [...linkingKeys(u, ctx), "patient", p], queryFn: ({ signal }) => api.patient(p, signal) }),
    supporters: (u: string, ctx: string, c: string, page: number) => queryOptions({ ...explicit, queryKey: [...linkingKeys(u, ctx), "case", c, "supporters", page], queryFn: ({ signal }) => api.supporters(c, page, signal) }),
    supporter: (u: string, ctx: string, c: string, id: string) => queryOptions({ ...explicit, queryKey: [...linkingKeys(u, ctx), "case", c, "supporter", id], queryFn: ({ signal }) => api.supporter(c, id, signal) }),
};
