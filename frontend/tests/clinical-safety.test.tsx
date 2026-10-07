import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { backend, renderClinical, routing, failure } from "./clinical-harness";
import PatientsPage from "@/app/patients/page";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { PatientDetail } from "@/features/clinical-intake/components/patient-detail";
import { DiagnosisDetail } from "@/features/clinical-intake/components/diagnosis-detail";
import { RegistrationDetail } from "@/features/clinical-intake/components/registration-detail";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";
import { useSession } from "@/lib/auth/session";
import { useQueryClient } from "@tanstack/react-query";
import { ids, officer, patientDetail, diagnosis, patientPage } from "./clinical-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/patients" }));
it("worklist filtering and detail edits never persist, log, change metadata or put identity in history", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem"); const open = vi.fn(); vi.stubGlobal("indexedDB", { open });
  const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
  const push = vi.spyOn(window.history, "pushState"); const replace = vi.spyOn(window.history, "replaceState"); const title = document.title;
  backend(); const worklist = renderClinical(<PatientsPage />); await screen.findByText("************1234");
  await userEvent.type(screen.getByLabelText("Cari NIK"), "1234567890121234"); await userEvent.click(screen.getByRole("button", { name: "Terapkan filter" }));
  worklist.unmount(); renderClinical(<ClinicalBoundary permissions={["PATIENT_READ"]}><PatientDetail id={ids.patient} /></ClinicalBoundary>);
  await userEvent.click(await screen.findByRole("button", { name: "Ubah pasien" }));
  await userEvent.clear(screen.getByLabelText("Nomor telepon")); await userEvent.type(screen.getByLabelText("Nomor telepon"), "089999999999");
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled());
  expect(storage).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled(); expect(document.title).toBe(title);
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});
it("late prior-account PATCH never navigates, injects response data or invalidates new-account clinical cache", async () => {
  let changed = false; let resolve!: (response: Response) => void; let signal: AbortSignal | undefined;
  const calls = backend(c => c.url.endsWith("/me") ? Response.json(changed ? { ...officer, id: "new-officer" } : officer) : c.options.method === "PATCH" ? (signal = c.options.signal as AbortSignal, new Promise<Response>(r => { resolve = r; })) : undefined);
  function Switch() {
    const session = useSession(); const client = useQueryClient();
    return <button onClick={() => { changed = true; void session.refresh().then(() => client.setQueryData(["clinical", "new-officer", "sentinel"], "new-data")); }}>Switch actor</button>;
  }
  renderClinical(<><Switch /><ClinicalBoundary permissions={["PATIENT_READ"]}><PatientDetail id={ids.patient} /></ClinicalBoundary></>);
  await userEvent.click(await screen.findByRole("button", { name: "Ubah pasien" }));
  await userEvent.clear(screen.getByLabelText("Nomor telepon")); await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(resolve).toBeDefined()); await userEvent.click(screen.getByText("Switch actor"));
  await screen.findByRole("button", { name: "Ubah pasien" }); expect(signal?.aborted).toBe(true);
  const before = calls.length;
  await act(async () => { resolve(Response.json({ ...patientDetail, demographics: { ...patientDetail.demographics, fullName: "Old response secret" } })); await Promise.resolve(); });
  expect(screen.queryByText("Old response secret")).not.toBeInTheDocument(); expect(calls.length).toBe(before);
});
it("an inactive historical diagnosis label renders but is absent from active choices and omitted from unrelated PATCH", async () => {
  const calls = backend(c => c.url.endsWith(`/diagnoses/${ids.diagnosis}`) ? Response.json({ ...diagnosis, anatomicalSite: { code: "OLD", name: "Lokasi historis" } }, { headers: { ETag: '"history-tag"' } }) : undefined);
  renderClinical(<ClinicalBoundary permissions={["DIAGNOSIS_READ"]}><DiagnosisDetail id={ids.diagnosis} /></ClinicalBoundary>);
  await screen.findByText("Lokasi historis"); await userEvent.click(screen.getByRole("button", { name: "Ubah diagnosis" }));
  expect(screen.queryByRole("option", { name: "Lokasi historis" })).not.toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Catatan diagnosis")); await userEvent.type(screen.getByLabelText("Catatan diagnosis"), "Diperbarui");
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(calls.some(c => c.options.method === "PATCH")).toBe(true));
  expect(calls.find(c => c.options.method === "PATCH")?.body).toEqual({ notes: "Diperbarui" });
});
it("missing record read permission prevents all record and catalog requests", async () => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: ["PATIENT_READ"] }) : undefined);
  renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}><CaseDetail id={ids.tbCase} /></ClinicalBoundary>);
  await screen.findByRole("heading", { name: "Akses tidak diizinkan" }); expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});
