import { queryOptions } from "@tanstack/react-query";
import { administrationApi as api } from "./api";
import type { FacilityFilters } from "./types";
import type { Me } from "@/lib/auth/types";
export const administrationKeys = (actor: string | Me) => ["administration", typeof actor === "string" ? actor : actor.id, ...(typeof actor === "string" ? [] : [JSON.stringify(actor)])] as const;
const explicit = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false } as const;
export const administrationQueries = {
    facilities: (u: string | Me, filters: FacilityFilters) => queryOptions({ ...explicit, queryKey: [...administrationKeys(u), "facilities", filters], queryFn: ({ signal }) => api.facilities(filters, signal) }),
    facility: (u: string | Me, id: string) => queryOptions({ ...explicit, queryKey: [...administrationKeys(u), "facility", id], queryFn: ({ signal }) => api.facility(id, signal) }),
    references: (u: string | Me) => queryOptions({ ...explicit, staleTime: 300000, queryKey: [...administrationKeys(u), "references"], queryFn: ({ signal }) => api.references(signal) }),
};
