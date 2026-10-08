import { apiRequest, type ApiOptions, type Versioned } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as s from "./schemas";
const segment = encodeURIComponent;
function invalid(): never { throw new ApiError({ status: 502, code: "INVALID_RESPONSE", title: "Respons layanan tidak valid" }); }
async function request<S extends z.ZodType>(path: string, schema: S, options: ApiOptions = {}) {
    const response = await apiRequest<unknown>(`/v1${path}`, options), parsed = schema.safeParse(response.data);
    if (!parsed.success)
        invalid();
    return { ...response, data: parsed.data as z.infer<S> };
}
export function getEtag(etag?: string): string {
    if (!etag)
        throw new ApiError({ status: 428, code: "PRECONDITION_REQUIRED", title: "Versi server diperlukan" });
    if (!/^"\d+"$/.test(etag))
        invalid();
    return etag;
}
const patientPath = (p: string) => `/patients/${segment(p)}/account-link`;
const supportersPath = (c: string) => `/cases/${segment(c)}/supporters`;
const supporterPath = (c: string, id: string) => `${supportersPath(c)}/${segment(id)}`;
export const linkingApi = {
    patient: async (p: string, signal: AbortSignal) => {
        const r = await request(patientPath(p), s.patientStateSchema, { signal });
        if (r.data.link) {
            if (r.data.link.patientId !== p)
                invalid();
            getEtag(r.etag);
        }
        else if (r.etag !== undefined)
            invalid();
        return r;
    },
    pair: async (p: string, u: string, signal: AbortSignal) => {
        const r = await request(`${patientPath(p)}/precondition?${new URLSearchParams({ userId: u })}`, s.pairStateSchema, { signal });
        if (r.data.patientId !== p || r.data.userId !== u)
            invalid();
        if (r.data.pair)
            getEtag(r.etag);
        else if (r.etag !== undefined)
            invalid();
        return r;
    },
    resolvePatient: (p: string, identity: string, signal: AbortSignal) => request(`${patientPath(p)}/resolve-user`, s.candidateSchema, { method: "POST", body: { identity }, signal }),
    linkPatient: (p: string, userId: string, etag: string | undefined, signal: AbortSignal) => request(patientPath(p), s.patientLinkResponseSchema, { method: "POST", body: { userId }, etag, signal }),
    revokePatient: (p: string, linkId: string, etag: string, signal: AbortSignal) => request(`/patients/${segment(p)}/account-links/${segment(linkId)}`, s.patientLinkResponseSchema, { method: "DELETE", etag: getEtag(etag), signal }),
    supporters: (c: string, page: number, signal: AbortSignal) => request(`${supportersPath(c)}?${new URLSearchParams({ page: String(page), size: "20" })}`, s.supporterPageSchema, { signal }),
    supporter: async (c: string, id: string, signal: AbortSignal) => {
        const r = await request(supporterPath(c, id), s.supporterDetailSchema, { signal });
        if (r.data.caseId !== c || r.data.id !== id)
            invalid();
        getEtag(r.etag);
        return r;
    },
    createSupporter: (c: string, input: s.SupporterInput, signal: AbortSignal) => request(supportersPath(c), s.supporterDetailSchema, { method: "POST", body: { supporterType: input.supporterType, fullName: input.fullName, ...(input.phone ? { phone: input.phone } : {}) }, signal }),
    resolveSupporter: (c: string, id: string, identity: string, signal: AbortSignal) => request(`${supporterPath(c, id)}/account-link/resolve-user`, s.candidateSchema, { method: "POST", body: { identity }, signal }),
    linkSupporter: (c: string, id: string, userId: string, etag: string, signal: AbortSignal) => request(`${supporterPath(c, id)}/account-link`, s.supporterLinkResponseSchema, { method: "POST", body: { userId }, etag: getEtag(etag), signal }),
    unlinkSupporter: (c: string, id: string, etag: string, signal: AbortSignal) => request(`${supporterPath(c, id)}/account-link`, s.supporterLinkResponseSchema, { method: "DELETE", etag: getEtag(etag), signal }),
};
export type PatientState = Awaited<ReturnType<typeof linkingApi.patient>>;
export type PairState = Awaited<ReturnType<typeof linkingApi.pair>>;
export type SupporterDetail = Awaited<ReturnType<typeof linkingApi.supporter>>;
/** Compare the actual reviewed GET, including identity and header, before a write. */
export function sameReview<T>(a: Versioned<T>, b: Versioned<T>): boolean { return a.etag === b.etag && JSON.stringify(a.data) === JSON.stringify(b.data); }
