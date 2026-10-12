import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { backend, renderF4, routing } from "./f4-harness";
import * as f from "./f4-fixtures";
import { formatDateTime } from "@/lib/date-format";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/integrations" }));
it("labels configuration and local metadata without implying a live SITB connection", async () => {
  const calls = backend(); await renderF4("integrations");
  expect(await screen.findByText("Belum dikonfigurasi")).toBeVisible();
  expect(screen.getByText("Metadata lokal TBCall · bukan koneksi SITB")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Integrasi" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Hubungkan|Sinkronkan/ })).not.toBeInTheDocument();
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});
it("keeps run cursor and identity metadata secondary and explicitly accessible", async () => {
  backend(); await renderF4("run");
  expect(await screen.findAllByText(formatDateTime(f.item.processedAt))).not.toHaveLength(0);
  expect(screen.queryAllByText(f.item.processedAt)).toHaveLength(0);
  const cursor = await screen.findByText("PRIVATE_CURSOR");
  expect(cursor).not.toBeVisible();
  await userEvent.click(screen.getByText("Identitas dan kursor proses", { exact: true }));
  expect(cursor).toBeVisible();
  expect(screen.getByText("PRIVATE_HASH")).not.toBeVisible();
});
it("has a compact empty integration list without unnecessary pagination", async () => {
  backend(f.admin, c => c.url.includes("/integrations?") ? Response.json({ content: [], page: 0, size: 20, totalElements: 0 }) : undefined);
  await renderF4("integrations");
  expect(await screen.findByText("Tidak ada metadata integrasi.")).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "Halaman data" })).not.toBeInTheDocument();
});
it("shows section status without moving identifiers into URLs or fetching inactive sections", async () => {
  const calls = backend(); await renderF4("integration");
  await screen.findByText("PRIVATE_EXTERNAL");
  const nav = screen.getByRole("navigation", { name: "Bagian metadata integrasi" });
  await userEvent.click(within(nav).getByRole("button", { name: "Proses sinkronisasi" }));
  const region = screen.getByRole("region", { name: "Proses sinkronisasi" });
  expect(await within(region).findByRole("link", { name: "Buka detail proses" })).toHaveAttribute("href", `/integrations/SITB/sync-runs/${f.runId}`);
  expect(calls.some(c => c.url.includes("/conflicts"))).toBe(false);
  expect(location.search).toBe("");
});
