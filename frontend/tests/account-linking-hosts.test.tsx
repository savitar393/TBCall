import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PatientDetail } from "@/features/clinical-intake/components/patient-detail";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";
import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { backend, renderClinical } from "./clinical-harness";
import { ids, officer } from "./clinical-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/patients" }));
it("adds independently authorized patient account linking inside the existing detail", async () => {
    backend(call => call.url.endsWith("/me") ? Response.json({ ...officer, permissions: [...officer.permissions, "PATIENT_LINK_VERIFY"] }) : call.url.endsWith("/account-link") ? Response.json({ link: null }) : undefined);
    renderClinical(<ClinicalBoundary permissions={["PATIENT_READ"]}>
    <PatientDetail id={ids.patient}/>
    </ClinicalBoundary>);
    expect(await screen.findByRole("heading", { name: "Akun pasien" })).toBeInTheDocument();
});
it("adds independently authorized case supporters inside the existing detail", async () => {
    backend(call => call.url.endsWith("/me") ? Response.json({ ...officer, permissions: [...officer.permissions, "SUPPORTER_LINK_MANAGE"] }) : call.url.includes("/supporters?") ? Response.json({ content: [], page: 0, size: 20, totalElements: 0 }) : undefined);
    renderClinical(<ClinicalBoundary permissions={["CASE_READ"]}>
    <CaseDetail id={ids.tbCase}/>
    </ClinicalBoundary>);
    expect(await screen.findByRole("heading", { name: "Pendamping kasus" })).toBeInTheDocument();
});
it.each(["patient", "case"])("%s host read grant does not imply linking grant", async (kind) => {
    const calls = backend();
    renderClinical(<ClinicalBoundary permissions={[kind === "patient" ? "PATIENT_READ" : "CASE_READ"]}>{kind === "patient" ? <PatientDetail id={ids.patient}/> : <CaseDetail id={ids.tbCase}/>}</ClinicalBoundary>);
    await screen.findByRole("heading", { name: kind === "patient" ? "Detail pasien" : "Detail kasus" });
    expect(screen.queryByRole("heading", { name: kind === "patient" ? "Akun pasien" : "Pendamping kasus" })).not.toBeInTheDocument();
    expect(calls.some(c => c.url.includes("/account-link") || c.url.includes("/supporters"))).toBe(false);
});
it.each(["patient", "case"])("%s linking grant does not bypass host read grant", async (kind) => {
    const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, permissions: ["PATIENT_LINK_VERIFY", "SUPPORTER_LINK_MANAGE"] }) : undefined);
    renderClinical(<ClinicalBoundary permissions={[kind === "patient" ? "PATIENT_READ" : "CASE_READ"]}>{kind === "patient" ? <PatientDetail id={ids.patient}/> : <CaseDetail id={ids.tbCase}/>}</ClinicalBoundary>);
    await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});
it.each(["SYSTEM_ADMIN", "FACILITY_ADMIN", "PATIENT", "TREATMENT_SUPPORTER", "LAB_STAFF", "PROGRAM_MONITOR"])("wrong role %s with synthetic grants never mounts clinical linking", async (role) => {
    const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, roles: [{ code: role, name: role }], permissions: ["PATIENT_READ", "CASE_READ", "PATIENT_LINK_VERIFY", "SUPPORTER_LINK_MANAGE"] }) : undefined);
    renderClinical(<ClinicalBoundary permissions={["PATIENT_READ"]}>
    <PatientDetail id={ids.patient}/>
    </ClinicalBoundary>);
    await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});
it("mixed officer/admin still requires each exact linking permission", async () => {
    const calls = backend(c => c.url.endsWith("/me") ? Response.json({ ...officer, roles: [...officer.roles, { code: "SYSTEM_ADMIN", name: "Admin" }], permissions: [...officer.permissions, "SUPPORTER_LINK_MANAGE"] }) : undefined);
    renderClinical(<ClinicalBoundary permissions={["PATIENT_READ"]}>
    <PatientDetail id={ids.patient}/>
    </ClinicalBoundary>);
    await screen.findByRole("heading", { name: "Detail pasien" });
    expect(screen.queryByRole("heading", { name: "Akun pasien" })).not.toBeInTheDocument();
    expect(calls.some(c => c.url.includes("/account-link"))).toBe(false);
});
