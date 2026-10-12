import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import * as f from "./monitoring-fixtures";
import { monitoringBackend, renderMonitoring } from "./monitoring-harness";

it("plan keeps dates and actions visible while metadata remains focusable and optional", async () => {
  monitoringBackend();
  await renderMonitoring("plan");
  const context = await screen.findByRole("region", { name: "Konteks rencana" });
  expect(within(context).getByText("1 Januari 2026")).toBeVisible();
  expect(within(context).getByText("31 Desember 2026")).toBeVisible();
  expect(within(context).getByText("Live ACTIVE")).toBeVisible();
  expect(within(context).getByRole("button", { name: "Ubah rencana" })).toBeEnabled();
  expect(screen.getByText(f.plan.rulesVersion)).not.toBeVisible();
  const metadata = screen.getByText("Metadata rencana");
  expect(metadata.tagName).toBe("SUMMARY");
  metadata.focus();
  expect(metadata).toHaveFocus();
  await userEvent.click(metadata);
  expect(screen.getByText(f.plan.rulesVersion)).toBeVisible();
  expect(within(screen.getByRole("region", { name: "Kegiatan pemantauan" })).getByText("2 Jan 2026, 10.15 WIB")).toBeVisible();
});

it("plan edit focuses a named region and groups editable fields", async () => {
  monitoringBackend();
  await renderMonitoring("plan");
  const trigger = await screen.findByRole("button", { name: "Ubah rencana" });
  await userEvent.click(trigger);
  const form = screen.getByRole("region", { name: "Formulir: Simpan rencana" });
  expect(form).toHaveFocus();
  expect(within(form).getByRole("group", { name: "Ubah rencana" })).toBeInTheDocument();
  expect(within(form).getByLabelText("Catatan rencana")).toHaveValue(f.plan.notes);
  await userEvent.click(within(form).getByRole("button", { name: "Tutup formulir" }));
  expect(screen.queryByRole("region", { name: "Formulir: Simpan rencana" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("activity detail uses authoritative schedule and restores keyboard focus on close", async () => {
  const detailDate = "2026-02-02T12:00:00Z";
  monitoringBackend(c => c.url.endsWith(`/monitoring-events/${f.event.id}`) ? Response.json({ ...f.event, scheduledAt: detailDate }, { headers: { ETag: '"detail"' } }) : undefined);
  await renderMonitoring("plan");
  const trigger = await screen.findByRole("button", { name: "Buka kegiatan 1" });
  await userEvent.click(trigger);
  const context = await screen.findByRole("region", { name: "Konteks kegiatan" });
  expect(within(context).getByText("2 Feb 2026, 19.00 WIB")).toBeVisible();
  const dialog = screen.getByRole("dialog", { name: "Detail kegiatan pemantauan" });
  const reschedule = within(dialog).getByRole("button", { name: "Jadwalkan ulang" });
  await userEvent.click(reschedule);
  expect(screen.getByRole("region", { name: "Formulir: Simpan jadwal" })).toHaveFocus();
  expect(screen.getByRole("group", { name: "Jadwalkan ulang" })).toBeInTheDocument();
  expect(reschedule).toBeInTheDocument();
  expect(reschedule).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Selesaikan kegiatan" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Batalkan kegiatan" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Tutup formulir" }));
  expect(reschedule).toBeEnabled();
  expect(reschedule).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Tutup detail kegiatan" }));
  expect(trigger).toHaveFocus();
});

it("target history keeps recorded counts and dates visible with metadata disclosed", async () => {
  monitoringBackend();
  await renderMonitoring("target", f.treatment.id);
  const history = await screen.findByRole("region", { name: "Riwayat rencana" });
  expect(within(history).getByText("1 Januari 2026")).toBeVisible();
  expect(within(history).getByText("Live SCHEDULED")).toBeVisible();
  expect(within(history).getByRole("link", { name: "Buka rencana" })).toHaveAttribute("href", `/monitoring-plans/${f.plan.id}`);
  expect(within(history).getByText(f.plan.rulesVersion)).not.toBeVisible();
});

it("alert filters, dates and evidence stay grouped without a one-page pager", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("alerts");
  const list = await screen.findByRole("region", { name: "Daftar peringatan" });
  expect(within(list).getByText(f.alert.message)).toBeVisible();
  expect(within(list).getByText("2 Jan 2026, 10.15 WIB")).toBeVisible();
  const filters = screen.getByRole("group", { name: "Filter peringatan" });
  await userEvent.selectOptions(within(filters).getByLabelText("Status peringatan"), "OPEN");
  await waitFor(() => expect(calls.some(c => c.url.includes("status=OPEN"))).toBe(true));
  const filteredList = await screen.findByRole("region", { name: "Daftar peringatan" });
  expect(within(filteredList).queryByRole("navigation", { name: "Halaman peringatan" })).not.toBeInTheDocument();
});

it("empty first alert page omits pagination", async () => {
  monitoringBackend(c => c.url.split("?")[0].endsWith("/alerts") ? Response.json({ ...f.page(f.alert), content: [], totalElements: 0 }) : undefined);
  await renderMonitoring("alerts");
  const list = await screen.findByRole("region", { name: "Daftar peringatan" });
  expect(within(list).getByText("Belum ada peringatan.")).toBeVisible();
  expect(within(list).queryByRole("navigation", { name: "Halaman peringatan" })).not.toBeInTheDocument();
});

it("empty later alert page retains a way back after the result count shrinks", async () => {
  const calls = monitoringBackend(c => {
    if (!c.url.split("?")[0].endsWith("/alerts")) return undefined;
    const page = Number(new URL(c.url, "http://test").searchParams.get("page"));
    return Response.json({ ...f.page(f.alert), page, content: page === 0 ? [f.alert] : [], totalElements: page === 0 ? 21 : 1 });
  });
  await renderMonitoring("alerts");
  await userEvent.click(await screen.findByRole("button", { name: "Berikutnya" }));
  const empty = await screen.findByText("Belum ada peringatan.");
  expect(empty).toBeVisible();
  const list = screen.getByRole("region", { name: "Daftar peringatan" });
  expect(within(list).getByRole("button", { name: "Berikutnya" })).toBeDisabled();
  const previous = within(list).getByRole("button", { name: "Sebelumnya" });
  expect(previous).toBeEnabled();
  await userEvent.click(previous);
  await screen.findByRole("link", { name: "Buka peringatan 1" });
  expect(calls.filter(c => c.url.includes("/alerts?") && c.url.includes("page=0")).length).toBeGreaterThanOrEqual(1);
});

it("alert detail groups source message and independent actions with confirmation intact", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("alert", f.alert.id);
  const context = await screen.findByRole("region", { name: "Konteks peringatan" });
  expect(within(context).getByText(f.alert.message)).toBeVisible();
  expect(within(context).getByRole("link", { name: "Buka target" })).toBeVisible();
  await userEvent.click(within(context).getByRole("button", { name: "Selesaikan peringatan" }));
  const dialog = screen.getByRole("dialog", { name: "Selesaikan peringatan terbuka" });
  expect(within(dialog).getByText(/Peringatan ini belum diakui/)).toBeVisible();
  await userEvent.click(within(dialog).getByRole("button", { name: "Konfirmasi penyelesaian peringatan" }));
  expect(calls.some(c => c.options.method === "POST")).toBe(false);
});

it("notification row keeps delivery evidence and contextual action together", async () => {
  monitoringBackend();
  await renderMonitoring("notifications");
  const list = await screen.findByRole("region", { name: "Daftar notifikasi" });
  const row = list.querySelector("article")!;
  expect(within(row).getByText("Live SENT")).toBeVisible();
  expect(within(row).getByText("3 Jan 2026, 07.00 WIB")).toBeVisible();
  expect(within(row).getByRole("link", { name: "Buka peringatan terkait" })).toHaveAttribute("href", `/alerts/${f.alert.id}`);
  expect(within(row).getByRole("button", { name: "Tandai notifikasi 1 dibaca" })).toBeEnabled();
});

it("unsupported notification channel gives a compact empty page without exposing its records", async () => {
  monitoringBackend(c => c.url.split("?")[0].endsWith("/me/notifications") ? Response.json({ ...f.page(f.notification), content: [{ ...f.notification, channel: "SMS" }], totalElements: 21 }) : undefined);
  await renderMonitoring("notifications");
  const list = await screen.findByRole("region", { name: "Daftar notifikasi" });
  expect(within(list).getByText("Belum ada notifikasi.")).toBeVisible();
  expect(within(list).queryByRole("article")).not.toBeInTheDocument();
  expect(within(list).getByRole("button", { name: "Berikutnya" })).toBeEnabled();
  expect(screen.queryByText("Live SMS")).not.toBeInTheDocument();
});
