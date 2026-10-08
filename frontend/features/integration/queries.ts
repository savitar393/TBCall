import { queryOptions } from "@tanstack/react-query";
import { integrationApi as api } from "./api";
import type { Me } from "@/lib/auth/types";
export const integrationKeys = (actor: string | Me) => ["integration", typeof actor === "string" ? actor : actor.id, ...(typeof actor === "string" ? [] : [JSON.stringify(actor)])] as const;
const explicit = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false } as const;
export const integrationQueries = {
    list: (u: string | Me, page: number) => queryOptions({ ...explicit, queryKey: [...integrationKeys(u), "list", page], queryFn: ({ signal }) => api.list(page, signal) }),
    detail: (u: string | Me, code: string) => queryOptions({ ...explicit, queryKey: [...integrationKeys(u), code, "detail"], queryFn: ({ signal }) => api.detail(code, signal) }),
    identifiers: (u: string | Me, code: string, page: number) => queryOptions({ ...explicit, queryKey: [...integrationKeys(u), code, "identifiers", page], queryFn: ({ signal }) => api.identifiers(code, page, signal) }),
    authorities: (u: string | Me, code: string, page: number) => queryOptions({ ...explicit, queryKey: [...integrationKeys(u), code, "authorities", page], queryFn: ({ signal }) => api.authorities(code, page, signal) }),
    runs: (u: string | Me, code: string, page: number) => queryOptions({ ...explicit, queryKey: [...integrationKeys(u), code, "runs", page], queryFn: ({ signal }) => api.runs(code, page, signal) }),
    conflicts: (u: string | Me, code: string, page: number) => queryOptions({ ...explicit, queryKey: [...integrationKeys(u), code, "conflicts", page], queryFn: ({ signal }) => api.conflicts(code, page, signal) }),
    run: (u: string | Me, code: string, id: string, page: number) => queryOptions({ ...explicit, queryKey: [...integrationKeys(u), code, "run", id, page], queryFn: ({ signal }) => api.run(code, id, page, signal) }),
};
