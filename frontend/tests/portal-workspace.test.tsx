import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { portalBackend, renderPortal, routing, failure } from "./portal-harness";
import * as f from "./portal-fixtures";
import { references } from "./portal-reference-fixture";
import { ApiError } from "@/lib/api/problem";
import { ApiFeedbackBoundary } from "@/components/api-feedback";
import { PortalState } from "@/features/portal/display";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));

it("supporter list retains separate case destinations for the same display name", async () => {
  const secondId = "33333333-3333-4333-8333-333333333333";
  const calls = portalBackend({ ...f.supporter, supporterCaseIds: [f.caseId, secondId] }, call =>
    call.url.includes(secondId) && call.url.endsWith("/treatment") ? Response.json({ ...f.supporterTreatment, caseId: secondId }) : undefined);
  await renderPortal("supporters");
  await waitFor(() => expect(screen.getAllByText(f.supporterTreatment.patientDisplayName)).toHaveLength(2));
  expect(screen.getByRole("link", { name: "Buka pendampingan 1" })).toHaveAttribute("href", `/supporting-cases/${f.caseId}`);
  expect(screen.getByRole("link", { name: "Buka pendampingan 2" })).toHaveAttribute("href", `/supporting-cases/${secondId}`);
  expect(screen.queryByText(/pasien unik|orang pasien/i)).not.toBeInTheDocument();
  expect(calls.every(call => call.url.includes("/v1/me"))).toBe(true);
  expect(calls.filter(call => call.url.endsWith("/treatment"))).toHaveLength(2);
});

it("supporter recorded counts retain source labels and permission independently from treatment", async () => {
  const calls = portalBackend({ ...f.supporter, permissions: ["TREATMENT_READ"] });
  await renderPortal("case");
  await screen.findByText(f.supporterTreatment.patientDisplayName);
  expect(screen.getByRole("region", { name: "Ringkasan pengobatan" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Jumlah laporan bukti dosis" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Laporan bukti dosis" })).not.toBeInTheDocument();
  expect(calls.some(call => /dose-events|\/alerts|\/monitoring/.test(call.url))).toBe(false);
});

it("supporter counts display server totals and actor reference labels without an adherence conclusion", async () => {
  portalBackend(f.supporter);
  await renderPortal("case");
  const section = await screen.findByRole("region", { name: "Jumlah laporan bukti dosis" });
  expect(section).toHaveTextContent("Hitungan laporan tercatat");
  expect(section).toHaveTextContent("2");
  const toggle = within(section).getByText("Jumlah per status laporan");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  await userEvent.click(toggle);
  expect(toggle.closest("details")).toHaveAttribute("open");
  expect(within(section).getByText(references.supporterDoseStatuses.find(option => option.code === "MISSED")!.name)).toBeInTheDocument();
  expect(section.textContent).not.toMatch(/%|patuh|berhasil|risiko/i);
});

it("monitoring preserves recorded dates and TPT labels in optional metadata", async () => {
  const type = references.tptMonitoringEventTypes[0];
  const calls = portalBackend(f.patient, call => call.url.split("?")[0].endsWith("/monitoring") ?
    Response.json(f.page({ ...f.event, targetType: "TPT", eventType: type.code, dueAt: f.time, completedAt: f.time })) : undefined);
  await renderPortal("monitoring");
  const section = await screen.findByRole("region", { name: "Pemantauan" });
  expect(await within(section).findByText(type.name)).toBeInTheDocument();
  const toggle = within(section).getByText("Rincian pemantauan");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  await userEvent.click(toggle);
  expect(within(section).getByText("TPT")).toBeInTheDocument();
  expect(within(section).getByText("Jatuh tempo")).toBeInTheDocument();
  expect(within(section).getByText("Selesai")).toBeInTheDocument();
  expect(calls.every(call => call.options.method === "GET" && call.url.includes("/v1/me"))).toBe(true);
  expect(section.textContent).not.toMatch(/kondisi klinis|langkah berikut|cara menggunakan/i);
});

