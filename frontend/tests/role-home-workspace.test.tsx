import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { backend, renderClinical } from "./clinical-harness";
import { admin } from "./f4-fixtures";
import { IdentityDashboard } from "@/components/identity-dashboard";
it.each(["SYSTEM_ADMIN", "FACILITY_ADMIN", "PROGRAM_MONITOR"])("keeps the %s account workspace free of irrelevant patient cards and clinical statistics", async role => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...admin, roles: [{ code: role, name: role }] }) : undefined);
  renderClinical(<IdentityDashboard />);
  await screen.findByRole("heading", { name: "Selamat datang" });
  expect(screen.queryByRole("heading", { name: "Tautan pasien" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Jumlah kasus pendampingan tertaut")).not.toBeInTheDocument();
  expect(screen.queryByText(/Kasus aktif|Skor kepatuhan|Risiko klinis/)).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Akun & konteks akses" }).parentElement).toHaveAttribute("id", "akun");
  expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});
