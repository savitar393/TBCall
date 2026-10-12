import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { backend, renderClinical, failure } from "./clinical-harness";
import { caseView, ids } from "./clinical-fixtures";
import PatientsPage from "@/app/patients/page";
import HistoryPage from "@/app/cases/history/page";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";
import { labBackend, renderLab } from "./laboratory-harness";
import { formatDate } from "@/lib/date-format";

it("worklist blank filters mean all, retaining clear/reset query semantics", async () => {
  const calls = backend(); renderClinical(<PatientsPage />);
  const filter = await screen.findByRole("combobox", { name: "Status registrasi" });
  expect(within(filter).getByRole("option", { name: "Semua status registrasi" })).toHaveValue("");
  await userEvent.selectOptions(filter, "OPEN");
  await userEvent.click(screen.getByRole("button", { name: "Terapkan filter" }));
  await screen.findByText("************1234");
  await userEvent.click(screen.getByRole("button", { name: "Hapus filter" }));
  expect(filter).toHaveValue("");
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});

it("laboratory filter choices describe all records, not editing or deleting data", async () => {
  const calls = labBackend(); await renderLab("queue");
  const filter = await screen.findByRole("combobox", { name: "Status permintaan" });
  expect(within(filter).getByRole("option", { name: "Semua status permintaan" })).toHaveValue("");
  expect(screen.queryByRole("option", { name: "Belum diisi / hapus" })).not.toBeInTheDocument();
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});

it("retained converted registration has a readable status and civil date without writable actions", async () => {
  backend(c => c.url.endsWith(`/cases/${ids.tbCase}`) ? Response.json({ ...caseView, registration: { ...caseView.registration, status: "CONVERTED_TO_CASE" } }, { headers: { ETag: '"case-tag"' } }) : undefined);
  renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}><CaseDetail id={ids.tbCase}/></ClinicalBoundary>);
  const origin = await screen.findByRole("region", { name: "Registrasi dan diagnosis konfirmasi" });
  expect(origin).toHaveTextContent("Dikonfirmasi menjadi kasus");
  expect(origin).toHaveTextContent(formatDate(caseView.registration.registrationDate));
  expect(within(origin).queryByText("CONVERTED_TO_CASE")).not.toBeInTheDocument();
  expect(within(origin).getByRole("link", { name: "Buka registrasi" })).toHaveAttribute("href", `/registrations/${ids.registration}`);
});

it("completed history has concise status and no unnecessary first-page pager", async () => {
  const calls = backend(c => c.url.includes("/cases/history?") ? Response.json({ content: [{ patientId: ids.patient, fullName: "Pasien Selesai Fiksi", confirmedAt: null, tbCase: { id: ids.tbCase, version: 1, status: "COMPLETED", caseCategory: null, currentFacility: caseView.currentFacility } }], page: 0, size: 20, totalElements: 1 }) : undefined);
  renderClinical(<HistoryPage />);
  expect(await screen.findByRole("heading", { name: "Pasien Selesai Fiksi" })).toBeVisible();
  expect(screen.getByText("Selesai", { exact: true })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Halaman berikutnya" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Buka kasus selesai" })).toHaveAttribute("href", `/cases/${ids.tbCase}`);
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});

it("a denied case read announces one safe error while retaining its retry action", async () => {
  const calls = backend(c => c.url.endsWith(`/cases/${ids.tbCase}`) ? failure(404, "RESOURCE_NOT_FOUND") : undefined);
  renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}><CaseDetail id={ids.tbCase}/></ClinicalBoundary>);
  await screen.findByRole("alert");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Coba kembali" })).toBeEnabled();
  expect(screen.queryByText(/private server|clinical prose|Pasien Contoh/)).not.toBeInTheDocument();
  expect(calls.filter(c => c.url.endsWith(`/cases/${ids.tbCase}`))).toHaveLength(1);
});