it("a failed alert refresh hides stale receipt actions and recorded content", async () => {
  let reject = false;
  const calls = portalBackend(f.patient, call => reject && call.url.split("?")[0].endsWith("/alerts") ? failure(503, "TEMPORARY") : undefined);
  await renderPortal("alerts");
  await screen.findByRole("button", { name: "Tandai sudah diketahui" });
  reject = true;
  await userEvent.click(screen.getByRole("button", { name: "Muat ulang catatan" }));
  await screen.findByRole("button", { name: "Coba kembali" });
  expect(screen.queryByRole("button", { name: "Tandai sudah diketahui" })).not.toBeInTheDocument();
  expect(screen.queryByText(f.alert.message)).not.toBeInTheDocument();
  expect(calls.some(call => call.options.method === "POST")).toBe(false);
});

it("recorded medication metadata stays separate from dose reports with exact values", async () => {
  const calls = portalBackend(f.patient, call => call.url.endsWith("/me/treatment") ?
    Response.json({ ...f.treatment, drugs: [{ drugName: "Obat tercatat", doseValue: 450, doseUnit: "mg", treatmentPhase: "Fase tercatat", frequencyPerWeek: 3, startDate: f.date, endDate: null }] }) : undefined);
  await renderPortal("treatment");
  const section = await screen.findByRole("region", { name: "Obat sesuai catatan" });
  expect(await within(section).findByText("Dosis tercatat: 450 mg")).toBeInTheDocument();
  const toggle = within(section).getByText("Rincian obat");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  await userEvent.click(toggle);
  expect(within(section).getByText("Frekuensi tercatat per minggu")).toBeInTheDocument();
  expect(within(section).getByText("3")).toBeInTheDocument();
  expect(within(section).getByText("Fase tercatat")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Laporan bukti dosis" })).toBeInTheDocument();
  expect(screen.getByLabelText("Tanggal dosis")).toHaveValue("");
  expect(screen.getByLabelText("Status laporan")).toHaveValue("");
  expect(calls.some(call => call.options.method === "POST")).toBe(false);
});

it("notification metadata never grants commands to a non-actionable recorded status", async () => {
  const calls = portalBackend(f.patient, call => call.url.split("?")[0].endsWith("/notifications") ? Response.json(f.page({ ...f.notification, status: "FAILED" })) : undefined);
  await renderPortal("notifications");
  const section = await screen.findByRole("region", { name: "Dalam aplikasi" });
  expect(await within(section).findByText(references.notificationStatuses.find(option => option.code === "FAILED")!.name)).toBeInTheDocument();
  const toggle = within(section).getByText("Rincian notifikasi");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(toggle);
  expect(screen.queryByRole("button", { name: /Tandai notifikasi/ })).not.toBeInTheDocument();
  expect(calls.every(call => call.options.method === "GET" && call.url.includes("/v1/me"))).toBe(true);
});

it("portal pagination retains the return action after the total shrinks on a later empty page", async () => {
  let shrunk = false;
  const calls = portalBackend(f.patient, call => {
    if (!call.url.split("?")[0].endsWith("/monitoring")) return;
    if (call.url.includes("page=1")) { shrunk = true; return Response.json({ ...f.page(f.event), content: [], page: 1, totalElements: 1 }); }
    return Response.json({ ...f.page(f.event), totalElements: shrunk ? 1 : 21 });
  });
  await renderPortal("monitoring");
  await screen.findByText("Tinjauan klinis");
  await userEvent.click(screen.getByRole("button", { name: "Berikutnya" }));
  await screen.findByText("Belum ada jadwal pemantauan.");
  expect(screen.getByRole("button", { name: "Sebelumnya" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Sebelumnya" }));
  await screen.findByText("Tinjauan klinis");
  expect(screen.queryByRole("navigation", { name: "Halaman daftar" })).not.toBeInTheDocument();
  expect(calls.filter(call => call.url.includes("page=0") && call.url.includes("/monitoring"))).toHaveLength(2);
  expect(calls.every(call => call.options.method === "GET")).toBe(true);
});

it("portal read feedback deduplicates only the identical shell error and retains retry", async () => {
  const outer = new ApiError({ status: 503, title: "Synthetic failure" });
  const inner = new ApiError({ status: 503, title: "Synthetic failure" });
  const refetch = vi.fn();
  const { rerender } = render(<ApiFeedbackBoundary error={outer}><PortalState query={{ isPending: false, error: outer, refetch }}/></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Coba kembali" }));
  expect(refetch).toHaveBeenCalledOnce();
  rerender(<ApiFeedbackBoundary error={outer}><PortalState query={{ isPending: false, error: inner, refetch }}/></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  rerender(<ApiFeedbackBoundary error={null}><PortalState query={{ isPending: false, error: inner, refetch }}/></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});
