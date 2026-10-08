import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as s from "./schemas";
async function read<S extends z.ZodType>(path: string, schema: S, signal: AbortSignal) {
    const response = await apiRequest<unknown>(`/v1/integrations${path}`, { signal });
    const parsed = schema.safeParse(response.data);
    if (!parsed.success)
        throw new ApiError({ status: 502, title: "Respons layanan tidak valid", code: "INVALID_RESPONSE" });
    return { ...response, data: parsed.data as z.infer<S> };
}
const segment = encodeURIComponent, paging = (page: number) => `?page=${page}&size=20`;
export const integrationApi = {
    list: (page: number, signal: AbortSignal) => read(paging(page), s.pageSchema(s.integrationSchema), signal),
    detail: (code: string, signal: AbortSignal) => read(`/${segment(code)}`, s.integrationSchema, signal),
    identifiers: (code: string, page: number, signal: AbortSignal) => read(`/${segment(code)}/external-identifiers${paging(page)}`, s.pageSchema(s.identifierSchema), signal),
    authorities: (code: string, page: number, signal: AbortSignal) => read(`/${segment(code)}/authorities${paging(page)}`, s.pageSchema(s.authoritySchema), signal),
    runs: (code: string, page: number, signal: AbortSignal) => read(`/${segment(code)}/sync-runs${paging(page)}`, s.pageSchema(s.runSummarySchema), signal),
    conflicts: (code: string, page: number, signal: AbortSignal) => read(`/${segment(code)}/conflicts${paging(page)}`, s.pageSchema(s.conflictSchema), signal),
    run: (code: string, id: string, page: number, signal: AbortSignal) => read(`/${segment(code)}/sync-runs/${segment(id)}${paging(page)}`, s.runDetailSchema, signal),
};
