import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import * as f from "./monitoring-fixtures";
import { monitoringBackend, renderMonitoring, tag, failure } from "./monitoring-harness";
it("manual target create opens with empty dates and one empty event, using live types", async () => {
  monitoringBackend(c => c.url.includes("monitoring-plans?") ? Response.json({
    ...f.page(f.plan),
    content: [],
    totalElements: 0
  }) : undefined);
  await renderMonitoring("target", f.treatment.id);
  await userEvent.click(await screen.findByRole("button", {
    name: "Buat rencana pemantauan"
  }));
  expect(screen.getByLabelText(/Tanggal mulai rencana/)).toHaveValue("");
  expect(screen.getByLabelText(/Jadwal kegiatan 1/)).toHaveValue("");
  expect(screen.getByLabelText(/Jenis kegiatan 1/)).toHaveValue("");
  expect(screen.getAllByRole("group", {
    name: /Kegiatan nomor/
  })).toHaveLength(1);
  expect(within(screen.getByLabelText(/Jenis kegiatan 1/)).getByText("Live CLINICAL_REVIEW")).toBeInTheDocument();
});
it("plan dirty notes clear uses GET ETag and no immutable fields", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("plan");
  await userEvent.click(await screen.findByRole("button", {
    name: "Ubah rencana"
  }));
  await userEvent.clear(screen.getByLabelText("Catatan rencana"));
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan rencana"
  }));
  await waitFor(() => expect(calls.find(c => c.options.method === "PATCH")?.body).toEqual({
    notes: null
  }));
  expect(tag(calls.find(c => c.options.method === "PATCH")!)).toBe('"plan-get"');
});
it("plan cancel requires confirmation and explains consequence", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("plan");
  await userEvent.click(await screen.findByRole("button", {
    name: "Batalkan rencana"
  }));
  await screen.findByText(/Membatalkan rencana akan membatalkan kegiatan/);
  await userEvent.click(screen.getByRole("button", {
    name: "Konfirmasi pembatalan rencana"
  }));
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(0);
  await userEvent.click(screen.getByLabelText("Saya mengonfirmasi pembatalan rencana"));
  await userEvent.click(screen.getByRole("button", {
    name: "Konfirmasi pembatalan rencana"
  }));
  await waitFor(() => expect(calls.find(c => c.url.endsWith("/cancel"))).toBeDefined());
  expect(tag(calls.find(c => c.url.endsWith("/cancel"))!)).toBe('"plan-get"');
});
it("event editor gets authoritative detail and clears due date without rewriting scheduled timestamp", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("plan");
  await userEvent.click(await screen.findByRole("button", {
    name: "Buka kegiatan 1"
  }));
  await userEvent.click(await screen.findByRole("button", {
    name: "Jadwalkan ulang"
  }));
  await userEvent.clear(screen.getByLabelText("Batas waktu kegiatan"));
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan jadwal"
  }));
  await waitFor(() => expect(calls.find(c => c.options.method === "PATCH")?.body).toEqual({
    dueAt: null
  }));
  expect(tag(calls.find(c => c.options.method === "PATCH")!)).toBe('"event-get"');
  expect(calls.some(c => c.options.method === "GET" && c.url.endsWith(`/monitoring-events/${f.event.id}`))).toBe(true);
});
it("blank event completion means server now", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("plan");
  await userEvent.click(await screen.findByRole("button", {
    name: "Buka kegiatan 1"
  }));
  await userEvent.click(await screen.findByRole("button", {
    name: "Selesaikan kegiatan"
  }));
  await screen.findByText(/Kosong berarti waktu server/);
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan penyelesaian"
  }));
  await waitFor(() => expect(calls.find(c => c.url.endsWith("/complete"))?.body).toEqual({}));
  expect(tag(calls.find(c => c.url.endsWith("/complete"))!)).toBe('"event-get"');
});
it.each(["OPTIMISTIC_LOCK_CONFLICT", "SOURCE_AUTHORITY_CONFLICT", "MONITORING_STATE_CONFLICT"])("%s preserves draft and prevents replay/raw prose", async code => {
  const calls = monitoringBackend(c => c.options.method === "PATCH" ? failure(409, code) : undefined);
  await renderMonitoring("plan");
  await userEvent.click(await screen.findByRole("button", {
    name: "Ubah rencana"
  }));
  await userEvent.type(screen.getByLabelText("Catatan rencana"), " retained");
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan rencana"
  }));
  await waitFor(() => expect(screen.getByRole("button", {
    name: "Simpan rencana"
  })).toBeDisabled());
  expect(screen.getByLabelText("Catatan rencana")).toHaveValue("Private plan notes retained");
  expect(screen.queryByText("never display clinical prose")).not.toBeInTheDocument();
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
});
it("alert acknowledge uses detail tag and resolve OPEN requires confirmation", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("alert", f.alert.id);
  await userEvent.click(await screen.findByRole("button", {
    name: "Akui peringatan"
  }));
  await waitFor(() => expect(calls.find(c => c.url.endsWith("/acknowledge"))).toBeDefined());
  expect(tag(calls.find(c => c.url.endsWith("/acknowledge"))!)).toBe('"alert-get"');
  await userEvent.click(await screen.findByRole("button", {
    name: "Selesaikan peringatan"
  }));
  await userEvent.click(screen.getByRole("button", {
    name: "Konfirmasi penyelesaian peringatan"
  }));
  expect(calls.some(c => c.url.endsWith("/resolve"))).toBe(false);
  await userEvent.click(screen.getByLabelText("Saya mengonfirmasi penyelesaian peringatan"));
  await userEvent.click(screen.getByRole("button", {
    name: "Konfirmasi penyelesaian peringatan"
  }));
  await waitFor(() => expect(calls.find(c => c.url.endsWith("/resolve"))).toBeDefined());
  expect(screen.queryByRole("button", {
    name: /dismiss/i
  })).not.toBeInTheDocument();
});
it("notification read fetches detail then uses its actual tag, never alters alert", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("notifications");
  await userEvent.click(await screen.findByRole("button", {
    name: "Tandai notifikasi 1 dibaca"
  }));
  await waitFor(() => expect(calls.find(c => c.url.endsWith("/read"))).toBeDefined());
  const command = calls.find(c => c.url.endsWith("/read"))!;
  expect(tag(command)).toBe('"notification-get"');
  expect(calls.some(c => c.options.method === "GET" && c.url.endsWith(f.notification.id))).toBe(true);
  expect(calls.some(c => c.url.includes("/alerts/") && c.options.method !== "GET")).toBe(false);
});
it.each(["PENDING", "FAILED", "CANCELLED", "READ"])("%s notification has no read command", async status => {
  monitoringBackend(c => c.url.split("?")[0].endsWith("/me/notifications") ? Response.json(f.page({
    ...f.notification,
    status
  })) : undefined);
  await renderMonitoring("notifications");
  await screen.findByText(`Live ${status}`);
  expect(screen.queryByRole("button", {
    name: /Tandai notifikasi/
  })).not.toBeInTheDocument();
});
