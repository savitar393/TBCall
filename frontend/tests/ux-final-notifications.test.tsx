import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { portalBackend, renderPortal } from "./portal-harness";
import * as f from "./portal-fixtures";
import { formatDateTime } from "@/lib/date-format";

it("pending notifications without alert metadata have a readable name and never imply delivery", async () => {
  const calls = portalBackend(f.patient, c => c.url.endsWith("/notifications?page=0&size=20") || c.url.includes("/notifications?") ? Response.json(f.page({ ...f.notification, alertId: null, alertType: null, severity: null, status: "PENDING", deliveredAt: null })) : undefined);
  await renderPortal("notifications");
  expect(await screen.findByRole("heading", { name: "Pemberitahuan akun" })).toBeVisible();
  expect(screen.getByText(`Dijadwalkan pada: ${formatDateTime(f.time)}`)).toBeVisible();
  expect(screen.queryByText(/Terkirim pada:/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Tandai notifikasi/ })).not.toBeInTheDocument();
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});
