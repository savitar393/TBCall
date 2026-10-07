import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { backend, renderClinical, routing } from "./clinical-harness";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { ids, officer, registration, diagnosis, caseView, facility } from "./clinical-fixtures";
import { RegistrationDetail } from "@/features/clinical-intake/components/registration-detail";
import { DiagnosisDetail } from "@/features/clinical-intake/components/diagnosis-detail";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/registrations/detail" }));
function record(kind: "registration" | "diagnosis") {
  const Component = kind === "registration" ? RegistrationDetail : DiagnosisDetail;
  return renderClinical(<ClinicalBoundary permissions={[kind === "registration" ? "REGISTRATION_READ" : "DIAGNOSIS_READ"]}><Component id={ids[kind]} /></ClinicalBoundary>);
}
beforeEach(() => { routing.push.mockReset(); });
it("creates diagnosis with current registration GET ETag and refetches its OPEN→DIAGNOSED transition", async () => {
  let created = false;
  const calls = backend(c => {
    if (c.url.endsWith(`/registrations/${ids.registration}/diagnoses`) && c.options.method === "POST") { created = true; return Response.json(diagnosis); }
    if (c.url.endsWith(`/registrations/${ids.registration}`)) return Response.json({ ...registration, status: created ? "DIAGNOSED" : "OPEN" }, { headers: { ETag: created ? '"new-registration"' : '"before-diagnosis"' } });
    if (c.url.endsWith("/diagnoses")) return Response.json(created ? [diagnosis] : []);
  });
  record("registration"); await userEvent.click(await screen.findByRole("button", { name: "Tambah diagnosis" }));
  await userEvent.type(screen.getByLabelText(/Tanggal diagnosis/), "2026-09-02");
  await userEvent.selectOptions(screen.getByLabelText(/Lokasi anatomi/), "PARU");
  await userEvent.selectOptions(screen.getByLabelText(/Jenis diagnosis/), "KLINIS");
  await userEvent.type(screen.getByLabelText(/Hasil diagnosis/), "Dicatat petugas");
  await userEvent.selectOptions(screen.getByLabelText(/Disposisi pengobatan/), "TREAT_HERE");
  await userEvent.click(screen.getByRole("button", { name: "Simpan diagnosis" }));
  await screen.findByRole("link", { name: "Buka diagnosis" });
  const call = calls.find(c => c.options.method === "POST")!;
  expect(new Headers(call.options.headers).get("If-Match")).toBe('"before-diagnosis"');
  expect(call.body).toMatchObject({ diagnosisDate: "2026-09-02", anatomicalSiteCode: "PARU", diagnosisTypeCode: "KLINIS", diagnosisResult: "Dicatat petugas", treatmentDisposition: "TREAT_HERE", referredToFacilityId: null });
  expect(calls.filter(c => c.url.endsWith(`/registrations/${ids.registration}`)).length).toBeGreaterThan(1);
});
it("debounces remote referral search only after two characters and excludes current registration facility", async () => {
  const calls = backend(); record("diagnosis"); await userEvent.click(await screen.findByRole("button", { name: "Ubah diagnosis" }));
  await userEvent.selectOptions(screen.getByLabelText(/Disposisi pengobatan/), "REFERRED");
  const search = screen.getByLabelText("Cari fasyankes tujuan");
  await userEvent.type(search, "r"); await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
  expect(calls.some(c => c.url.includes("/clinical-facilities"))).toBe(false);
  await userEvent.type(search, "u");
  const destination = await screen.findByRole("button", { name: "Pilih Rumah Sakit Tujuan" });
  expect(screen.queryByRole("button", { name: "Pilih Puskesmas Asal" })).not.toBeInTheDocument();
  await userEvent.click(destination); await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(calls.some(c => c.options.method === "PATCH")).toBe(true));
  expect(calls.find(c => c.options.method === "PATCH")?.body).toEqual({ treatmentDisposition: "REFERRED", referredToFacilityId: ids.destination });
});
it("changing away from REFERRED explicitly clears destination in dirty PATCH", async () => {
  const calls = backend(c => c.url.endsWith(`/diagnoses/${ids.diagnosis}`) ? Response.json({ ...diagnosis, treatmentDisposition: "REFERRED", referredToFacility: { id: ids.destination, name: "Rumah Sakit Tujuan" } }, { headers: { ETag: '"referred-etag"' } }) : undefined);
  record("diagnosis"); await userEvent.click(await screen.findByRole("button", { name: "Ubah diagnosis" }));
  await userEvent.selectOptions(screen.getByLabelText(/Disposisi pengobatan/), "NOT_TREATED");
  await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(calls.some(c => c.options.method === "PATCH")).toBe(true));
  expect(calls.find(c => c.options.method === "PATCH")?.body).toEqual({ treatmentDisposition: "NOT_TREATED", referredToFacilityId: null });
});
it("requires explicit eligible diagnosis selection and category without guessing resistance or outcomes", async () => {
  const calls = backend(c => c.url.endsWith("/cases") && c.options.method === "POST" ? Response.json(caseView) : c.url.endsWith("/diagnoses") ? Response.json([
    diagnosis, { ...diagnosis, id: ids.tbCase, treatmentDisposition: "NOT_TREATED", diagnosisResult: "Tidak eligible" },
    { ...diagnosis, id: ids.destination, treatmentDisposition: "UNKNOWN", diagnosisResult: "Belum eligible" },
  ]) : undefined);
  record("registration"); await userEvent.click(await screen.findByRole("button", { name: "Konfirmasi kasus" }));
  const select = screen.getByLabelText("Diagnosis untuk konfirmasi");
  expect(select).toHaveValue(""); expect(within(select).getAllByRole("option")).toHaveLength(2);
  expect(screen.getByLabelText(/Kategori kasus/)).toHaveValue("");
  expect(screen.getByLabelText("Pola resistansi obat")).toHaveValue("");
  await userEvent.click(screen.getByRole("button", { name: "Simpan konfirmasi kasus" }));
  expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
  expect(calls.some(c => c.url.endsWith("/cases") && c.options.method === "POST")).toBe(false);
  await userEvent.selectOptions(select, ids.diagnosis); await userEvent.selectOptions(screen.getByLabelText(/Kategori kasus/), "TB_SO");
  await userEvent.selectOptions(screen.getByLabelText(/Kategori pengobatan sebelumnya/), "BARU");
  await userEvent.click(screen.getByRole("button", { name: "Simpan konfirmasi kasus" }));
  await waitFor(() => expect(routing.push).toHaveBeenCalledWith(`/cases/${ids.tbCase}`));
  const call = calls.find(c => c.url.endsWith("/cases") && c.options.method === "POST")!;
  expect(new Headers(call.options.headers).get("If-Match")).toBe('"registration-server-tag"');
  expect(call.body).toMatchObject({ diagnosisId: ids.diagnosis, caseCategoryCode: "TB_SO", drugResistancePatternCode: null, previousTreatmentCategoryCode: "BARU", hivStatusCode: null, dmStatusCode: null });
  expect(call.body).not.toHaveProperty("status"); expect(call.body).not.toHaveProperty("outcome");
});
it("offers REFERRED diagnoses as confirmation choices without treating them as local treatment", async () => {
  backend(c => c.url.endsWith("/diagnoses") ? Response.json([{ ...diagnosis, treatmentDisposition: "REFERRED", referredToFacility: { ...facility, id: ids.destination } }]) : undefined);
  record("registration"); await userEvent.click(await screen.findByRole("button", { name: "Konfirmasi kasus" }));
  expect(within(screen.getByLabelText("Diagnosis untuk konfirmasi")).getAllByRole("option")).toHaveLength(2);
});
it("does not request diagnoses or offer confirmation when DIAGNOSIS_READ is absent", async () => {
  const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: officer.permissions.filter(p => p !== "DIAGNOSIS_READ") }) : undefined);
  record("registration"); await screen.findByRole("heading", { name: "Detail registrasi" });
  expect(calls.some(c => c.url.endsWith("/diagnoses"))).toBe(false);
  expect(screen.queryByRole("button", { name: "Konfirmasi kasus" })).not.toBeInTheDocument();
});
