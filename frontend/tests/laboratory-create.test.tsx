import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ids, registration, caseView } from "./clinical-fixtures";
import { labOfficer, labDetail, labStaff } from "./laboratory-fixtures";
import { labBackend, renderLab, routing } from "./laboratory-harness";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { RegistrationDetail } from "@/features/clinical-intake/components/registration-detail";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";
import { renderClinical } from "./clinical-harness";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/laboratory/requests/new" }));
beforeEach(() => { routing.push.mockReset(); labBackend(); });
it.each(["REGISTRATION", "CASE"] as const)("contextual %s creates exactly one owner/reason with explicit facility and live test types", async ownerType => {
  const calls = labBackend(); await renderLab("create", { ownerType, id: ownerType === "CASE" ? ids.tbCase : ids.registration });
  const facility = await screen.findByLabelText(/Fasilitas pemeriksa/); expect(facility).toHaveValue("");
  expect(screen.getByText(ownerType === "CASE" ? "Tindak lanjut langsung" : "Diagnosis langsung")).toBeInTheDocument();
  await userEvent.selectOptions(facility, ids.facility);
  await userEvent.click(screen.getByLabelText("Molekuler langsung"));
  await userEvent.type(screen.getByLabelText("Nama kurir"), "Kurir form");
  await userEvent.click(screen.getByRole("button", { name: "Simpan permintaan" }));
  await waitFor(() => expect(routing.push).toHaveBeenCalledWith(`/laboratory/requests/${labDetail.id}`));
  const call = calls.find(c => c.options.method === "POST")!;
  expect(call.body).toEqual({ ...(ownerType === "CASE" ? { caseId: ids.tbCase } : { registrationId: ids.registration }), requestReasonCode: ownerType === "CASE" ? "FOLLOW_UP" : "DIAGNOSIS", testingFacilityId: ids.facility, testTypeCodes: ["TCM"], sampleShippingMethod: null, courierName: "Kurir form", notes: null });
  expect(new Headers(call.options.headers).has("If-Match")).toBe(false);
});
it("required owner-read permission is never replaced by source write permission", async () => {
  const calls = labBackend(undefined, { ...labOfficer, permissions: labOfficer.permissions.filter(p => p !== "REGISTRATION_READ") });
  await renderLab("create", { ownerType: "REGISTRATION", id: ids.registration });
  await screen.findByText(/Izin membaca pemilik/);
  expect(calls.some(c => c.url.includes(`/registrations/${ids.registration}`))).toBe(false);
});
it("LAB_STAFF cannot create a request even with an artificial source write grant", async () => {
  const calls = labBackend(undefined, { ...labStaff, permissions: [...labStaff.permissions, "LAB_REQUEST_WRITE"] });
  await renderLab("create", { ownerType: "REGISTRATION", id: ids.registration }); await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
  expect(calls.every(c => c.url.endsWith("/me"))).toBe(true);
});
it.each(["CONVERTED_TO_CASE", "CLOSED", "CANCELLED"])("registration state %s cannot create a request", async status => {
  const calls = labBackend(c => c.url.endsWith(`/registrations/${ids.registration}`) ? Response.json({ ...registration, status }) : undefined);
  await renderLab("create", { ownerType: "REGISTRATION", id: ids.registration }); await screen.findByText(/Pemilik tidak tersedia untuk permintaan/);
  expect(calls.some(c => c.options.method === "POST")).toBe(false);
});
it("an inactive case cannot create a request", async () => {
  labBackend(c => c.url.endsWith(`/cases/${ids.tbCase}`) ? Response.json({ ...caseView, status: "COMPLETED" }) : undefined);
  await renderLab("create", { ownerType: "CASE", id: ids.tbCase }); await screen.findByText(/Pemilik tidak tersedia untuk permintaan/);
});
it("testing directory requires PATIENT_READ while owner and assigned choices remain explicit", async () => {
  const calls = labBackend(undefined, { ...labOfficer, permissions: labOfficer.permissions.filter(p => p !== "PATIENT_READ") });
  await renderLab("create", { ownerType: "REGISTRATION", id: ids.registration }); await screen.findByLabelText(/Fasilitas pemeriksa/);
  expect(screen.queryByLabelText("Cari fasilitas pemeriksa")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Fasilitas pemeriksa/)).toHaveValue("");
  expect(calls.some(c => c.url.includes("clinical-facilities"))).toBe(false);
});
it("testing directory debounces two characters and permits an explicit external active choice", async () => {
  const calls = labBackend(); await renderLab("create", { ownerType: "REGISTRATION", id: ids.registration });
  await userEvent.type(await screen.findByLabelText("Cari fasilitas pemeriksa"), "F");
  await new Promise(resolve => setTimeout(resolve, 400)); expect(calls.some(c => c.url.includes("clinical-facilities"))).toBe(false);
  await userEvent.type(screen.getByLabelText("Cari fasilitas pemeriksa"), "a");
  await userEvent.click(await screen.findByRole("button", { name: "Pilih Rumah Sakit Tujuan" }));
  expect(screen.getByLabelText(/Fasilitas pemeriksa/)).toHaveValue(ids.destination);
});
it("missing active required reason prevents creation instead of hard-coding its label", async () => {
  const { labReferences } = await import("./laboratory-fixtures");
  labBackend(c => c.url.endsWith("laboratory-reference-data") ? Response.json({ ...labReferences, requestReasons: [] }) : undefined);
  await renderLab("create", { ownerType: "REGISTRATION", id: ids.registration }); await screen.findByText(/Alasan permintaan aktif belum tersedia/);
  expect(screen.getByRole("button", { name: "Simpan permintaan" })).toBeDisabled();
});
it.each(["registration", "case"])("F2A %s exposes only a plain contextual source-action link", async kind => {
  labBackend(); renderClinical(<ClinicalBoundary permissions={[kind === "case" ? "CASE_READ" : "REGISTRATION_READ"]}>{kind === "case" ? <CaseDetail id={ids.tbCase} /> : <RegistrationDetail id={ids.registration} />}</ClinicalBoundary>);
  expect(await screen.findByRole("link", { name: "Buat permintaan laboratorium" })).toHaveAttribute("href", `/laboratory/requests/new/${kind}/${kind === "case" ? ids.tbCase : ids.registration}`);
});
