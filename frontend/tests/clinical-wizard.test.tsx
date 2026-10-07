import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { backend, renderClinical, routing, failure } from "./clinical-harness";
import { ids, identityConfirmation, officer, registration } from "./clinical-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/intake/new" }));
import RegistrationWizardPage from "@/app/intake/new/page";
import { useSession } from "@/lib/auth/session";
function renderWizard() { return renderClinical(<RegistrationWizardPage />); }
beforeEach(() => { routing.push.mockReset(); routing.replace.mockReset(); });
async function patientStep() { renderWizard(); await userEvent.click(await screen.findByRole("button", { name: "Lanjut ke pasien" })); }
async function existingStep() {
  await patientStep(); await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  await userEvent.type(screen.getByLabelText("NIK"), "1234567890121234");
  await userEvent.type(screen.getByLabelText("Nama untuk konfirmasi"), "Pasien Contoh");
  await userEvent.click(screen.getByRole("button", { name: "Konfirmasi identitas" }));
  await screen.findByText("************1234");
}
async function completeRegistration() {
  await userEvent.type(screen.getByLabelText(/Tanggal registrasi/), "2026-09-01");
  await userEvent.selectOptions(screen.getByLabelText(/Jenis terduga/), "TERDUGA");
  await userEvent.selectOptions(screen.getByLabelText(/Kategori pengobatan sebelumnya/), "BARU");
}
it("creates a new patient registration with an assigned facility, live codes and explicit identity/date pairs", async () => {
  const calls = backend(c => c.url.endsWith("/registrations") && c.options.method === "POST" ? Response.json(registration) : undefined);
  await patientStep();
  await userEvent.type(screen.getByLabelText(/Nama lengkap/), "Pasien Baru");
  await userEvent.type(screen.getByLabelText(/NIK/), "9876543210987654");
  await userEvent.click(screen.getByLabelText("Tanggal lahir tidak diketahui"));
  await userEvent.selectOptions(screen.getByLabelText(/Jenis kelamin/), "L");
  await userEvent.click(screen.getByRole("button", { name: "Lanjut ke registrasi" }));
  await completeRegistration(); await userEvent.click(screen.getByRole("button", { name: "Simpan registrasi" }));
  await waitFor(() => expect(routing.push).toHaveBeenCalledWith(`/registrations/${ids.registration}`));
  const body = calls.find(c => c.options.method === "POST")?.body;
  expect(body).toMatchObject({ facilityId: ids.facility, registrationDate: "2026-09-01", suspectTypeCode: "TERDUGA", previousTreatmentCategoryCode: "BARU", newPatient: { fullName: "Pasien Baru", citizenship: "WNI", nik: "9876543210987654", otherIdentityNumber: null, birthDate: null, birthDateUnknown: true, sexCode: "L" } });
  expect(body).not.toHaveProperty("existingPatient");
});
it("reuses original exact resolve confirmation rather than masked values in final existingPatient", async () => {
  const calls = backend(c => c.url.endsWith("/patients/resolve") ? Response.json(identityConfirmation) : c.url.endsWith("/registrations") && c.options.method === "POST" ? Response.json(registration) : undefined);
  await existingStep(); await userEvent.click(screen.getByRole("button", { name: "Lanjut ke registrasi" }));
  await completeRegistration(); await userEvent.click(screen.getByRole("button", { name: "Simpan registrasi" }));
  await waitFor(() => expect(routing.push).toHaveBeenCalled());
  expect(calls.find(c => c.url.endsWith("/patients/resolve"))?.body).toEqual({ citizenship: "WNI", nik: "1234567890121234", fullName: "Pasien Contoh" });
  expect(calls.find(c => c.url.endsWith("/registrations") && c.options.method === "POST")?.body?.existingPatient).toEqual({ patientId: ids.patient, citizenship: "WNI", nik: "1234567890121234", fullName: "Pasien Contoh" });
});
it("switching patient path clears masked confirmation and exact inputs, and refresh requires reconfirmation", async () => {
  backend(c => c.url.endsWith("/patients/resolve") ? Response.json(identityConfirmation) : undefined);
  await existingStep(); await userEvent.click(screen.getByRole("button", { name: "Pasien baru" }));
  expect(screen.queryByText("************1234")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  expect(screen.getByLabelText("NIK")).toHaveValue("");
  expect(screen.getByLabelText("Nama untuk konfirmasi")).toHaveValue("");
  expect(screen.queryByRole("button", { name: "Lanjut ke registrasi" })).not.toBeInTheDocument();
});
it("does not request fuzzy identity resolution without an exact key and name/date confirmation", async () => {
  const calls = backend(); await patientStep(); await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  await userEvent.type(screen.getByLabelText("NIK"), "123");
  await userEvent.click(screen.getByRole("button", { name: "Konfirmasi identitas" }));
  expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
  expect(calls.some(c => c.url.endsWith("/patients/resolve"))).toBe(false);
});
it("uses only /me assigned facilities and requires explicit choice when more than one exists", async () => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, activeFacilities: [...officer.activeFacilities, { id: ids.destination, name: "Fasilitas tugas kedua" }] }) : undefined);
  renderWizard(); const field = await screen.findByLabelText("Fasilitas registrasi");
  expect(field).toHaveValue(""); expect(screen.getByRole("button", { name: "Lanjut ke pasien" })).toBeDisabled();
  expect(screen.getAllByRole("option").map(o => o.textContent)).toEqual(["Pilih fasilitas…", "Puskesmas Asal", "Fasilitas tugas kedua"]);
  expect(calls.some(c => c.url.includes("/clinical-facilities"))).toBe(false);
});
it("hides existing patient option without PATIENT_IDENTITY_RESOLVE", async () => {
  backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: officer.permissions.filter(p => p !== "PATIENT_IDENTITY_RESOLVE") }) : undefined);
  await patientStep(); expect(screen.queryByRole("button", { name: "Pasien sudah terdaftar" })).not.toBeInTheDocument();
});
it("denies registration without both create permissions and emits no clinical request", async () => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: ["PATIENT_READ", "REGISTRATION_WRITE"] }) : undefined);
  renderWizard(); await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
  expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});
