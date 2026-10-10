import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { backend, renderClinical, failure } from "./clinical-harness";
import { ids, officer, caseView } from "./clinical-fixtures";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";
import HistoryPage from "@/app/cases/history/page";
import { CaseSummary } from "@/features/case-summary/case-summary";
import { summaryFixture, summaryActor } from "./case-summary-fixtures";

function renderSummary() { return renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}><CaseSummary id={ids.tbCase} /></ClinicalBoundary>); }
function serveSummary(value: unknown = summaryFixture, actor = summaryActor) {
  return backend(c => c.url.endsWith("/me") ? Response.json(actor) : c.url.includes(`/cases/${ids.tbCase}/summary?`) ? Response.json(value) : undefined);
}

it("opens a read-only case summary from case details", async () => {
  backend(); renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}><CaseDetail id={ids.tbCase} /></ClinicalBoundary>);
  await screen.findByRole("heading", { name: "Detail kasus" });
  expect(screen.getByRole("link", { name: "Ringkasan kasus" })).toHaveAttribute("href", `/cases/${ids.tbCase}/summary`);
});

it("opens the same summary from completed history with CASE_READ alone", async () => {
  backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: ["CASE_READ"] }) : c.url.includes("/cases/history?") ? Response.json({ content: [{ patientId: ids.patient, fullName: "Fictional summary", confirmedAt: null, tbCase: { id: ids.tbCase, version: 0, status: "COMPLETED", caseCategory: null, currentFacility: caseView.currentFacility } }], page: 0, size: 20, totalElements: 1 }) : undefined);
  renderClinical(<HistoryPage />);
  expect(within(await screen.findByRole("region", { name: "Hasil riwayat kasus" })).getByRole("link", { name: "Ringkasan kasus" })).toHaveAttribute("href", `/cases/${ids.tbCase}/summary`);
});

it.each(["ACTIVE", "COMPLETED"])("consolidates the recorded %s episode with original/corrected results and no mutations", async status => {
  const calls = serveSummary({ ...summaryFixture, status }); renderSummary();
  await screen.findByRole("heading", { name: "Ringkasan kasus" });
  expect(screen.getByText(new RegExp(`Status kasus: ${status}`))).toBeInTheDocument();
  const lab = screen.getByRole("region", { name: "Pemeriksaan laboratorium" });
  expect(within(lab).getByText("Fictional corrected value")).toBeInTheDocument(); expect(within(lab).getByText("Fictional original value")).toBeInTheDocument();
  expect(within(lab).getByText(/Hasil asli.*Urutan 1/)).toBeInTheDocument(); expect(within(lab).getByText(/Hasil koreksi.*Urutan 2/)).toBeInTheDocument();
  expect(within(lab).getByText(/Versi historis, bukan versi terbaru/)).toBeInTheDocument();
  expect(screen.getByText("Recorded fictional diagnosis")).toBeInTheDocument(); expect(screen.getByText("Fictional recorded drug · —")).toBeInTheDocument();
  expect(screen.getByText(/Laporan pasien \(PATIENT\)/)).toBeInTheDocument(); expect(screen.getByText("Recorded fictional observation")).toBeInTheDocument();
  expect(screen.getByText(/Fictional explicit outcome/)).toBeInTheDocument(); expect(screen.getByText(/Fictional scheduled follow-up/)).toBeInTheDocument();
  expect(screen.getByText(/Penutupan kasus bukan penetapan kesembuhan/)).toBeInTheDocument();
  for (const label of ["Mulai pengobatan", "Catat bukti dosis", "Catat hasil akhir", "Ubah kasus", "Koreksi hasil"]) expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});

