import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import HomePage from "@/app/page";
import { officer } from "./clinical-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/" }));
beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(officer))); });
it("offers officer worklist and registration only when each explicit permission is granted", async () => {
  render(<AppProviders><HomePage /></AppProviders>);
  await screen.findByRole("heading", { name: "Selamat datang" });
  const nav = screen.getByRole("navigation", { name: "Navigasi utama desktop" });
  expect(within(nav).getByRole("link", { name: "Daftar pasien" })).toHaveAttribute("href", "/patients");
  expect(within(nav).getByRole("link", { name: "Registrasi baru" })).toHaveAttribute("href", "/intake/new");
});
it.each(["PATIENT", "TREATMENT_SUPPORTER", "LAB_STAFF", "SYSTEM_ADMIN", "FACILITY_ADMIN", "PROGRAM_MONITOR"])("hides officer intake from %s even with all clinical permissions", async role => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...officer, roles: [{ code: role, name: role }] })));
  render(<AppProviders><HomePage /></AppProviders>);
  await screen.findByRole("heading", { name: "Selamat datang" });
  expect(screen.queryByRole("link", { name: "Daftar pasien" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Registrasi baru" })).not.toBeInTheDocument();
});
it.each(["PATIENT_CREATE", "REGISTRATION_WRITE"])("hides registration when %s is missing without inferring it from TB_OFFICER", async permission => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...officer, permissions: officer.permissions.filter(p => p !== permission) })));
  render(<AppProviders><HomePage /></AppProviders>);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Selamat datang" })).toBeInTheDocument());
  expect(screen.queryByRole("link", { name: "Registrasi baru" })).not.toBeInTheDocument();
});
