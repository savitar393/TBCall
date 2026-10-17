import { apiRequest, type ApiOptions } from "@/lib/api/client";
import { readXsrfToken } from "@/lib/api/csrf";
import { ApiError } from "@/lib/api/problem";
import { z } from "@/lib/validation";

export const votStatuses = { PENDING_REVIEW: "Menunggu peninjauan", OBSERVED: "Aktivitas teramati", NOT_VERIFIABLE: "Tidak dapat diverifikasi", CANCELLED: "Dibatalkan" } as const;
export type VotStatus = keyof typeof votStatuses;
const instant = z.iso.datetime({ offset: true });
export const votSubmissionSchema = z.object({
  id: z.string().min(1), patientId: z.string().min(1), treatmentId: z.string().min(1), scheduleId: z.string().min(1), revisionId: z.string().min(1), occurrenceId: z.string().min(1),
  scheduledAt: instant, localDate: z.iso.date(), localTime: z.string(), timeZone: z.string(), contentType: z.string().regex(/^video\/(webm|mp4)(?:;.*)?$/i), size: z.number().int().positive(),
  submittedAt: instant, status: z.enum(["PENDING_REVIEW", "OBSERVED", "NOT_VERIFIABLE", "CANCELLED"]), consentPolicyVersion: z.string().min(1), consentAcknowledged: z.literal(true),
  reviewedAt: instant.nullable(), reviewedByUserId: z.string().nullable(), reviewNotes: z.string().nullable(), version: z.number().int().nonnegative(), retentionExpiresAt: instant, mediaDeletedAt: instant.nullable(),
});
const pageSchema = z.object({ content: z.array(votSubmissionSchema), page: z.number().int().nonnegative(), size: z.literal(20), totalElements: z.number().int().nonnegative() });
const policySchema = z.object({ enabled: z.boolean(), syntheticOnly: z.literal(true), maxFileBytes: z.number().int().positive().max(20971520), retentionDays: z.number().int().positive(), consentPolicyVersion: z.string().min(1) });
export type VotSubmission = z.infer<typeof votSubmissionSchema>;
export type VotPolicy = z.infer<typeof policySchema>;
export type VotDecision = "OBSERVED" | "NOT_VERIFIABLE";
export type VotAudience = "patient" | "staff";
async function validated<S extends z.ZodType>(path: string, schema: S, options: ApiOptions = {}) {
  const response = await apiRequest<unknown>(path, options), parsed = schema.safeParse(response.data);
  if (!parsed.success) throw new ApiError({ status: 502, code: "INVALID_RESPONSE", title: "Respons layanan tidak valid" });
  return { ...response, data: parsed.data as z.infer<S> };
}
const root = (audience: VotAudience) => audience === "patient" ? "/v1/me/vot-submissions" : "/v1/vot-submissions";
export const mediaUrl = (audience: VotAudience, id: string) => `/api/tbcall${root(audience)}/${encodeURIComponent(id)}/media`;
export const votApi = {
  policy: (signal?: AbortSignal) => validated("/v1/me/vot-policy", policySchema, { signal }),
  list: (audience: VotAudience, page = 0, status?: VotStatus, treatmentId?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ page: String(page), size: "20", ...(status ? { status } : {}), ...(treatmentId ? { treatmentId } : {}) });
    return validated(`${root(audience)}?${params}`, pageSchema, { signal });
  },
  detail: (audience: VotAudience, id: string, signal?: AbortSignal) => validated(`${root(audience)}/${encodeURIComponent(id)}`, votSubmissionSchema, { signal }),
  cancel: (id: string, version: number, signal?: AbortSignal) => validated(`${root("patient")}/${encodeURIComponent(id)}/cancel`, votSubmissionSchema, { method: "POST", etag: `"${version}"`, signal }),
  review: (id: string, body: { decision: VotDecision; notes?: string }, version: number, signal?: AbortSignal) => validated(`${root("staff")}/${encodeURIComponent(id)}/review`, votSubmissionSchema, { method: "POST", body, etag: `"${version}"`, signal }),
  upload: (input: { treatmentId: string; occurrenceId: string; consentPolicyVersion: string }, blob: Blob, progress: (percent: number) => void, signal?: AbortSignal): Promise<{ data: VotSubmission }> => new Promise((resolve, reject) => {
    const token = readXsrfToken();
    if (!token) { reject(new ApiError({ status: 403, code: "CSRF_INVALID", title: "Keamanan sesi perlu diperbarui" })); return; }
    if (signal?.aborted) { reject(new DOMException("Upload cancelled", "AbortError")); return; }
    const xhr = new XMLHttpRequest(), requestId = crypto.randomUUID();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    xhr.open("POST", `/api/tbcall/v1/me/vot-submissions?${new URLSearchParams({ ...input, consentAcknowledged: "true" })}`);
    xhr.withCredentials = true;
    xhr.timeout = 120000;
    xhr.setRequestHeader("Content-Type", blob.type);
    xhr.setRequestHeader("Accept", "application/json, application/problem+json");
    xhr.setRequestHeader("X-XSRF-TOKEN", token);
    xhr.setRequestHeader("X-Request-ID", requestId);
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.min(100, Math.round(event.loaded * 100 / event.total))); };
    xhr.onload = () => {
      cleanup();
      if (xhr.status !== 201) {
        let code: string | undefined;
        try { const data = JSON.parse(xhr.responseText); if (typeof data.code === "string") code = data.code; } catch { /* Never expose raw response text. */ }
        reject(new ApiError({ status: xhr.status, title: "Video belum dapat dikirim", code }, requestId)); return;
      }
      try { resolve({ data: votSubmissionSchema.parse(JSON.parse(xhr.responseText)) }); }
      catch { reject(new ApiError({ status: 502, code: "INVALID_RESPONSE", title: "Respons layanan tidak valid" }, requestId)); }
    };
    xhr.onerror = xhr.ontimeout = () => { cleanup(); reject(new ApiError({ status: 0, code: "NETWORK_UNAVAILABLE", title: "Video belum dapat dikirim" }, requestId)); };
    xhr.onabort = () => { cleanup(); reject(new DOMException("Upload cancelled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(blob);
  }),
};