it.each(["LAB_RESULT_READ", "LAB_REQUEST_READ", "TREATMENT_READ", "ADHERENCE_READ", "FOLLOW_UP_READ", "OUTCOME_READ", "DIAGNOSIS_READ", "REGISTRATION_READ"])("independently hides protected contents when %s is absent even in an over-broad response", async permission => {
  serveSummary(summaryFixture, { ...summaryActor, permissions: summaryActor.permissions.filter(p => p !== permission) }); renderSummary();
  await screen.findByRole("heading", { name: "Ringkasan kasus" });
  const hidden: Record<string, string[]> = { LAB_RESULT_READ: ["Fictional corrected value", "Fictional original value"], LAB_REQUEST_READ: ["Fictional corrected value"], TREATMENT_READ: ["Fictional recorded drug · —", "Recorded fictional observation"], ADHERENCE_READ: ["TAKEN_SELF_REPORTED"], FOLLOW_UP_READ: ["Recorded fictional observation"], OUTCOME_READ: ["Fictional explicit outcome"], DIAGNOSIS_READ: ["Recorded fictional diagnosis"], REGISTRATION_READ: ["Buka registrasi"] };
  for (const value of hidden[permission]) expect(screen.queryByText(new RegExp(value))).not.toBeInTheDocument();
  expect(screen.getAllByText("Konten memerlukan izin baca tersendiri.").length).toBeGreaterThan(0);
  if (permission === "LAB_RESULT_READ" || permission === "LAB_REQUEST_READ") expect(within(screen.getByRole("region", { name: "Pemeriksaan laboratorium" })).queryByRole("button")).not.toBeInTheDocument();
});

it.each(["PATIENT", "LAB_STAFF", "TREATMENT_SUPPORTER", "FACILITY_ADMIN", "SYSTEM_ADMIN", "PROGRAM_MONITOR"])("denies %s before requesting a summary", async role => {
  const calls = serveSummary(summaryFixture, { ...summaryActor, roles: [{ code: role, name: role }] }); renderSummary();
  await screen.findByRole("heading", { name: "Akses tidak diizinkan" }); expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});

it("denies missing CASE_READ before fetching any episode", async () => {
  const calls = serveSummary(summaryFixture, { ...summaryActor, permissions: summaryActor.permissions.filter(p => p !== "CASE_READ") }); renderSummary();
  await screen.findByRole("heading", { name: "Akses tidak diizinkan" }); expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});

it("distinguishes out-of-scope registration and denied sections from empty authorized lists", async () => {
  serveSummary({ ...summaryFixture, registration: { state: "OUT_OF_SCOPE", data: null }, diagnoses: { state: "OUT_OF_SCOPE", data: null }, laboratory: { state: "AVAILABLE", data: { content: [], page: 0, size: 5, totalElements: 0 } }, treatments: { state: "PERMISSION_DENIED", data: null } }); renderSummary();
  await screen.findByRole("heading", { name: "Ringkasan kasus" }); expect(screen.getAllByText(/tidak tersedia dalam cakupan akses/)).toHaveLength(2);
  expect(screen.getByText(/Belum ada permintaan yang dapat dibaca/)).toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Buka registrasi" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Pengobatan dan bukti obat" })).queryByText(/Belum ada episode/)).not.toBeInTheDocument();
});

it.each([403, 404, 500])("renders safe summary errors on HTTP %s without server prose", async status => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json(summaryActor) : c.url.includes("/summary?") ? failure(status, status === 404 ? "RESOURCE_NOT_FOUND" : "ACCESS_DENIED") : undefined); renderSummary();
  await within(await screen.findByRole("region", { name: "Status ringkasan" })).findByRole("alert");
  expect(screen.queryByText(/private server|clinical prose|Fictional summary patient/)).not.toBeInTheDocument(); expect(calls.filter(c => c.url.includes("/summary?")).length).toBe(1);
});

it.each([{ ...summaryFixture, nik: "PRIVATE-NIK" }, { ...summaryFixture, caseId: ids.patient }])("rejects a protected extra field or inconsistent case identity independently", async value => {
  serveSummary(value); renderSummary();
  await within(await screen.findByRole("region", { name: "Status ringkasan" })).findByRole("alert"); expect(screen.queryByText("Fictional summary patient")).not.toBeInTheDocument();
});

