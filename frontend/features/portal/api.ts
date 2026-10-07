import { apiRequest, type ApiOptions } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as s from "./schemas";
import type { PortalTarget, DoseInput } from "./types";
async function request<S extends z.ZodType>(path: string, schema: S, options: ApiOptions = {}) {
    const response = await apiRequest<unknown>(`/v1/me${path}`, options);
    const parsed = schema.safeParse(response.data);
    if (!parsed.success)
        throw new ApiError({ status: 502, title: "Respons layanan tidak valid", code: "INVALID_RESPONSE" });
    return { ...response, data: parsed.data as z.infer<S> };
}
const targetPath = (target: PortalTarget) => target.kind === "patient" ? "" : `/supporting-cases/${encodeURIComponent(target.caseId)}`;
const paging = (page: number) => `?page=${page}&size=20`;
export const portalApi = {
    references: (signal: AbortSignal) => request("/portal-reference-data", s.referencesSchema, { signal }),
    patient: (signal: AbortSignal) => request("/patient", s.selfPatientSchema, { signal }),
    patientTreatment: (signal: AbortSignal) => request("/treatment", s.patientTreatmentSchema, { signal }),
    supporterTreatment: (caseId: string, signal: AbortSignal) => request(`/supporting-cases/${encodeURIComponent(caseId)}/treatment`, s.supporterTreatmentSchema, { signal }),
    doses: (target: PortalTarget, page: number, signal: AbortSignal) => request(`${target.kind === "patient" ? "/treatment" : targetPath(target)}/dose-events${paging(page)}`, s.dosePageSchema, { signal }),
    recordDose: (target: PortalTarget, body: DoseInput, signal: AbortSignal) => request(`${target.kind === "patient" ? "/treatment" : targetPath(target)}/dose-events`, s.safeDoseSchema, { method: "POST", body, signal }),
    followUps: (signal: AbortSignal) => request("/follow-ups", s.followUpsSchema, { signal }),
    tpt: (signal: AbortSignal) => request("/tpt", s.safeTptSchema, { signal }),
    monitoring: (target: PortalTarget, page: number, signal: AbortSignal) => request(`${targetPath(target)}/monitoring${paging(page)}`, s.eventPageSchema, { signal }),
    alerts: (target: PortalTarget, page: number, signal: AbortSignal) => request(`${targetPath(target)}/alerts${paging(page)}`, s.alertPageSchema, { signal }),
    acknowledge: (target: PortalTarget, id: string, signal: AbortSignal) => request(`${targetPath(target)}/alerts/${encodeURIComponent(id)}/acknowledge`, s.safeAlertSchema, { method: "POST", body: {}, signal }),
    notifications: (page: number, signal: AbortSignal) => request(`/notifications${paging(page)}`, s.notificationPageSchema, { signal }),
    notification: (id: string, signal: AbortSignal) => request(`/notifications/${encodeURIComponent(id)}`, s.notificationSchema, { signal }),
    readNotification: (id: string, etag: string | undefined, signal: AbortSignal) => {
        if (!etag)
            throw new ApiError({ status: 428, title: "Versi data diperlukan" });
        return request(`/notifications/${encodeURIComponent(id)}/read`, s.notificationSchema, { method: "POST", body: {}, etag, signal });
    }
};
