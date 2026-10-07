import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { backend, renderClinical, routing } from "./clinical-harness";
import { officer, patientPage } from "./clinical-fixtures";
import PatientsPage from "@/app/patients/page";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/patients" }));
function renderWorklist() { return renderClinical(<PatientsPage />); }
beforeEach(() => { backend(); });
it("shows backend-masked identities and registration/case summaries in a responsive worklist", async () => {
  renderWorklist(); await screen.findByRole("heading", { name: "Daftar pasien" });
  expect(await screen.findByText("************1234")).toBeInTheDocument();
  expect(screen.getByText("*********4321")).toBeInTheDocument();
  expect(screen.queryByText("1234567890121234")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Buka pasien Pasien Contoh" })).toHaveAttribute("href", `/patients/${patientPage.content[0].patientId}`);
  expect(screen.getByRole("link", { name: "Buka registrasi" })).toHaveAttribute("href", "/registrations/22222222-2222-4222-8222-222222222222");
});
it("keeps sensitive filters out of browser location and clears them without losing live status labels", async () => {
  const calls = backend(); const before = window.location.href;
  renderWorklist(); await screen.findByText("************1234");
  await userEvent.type(screen.getByLabelText("Cari nama"), "Contoh");
  await userEvent.type(screen.getByLabelText("Cari NIK"), "1234567890121234");
  await userEvent.click(screen.getByRole("button", { name: "Terapkan filter" }));
  await waitFor(() => expect(calls.some(c => c.url.includes("name=Contoh") && c.url.includes("nik=1234567890121234"))).toBe(true));
  expect(window.location.href).toBe(before);
  await userEvent.click(screen.getByRole("button", { name: "Hapus filter" }));
  expect(screen.getByLabelText("Cari nama")).toHaveValue("");
  expect(screen.getByRole("option", { name: "Terbuka" })).toBeInTheDocument();
});
it.each([["Cari nama", "ab"], ["Cari NIK", "123"], ["Ukuran halaman", "51"]])("rejects invalid %s without emitting another patient GET", async (label, value) => {
  const calls = backend(); renderWorklist(); await screen.findByText("************1234");
  const previous = calls.filter(c => c.url.includes("/patients?")).length;
  await userEvent.clear(screen.getByLabelText(label)); await userEvent.type(screen.getByLabelText(label), value);
  await userEvent.click(screen.getByRole("button", { name: "Terapkan filter" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(calls.filter(c => c.url.includes("/patients?")).length).toBe(previous);
});
it("denies direct module access for PATIENT with PATIENT_READ without making clinical requests", async () => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, roles: [{ code: "PATIENT", name: "Pasien" }] }) : undefined);
  renderWorklist(); await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
  expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});
it("provides empty and pagination states using the backend total", async () => {
  backend(c => c.url.includes("/patients?") ? Response.json({ content: [], page: 0, size: 20, totalElements: 0 }) : undefined);
  renderWorklist(); await screen.findByText("Tidak ada pasien yang sesuai.");
  expect(screen.getByRole("button", { name: "Halaman berikutnya" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Halaman sebelumnya" })).toBeDisabled();
});