it("refuses raw backend error prose from unsuccessful identity resolution", async () => {
  backend(c => c.url.endsWith("/patients/resolve") ? failure(404, "RESOURCE_NOT_FOUND") : undefined);
  await patientStep(); await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  await userEvent.type(screen.getByLabelText("NIK"), "1234567890121234"); await userEvent.type(screen.getByLabelText("Nama untuk konfirmasi"), "Pasien Contoh");
  await userEvent.click(screen.getByRole("button", { name: "Konfirmasi identitas" }));
  expect(await screen.findByRole("alert")).not.toHaveTextContent(/private server|clinical prose/);
});
it("a late resolve after switching paths is aborted and cannot restore old exact confirmation", async () => {
  let complete!: (response: Response) => void; let signal: AbortSignal | undefined;
  backend(c => c.url.endsWith("/patients/resolve") ? (signal = c.options.signal as AbortSignal, new Promise<Response>(resolve => { complete = resolve; })) : undefined);
  await patientStep(); await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  await userEvent.type(screen.getByLabelText("NIK"), "1234567890121234"); await userEvent.type(screen.getByLabelText("Nama untuk konfirmasi"), "Pasien Contoh");
  await userEvent.click(screen.getByRole("button", { name: "Konfirmasi identitas" }));
  await waitFor(() => expect(complete).toBeDefined());
  await userEvent.click(screen.getByRole("button", { name: "Pasien baru" })); expect(signal?.aborted).toBe(true);
  await act(async () => { complete(Response.json(identityConfirmation)); await Promise.resolve(); });
  expect(screen.queryByText("Identitas terkonfirmasi")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  expect(screen.getByLabelText("NIK")).toHaveValue("");
});
it("leaving and remounting the wizard requires a new exact confirmation", async () => {
  backend(c => c.url.endsWith("/patients/resolve") ? Response.json(identityConfirmation) : undefined);
  const mounted = renderWizard()!; await userEvent.click(await screen.findByRole("button", { name: "Lanjut ke pasien" }));
  await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  await userEvent.type(screen.getByLabelText("NIK"), "1234567890121234"); await userEvent.type(screen.getByLabelText("Nama untuk konfirmasi"), "Pasien Contoh");
  await userEvent.click(screen.getByRole("button", { name: "Konfirmasi identitas" })); await screen.findByText("************1234");
  mounted.unmount(); await patientStep(); await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  expect(screen.getByLabelText("NIK")).toHaveValue(""); expect(screen.queryByText("************1234")).not.toBeInTheDocument();
});
it("an account change clears confirmed wizard state before accepting input for the new account", async () => {
  let changed = false;
  backend(c => c.url.endsWith("/me") ? Response.json(changed ? { ...officer, id: "new-officer" } : officer) : c.url.endsWith("/patients/resolve") ? Response.json(identityConfirmation) : undefined);
  function Switch() { const session = useSession(); return <button onClick={() => { changed = true; void session.refresh(); }}>Changer</button>; }
  renderClinical(<><Switch /><RegistrationWizardPage /></>);
  await userEvent.click(await screen.findByRole("button", { name: "Lanjut ke pasien" })); await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  await userEvent.type(screen.getByLabelText("NIK"), "1234567890121234"); await userEvent.type(screen.getByLabelText("Nama untuk konfirmasi"), "Pasien Contoh");
  await userEvent.click(screen.getByRole("button", { name: "Konfirmasi identitas" })); await screen.findByText("************1234");
  await userEvent.click(screen.getByText("Changer"));
  await userEvent.click(await screen.findByRole("button", { name: "Lanjut ke pasien" })); await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  expect(screen.getByLabelText("NIK")).toHaveValue(""); expect(screen.queryByText("************1234")).not.toBeInTheDocument();
});
it("ambiguous identity can be corrected and resolved manually without a clinical-state lock", async () => {
  let first = true;
  const calls = backend(c => c.url.endsWith("/patients/resolve") ? first ? (first = false, failure(409, "PATIENT_IDENTITY_AMBIGUOUS")) : Response.json(identityConfirmation) : undefined);
  await patientStep(); await userEvent.click(screen.getByRole("button", { name: "Pasien sudah terdaftar" }));
  await userEvent.type(screen.getByLabelText("NIK"), "1234567890121234"); await userEvent.type(screen.getByLabelText("Nama untuk konfirmasi"), "Pasien Contoh");
  await userEvent.click(screen.getByRole("button", { name: "Konfirmasi identitas" })); await screen.findByRole("alert");
  await userEvent.type(screen.getByLabelText("Tanggal lahir untuk konfirmasi"), "1990-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Konfirmasi identitas" })); await screen.findByText("************1234");
  expect(calls.filter(c => c.url.endsWith("/patients/resolve"))).toHaveLength(2);
});
it("retains registration values and exact confirmation across ordinary back/forward navigation", async () => {
  const calls = backend(c => c.url.endsWith("/patients/resolve") ? Response.json(identityConfirmation) : c.url.endsWith("/registrations") && c.options.method === "POST" ? Response.json(registration) : undefined);
  await existingStep(); await userEvent.click(screen.getByRole("button", { name: "Lanjut ke registrasi" }));
  await completeRegistration();
  await userEvent.type(screen.getByLabelText("Nomor rekam medis"), "RM-draft");
  await userEvent.type(screen.getByLabelText("Berat awal (kg)"), "55.25");
  await userEvent.type(screen.getByLabelText("Catatan rujukan"), "Catatan draft");
  await userEvent.click(screen.getByRole("button", { name: "Kembali ke pasien" }));
  expect(screen.getByText("************1234")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Lanjut ke registrasi" }));
  expect(screen.getByLabelText(/Tanggal registrasi/)).toHaveValue("2026-09-01");
  expect(screen.getByLabelText(/Jenis terduga/)).toHaveValue("TERDUGA");
  expect(screen.getByLabelText(/Kategori pengobatan sebelumnya/)).toHaveValue("BARU");
  expect(screen.getByLabelText("Nomor rekam medis")).toHaveValue("RM-draft");
  expect(screen.getByLabelText("Berat awal (kg)")).toHaveValue("55.25");
  expect(screen.getByLabelText("Catatan rujukan")).toHaveValue("Catatan draft");
  await userEvent.click(screen.getByRole("button", { name: "Simpan registrasi" }));
  await waitFor(() => expect(routing.push).toHaveBeenCalled());
  expect(calls.find(c => c.url.endsWith("/registrations") && c.options.method === "POST")?.body).toMatchObject({ registrationDate: "2026-09-01", medicalRecordNumber: "RM-draft", initialWeightKg: 55.25, referralNotes: "Catatan draft", existingPatient: { nik: "1234567890121234", fullName: "Pasien Contoh" } });
});
it("finishes successful creation and clears confirmation even when the subsequent catalog refresh fails", async () => {
  let committed = false;
  backend(c => {
    if (c.url.endsWith("/patients/resolve")) return Response.json(identityConfirmation);
    if (c.url.endsWith("/registrations") && c.options.method === "POST") { committed = true; return Response.json(registration); }
    if (committed && c.url.endsWith("/clinical-reference-data")) return failure(503, "SERVICE_UNAVAILABLE");
  });
  await existingStep(); await userEvent.click(screen.getByRole("button", { name: "Lanjut ke registrasi" }));
  await completeRegistration(); await userEvent.click(screen.getByRole("button", { name: "Simpan registrasi" }));
  await waitFor(() => expect(routing.push).toHaveBeenCalledWith(`/registrations/${ids.registration}`));
  await userEvent.click(screen.getByRole("button", { name: "Kembali ke pasien" }));
  expect(screen.queryByText("************1234")).not.toBeInTheDocument();
  expect(screen.getByLabelText("NIK")).toHaveValue("");
  expect(screen.getByLabelText("Nama untuk konfirmasi")).toHaveValue("");
});
it("clears the saved registration draft when the actual patient path changes", async () => {
  backend(c => c.url.endsWith("/patients/resolve") ? Response.json(identityConfirmation) : undefined);
  await existingStep(); await userEvent.click(screen.getByRole("button", { name: "Lanjut ke registrasi" }));
  await completeRegistration(); await userEvent.type(screen.getByLabelText("Nomor rekam medis"), "Old-patient-draft");
  await userEvent.click(screen.getByRole("button", { name: "Kembali ke pasien" }));
  await userEvent.click(screen.getByRole("button", { name: "Pasien baru" }));
  await userEvent.type(screen.getByLabelText(/Nama lengkap/), "Pasien Baru");
  await userEvent.type(screen.getByLabelText(/NIK/), "9876543210987654");
  await userEvent.click(screen.getByLabelText("Tanggal lahir tidak diketahui"));
  await userEvent.selectOptions(screen.getByLabelText(/Jenis kelamin/), "L");
  await userEvent.click(screen.getByRole("button", { name: "Lanjut ke registrasi" }));
  expect(screen.getByLabelText(/Tanggal registrasi/)).toHaveValue("");
  expect(screen.getByLabelText("Nomor rekam medis")).toHaveValue("");
});