it("retains view access without PATIENT_READ but never bypasses reference-directory permissions", async () => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: ["DIAGNOSIS_READ", "DIAGNOSIS_WRITE"] }) : undefined);
  renderClinical(<ClinicalBoundary permissions={["DIAGNOSIS_READ"]}><DiagnosisDetail id={ids.diagnosis} /></ClinicalBoundary>);
  await userEvent.click(await screen.findByRole("button", { name: "Ubah diagnosis" }));
  expect(screen.getByText("Izin membaca referensi klinis diperlukan untuk mengedit.")).toBeInTheDocument();
  expect(calls.some(c => c.url.includes("/clinical-reference-data") || c.url.includes("/clinical-facilities") || c.url.includes("/registrations/"))).toBe(false);
});
it("read-only case view never acquires treatment or laboratory endpoints", async () => {
  const calls = backend(); renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}><CaseDetail id={ids.tbCase} /></ClinicalBoundary>);
  await screen.findByRole("heading", { name: "Detail kasus" }); expect(screen.getByText("2026-09-03T10:00:00+07:00")).toBeInTheDocument();
  expect(calls.every(c => c.url.endsWith("/me") || c.url.includes("/clinical-reference-data") || c.url.endsWith(`/cases/${ids.tbCase}`))).toBe(true);
});
it("worklist loading, network error and explicit retry remain safe", async () => {
  let fail = true;
  backend(c => c.url.includes("/patients?") ? fail ? failure(503, "NETWORK_UNAVAILABLE") : Response.json(patientPage) : undefined);
  renderClinical(<PatientsPage />); expect(screen.getByRole("status")).toHaveTextContent("Memeriksa sesi");
  await screen.findAllByText("Layanan belum tersedia"); fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Coba kembali" })); await screen.findByText("************1234");
});
it("after changing away and back to REFERRED, an earlier destination must be selected again", async () => {
  backend(c => c.url.endsWith(`/diagnoses/${ids.diagnosis}`) ? Response.json({ ...diagnosis, treatmentDisposition: "REFERRED", referredToFacility: { id: ids.destination, name: "Rumah Sakit Tujuan" } }, { headers: { ETag: '"ref-tag"' } }) : undefined);
  renderClinical(<ClinicalBoundary permissions={["DIAGNOSIS_READ"]}><DiagnosisDetail id={ids.diagnosis} /></ClinicalBoundary>);
  await userEvent.click(await screen.findByRole("button", { name: "Ubah diagnosis" }));
  await userEvent.selectOptions(screen.getByLabelText(/Disposisi pengobatan/), "UNKNOWN");
  await userEvent.selectOptions(screen.getByLabelText(/Disposisi pengobatan/), "REFERRED");
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(await screen.findByText("Pilih fasyankes tujuan rujukan.")).toBeInTheDocument();
});
it("does not infer confirmation data from registration values or an unselected clinical diagnosis", async () => {
  backend(); renderClinical(<ClinicalBoundary permissions={["REGISTRATION_READ"]}><RegistrationDetail id={ids.registration} /></ClinicalBoundary>);
  await userEvent.click(await screen.findByRole("button", { name: "Konfirmasi kasus" }));
  expect(screen.getByLabelText(/Kategori pengobatan sebelumnya/)).toHaveValue("");
  expect(screen.getByLabelText(/Berat \(kg\)/)).toHaveValue("");
  expect(screen.getByLabelText("Status HIV")).toHaveValue("");
});
