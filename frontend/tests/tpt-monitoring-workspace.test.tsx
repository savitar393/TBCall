import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { tpt, plan, page } from "./monitoring-fixtures";
import { monitoringBackend, renderMonitoring, routing } from "./monitoring-harness";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => `/preventive-treatments/${tpt.id}/monitoring` }));

it("TPT monitoring retains contextual navigation and the recorded history", async () => {
  monitoringBackend(c => c.url.includes("/monitoring-plans?") ? Response.json(page({ ...plan, targetType: "TPT", targetId: tpt.id })) : undefined);
  await renderMonitoring("target", tpt.id, "TPT");
  expect(await screen.findByRole("link", { name: "Kembali ke detail TPT" })).toHaveAttribute("href", `/preventive-treatments/${tpt.id}`);
  expect(screen.getByRole("region", { name: "Riwayat rencana" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Buka rencana" })).toHaveAttribute("href", `/monitoring-plans/${plan.id}`);
  expect(screen.queryByRole("button", { name: "Sebelumnya" })).not.toBeInTheDocument();
});
it("terminal TPT is readable without offering a new plan", async () => {
  const calls = monitoringBackend(c => c.url.endsWith(tpt.id) ? Response.json({ ...tpt, status: "COMPLETED" }) : undefined);
  await renderMonitoring("target", tpt.id, "TPT");
  await screen.findByRole("link", { name: "Kembali ke detail TPT" });
  expect(screen.getByRole("region", { name: "Konteks pemantauan" })).toHaveTextContent("Selesai");
  expect(screen.queryByRole("button", { name: "Buat rencana pemantauan" })).not.toBeInTheDocument();
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});
