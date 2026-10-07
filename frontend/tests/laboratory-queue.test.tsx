import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { SessionBoundary } from "@/components/session-boundary";
import { ids, officer } from "./clinical-fixtures";
import { labOfficer, labStaff, labPage } from "./laboratory-fixtures";
import { labBackend, renderLab, renderClinical, routing, failure } from "./laboratory-harness";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/laboratory" }));
beforeEach(() => { routing.push.mockReset(); labBackend(); });
it.each([labOfficer, labStaff])("laboratory actor $roles.0.code sees independently authorized navigation", async actor => {
  labBackend(undefined, actor); renderClinical(<SessionBoundary><AppShell>Content</AppShell></SessionBoundary>);
  expect(await screen.findByRole("link", { name: "Laboratorium" })).toHaveAttribute("href", "/laboratory");
});
it.each(["PATIENT", "SYSTEM_ADMIN", "FACILITY_ADMIN", "PROGRAM_MONITOR", "TREATMENT_SUPPORTER"])("%s with a read grant cannot navigate or fetch the laboratory module", async role => {
  const calls = labBackend(undefined, { ...labOfficer, roles: [{ code: role, name: role }] });
  await renderLab("queue"); await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
  expect(screen.queryByRole("link", { name: "Laboratorium" })).not.toBeInTheDocument();
  expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});
it.each(["permission", "facility"])("a missing %s prevents laboratory reads", async missing => {
  const calls = labBackend(undefined, { ...labOfficer, ...(missing === "permission" ? { permissions: [] } : { activeFacilities: [] }) });
  await renderLab("queue"); await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
  expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});
it("queue uses live labels and minimum patient projection without clinical identity enrichment", async () => {
  const calls = labBackend(); await renderLab("queue");
  await screen.findByText("Pasien laboratorium pribadi");
  expect(screen.getAllByText("Diminta langsung").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Molekuler langsung/).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "Buka permintaan" })).toHaveAttribute("href", `/laboratory/requests/${labPage.content[0].id}`);
  expect(calls.some(c => /\/patients|\/clinical-reference-data/.test(c.url))).toBe(false);
  expect(within(screen.getByRole("banner")).queryByText(/Pasien laboratorium pribadi/)).not.toBeInTheDocument();
});
it("filters use assigned facilities and live choices, stay out of history, clear and paginate", async () => {
  const start = window.location.href;
  const calls = labBackend(c => c.url.includes("/lab-requests?") ? Response.json({ ...labPage, totalElements: 42, page: Number(new URL(c.url, "https://fixture.test").searchParams.get("page")) }) : undefined);
  await renderLab("queue"); await screen.findByText("Pasien laboratorium pribadi");
  expect(within(screen.getByLabelText("Fasilitas pemeriksa")).queryByRole("option", { name: "Laboratorium tujuan" })).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Status permintaan"), "REQUESTED");
  await userEvent.selectOptions(screen.getByLabelText("Jenis pemilik"), "REGISTRATION");
  await userEvent.selectOptions(screen.getByLabelText("Alasan permintaan"), "DIAGNOSIS");
  await userEvent.selectOptions(screen.getByLabelText("Fasilitas peminta"), ids.facility);
  await userEvent.click(screen.getByRole("button", { name: "Terapkan filter" }));
  await waitFor(() => expect(calls.some(c => c.url.includes(`requestingFacilityId=${ids.facility}`))).toBe(true));
  await userEvent.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
  await waitFor(() => expect(calls.some(c => c.url.includes("page=1"))).toBe(true));
  await userEvent.click(screen.getByRole("button", { name: "Bersihkan filter" }));
  expect(screen.getByLabelText("Status permintaan")).toHaveValue(""); expect(window.location.href).toBe(start);
});
it("empty and safe service-error queue states support retry", async () => {
  let first = true;
  labBackend(c => c.url.includes("/lab-requests?") ? first ? (first = false, failure(503, "SERVICE_UNAVAILABLE")) : Response.json({ ...labPage, content: [], totalElements: 0 }) : undefined);
  await renderLab("queue"); expect(await screen.findByRole("button", { name: "Coba kembali" })).toBeInTheDocument();
  expect(screen.getAllByRole("alert").every(el => !/private server|clinical prose/.test(el.textContent ?? ""))).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Coba kembali" })); await screen.findByText("Belum ada permintaan laboratorium.");
});
it.each([0, 51])("queue rejects page size %s before issuing a new GET", async size => {
  const calls = labBackend(); await renderLab("queue"); await screen.findByText("Pasien laboratorium pribadi");
  const initial = calls.length; await userEvent.clear(screen.getByLabelText("Ukuran halaman")); await userEvent.type(screen.getByLabelText("Ukuran halaman"), String(size));
  await userEvent.click(screen.getByRole("button", { name: "Terapkan filter" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument(); expect(calls).toHaveLength(initial);
});
it("existing officer clinical navigation remains available alongside laboratory", async () => {
  labBackend(undefined, { ...officer, permissions: [...officer.permissions, "LAB_REQUEST_READ"] }); renderClinical(<SessionBoundary><AppShell>Content</AppShell></SessionBoundary>);
  expect(await screen.findByRole("link", { name: "Daftar pasien" })).toHaveAttribute("href", "/patients");
  expect(screen.getByRole("link", { name: "Laboratorium" })).toBeInTheDocument();
});
