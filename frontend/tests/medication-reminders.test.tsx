import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { MedicationReminders } from "@/features/medication-reminders/preferences";
import { PatientProfile } from "@/features/portal/patient/profile";
import type { Me } from "@/lib/auth/types";
import { reminderApi, type ReminderInput, type ReminderPreferences } from "@/features/medication-reminders/api";
import { patient, supporter, id } from "./portal-fixtures";

const session = vi.hoisted(() => ({ user: null as Me | null, handleFailure: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ ME_QUERY_KEY: ["session", "me"], useSession: () => session }));
const defaults: ReminderPreferences = { version: 0, emailConsent: false, telegramConsent: false, verifiedEmail: true, maskedEmail: "s•••@example.test", emailBindingCurrent: false, telegramBindingCurrent: false, telegramLinked: false, maskedTelegram: null, emailAvailable: false, telegramAvailable: false, whatsappConsent: false, timeZone: null, permittedFrom: null, permittedUntil: null, allDay: false, verifiedPhone: true, maskedPhone: "+62••••1234", bindingCurrent: true, mode: "SIMULATED", policyVersion: "MEDICATION_REMINDERS_V1" };
type Call = { path: string; options: RequestInit; body: Record<string, unknown> | null };
function backend(preferences = defaults, override?: (call: Call) => Response | Promise<Response> | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, options = {}) => {
    const call = { path: String(url), options, body: typeof options.body === "string" ? JSON.parse(options.body) : null };
    calls.push(call);
    const custom = override?.(call); if (custom) return custom;
    if (call.path.endsWith("/telegram")) return Response.json({ version: 0, linked: false, maskedChat: null, botUsername: "tbcall_fictitious_bot", available: true }, { headers: { ETag: '"telegram-zero"' } });
    if (call.path.includes("/history")) return Response.json({ content: [], page: 0, size: 10, totalElements: 0 });
    if (options.method === "PATCH") return Response.json({ ...preferences, ...call.body, version: preferences.version + 1 }, { headers: { ETag: '"next"' } });
    return Response.json(preferences, { headers: { ETag: '"initial-zero"' } });
  }));
  return calls;
}
function setup(user: Me = { ...patient, permissions: [] }, profile = false) {
  session.user = user;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryDefaults(["session", "me"], { gcTime: Infinity });
  client.setQueryData(["session", "me"], user);
  const view = render(<QueryClientProvider client={client}>{profile ? <PatientProfile/> : <MedicationReminders/>}</QueryClientProvider>);
  return { ...view, client };
}
beforeEach(() => { session.user = null; session.handleFailure.mockReset(); document.cookie = "XSRF-TOKEN=reminder-test; Path=/"; });
it.each([
  ["smsConsent", true],
  ["smsFallback", true],
  ["preferredChannel", "SMS"],
  ["futureSmsOption", true],
])("rejects obsolete or unknown request field %s before making a request", (field, value) => {
  const calls = backend();
  const input = { whatsappConsent: true, timeZone: "Asia/Jakarta", permittedFrom: null, permittedUntil: null, allDay: true, riskAcknowledged: true, policyVersion: "MEDICATION_REMINDERS_V1", [field]: value } as ReminderInput;
  expect(() => reminderApi.save(input, '"opaque"', new AbortController().signal)).toThrow(/Unrecognized key/);
  expect(calls).toHaveLength(0);
});
it.each(["SMS", "UNKNOWN"])("rejects unsupported history channel %s without displaying it as WhatsApp", async channel => {
  backend(defaults, c => c.path.includes("/history") ? Response.json({ content: [{ id, scheduledAt: "2026-10-16T01:00:00Z", channel, state: "ACCEPTED", attemptCount: 1, classification: null, mode: "SIMULATED", createdAt: "2026-10-16T00:00:00Z" }], page: 0, size: 10, totalElements: 1 }) : undefined);
  await expect(reminderApi.history(new AbortController().signal)).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
});
it("accepts the limited Cloud test mode in preference and history responses", async () => {
  backend({ ...defaults, mode: "CLOUD_TEST" }, c => c.path.includes("/history") ? Response.json({ content: [{ id, scheduledAt: "2026-10-16T01:00:00Z", channel: "WHATSAPP", state: "ACCEPTED", attemptCount: 1, classification: null, mode: "CLOUD_TEST", createdAt: "2026-10-16T00:00:00Z" }], page: 0, size: 10, totalElements: 1 }) : undefined);
  const signal = new AbortController().signal;
  await expect(reminderApi.preferences(signal)).resolves.toMatchObject({ data: { mode: "CLOUD_TEST", whatsappConsent: false }, etag: '"initial-zero"' });
  await expect(reminderApi.history(signal)).resolves.toMatchObject({ data: { content: [{ mode: "CLOUD_TEST", state: "ACCEPTED" }] } });
});
it("shows limited manual Meta testing with consent OFF", async () => {
  backend({ ...defaults, mode: "CLOUD_TEST" }); setup();
  const whatsapp = await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" });
  expect(whatsapp).not.toBeChecked();
  const note = screen.getByText(/Uji WhatsApp Meta terbatas/i);
  expect(note).toHaveTextContent(/manual.*operator/i);
  expect(note).toHaveTextContent(/bukan layanan produksi/i);
  expect(note).toHaveTextContent(/tidak ada pengiriman otomatis/i);
});
it.each([
  ["ACCEPTED", "Diterima Meta, belum dikonfirmasi terkirim · uji WhatsApp"],
  ["DELIVERED", "Terkirim, dikonfirmasi callback Meta · uji WhatsApp"],
  ["UNCERTAIN", "Hasil belum pasti, tidak dicoba ulang otomatis · uji WhatsApp"],
])("identifies Cloud test %s without claiming medication adherence", async (state, label) => {
  backend({ ...defaults, mode: "CLOUD_TEST" }, c => c.path.includes("/history") ? Response.json({ content: [{ id, scheduledAt: "2026-10-16T01:00:00Z", channel: "WHATSAPP", state, attemptCount: 1, classification: null, mode: "CLOUD_TEST", createdAt: "2026-10-16T00:00:00Z" }], page: 0, size: 10, totalElements: 1 }) : undefined);
  setup();
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(screen.getByText(/tidak membuktikan obat diminum/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /kirim|coba ulang/i })).not.toBeInTheDocument();
});
async function enable() {
  await userEvent.click(await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Zona waktu (IANA)" }), "Asia/Jakarta");
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan sepanjang hari" }));
}
it("places WhatsApp-only OFF consent controls in patient profile without clinical read permissions", async () => {
  backend(); setup(undefined, true);
  const section = await screen.findByRole("region", { name: "Pengingat" });
  expect(await within(section).findByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeChecked();
  expect(within(section).queryByRole("checkbox", { name: /SMS/i })).not.toBeInTheDocument();
  expect(within(section).queryByRole("combobox")).not.toBeInTheDocument();
  expect(section).not.toHaveTextContent(/SMS/i);
  expect(within(section).getByText("+62••••1234")).toBeInTheDocument();
  expect(within(section).getByText(/Simulasi.*tidak mengirim pesan/i)).toBeInTheDocument();
  expect(within(section).queryByRole("textbox", { name: /nomor/i })).not.toBeInTheDocument();
});
it.each([supporter, { ...patient, roles: [{ code: "STAFF", name: "Petugas" }] }, { ...patient, roles: [...patient.roles, { code: "STAFF", name: "Petugas" }] }, { ...patient, patientLink: null }])("hides reminders for unauthorized scope %s", async user => {
  const calls = backend(); setup(user); expect(screen.queryByRole("region", { name: "Pengingat" })).not.toBeInTheDocument();
  expect(calls).toHaveLength(0);
});
it.each(["SIMULATED", "CLOUD_TEST"] as const)("requires explicit privacy acknowledgement before storing enabled consent and preserves server ETag in %s", async mode => {
  const calls = backend({ ...defaults, mode }); setup(); await enable();
  const save = screen.getByRole("button", { name: "Simpan pengingat" });
  expect(save).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(save);
  await screen.findByText("Pengaturan pengingat disimpan.");
  await waitFor(() => expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1));
  const request = calls.find(c => c.options.method === "PATCH")!;
  expect(new Headers(request.options.headers).get("If-Match")).toBe('"initial-zero"');
  expect(new Headers(request.options.headers).get("X-XSRF-TOKEN")).toBe("reminder-test");
  expect(request.body).toEqual({ whatsappConsent: true, timeZone: "Asia/Jakarta", permittedFrom: null, permittedUntil: null, allDay: true, policyVersion: "MEDICATION_REMINDERS_V1", riskAcknowledged: true, emailConsent: false, telegramConsent: false, emailRiskAcknowledged: false, telegramRiskAcknowledged: false });
});
it("prevents enabling without verified phone while allowing consent withdrawal", async () => {
  const calls = backend({ ...defaults, whatsappConsent: true, verifiedPhone: false, maskedPhone: null }); setup();
  const whatsapp = await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" });
  expect(whatsapp).toBeChecked();
  await userEvent.click(whatsapp);
  expect(whatsapp).toBeDisabled();
  expect(screen.getByText(/Nomor telepon belum terverifikasi/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Simpan pengingat" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await screen.findByText("Pengaturan pengingat disimpan.");
  expect(calls.some(c => c.body?.whatsappConsent === false && c.body.riskAcknowledged === false)).toBe(true);
});
it("accepts overnight WhatsApp hours with a valid IANA zone", async () => {
  const calls = backend(); setup(); await enable();
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan sepanjang hari" }));
  await userEvent.type(screen.getByLabelText("Mulai"), "22:00"); await userEvent.type(screen.getByLabelText("Sampai"), "06:00");
  await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await waitFor(() => expect(calls.some(c => c.body?.whatsappConsent === true && c.body.permittedFrom === "22:00" && c.body.permittedUntil === "06:00")).toBe(true));
});
it("rejects equal hours and invalid time zones", async () => {
  backend(); setup(); await enable(); await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan sepanjang hari" }));
  await userEvent.type(screen.getByLabelText("Mulai"), "08:00"); await userEvent.type(screen.getByLabelText("Sampai"), "08:00");
  expect(screen.getByRole("button", { name: "Simpan pengingat" })).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan sepanjang hari" }));
  await userEvent.clear(screen.getByLabelText("Zona waktu (IANA)")); await userEvent.type(screen.getByLabelText("Zona waktu (IANA)"), "Jakarta");
  expect(screen.getByRole("button", { name: "Simpan pengingat" })).toBeDisabled();
});
it("discards stale binding consent and history but permits explicit re-enrollment", async () => {
  backend({ ...defaults, bindingCurrent: false, whatsappConsent: true }, c => c.path.includes("/history") ? Response.json({ content: [{ id, scheduledAt: "2026-10-16T01:00:00Z", channel: "WHATSAPP", state: "ACCEPTED", attemptCount: 1, classification: null, mode: "SIMULATED", createdAt: "2026-10-16T00:00:00Z" }], page: 0, size: 10, totalElements: 1 }) : undefined);
  setup(); expect(await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeChecked();
  expect(screen.queryByText(/Diterima.*simulasi/i)).not.toBeInTheDocument();
  await enable(); await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  expect(screen.getByRole("button", { name: "Simpan pengingat" })).toBeEnabled();
});
it("labels simulated acceptance without claiming message delivery", async () => {
  backend(defaults, c => c.path.includes("/history") ? Response.json({ content: [{ id, scheduledAt: "2026-10-16T01:00:00Z", channel: "WHATSAPP", state: "ACCEPTED", attemptCount: 1, classification: null, mode: "SIMULATED", createdAt: "2026-10-16T00:00:00Z" }], page: 0, size: 10, totalElements: 1 }) : undefined);
  setup(); expect(await screen.findByText("Diterima oleh simulasi")).toBeInTheDocument();
  expect(screen.queryByText(/^Terkirim$/i)).not.toBeInTheDocument();
});
it.each([
  { ...patient, id: "other-user" },
  { ...patient, patientLink: { ...patient.patientLink!, version: 1 } },
  { ...patient, patientLink: null },
  { ...patient, roles: [{ code: "TREATMENT_SUPPORTER", name: "Pendamping" }] },
])("clears private state and aborts reads immediately when account context changes: %s", async next => {
  let historySignal: AbortSignal | null | undefined;
  backend(defaults, c => c.path.includes("/history") ? (historySignal = c.options.signal, new Promise<Response>(() => {})) : undefined);
  const view = setup(); await screen.findByText("+62••••1234");
  act(() => view.client.setQueryData(["session", "me"], next));
  expect(historySignal?.aborted).toBe(true);
  expect(screen.queryByText("+62••••1234")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeInTheDocument();
});
it.each([401, 403])("clears controls on read failure %i and delegates session handling", async status => {
  backend(defaults, c => c.path.includes("/history") ? Response.json({ title: "private", status }, { status, headers: { "Content-Type": "application/problem+json" } }) : undefined);
  setup(); await waitFor(() => expect(session.handleFailure).toHaveBeenCalled());
  expect(screen.queryByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeInTheDocument();
  expect(screen.queryByText("+62••••1234")).not.toBeInTheDocument();
});
it("requires reload after conflict without automatically replaying failed PATCH", async () => {
  const calls = backend(defaults, c => c.options.method === "PATCH" ? Response.json({ title: "private", status: 412 }, { status: 412, headers: { "Content-Type": "application/problem+json" } }) : undefined);
  setup(); await enable(); await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  expect(await screen.findByText(/Pengaturan telah berubah/)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeInTheDocument();
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Muat ulang pengingat" }));
  expect(await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeChecked();
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
});
it("keeps consent unavailable after account changes then restores before React rerenders", async () => {
  backend(); const view = setup(); await enable();
  act(() => { view.client.setQueryData(["session", "me"], { ...patient, id: "temporary-other" }); view.client.setQueryData(["session", "me"], session.user); });
  expect(screen.queryByText("+62••••1234")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeInTheDocument();
});
it("aborts an in-flight save and suppresses late success after account change", async () => {
  let resolve!: (response: Response) => void, signal: AbortSignal | null | undefined;
  const calls = backend(defaults, c => c.options.method === "PATCH" ? (signal = c.options.signal, new Promise<Response>(r => { resolve = r; })) : undefined);
  const view = setup(); await enable(); await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  act(() => view.client.setQueryData(["session", "me"], { ...patient, id: "new-account" }));
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve(Response.json({ ...defaults, version: 1, whatsappConsent: true }, { headers: { ETag: '"late"' } })));
  expect(screen.queryByText("Pengaturan pengingat disimpan.")).not.toBeInTheDocument();
  expect(screen.queryByText("+62••••1234")).not.toBeInTheDocument();
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
});
it("requires an authoritative ETag before exposing editable controls", async () => {
  backend(defaults, c => !c.path.includes("/history") ? Response.json(defaults) : undefined); setup();
  await screen.findByRole("button", { name: "Muat ulang pengingat" });
  expect(screen.queryByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeInTheDocument();
});
it.each(["", "x".repeat(101)])("rejects a saved time zone outside the bounded nonempty contract: %s", async timeZone => {
  backend({ ...defaults, timeZone }); setup();
  await screen.findByRole("button", { name: "Muat ulang pengingat" });
  expect(screen.queryByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeInTheDocument();
});
it("keeps withdrawal available for a saved server zone unsupported by the browser and formats history in UTC", async () => {
  const DateTimeFormat = Intl.DateTimeFormat;
  // Browsers ship different ICU zone catalogs. Model a server-supported legacy zone absent from this browser.
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
    if (options?.timeZone === "SystemV/AST4") throw new RangeError("Unsupported browser zone");
    return new DateTimeFormat(locales, options);
  } as typeof Intl.DateTimeFormat);
  const calls = backend({ ...defaults, whatsappConsent: true, timeZone: "SystemV/AST4", allDay: true }, c => c.path.includes("/history") ? Response.json({ content: [{ id, scheduledAt: "2026-10-16T01:00:00Z", channel: "WHATSAPP", state: "ACCEPTED", attemptCount: 1, classification: null, mode: "SIMULATED", createdAt: "2026-10-16T00:00:00Z" }], page: 0, size: 10, totalElements: 1 }) : undefined);
  setup();
  const whatsapp = await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" });
  expect(whatsapp).toBeChecked();
  expect(screen.getByLabelText("Zona waktu (IANA)")).toHaveValue("SystemV/AST4");
  await screen.findByText("Diterima oleh simulasi");
  expect(screen.getByText(/\(UTC\)/)).toHaveTextContent("01.00");
  await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  expect(screen.getByRole("button", { name: "Simpan pengingat" })).toBeDisabled();
  await userEvent.click(whatsapp);
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await screen.findByText("Pengaturan pengingat disimpan.");
  expect(calls.find(c => c.options.method === "PATCH")?.body).toMatchObject({ whatsappConsent: false, timeZone: null, riskAcknowledged: false });
});
it.each(["GMT", "CET", "WET"])("reads saved IANA alias %s and allows consent withdrawal using its opaque ETag", async timeZone => {
  const saved = { ...defaults, version: 7, whatsappConsent: true, timeZone, allDay: true };
  const calls = backend(saved, c => c.path.endsWith("/preferences") && c.options.method !== "PATCH" ? Response.json(saved, { headers: { ETag: '"7-identity-binding-58e2"' } }) : undefined);
  setup();
  const whatsapp = await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" });
  expect(whatsapp).toBeChecked();
  expect(screen.getByLabelText("Zona waktu (IANA)")).toHaveValue(timeZone);
  await userEvent.click(whatsapp);
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await screen.findByText("Pengaturan pengingat disimpan.");
  const request = calls.find(c => c.options.method === "PATCH")!;
  expect(request.body).toMatchObject({ whatsappConsent: false, timeZone, riskAcknowledged: false });
  expect(new Headers(request.options.headers).get("If-Match")).toBe('"7-identity-binding-58e2"');
});
it("stores explicit consent when transport is disabled while clearly showing delivery unavailable", async () => {
  const calls = backend({ ...defaults, mode: "DISABLED" }); setup(); await enable();
  expect(screen.getByText(/Pengiriman WhatsApp belum tersedia/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await screen.findByText("Pengaturan pengingat disimpan."); expect(calls.some(c => c.body?.whatsappConsent)).toBe(true);
});
it.each([401, 403])("clears controls after save denial %i without replay", async status => {
  const calls = backend(defaults, c => c.options.method === "PATCH" ? Response.json({ title: "private", status }, { status, headers: { "Content-Type": "application/problem+json" } }) : undefined);
  setup(); await enable(); await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await waitFor(() => expect(session.handleFailure).toHaveBeenCalled());
  expect(screen.queryByText("+62••••1234")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeInTheDocument();
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
});

it("requires separate Email and Telegram acknowledgements and permits Email without a phone", async () => {
  const calls = backend({ ...defaults, mode: "CHANNEL_TEST", verifiedPhone: false, emailAvailable: true, telegramAvailable: true, telegramLinked: true, telegramBindingCurrent: true, maskedTelegram: "•••1234" }); setup();
  await userEvent.click(await screen.findByRole("checkbox", { name: "Izinkan Email" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan Telegram" }));
  await userEvent.type(screen.getByLabelText("Zona waktu (IANA)"), "Asia/Jakarta");
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan sepanjang hari" }));
  const save = screen.getByRole("button", { name: "Simpan pengingat" });
  expect(save).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*pengingat Email/i }));
  expect(save).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*pengingat Telegram/i }));
  await userEvent.click(save);
  await screen.findByText("Pengaturan pengingat disimpan.");
  expect(calls.find(c => c.options.method === "PATCH")?.body).toMatchObject({ whatsappConsent: false, emailConsent: true, telegramConsent: true, riskAcknowledged: false, emailRiskAcknowledged: true, telegramRiskAcknowledged: true });
  expect(screen.queryByRole("textbox", { name: /email|chat|penerima/i })).not.toBeInTheDocument();
});
it.each(["EMAIL", "TELEGRAM"])("shows %s provider acceptance without claiming delivery or adherence", async channel => {
  backend({ ...defaults, bindingCurrent: false, emailBindingCurrent: true, mode: "CHANNEL_TEST" }, c => c.path.includes("/history") ? Response.json({ content: [{ id, scheduledAt: "2026-10-16T01:00:00Z", channel, state: "ACCEPTED", attemptCount: 1, classification: null, mode: "CHANNEL_TEST", createdAt: "2026-10-16T00:00:00Z" }], page: 0, size: 10, totalElements: 1 }) : undefined);
  setup();
  expect(await screen.findByText(/Diterima penyedia, belum dikonfirmasi terkirim/)).toHaveTextContent(/uji Email|uji Telegram/);
  expect(screen.getByText(/tidak membuktikan obat diminum/)).toBeInTheDocument();
});
it("creates only one Telegram link with the authoritative ETag and clears it on explicit recheck", async () => {
  let finish!: (response: Response) => void;
  const calls = backend(defaults, c => c.path.endsWith("/telegram/link") ? new Promise<Response>(resolve => { finish = resolve; }) : undefined);
  setup();
  const button = await screen.findByRole("button", { name: "Hubungkan Telegram" });
  await userEvent.dblClick(button);
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
  const request = calls.find(c => c.options.method === "POST")!;
  expect(new Headers(request.options.headers).get("If-Match")).toBe('"telegram-zero"');
  expect(new Headers(request.options.headers).get("X-XSRF-TOKEN")).toBe("reminder-test");
  expect(request.body).toEqual({});
  const deepLink = `https://t.me/tbcall_fictitious_bot?start=${"a".repeat(43)}`;
  await act(async () => finish(Response.json({ deepLink, expiresAt: new Date(Date.now() + 300000).toISOString() })));
  const link = await screen.findByRole("link", { name: "Buka bot Telegram" });
  expect(link).toHaveAttribute("href", deepLink);
  expect(link).toHaveAttribute("rel", "noreferrer noopener");
  await userEvent.click(screen.getByRole("button", { name: "Periksa tautan" }));
  expect(screen.queryByRole("link", { name: "Buka bot Telegram" })).not.toBeInTheDocument();
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
});
it("requires a Telegram unlink confirmation and refreshes preference and Telegram ETags after unlink", async () => {
  let linked = true;
  const calls = backend({ ...defaults, mode: "CHANNEL_TEST", telegramLinked: true, telegramBindingCurrent: true }, c => {
    if (!c.path.endsWith("/telegram")) return;
    if (c.options.method === "DELETE") linked = false;
    return Response.json({ version: linked ? 0 : 1, linked, maskedChat: linked ? "•••1234" : null, botUsername: "tbcall_fictitious_bot", available: true }, { headers: { ETag: linked ? '"tg-linked"' : '"tg-unlinked"' } });
  });
  setup();
  await userEvent.click(await screen.findByRole("button", { name: "Putuskan tautan Telegram" }));
  expect(calls.filter(c => c.options.method === "DELETE")).toHaveLength(0);
  const dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByRole("button", { name: /Ya, putuskan tautan Telegram/i }));
  await screen.findByRole("button", { name: "Hubungkan Telegram" });
  const request = calls.find(c => c.options.method === "DELETE")!;
  expect(new Headers(request.options.headers).get("If-Match")).toBe('"tg-linked"');
  expect(new Headers(request.options.headers).get("X-XSRF-TOKEN")).toBe("reminder-test");
  expect(calls.filter(c => c.path.endsWith("/preferences") && c.options.method !== "PATCH").length).toBeGreaterThan(1);
});
it("clears a transient Telegram token on save and never places it in the query cache", async () => {
  const deepLink = `https://t.me/tbcall_fictitious_bot?start=${"a".repeat(43)}`;
  backend(defaults, c => c.path.endsWith("/telegram/link") ? Response.json({ deepLink, expiresAt: new Date(Date.now() + 300000).toISOString() }) : undefined);
  const view = setup();
  await userEvent.click(await screen.findByRole("button", { name: "Hubungkan Telegram" }));
  await screen.findByRole("link", { name: "Buka bot Telegram" });
  expect(JSON.stringify(view.client.getQueryCache().getAll().map(query => query.state.data))).not.toContain(deepLink);
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await screen.findByText("Pengaturan pengingat disimpan.");
  expect(screen.queryByRole("link", { name: "Buka bot Telegram" })).not.toBeInTheDocument();
});
it("aborts pending Telegram linking and suppresses late links after account change", async () => {
  let finish!: (response: Response) => void, signal: AbortSignal | null | undefined;
  const calls = backend(defaults, c => c.path.endsWith("/telegram/link") ? (signal = c.options.signal, new Promise<Response>(resolve => { finish = resolve; })) : undefined);
  const view = setup();
  await userEvent.click(await screen.findByRole("button", { name: "Hubungkan Telegram" }));
  act(() => view.client.setQueryData(["session", "me"], { ...patient, id: "other-account" }));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(Response.json({ deepLink: `https://t.me/tbcall_fictitious_bot?start=${"a".repeat(43)}`, expiresAt: new Date(Date.now() + 300000).toISOString() })));
  expect(screen.queryByRole("link", { name: "Buka bot Telegram" })).not.toBeInTheDocument();
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
});
it("requires a fresh read after Telegram conflict without replaying link creation", async () => {
  const calls = backend(defaults, c => c.path.endsWith("/telegram/link") ? Response.json({ title: "Stale", status: 412 }, { status: 412 }) : undefined);
  setup();
  await userEvent.click(await screen.findByRole("button", { name: "Hubungkan Telegram" }));
  await screen.findByText(/Pengaturan telah berubah/);
  expect(screen.queryByRole("link", { name: "Buka bot Telegram" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Muat ulang pengingat" }));
  await screen.findByRole("button", { name: "Hubungkan Telegram" });
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
  expect(calls.filter(c => c.path.endsWith("/telegram")).length).toBeGreaterThan(1);
});
it("hides an expired Telegram deep link", async () => {
  backend(defaults, c => c.path.endsWith("/telegram/link") ? Response.json({ deepLink: `https://t.me/tbcall_fictitious_bot?start=${"a".repeat(43)}`, expiresAt: new Date(Date.now() + 400).toISOString() }) : undefined);
  setup();
  await userEvent.click(await screen.findByRole("button", { name: "Hubungkan Telegram" }));
  await screen.findByRole("link", { name: "Buka bot Telegram" });
  await waitFor(() => expect(screen.queryByRole("link", { name: "Buka bot Telegram" })).not.toBeInTheDocument());
});
it("refreshes preference bindings when retrying a failed Telegram status read", async () => {
  let first = true;
  const calls = backend(defaults, c => {
    if (!c.path.endsWith("/telegram")) return;
    if (first) { first = false; return Response.json({ title: "Unavailable", status: 503 }, { status: 503 }); }
    return Response.json({ version: 1, linked: true, maskedChat: "•••1234", botUsername: "tbcall_fictitious_bot", available: true }, { headers: { ETag: '"tg-after-retry"' } });
  });
  setup();
  await userEvent.click(await screen.findByRole("button", { name: "Muat ulang tautan Telegram" }));
  await screen.findByText(/Telegram terhubung: •••1234/);
  expect(calls.filter(c => c.path.endsWith("/preferences")).length).toBeGreaterThan(1);
});
