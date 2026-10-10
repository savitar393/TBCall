import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { backend, renderClinical, failure } from "./clinical-harness";
import { caseView, ids, officer } from "./clinical-fixtures";
import PatientsPage from "@/app/patients/page";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";
import HistoryPage from "@/app/cases/history/page";
import { treatmentBackend, renderTreatment } from "./treatment-harness";
import { treatmentDetail, treatmentIds } from "./treatment-fixtures";

const history = { content: [{ patientId: ids.patient, fullName: "Fictional completed patient", confirmedAt: "2026-01-01T00:00:00Z", tbCase: { id: ids.tbCase, version: 3, status: "COMPLETED", caseCategory: { code: "TB_SO", name: "TBC SO" }, currentFacility: caseView.currentFacility } }], page: 0, size: 20, totalElements: 1 };
function historyBackend(actor = officer) { return backend(c => c.url.endsWith("/me") ? Response.json(actor) : c.url.includes("/cases/history?") ? Response.json(history) : undefined); }

it("offers completed history from the patient worklist independently of write permissions", async () => {
  backend(); renderClinical(<PatientsPage />);
  const main = await screen.findByRole("heading", { name: "Daftar pasien" });
  expect(within(main.parentElement!.parentElement!).getByRole("link", { name: "Riwayat kasus selesai" })).toHaveAttribute("href", "/cases/history");
});

it("discovers completed-only records with CASE_READ and no patient or write permissions", async () => {
  const calls = historyBackend({ ...officer, permissions: ["CASE_READ"] });
  renderClinical(<HistoryPage />);
  const results = await screen.findByRole("region", { name: "Hasil riwayat kasus" });
  expect(within(results).getByRole("link", { name: "Buka kasus selesai" })).toHaveAttribute("href", `/cases/${ids.tbCase}`);
  expect(within(results).getByText("Fictional completed patient")).toBeInTheDocument();
  expect(screen.getByText(/kasus aktif \(ACTIVE\) dan dirujuk \(REFERRED\)/i)).toBeInTheDocument();
  expect(calls.filter(c => !c.url.endsWith("/me")).every(c => c.url.includes("/cases/history?") && c.options.method === "GET")).toBe(true);
  expect(screen.queryByLabelText(/NIK|BPJS/)).not.toBeInTheDocument();
});

it.each(["PATIENT", "TREATMENT_SUPPORTER", "LAB_STAFF", "SYSTEM_ADMIN", "FACILITY_ADMIN", "PROGRAM_MONITOR"])("denies direct history for %s without issuing a history read", async role => {
  const calls = historyBackend({ ...officer, roles: [{ code: role, name: role }] }); renderClinical(<HistoryPage />);
  await screen.findByRole("heading", { name: "Akses tidak diizinkan" }); expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
  expect(screen.queryByRole("link", { name: "Riwayat kasus selesai" })).not.toBeInTheDocument();
});

it("missing CASE_READ hides the history entry and denies its direct route", async () => {
  const calls = historyBackend({ ...officer, permissions: ["PATIENT_READ"] }); renderClinical(<HistoryPage />);
  await screen.findByRole("heading", { name: "Akses tidak diizinkan" }); expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
  expect(screen.queryByRole("link", { name: "Riwayat kasus selesai" })).not.toBeInTheDocument();
});

it("keeps name filters out of browser location and resets paging on search and clear", async () => {
  const calls = backend(c => c.url.includes("/cases/history?") ? Response.json({ ...history, totalElements: 21 }) : undefined);
  const location = window.location.href; renderClinical(<HistoryPage />); await screen.findByText("Fictional completed patient");
  await userEvent.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
  await waitFor(() => expect(calls.some(c => c.url.includes("page=1"))).toBe(true));
  await userEvent.type(screen.getByLabelText("Cari nama"), "Fictional"); await userEvent.click(screen.getByRole("button", { name: "Terapkan filter" }));
  await waitFor(() => expect(calls.some(c => c.url.includes("page=0") && c.url.includes("name=Fictional"))).toBe(true));
  expect(window.location.href).toBe(location);
  await userEvent.click(screen.getByRole("button", { name: "Hapus filter" })); expect(screen.getByLabelText("Cari nama")).toHaveValue("");
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});

