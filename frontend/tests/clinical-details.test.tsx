import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { backend, renderClinical, routing, failure } from "./clinical-harness";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { ids, patientDetail, registration, officer } from "./clinical-fixtures";
import { PatientDetail } from "@/features/clinical-intake/components/patient-detail";
import { RegistrationDetail } from "@/features/clinical-intake/components/registration-detail";
import { DiagnosisDetail } from "@/features/clinical-intake/components/diagnosis-detail";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/patients/detail" }));
function renderRecord(kind: "patient" | "registration" | "diagnosis" | "case") {
  const Component = { patient: PatientDetail, registration: RegistrationDetail, diagnosis: DiagnosisDetail, case: CaseDetail }[kind];
  const permission = { patient: "PATIENT_READ", registration: "REGISTRATION_READ", diagnosis: "DIAGNOSIS_READ", case: "CASE_READ" }[kind];
  return renderClinical(<ClinicalBoundary permissions={[permission]}><Component id={kind === "case" ? ids.tbCase : ids[kind]} /></ClinicalBoundary>);
}
beforeEach(() => { routing.push.mockReset(); backend(); });
it.each([
  ["patient", "Ubah pasien", "Nomor telepon", "089999999999", { phone: "089999999999" }, "patient-server-tag"],
  ["registration", "Ubah registrasi", "Nomor rekam medis", "RM2", { medicalRecordNumber: "RM2" }, "registration-server-tag"],
  ["diagnosis", "Ubah diagnosis", "Catatan diagnosis", "Catatan baru", { notes: "Catatan baru" }, "diagnosis-server-tag"],
  ["case", "Ubah kasus", "Berat (kg)", "56.25", { weightKg: 56.25 }, "case-server-tag"],
] as const)("%s edits use GET server ETag and send only dirty input fields", async (kind, edit, label, input, expected, etag) => {
  const calls = backend(c => c.url.endsWith(`/registrations/${ids.registration}`) ? Response.json({ ...registration, status: "OPEN" }, { headers: { ETag: '"registration-server-tag"' } }) : undefined);
  renderRecord(kind); await userEvent.click(await screen.findByRole("button", { name: edit }));
  await userEvent.clear(screen.getByLabelText(new RegExp(label.replace(/[()]/g, "\\$&"))));
  await userEvent.type(screen.getByLabelText(new RegExp(label.replace(/[()]/g, "\\$&"))), input);
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1));
  const call = calls.find(c => c.options.method === "PATCH")!;
  expect(call.body).toEqual(expected); expect(new Headers(call.options.headers).get("If-Match")).toBe(`"${etag}"`);
});
it("explicitly clears nullable patient identity/date partners and never sends demographic response fields", async () => {
  const calls = backend(); renderRecord("patient"); await userEvent.click(await screen.findByRole("button", { name: "Ubah pasien" }));
  await userEvent.selectOptions(screen.getByLabelText(/Kewarganegaraan/), "WNA");
  await userEvent.type(screen.getByLabelText(/Nomor identitas lain/), "PASSPORT123");
  await userEvent.click(screen.getByLabelText("Tanggal lahir tidak diketahui"));
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(calls.some(c => c.options.method === "PATCH")).toBe(true));
  expect(calls.find(c => c.options.method === "PATCH")?.body).toEqual({ citizenship: "WNA", otherIdentityNumber: "PASSPORT123", nik: null, birthDate: null, birthDateUnknown: true });
});
it("recovers diagnosis list on registration reload and detail/ETag from GET without mutation response state", async () => {
  const calls = backend(); renderRecord("registration");
  expect(await screen.findByRole("link", { name: "Buka diagnosis" })).toHaveAttribute("href", `/diagnoses/${ids.diagnosis}`);
  expect(calls.some(c => c.url.endsWith(`/registrations/${ids.registration}/diagnoses`) && c.options.method === "GET")).toBe(true);
});
it("keeps dirty values after optimistic conflict, refetches, requires explicit review and never auto-replays", async () => {
  let conflicted = false;
  const calls = backend(c => {
    if (c.options.method === "PATCH") { conflicted = true; return failure(409, "OPTIMISTIC_LOCK_CONFLICT"); }
    if (conflicted && c.url.endsWith(`/patients/${ids.patient}`)) return Response.json({ ...patientDetail, version: 99, demographics: { ...patientDetail.demographics, fullName: "Nama terbaru", phone: "081111111111" } }, { headers: { ETag: '"latest-etag"' } });
  });
  renderRecord("patient"); await userEvent.click(await screen.findByRole("button", { name: "Ubah pasien" }));
  await userEvent.clear(screen.getByLabelText("Nomor telepon")); await userEvent.type(screen.getByLabelText("Nomor telepon"), "089999999999");
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(await screen.findByText("Data telah berubah")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText(/Nama lengkap/)).toHaveValue("Nama terbaru"));
  expect(screen.getByLabelText("Nomor telepon")).toHaveValue("089999999999");
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Saya sudah meninjau data terbaru" }));
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(2));
  expect(new Headers(calls.filter(c => c.options.method === "PATCH")[1].options.headers).get("If-Match")).toBe('"latest-etag"');
});
it("source-authority conflict locks repeated save attempts for the mounted form while preserving reads", async () => {
  const calls = backend(c => c.options.method === "PATCH" ? failure(409, "SOURCE_AUTHORITY_CONFLICT") : undefined);
  renderRecord("patient"); await userEvent.click(await screen.findByRole("button", { name: "Ubah pasien" }));
  await userEvent.clear(screen.getByLabelText("Nomor telepon"));
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(await screen.findByText("Data dikendalikan sumber eksternal")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Kembali ke daftar pasien" })).toBeEnabled();
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
});
it("clinical state conflict refetches safely and preserves diagnosis notes without overriding state", async () => {
  const calls = backend(c => c.options.method === "PATCH" ? failure(409, "CLINICAL_STATE_CONFLICT") : undefined);
  renderRecord("diagnosis"); await userEvent.click(await screen.findByRole("button", { name: "Ubah diagnosis" }));
  await userEvent.clear(screen.getByLabelText("Catatan diagnosis")); await userEvent.type(screen.getByLabelText("Catatan diagnosis"), "Tetap disimpan lokal");
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  const alert = await screen.findByRole("alert"); expect(alert).toHaveTextContent("Status data telah berubah");
  expect(alert).not.toHaveTextContent(/private|clinical prose/);
  expect(screen.getByLabelText("Catatan diagnosis")).toHaveValue("Tetap disimpan lokal");
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
});
it.each([["patient", "PATIENT_UPDATE", "Ubah pasien"], ["registration", "REGISTRATION_WRITE", "Ubah registrasi"], ["diagnosis", "DIAGNOSIS_WRITE", "Ubah diagnosis"], ["case", "CASE_WRITE", "Ubah kasus"]] as const)("%s cannot edit without explicit %s permission", async (kind, permission, label) => {
  backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: officer.permissions.filter(p => p !== permission) }) : undefined);
  renderRecord(kind); await screen.findByRole("heading", { level: 1 });
  expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
});
it("registration edit is offered only for OPEN status", async () => {
  renderRecord("registration"); await screen.findByText("Hasil dicatat petugas");
  expect(screen.queryByRole("button", { name: "Ubah registrasi" })).not.toBeInTheDocument();
});
it("patient detail renders authorized full identity locally with safe global chrome and unchanged document metadata", async () => {
  const before = document.title; renderRecord("patient");
  expect(await screen.findByText("1234567890121234")).toBeInTheDocument();
  expect(within(screen.getByRole("banner")).queryByText(/Pasien Contoh|1234567890121234|Alamat pribadi/)).not.toBeInTheDocument();
  expect(document.title).toBe(before);
});
it("missing server ETag disables editing instead of synthesizing it from response version", async () => {
  const calls = backend(c => c.url.endsWith(`/patients/${ids.patient}`) ? Response.json(patientDetail) : undefined);
  renderRecord("patient"); await userEvent.click(await screen.findByRole("button", { name: "Ubah pasien" }));
  await userEvent.clear(screen.getByLabelText("Nomor telepon"));
  expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
  expect(calls.some(c => c.options.method === "PATCH")).toBe(false);
});
it.each([
  ["patient", "Ubah pasien", "Nomor telepon", "089999999999"],
  ["registration", "Ubah registrasi", "Nomor rekam medis", "RM2"],
  ["diagnosis", "Ubah diagnosis", "Catatan diagnosis", "Catatan tetap"],
  ["case", "Ubah kasus", "Berat (kg)", "56.25"],
] as const)("%s retains its draft and conflict review through a failed catalog refresh and retry", async (kind, edit, label, input) => {
  let conflicted = false; let recovered = false;
  const calls = backend(c => {
    if (c.options.method === "PATCH") { conflicted = true; return failure(409, "OPTIMISTIC_LOCK_CONFLICT"); }
    if (conflicted && !recovered && c.url.endsWith("/clinical-reference-data")) return failure(503, "SERVICE_UNAVAILABLE");
    if (c.url.endsWith(`/registrations/${ids.registration}`)) return Response.json({ ...registration, status: "OPEN" }, { headers: { ETag: '"registration-server-tag"' } });
  });
  renderRecord(kind); await userEvent.click(await screen.findByRole("button", { name: edit }));
  const fieldLabel = new RegExp(label.replace(/[()]/g, "\\$&"));
  await userEvent.clear(screen.getByLabelText(fieldLabel)); await userEvent.type(screen.getByLabelText(fieldLabel), input);
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await screen.findByRole("button", { name: "Coba kembali" });
  expect(screen.getByLabelText(fieldLabel)).toHaveValue(input);
  expect(screen.getByRole("button", { name: "Saya sudah meninjau data terbaru" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
  recovered = true; await userEvent.click(screen.getByRole("button", { name: "Coba kembali" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Saya sudah meninjau data terbaru" })).toBeEnabled());
  expect(screen.getByLabelText(fieldLabel)).toHaveValue(input);
  expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Saya sudah meninjau data terbaru" }));
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(2));
});
it("keeps the source-authority lock through an independent catalog failure and retry", async () => {
  let failCatalog = false;
  const calls = backend(c => c.options.method === "PATCH" ? failure(409, "SOURCE_AUTHORITY_CONFLICT") : failCatalog && c.url.endsWith("/clinical-reference-data") ? failure(503, "SERVICE_UNAVAILABLE") : undefined);
  function Refresh() { const client = useQueryClient(); return <button onClick={() => { failCatalog = true; void client.invalidateQueries({ queryKey: ["clinical", officer.id, "references"] }); }}>Refresh catalog</button>; }
  renderClinical(<ClinicalBoundary permissions={["PATIENT_READ"]}><Refresh /><PatientDetail id={ids.patient} /></ClinicalBoundary>);
  await userEvent.click(await screen.findByRole("button", { name: "Ubah pasien" }));
  await userEvent.clear(screen.getByLabelText("Nomor telepon"));
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await screen.findByText("Data dikendalikan sumber eksternal");
  await userEvent.click(screen.getByRole("button", { name: "Refresh catalog" }));
  await screen.findByRole("button", { name: "Coba kembali" });
  expect(screen.getByLabelText("Nomor telepon")).toHaveValue("");
  failCatalog = false; await userEvent.click(screen.getByRole("button", { name: "Coba kembali" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Coba kembali" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
  expect(screen.getByLabelText("Nomor telepon")).toBeDisabled();
  expect(screen.getByText("Data dikendalikan sumber eksternal")).toBeInTheDocument();
  expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
});
