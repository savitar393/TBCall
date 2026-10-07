import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import type { z } from "@/lib/validation";
import * as schema from "./schemas";
import type { RequestFilters, CreateInput, SpecimenInput, ReceiveInput, ResultInput, CorrectionInput } from "./types";
async function validated<S extends z.ZodType>(path: string, model: S, options: Parameters<typeof apiRequest>[1] = {}) {
  const response = await apiRequest<unknown>(`/v1${path}`, options);
  const value = model.safeParse(response.data);
  if (!value.success) throw new ApiError({ status: 502, code: "INVALID_RESPONSE", title: "Respons layanan tidak valid" });
  return { ...response, data: value.data as z.infer<S> };
}
const segment = encodeURIComponent;
export const labApi = {
  references: (signal?: AbortSignal) => validated("/laboratory-reference-data", schema.referenceDataSchema, { signal }),
  requests: (filters: RequestFilters, signal?: AbortSignal) => { const query = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); }); return validated(`/lab-requests?${query}`, schema.requestPageSchema, { signal }); },
  request: (id: string, signal?: AbortSignal) => validated(`/lab-requests/${segment(id)}`, schema.requestDetailSchema, { signal }),
  create: (body: CreateInput, signal?: AbortSignal) => validated("/lab-requests", schema.requestDetailSchema, { method: "POST", body, signal }),
  specimen: (id: string, body: SpecimenInput, etag: string, signal?: AbortSignal) => validated(`/lab-requests/${segment(id)}/specimens`, schema.specimenSchema, { method: "POST", body, etag, signal }),
  cancel: (id: string, etag: string, signal?: AbortSignal) => validated(`/lab-requests/${segment(id)}/cancel`, schema.requestDetailSchema, { method: "POST", etag, signal }),
  receive: (id: string, body: ReceiveInput, etag: string, signal?: AbortSignal) => validated(`/lab-specimens/${segment(id)}/receive`, schema.specimenSchema, { method: "POST", body, etag, signal }),
  result: (id: string, body: ResultInput, etag: string, signal?: AbortSignal) => validated(`/lab-request-tests/${segment(id)}/results`, schema.resultResponseSchema, { method: "POST", body, etag, signal }),
  correct: (id: string, body: CorrectionInput, etag: string, signal?: AbortSignal) => validated(`/lab-results/${segment(id)}/corrections`, schema.resultResponseSchema, { method: "POST", body, etag, signal }),
};
