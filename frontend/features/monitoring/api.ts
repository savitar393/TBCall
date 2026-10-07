import { apiRequest, type ApiOptions } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as s from "./schemas";
import type { Body, TargetType } from "./types";
const segment = encodeURIComponent;
export const targetPath = (type: TargetType, id: string) => `/${type === "TPT" ? "preventive-treatments" : "treatments"}/${segment(id)}`;
export function requireEtag(etag: string | undefined): string {
  if (!etag) throw new ApiError({
    status: 428,
    title: "Versi data diperlukan"
  });
  return etag;
}
async function request<S extends z.ZodType>(path: string, schema: S, options: ApiOptions = {}) {
  const result = await apiRequest<unknown>(`/v1${path}`, options);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new ApiError({
    status: 502,
    title: "Respons layanan tidak valid",
    code: "INVALID_RESPONSE"
  });
  return {
    ...result,
    data: parsed.data as z.infer<S>
  };
}
const paging = (page: number, size = 20) => new URLSearchParams({
  page: String(page),
  size: String(size)
}).toString();
export const monitoringApi = {
  references: (signal?: AbortSignal) => request("/monitoring-reference-data", s.referencesSchema, {
    signal
  }),
  history: (type: TargetType, id: string, page: number, signal?: AbortSignal) => request(`${targetPath(type, id)}/monitoring-plans?${paging(page)}`, s.planPageSchema, {
    signal
  }),
  create: (type: TargetType, id: string, body: Body, signal?: AbortSignal) => request(`${targetPath(type, id)}/monitoring-plans`, s.planSchema, {
    method: "POST",
    body,
    signal
  }),
  plan: (id: string, signal?: AbortSignal) => request(`/monitoring-plans/${segment(id)}`, s.planSchema, {
    signal
  }),
  patchPlan: (id: string, body: Body, etag: string | undefined, signal?: AbortSignal) => request(`/monitoring-plans/${segment(id)}`, s.planSchema, {
    method: "PATCH",
    body,
    etag: requireEtag(etag),
    signal
  }),
  cancelPlan: (id: string, etag: string | undefined, signal?: AbortSignal) => request(`/monitoring-plans/${segment(id)}/cancel`, s.planSchema, {
    method: "POST",
    body: {},
    etag: requireEtag(etag),
    signal
  }),
  events: (id: string, page: number, signal?: AbortSignal) => request(`/monitoring-plans/${segment(id)}/events?${paging(page)}`, s.eventPageSchema, {
    signal
  }),
  addEvent: (id: string, body: Body, etag: string | undefined, signal?: AbortSignal) => request(`/monitoring-plans/${segment(id)}/events`, s.eventSchema, {
    method: "POST",
    body,
    etag: requireEtag(etag),
    signal
  }),
  event: (id: string, signal?: AbortSignal) => request(`/monitoring-events/${segment(id)}`, s.eventSchema, {
    signal
  }),
  reschedule: (id: string, body: Body, etag: string | undefined, signal?: AbortSignal) => request(`/monitoring-events/${segment(id)}`, s.eventSchema, {
    method: "PATCH",
    body,
    etag: requireEtag(etag),
    signal
  }),
  eventAction: (id: string, action: "complete" | "cancel", body: Body, etag: string | undefined, signal?: AbortSignal) => request(`/monitoring-events/${segment(id)}/${action}`, s.eventSchema, {
    method: "POST",
    body,
    etag: requireEtag(etag),
    signal
  }),
  alerts: (status: string, targetType: string, page: number, size: number, signal?: AbortSignal) => request(`/alerts?${new URLSearchParams({
    ...(status ? {
      status
    } : {}),
    ...(targetType ? {
      targetType
    } : {}),
    page: String(page),
    size: String(size)
  })}`, s.alertPageSchema, {
    signal
  }),
  alert: (id: string, signal?: AbortSignal) => request(`/alerts/${segment(id)}`, s.alertSchema, {
    signal
  }),
  alertAction: (id: string, action: "acknowledge" | "resolve", etag: string | undefined, signal?: AbortSignal) => request(`/alerts/${segment(id)}/${action}`, s.alertSchema, {
    method: "POST",
    body: {},
    etag: requireEtag(etag),
    signal
  }),
  notifications: (page: number, signal?: AbortSignal) => request(`/me/notifications?${paging(page)}`, s.notificationPageSchema, {
    signal
  }),
  notification: (id: string, signal?: AbortSignal) => request(`/me/notifications/${segment(id)}`, s.notificationSchema, {
    signal
  }),
  read: (id: string, etag: string | undefined, signal?: AbortSignal) => request(`/me/notifications/${segment(id)}/read`, s.notificationSchema, {
    method: "POST",
    body: {},
    etag: requireEtag(etag),
    signal
  })
};