it.each([403, 404])("renders safe denial without records or private error prose on HTTP %s", async status => {
  backend(c => c.url.includes("/cases/history?") ? failure(status, status === 403 ? "ACCESS_DENIED" : "RESOURCE_NOT_FOUND") : undefined);
  renderClinical(<HistoryPage />); await within(await screen.findByRole("region", { name: "Status riwayat kasus" })).findByRole("alert");
  expect(screen.queryByText("Fictional completed patient")).not.toBeInTheDocument(); expect(screen.queryByText(/private server details|clinical prose/)).not.toBeInTheDocument();
});

it("shows an empty historical page with disabled paging", async () => {
  backend(c => c.url.includes("/cases/history?") ? Response.json({ ...history, content: [], totalElements: 0 }) : undefined);
  renderClinical(<HistoryPage />); await screen.findByText("Tidak ada kasus selesai yang sesuai.");
  expect(screen.getByRole("button", { name: "Halaman berikutnya" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Halaman sebelumnya" })).toBeDisabled();
});

it("rejects a response containing an active case instead of mislabeling it completed", async () => {
  backend(c => c.url.includes("/cases/history?") ? Response.json({ ...history, content: [{ ...history.content[0], tbCase: { ...history.content[0].tbCase, status: "ACTIVE" } }] }) : undefined);
  renderClinical(<HistoryPage />); await within(await screen.findByRole("region", { name: "Status riwayat kasus" })).findByRole("alert"); expect(screen.queryByText("Fictional completed patient")).not.toBeInTheDocument();
});

it("completed treatment remains readable with no dose, outcome, or other editor actions", async () => {
  const calls = treatmentBackend(c => c.url.endsWith(`/treatments/${treatmentIds.treatment}`) ? Response.json({ ...treatmentDetail, status: "COMPLETED" }, { headers: { ETag: '"closed-treatment"' } }) : undefined);
  await renderTreatment("detail", treatmentIds.treatment); await screen.findByRole("heading", { name: "Detail pengobatan" });
  for (const label of ["Catat bukti dosis", "Catat hasil akhir", "Ubah metadata", "Jadwalkan tindak lanjut", "Catat kejadian tidak diinginkan"]) expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});

it("completed case cannot start treatment but retains the existing episode detail link", async () => {
  treatmentBackend(c => c.url.endsWith(`/cases/${ids.tbCase}`) ? Response.json({ ...caseView, status: "COMPLETED" })
    : c.url.endsWith(`/cases/${ids.tbCase}/treatments`) ? Response.json([{ ...treatmentDetail, status: "COMPLETED" }]) : undefined);
  await renderTreatment("episodes", ids.tbCase); await screen.findByRole("heading", { name: "Episode pengobatan" });
  expect(await screen.findByRole("link", { name: "Buka pengobatan" })).toHaveAttribute("href", `/treatments/${treatmentIds.treatment}`);
  expect(screen.queryByRole("button", { name: "Mulai pengobatan" })).not.toBeInTheDocument();
});

it("completed case retains permitted treatment reads but hides case and referral mutations", async () => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: [...officer.permissions, "TREATMENT_READ", "REFERRAL_WRITE"] })
    : c.url.endsWith(`/cases/${ids.tbCase}`) ? Response.json({ ...caseView, status: "COMPLETED" }, { headers: { ETag: '"terminal-case"' } }) : undefined);
  renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}><CaseDetail id={ids.tbCase} /></ClinicalBoundary>);
  await screen.findByRole("heading", { name: "Detail kasus" });
  expect(screen.queryByRole("button", { name: "Ubah kasus" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Buat rujukan" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Pengobatan" })).toHaveAttribute("href", `/cases/${ids.tbCase}/treatments`);
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});
