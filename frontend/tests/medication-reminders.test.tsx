import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { MedicationReminders } from "@/features/medication-reminders/preferences";
import { PatientProfile } from "@/features/portal/patient/profile";
import type { Me } from "@/lib/auth/types";
import type { ReminderPreferences } from "@/features/medication-reminders/api";
import { patient, supporter, id } from "./portal-fixtures";

const session = vi.hoisted(() => ({ user: null as Me | null, handleFailure: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ ME_QUERY_KEY: ["session", "me"], useSession: () => session }));
const defaults: ReminderPreferences = { version: 0, whatsappConsent: false, smsConsent: false, preferredChannel: "WHATSAPP", smsFallback: false, timeZone: null, permittedFrom: null, permittedUntil: null, allDay: false, verifiedPhone: true, maskedPhone: "+62••••1234", bindingCurrent: true, mode: "SIMULATED", policyVersion: "MEDICATION_REMINDERS_V1" };
type Call = { path: string; options: RequestInit; body: Record<string, unknown> | null };
function backend(preferences = defaults, override?: (call: Call) => Response | Promise<Response> | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, options = {}) => {
    const call = { path: String(url), options, body: typeof options.body === "string" ? JSON.parse(options.body) : null };
    calls.push(call);
    const custom = override?.(call); if (custom) return custom;
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
async function enable() {
  await userEvent.click(await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Zona waktu (IANA)" }), "Asia/Jakarta");
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan sepanjang hari" }));
}
it("places independent OFF consent controls in patient profile without clinical read permissions", async () => {
  backend(); setup(undefined, true);
  const section = await screen.findByRole("region", { name: "Pengingat" });
  expect(await within(section).findByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeChecked();
  expect(within(section).getByRole("checkbox", { name: "Izinkan SMS" })).not.toBeChecked();
  expect(within(section).getByText("+62••••1234")).toBeInTheDocument();
  expect(within(section).getByText(/Simulasi.*tidak mengirim pesan/i)).toBeInTheDocument();
  expect(within(section).queryByRole("textbox", { name: /nomor/i })).not.toBeInTheDocument();
});
it.each([supporter, { ...patient, roles: [{ code: "STAFF", name: "Petugas" }] }, { ...patient, roles: [...patient.roles, { code: "STAFF", name: "Petugas" }] }, { ...patient, patientLink: null }])("hides reminders for unauthorized scope %s", async user => {
  const calls = backend(); setup(user); expect(screen.queryByRole("region", { name: "Pengingat" })).not.toBeInTheDocument();
  expect(calls).toHaveLength(0);
});
it("requires explicit privacy acknowledgement before storing enabled consent and preserves server ETag", async () => {
  const calls = backend(); setup(); await enable();
  const save = screen.getByRole("button", { name: "Simpan pengingat" });
  expect(save).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(save);
  await screen.findByText("Pengaturan pengingat disimpan.");
  await waitFor(() => expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1));
  const request = calls.find(c => c.options.method === "PATCH")!;
  expect(new Headers(request.options.headers).get("If-Match")).toBe('"initial-zero"');
  expect(new Headers(request.options.headers).get("X-XSRF-TOKEN")).toBe("reminder-test");
  expect(request.body).toEqual({ whatsappConsent: true, smsConsent: false, preferredChannel: "WHATSAPP", smsFallback: false, timeZone: "Asia/Jakarta", permittedFrom: null, permittedUntil: null, allDay: true, policyVersion: "MEDICATION_REMINDERS_V1", riskAcknowledged: true });
});
it("prevents enabling without verified phone while allowing consent withdrawal", async () => {
  const calls = backend({ ...defaults, whatsappConsent: true, verifiedPhone: false, maskedPhone: null }); setup();
  const whatsapp = await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" });
  expect(whatsapp).toBeChecked();
  await userEvent.click(whatsapp);
  expect(whatsapp).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Izinkan SMS" })).toBeDisabled();
  expect(screen.getByText(/Nomor telepon belum terverifikasi/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Simpan pengingat" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await screen.findByText("Pengaturan pengingat disimpan.");
  expect(calls.some(c => c.body?.whatsappConsent === false && c.body.smsConsent === false && c.body.riskAcknowledged === false)).toBe(true);
});
it("requires independent SMS consent for fallback and accepts overnight hours with valid IANA zone", async () => {
  const calls = backend(); setup(); await enable();
  const fallback = screen.getByRole("checkbox", { name: "Gunakan SMS sebagai cadangan" });
  expect(fallback).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan SMS" })); await userEvent.click(fallback);
  await userEvent.click(screen.getByRole("checkbox", { name: "Izinkan sepanjang hari" }));
  await userEvent.type(screen.getByLabelText("Mulai"), "22:00"); await userEvent.type(screen.getByLabelText("Sampai"), "06:00");
  await userEvent.click(screen.getByRole("checkbox", { name: /Saya memahami.*TBCall.*TBC/i }));
  await userEvent.click(screen.getByRole("button", { name: "Simpan pengingat" }));
  await waitFor(() => expect(calls.some(c => c.body?.smsFallback === true && c.body.permittedFrom === "22:00" && c.body.permittedUntil === "06:00")).toBe(true));
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
  backend({ ...defaults, bindingCurrent: false, whatsappConsent: true, smsConsent: true }, c => c.path.includes("/history") ? Response.json({ content: [{ id, scheduledAt: "2026-10-16T01:00:00Z", channel: "SMS", state: "ACCEPTED", attemptCount: 1, classification: null, mode: "SIMULATED", createdAt: "2026-10-16T00:00:00Z" }], page: 0, size: 10, totalElements: 1 }) : undefined);
  setup(); expect(await screen.findByRole("checkbox", { name: "Izinkan WhatsApp" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Izinkan SMS" })).not.toBeChecked();
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
  expect(calls.find(c => c.options.method === "PATCH")?.body).toMatchObject({ whatsappConsent: false, smsConsent: false, timeZone: null, riskAcknowledged: false });
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
  expect(request.body).toMatchObject({ whatsappConsent: false, smsConsent: false, timeZone, riskAcknowledged: false });
  expect(new Headers(request.options.headers).get("If-Match")).toBe('"7-identity-binding-58e2"');
});
it("stores explicit consent when transport is disabled while clearly showing delivery unavailable", async () => {
  const calls = backend({ ...defaults, mode: "DISABLED" }); setup(); await enable();
  expect(screen.getByText(/Pengiriman WhatsApp dan SMS belum tersedia/)).toBeInTheDocument();
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