it("uses the recorded result status rather than sequence to classify an incomplete legacy result", async () => {
  const fixture = structuredClone(summaryFixture); if (fixture.laboratory.state !== "AVAILABLE") throw new Error("fixture");
  const request = fixture.laboratory.data.content[0]; request.requestReasonCode = null;
  request.results.content = [{ ...request.results.content[0], sequenceNo: 8, status: "FINAL", testedAt: null }];
  serveSummary(fixture); renderSummary(); await screen.findByRole("heading", { name: "Ringkasan kasus" });
  const lab = screen.getByRole("region", { name: "Pemeriksaan laboratorium" });
  expect(within(lab).getByText(/Hasil asli \(FINAL\).*Urutan 8/)).toBeInTheDocument();
  expect(within(lab).queryByText(/Hasil koreksi/)).not.toBeInTheDocument();
  expect(within(lab).getByText(/Alasan belum tercatat/)).toBeInTheDocument();
  expect(within(lab).getByText(/Diperiksa: Waktu belum tercatat/)).toBeInTheDocument();
});

it("renders missing legacy snapshot fields without inventing a name, timestamp or dose", async () => {
  const fixture = structuredClone(summaryFixture); if (fixture.treatments.state !== "AVAILABLE") throw new Error("fixture");
  const episode = fixture.treatments.data.content[0]; episode.drugs.content[0].drugName = null; episode.drugs.content[0].startDate = null;
  if (episode.doses.state !== "AVAILABLE") throw new Error("fixture"); episode.doses.data.content[0].recordedAt = null;
  serveSummary(fixture); renderSummary(); await screen.findByRole("heading", { name: "Ringkasan kasus" });
  expect(screen.getByText(/Nama snapshot belum tercatat/)).toBeInTheDocument();
  expect(screen.getByText(/Tanggal mulai belum tercatat/)).toBeInTheDocument();
  expect(screen.getByText(/Dicatat Waktu belum tercatat/)).toBeInTheDocument();
  expect(screen.getByText(/Dosis tercatat: —/)).toBeInTheDocument();
});

it("paginates sections independently and removes old content if the next page is denied", async () => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json(summaryActor) : c.url.includes("/summary?") ? c.url.includes("labPage=1") ? failure(403, "ACCESS_DENIED") : Response.json({ ...summaryFixture, laboratory: { ...summaryFixture.laboratory, data: { ...(summaryFixture.laboratory.state === "AVAILABLE" ? summaryFixture.laboratory.data : {}), totalElements: 6 } } }) : undefined);
  renderSummary(); await screen.findByRole("heading", { name: "Ringkasan kasus" }); await userEvent.click(screen.getByRole("button", { name: "Berikutnya laboratorium" }));
  await within(await screen.findByRole("region", { name: "Status ringkasan" })).findByRole("alert");
  expect(screen.queryByText("Fictional corrected value")).not.toBeInTheDocument(); expect(calls.filter(c => c.url.includes("labPage=1") && c.url.includes("diagnosisPage=0") && c.url.includes("treatmentPage=0"))).toHaveLength(1);
});

it("reports bounded child evidence explicitly instead of presenting it as the complete history", async () => {
  const fixture = structuredClone(summaryFixture); if (fixture.treatments.state !== "AVAILABLE") throw new Error("fixture"); fixture.treatments.data.content[0].doses = { state: "AVAILABLE", data: { content: [], hasMore: true } };
  const calls = serveSummary(fixture); renderSummary(); await screen.findByRole("heading", { name: "Ringkasan kasus" });
  expect(screen.getByText(/Ringkasan dibatasi/)).toBeInTheDocument(); expect(calls.every(c => c.options.method === "GET")).toBe(true);
  await waitFor(() => expect(screen.getByRole("link", { name: "Buka pengobatan" })).toHaveAttribute("href", "/treatments/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
});
