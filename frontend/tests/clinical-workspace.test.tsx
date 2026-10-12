import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { backend, renderClinical, routing } from "./clinical-harness";
import { caseView, ids, officer } from "./clinical-fixtures";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { PatientWorklist } from "@/features/clinical-intake/components/patient-worklist";
import { PatientDetail } from "@/features/clinical-intake/components/patient-detail";
import { RegistrationDetail } from "@/features/clinical-intake/components/registration-detail";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";

vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/patients" }));
beforeEach(() => { backend(); });

it.each([
  ["patient", PatientDetail, ids.patient, "PATIENT_READ", "Bagian detail pasien", ["Identitas pasien", "Registrasi saat ini", "Kasus saat ini"]],
  ["registration", RegistrationDetail, ids.registration, "REGISTRATION_READ", "Bagian detail registrasi", ["Data registrasi", "Diagnosis registrasi", "Konfirmasi kasus"]],
  ["case", CaseDetail, ids.tbCase, "CASE_READ", "Bagian detail kasus", ["Data kasus", "Registrasi dan diagnosis konfirmasi"]],
] as const)("%s section navigation reaches named record sections without hiding clinical context", async (_kind, Component, id, permission, label, sections) => {
  renderClinical(<ClinicalBoundary permissions={[permission]}><Component id={id} /></ClinicalBoundary>);
  const nav = await screen.findByRole("navigation", { name: label });
  for (const name of sections) {
    const link = within(nav).getByRole("link", { name });
    const target = document.querySelector(link.getAttribute("href")!);
    expect(target).not.toBeNull();
    expect(within(target as HTMLElement).getByRole("region", { name })).toBeVisible();
  }
  expect(screen.getByRole("heading", { name: "Pasien Contoh" })).toBeVisible();
});

it("keeps all seven filters operable and sends their original request values", async () => {
  const calls = backend();
  renderClinical(<ClinicalBoundary permissions={["PATIENT_READ"]}><PatientWorklist /></ClinicalBoundary>);
  const panel = await screen.findByRole("region", { name: "Filter pasien" });
  await userEvent.type(within(panel).getByLabelText("Cari nama"), " Contoh ");
  await userEvent.type(within(panel).getByLabelText("Cari NIK"), "1234567890121234");
  await userEvent.type(within(panel).getByLabelText("Cari BPJS"), " 1234567894321 ");
  await userEvent.selectOptions(within(panel).getByLabelText("Status registrasi"), "DIAGNOSED");
  await userEvent.selectOptions(within(panel).getByLabelText("Status kasus"), "ACTIVE");
  await userEvent.selectOptions(within(panel).getByLabelText("Fasilitas terdaftar"), ids.facility);
  await userEvent.clear(within(panel).getByLabelText("Ukuran halaman"));
  await userEvent.type(within(panel).getByLabelText("Ukuran halaman"), "10");
  await userEvent.click(within(panel).getByRole("button", { name: "Terapkan filter" }));
  await waitFor(() => expect(calls.some(call => {
    if (!call.url.includes("/patients?")) return false;
    const params = new URL(call.url, "http://localhost").searchParams;
    return params.get("name") === "Contoh" && params.get("nik") === "1234567890121234" && params.get("bpjs") === "1234567894321" && params.get("registrationStatus") === "DIAGNOSED" && params.get("caseStatus") === "ACTIVE" && params.get("facilityId") === ids.facility && params.get("size") === "10" && params.get("page") === "0";
  })).toBe(true));
  expect(await screen.findByText("************1234")).toBeVisible();
  expect(screen.queryByText("1234567890121234")).not.toBeInTheDocument();
});

it("keeps completed case history visible and excludes prospective case actions even with write grants", async () => {
  backend(call => call.url.endsWith("/me") ? Response.json({ ...officer, permissions: [...officer.permissions, "LAB_REQUEST_WRITE", "REFERRAL_WRITE"] }) : call.url.endsWith(`/cases/${ids.tbCase}`) ? Response.json({ ...caseView, status: "COMPLETED" }, { headers: { ETag: '"completed-tag"' } }) : undefined);
  renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}><CaseDetail id={ids.tbCase} /></ClinicalBoundary>);
  expect(await screen.findByText(/Kasus selesai\. Data kasus/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Ringkasan kasus" })).toHaveAttribute("href", `/cases/${ids.tbCase}/summary`);
  expect(screen.queryByRole("button", { name: "Ubah kasus" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Buat rujukan" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Buat permintaan laboratorium" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Pasien Contoh" })).not.toBeInTheDocument();
});
