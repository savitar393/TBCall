import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { labDetail, labIds, labPage, labStaff, labResult } from "./laboratory-fixtures";
import { labBackend, renderLab, routing } from "./laboratory-harness";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/laboratory" }));

it("empty queue offers meaningful feedback without an unnecessary pager", async () => {
  labBackend(c => c.url.includes("/lab-requests?") ? Response.json({ ...labPage, content: [], totalElements: 0 }) : undefined);
  await renderLab("queue"); await screen.findByText("Belum ada permintaan laboratorium.");
  expect(screen.queryByRole("button", { name: "Halaman sebelumnya" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Antrean laboratorium" })).toBeInTheDocument();
});
it("a later empty page keeps a route back when totals shrink", async () => {
  labBackend(c => c.url.includes("/lab-requests?") ? Response.json(c.url.includes("page=1") ? { ...labPage, content: [], totalElements: 1, page: 1 } : { ...labPage, totalElements: 21 }) : undefined);
  await renderLab("queue"); await screen.findByText(labDetail.patient.fullName);
  await userEvent.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
  await screen.findByText("Belum ada permintaan laboratorium.");
  expect(screen.getByRole("button", { name: "Halaman sebelumnya" })).toBeEnabled();
});
it("detail provides section navigation, visible recorded evidence and fixed correction sequence", async () => {
  labBackend(undefined, labStaff); await renderLab("detail", { id: labIds.request });
  await screen.findByText(labDetail.patient.fullName);
  const sections = screen.getByRole("navigation", { name: "Bagian laboratorium" });
  expect(within(sections).getByRole("link", { name: "Spesimen" })).toHaveAttribute("href", "#lab-specimens");
  expect(within(sections).getByRole("link", { name: "Pemeriksaan & hasil" })).toHaveAttribute("href", "#lab-results");
  expect(screen.getByText(labResult.resultText)).toBeVisible();
  expect(screen.getByText(/Urutan 2/)).toBeInTheDocument();
  expect(screen.queryByText(/terkonfirmasi klinis/i)).not.toBeInTheDocument();
});
it("an explicit editor receives keyboard focus and returns it after discard", async () => {
  labBackend(); await renderLab("detail", { id: labIds.request });
  const action = await screen.findByRole("button", { name: "Catat spesimen" });
  await userEvent.click(action);
  const editor = screen.getByRole("region", { name: "Formulir tindakan" });
  await waitFor(() => expect(within(editor).getByRole("heading", { name: "Catat spesimen" })).toHaveFocus());
  await userEvent.click(screen.getByRole("button", { name: "Tutup formulir" }));
  await userEvent.click(screen.getByRole("button", { name: "Buang isian dan tutup" }));
  await waitFor(() => expect(action).toHaveFocus());
});
it("cancelled records stay readable with their catalog status and no mutation actions", async () => {
  labBackend(c => c.url.endsWith(labIds.request) ? Response.json({ ...labDetail, status: "CANCELLED" }) : undefined, labStaff);
  await renderLab("detail", { id: labIds.request }); await screen.findByText(labDetail.patient.fullName);
  expect(screen.getByText("Dibatalkan")).toBeInTheDocument();
  expect(screen.getByText(labResult.resultText)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Catat hasil|Koreksi hasil|Terima spesimen|Batalkan permintaan/ })).not.toBeInTheDocument();
});
