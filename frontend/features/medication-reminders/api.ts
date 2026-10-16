import { z } from "@/lib/validation";
import { apiRequest, type ApiOptions } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";

const channel = z.enum(["WHATSAPP"]);
const mode = z.enum(["DISABLED", "SIMULATED"]);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable();
export function validReminderZone(zone: string) {
  // Named IANA aliases (for example GMT, CET and WET) are valid too.
  // Intl also accepts numeric offsets, which are outside the server's named-zone contract.
  if (/^[+-]/.test(zone)) return false;
  try { new Intl.DateTimeFormat("id-ID", { timeZone: zone }); return true; } catch { return false; }
}
const consentFields = {
  whatsappConsent: z.boolean(),
  timeZone: z.string().refine(validReminderZone).nullable(), permittedFrom: time, permittedUntil: time, allDay: z.boolean(),
  policyVersion: z.literal("MEDICATION_REMINDERS_V1"),
};
const preferencesSchema = z.object({
  ...consentFields, timeZone: z.string().min(1).max(100).nullable(),
  version: z.number().int().nonnegative(), verifiedPhone: z.boolean(), maskedPhone: z.string().nullable(),
  bindingCurrent: z.boolean(), mode,
});
const inputSchema = z.object({ ...consentFields, riskAcknowledged: z.boolean() }).strict();
const historySchema = z.object({
  content: z.array(z.object({
    id: z.uuid(), scheduledAt: z.iso.datetime({ offset: true }), channel,
    state: z.enum(["SCHEDULED", "ELIGIBLE", "SUPPRESSED", "DISPATCHED", "ACCEPTED", "DELIVERED", "FAILED", "CANCELLED", "UNCERTAIN"]),
    attemptCount: z.number().int().nonnegative(), classification: z.string().nullable(), mode, createdAt: z.iso.datetime({ offset: true }),
  })), page: z.literal(0), size: z.literal(10), totalElements: z.number().int().nonnegative(),
});
export type ReminderPreferences = z.infer<typeof preferencesSchema>;
export type ReminderInput = z.infer<typeof inputSchema>;
export type ReminderJob = z.infer<typeof historySchema>["content"][number];
const path = "/v1/me/medication-reminders";
const invalid = () => new ApiError({ status: 502, code: "INVALID_RESPONSE", title: "Respons layanan tidak valid" });
async function preferences(options: ApiOptions = {}) {
  const response = await apiRequest<unknown>(`${path}/preferences`, options);
  const parsed = preferencesSchema.safeParse(response.data);
  if (!parsed.success || !response.etag) throw invalid();
  return { data: parsed.data, etag: response.etag };
}
export const reminderApi = {
  preferences: (signal: AbortSignal) => preferences({ signal }),
  save: (body: ReminderInput, etag: string, signal: AbortSignal) => preferences({ method: "PATCH", body: inputSchema.parse(body), etag, signal }),
  history: async (signal: AbortSignal) => {
    const response = await apiRequest<unknown>(`${path}/history?page=0&size=10`, { signal });
    const parsed = historySchema.safeParse(response.data);
    if (!parsed.success || parsed.data.content.length > 10) throw invalid();
    return { data: parsed.data };
  },
};
