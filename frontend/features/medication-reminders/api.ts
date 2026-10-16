import { z } from "@/lib/validation";
import { apiRequest, type ApiOptions } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";

const channel = z.enum(["WHATSAPP", "EMAIL", "TELEGRAM"]);
const mode = z.enum(["DISABLED", "SIMULATED", "CLOUD_TEST", "CHANNEL_TEST"]);
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
  emailConsent: z.boolean(), telegramConsent: z.boolean(), verifiedEmail: z.boolean(), maskedEmail: z.string().nullable(),
  emailBindingCurrent: z.boolean(), telegramBindingCurrent: z.boolean(), telegramLinked: z.boolean(), maskedTelegram: z.string().nullable(),
  emailAvailable: z.boolean(), telegramAvailable: z.boolean(),
});
const inputSchema = z.object({ ...consentFields, riskAcknowledged: z.boolean(), emailConsent: z.boolean().optional(), telegramConsent: z.boolean().optional(), emailRiskAcknowledged: z.boolean().optional(), telegramRiskAcknowledged: z.boolean().optional() }).strict();
const botUsername = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/);
const telegramSchema = z.object({ version: z.number().int().nonnegative(), linked: z.boolean(), maskedChat: z.string().nullable(), botUsername: botUsername.nullable(), available: z.boolean() }).strict();
const linkSchema = z.object({ deepLink: z.string(), expiresAt: z.iso.datetime({ offset: true }) }).strict();
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
export type TelegramStatus = z.infer<typeof telegramSchema>;
export type TelegramLink = z.infer<typeof linkSchema>;
const path = "/v1/me/medication-reminders";
const invalid = () => new ApiError({ status: 502, code: "INVALID_RESPONSE", title: "Respons layanan tidak valid" });
async function preferences(options: ApiOptions = {}) {
  const response = await apiRequest<unknown>(`${path}/preferences`, options);
  const parsed = preferencesSchema.safeParse(response.data);
  if (!parsed.success || !response.etag) throw invalid();
  return { data: parsed.data, etag: response.etag };
}
async function telegram(options: ApiOptions = {}) {
  const response = await apiRequest<unknown>(`${path}/telegram`, options);
  const parsed = telegramSchema.safeParse(response.data);
  if (!parsed.success || !response.etag) throw invalid();
  return { data: parsed.data, etag: response.etag };
}
export const reminderApi = {
  preferences: (signal: AbortSignal) => preferences({ signal }),
  save: (body: ReminderInput, etag: string, signal: AbortSignal) => preferences({ method: "PATCH", body: inputSchema.parse(body), etag, signal }),
  telegram: (signal: AbortSignal) => telegram({ signal }),
  unlinkTelegram: (etag: string, signal: AbortSignal) => telegram({ method: "DELETE", etag, signal }),
  linkTelegram: async (etag: string, username: string, signal: AbortSignal): Promise<TelegramLink> => {
    if (!botUsername.safeParse(username).success) throw invalid();
    const response = await apiRequest<unknown>(`${path}/telegram/link`, { method: "POST", body: {}, etag, signal });
    const parsed = linkSchema.safeParse(response.data);
    if (!parsed.success) throw invalid();
    // Match the literal URL as well as its structure: no alternate origins, encoded paths,
    // extra parameters, credentials, fragments or client-supplied destinations.
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^https://t\\.me/${escaped}\\?start=[A-Za-z0-9_-]{43}$`).test(parsed.data.deepLink)) throw invalid();
    const remaining = Date.parse(parsed.data.expiresAt) - Date.now();
    if (remaining <= 0 || remaining > 300000) throw invalid();
    return parsed.data;
  },
  history: async (signal: AbortSignal) => {
    const response = await apiRequest<unknown>(`${path}/history?page=0&size=10`, { signal });
    const parsed = historySchema.safeParse(response.data);
    if (!parsed.success || parsed.data.content.length > 10) throw invalid();
    return { data: parsed.data };
  },
};
