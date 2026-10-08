import { apiRequest, type ApiOptions } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as s from "./schemas";
import type { FacilityFilters, FacilityInput, ManagedRole } from "./types";
async function request<S extends z.ZodType>(path: string, schema: S, options: ApiOptions = {}) {
    const response = await apiRequest<unknown>(`/v1/admin${path}`, options);
    const parsed = schema.safeParse(response.data);
    if (!parsed.success)
        throw new ApiError({ status: 502, title: "Respons layanan tidak valid", code: "INVALID_RESPONSE" });
    return { ...response, data: parsed.data as z.infer<S> };
}
const segment = encodeURIComponent;
export const administrationApi = {
    facilities: (filters: FacilityFilters, signal: AbortSignal) => {
        const params = new URLSearchParams({ page: String(filters.page), size: "20" });
        if (filters.query)
            params.set("query", filters.query);
        if (filters.active !== undefined)
            params.set("active", String(filters.active));
        return request(`/facilities?${params}`, s.facilityPageSchema, { signal });
    },
    facility: (id: string, signal: AbortSignal) => request(`/facilities/${segment(id)}`, s.facilitySchema, { signal }),
    references: (signal: AbortSignal) => request("/reference-data", s.referencesSchema, { signal }),
    create: (body: FacilityInput, signal: AbortSignal) => request("/facilities", s.facilitySchema, { method: "POST", body, signal }),
    patch: (id: string, body: FacilityInput, etag: string, signal: AbortSignal) => request(`/facilities/${segment(id)}`, s.facilitySchema, { method: "PATCH", body, etag, signal }),
    deactivate: (id: string, etag: string, signal: AbortSignal) => request(`/facilities/${segment(id)}/deactivate`, s.facilitySchema, { method: "POST", etag, signal }),
    lookup: (identity: string, signal: AbortSignal) => request(`/users/lookup?${new URLSearchParams({ identity })}`, s.userLookupSchema, { signal }),
    membership: (facility: string, user: string, primary: boolean | null, signal: AbortSignal) => request(`/facilities/${segment(facility)}/users/${segment(user)}`, s.membershipSchema, { method: primary === null ? "DELETE" : "POST", ...(primary === null ? {} : { body: { primary } }), signal }),
    role: (user: string, role: ManagedRole, assign: boolean, signal: AbortSignal) => request(`/users/${segment(user)}/roles/${segment(role)}`, s.roleSchema, { method: assign ? "POST" : "DELETE", signal }),
    status: (user: string, action: "suspend" | "reactivate" | "disable", lookupVersion: number, signal: AbortSignal) => request(`/users/${segment(user)}/${action}`, s.statusSchema, { method: "POST", etag: `"${lookupVersion}"`, signal }),
};
export function facilityEtag(etag?: string): string {
    if (!etag)
        throw new ApiError({ status: 428, title: "Buka ulang detail fasyankes", code: "PRECONDITION_REQUIRED" });
    return etag;
}
