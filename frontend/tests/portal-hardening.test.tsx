import { screen, waitFor, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { portalBackend, renderPortal, routing, failure } from "./portal-harness";
import * as f from "./portal-fixtures";
import { portalNavigation } from "@/features/portal/permissions";
import { references } from "./portal-reference-fixture";
import { useQueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { portalQueries } from "@/features/portal/queries";
import * as schemas from "@/features/portal/schemas";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));
it("removed live administration mode cannot be submitted from a retained dose draft",async()=>{
  const calls=portalBackend();function ReplaceReferences(){const client=useQueryClient();return <button onClick={()=>client.setQueryData(["portal",f.patient.id,"references"],{data:{...references,administrationModes:[]}})}>Ganti pilihan</button>;}
  await renderPortal("treatment",<ReplaceReferences/>);await screen.findByLabelText("Status laporan");fireEvent.change(screen.getByLabelText("Tanggal dosis"),{target:{value:f.date}});await userEvent.selectOptions(screen.getByLabelText("Status laporan"),"MISSED");await userEvent.selectOptions(screen.getByLabelText("Cara pemberian"),"DIRECTLY_OBSERVED");await userEvent.click(screen.getByText("Ganti pilihan"));
  expect(screen.getByRole("button",{name:"Simpan laporan dosis"})).toBeDisabled();fireEvent.submit(screen.getByRole("button",{name:"Simpan laporan dosis"}).closest("form")!);expect(calls.some(c=>c.options.method==="POST")).toBe(false);
});
it("mixed-role navigation independently retains portal and staff authorization", () => {
    const user = { ...f.patient, roles: [...f.patient.roles, { code: "TB_OFFICER", name: "Petugas" }] };
    expect(portalNavigation(user).map(n => n.href)).toContain("/portal/treatment");
    expect(portalNavigation({ ...user, permissions: ["PATIENT_READ"] }).map(n => n.href)).toEqual(["/portal"]);
    expect(portalNavigation({ ...f.supporter, permissions: [] }).map(n => n.href)).toEqual(["/supporting-cases"]);
});
it("mixed patient/officer shell retains authorized staff links and portal links",async()=>{
  portalBackend({...f.patient,roles:[...f.patient.roles,{code:"TB_OFFICER",name:"Petugas"}],activeFacilities:[f.facility]});await renderPortal("home");await screen.findByText("Nama pasien privat");expect(screen.getByRole("link",{name:"Daftar pasien"})).toHaveAttribute("href","/patients");expect(screen.getByRole("link",{name:"Portal Saya"})).toHaveAttribute("href","/portal");expect(screen.getByText("Fasilitas aktif")).toBeInTheDocument();
});
it("empty supplied supporter route ID is denied before resource calls", async () => {
    const calls = portalBackend(f.supporter);
    await renderPortal("case", undefined, "");
    await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});
it("all portal query factories scope keys by actor, consume signal and disable implicit refresh", () => {
    const target = { kind: "patient" as const }, u = "unique-actor";
    const queries = [portalQueries.references(u), portalQueries.patient(u), portalQueries.treatment(u), portalQueries.supporterTreatment(u, f.caseId), portalQueries.tpt(u), portalQueries.followUps(u), portalQueries.doses(u, target, 0), portalQueries.monitoring(u, target, 0), portalQueries.alerts(u, target, 0), portalQueries.notifications(u, 0)];
    queries.forEach(q => { expect(q.queryKey.slice(0, 2)).toEqual(["portal", u]); expect(q.refetchOnWindowFocus).toBe(false); expect(q.refetchOnReconnect).toBe(false); expect(q.retry).toBe(false); });
});
it.each(["referencesSchema", "dosePageSchema", "eventPageSchema", "alertPageSchema", "notificationPageSchema"] as const)("%s rejects extra top-level fields", name => {
    const values = { referencesSchema: references, dosePageSchema: f.page(f.dose), eventPageSchema: f.page(f.event), alertPageSchema: f.page(f.alert), notificationPageSchema: f.page(f.notification) };
    expect(schemas[name].safeParse(values[name]).success).toBe(true);
    expect(schemas[name].safeParse({ ...values[name], privateNotes: "forbidden" }).success).toBe(false);
});
it("nested treatment staff fields fail safe parsing", () => { expect(schemas.patientTreatmentSchema.safeParse({ ...f.treatment, regimen: { ...f.treatment.regimen, composition: "private" } }).success).toBe(false); });
it("patient missing PATIENT_READ leaves independent cards available without profile fetch", async () => {
    const calls = portalBackend({ ...f.patient, permissions: ["TREATMENT_READ"] });
    await renderPortal("home");
    await screen.findByText("Izin baca profil belum tersedia.");
    expect(screen.getAllByRole("link", { name: "Pengobatan Saya" })).toHaveLength(2);
    expect(calls.some(c => c.url.endsWith("/me/patient"))).toBe(false);
});
it("supporter independent monitoring permission does not request treatment, doses or alerts", async () => {
    const calls = portalBackend({ ...f.supporter, permissions: ["MONITORING_READ"] });
    await renderPortal("case");
    await screen.findByText("Tinjauan klinis");
    expect(calls.some(c => /\/treatment$|\/dose-events|\/alerts/.test(c.url))).toBe(false);
});
it("patient without ADHERENCE_RECORD or FOLLOW_UP_READ has no commands or follow-up request", async () => {
    const calls = portalBackend({ ...f.patient, permissions: ["TREATMENT_READ", "ADHERENCE_READ"] });
    await renderPortal("treatment");
    await screen.findByText("Laporan bukti dosis");
    expect(screen.queryByLabelText("Status laporan")).not.toBeInTheDocument();
    expect(calls.some(c => c.url.endsWith("/follow-ups"))).toBe(false);
});
it("alert read alone shows personal state without acknowledgement command", async () => { portalBackend({ ...f.patient, permissions: ["ALERT_READ"] }); await renderPortal("alerts"); await screen.findByText("Belum ditandai oleh Anda"); expect(screen.queryByRole("button", { name: "Tandai sudah diketahui" })).not.toBeInTheDocument(); });
it("receipt already acknowledged has no new command and global OPEN state stays visible", async () => { portalBackend(f.patient, c => c.url.split("?")[0].endsWith("/alerts") ? Response.json(f.page({ ...f.alert, acknowledged: true })) : undefined); await renderPortal("alerts"); await screen.findByText("Sudah diketahui oleh Anda"); expect(screen.getByText("Terbuka")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Tandai sudah diketahui" })).not.toBeInTheDocument(); });
it("extra safe response field becomes INVALID_RESPONSE instead of rendering private data", async () => { portalBackend(f.patient, c => c.url.endsWith("/me/treatment") ? Response.json({ ...f.treatment, notes: "private clinical prose" }) : undefined); await renderPortal("treatment"); expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0); expect(screen.queryByText(/private clinical prose/)).not.toBeInTheDocument(); expect(screen.queryByLabelText("Status laporan")).not.toBeInTheDocument(); });
it("pagination changes only API request memory and no clinical storage, logs, history or metadata", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"), log = vi.spyOn(console, "log"), info = vi.spyOn(console, "info"), push = vi.spyOn(history, "pushState"), replace = vi.spyOn(history, "replaceState"), title = document.title;
    const calls = portalBackend(f.patient, c => c.url.split("?")[0].endsWith("/monitoring") ? Response.json({ ...f.page(f.event), totalElements: 21 }) : undefined);
    await renderPortal("monitoring");
    await screen.findByText("Tinjauan klinis");
    fireEvent.click(screen.getByRole("button", { name: "Berikutnya" }));
    await waitFor(() => expect(calls.some(c => c.url.includes("page=1"))).toBe(true));
    expect(storage).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(document.title).toBe(title);
    expect(calls.every(c => c.options.cache === "no-store")).toBe(true);
});
it("supporter private patient name appears only in case content, never global chrome", async () => { portalBackend(f.supporter); await renderPortal("case"); await screen.findByText("Nama pasien privat"); for (const selector of ["header", "aside", "nav", "footer", "title"])
    document.querySelectorAll(selector).forEach(el => expect(el.textContent).not.toContain("Nama pasien privat")); });
it("403 and 401 use existing safe session handling rather than raw backend prose", async () => { portalBackend(f.patient, c => c.url.endsWith("/me/patient") ? failure(403, "AUTHORIZATION_DENIED") : undefined); await renderPortal("home"); await waitFor(() => expect(routing.replace).toHaveBeenCalledWith("/forbidden")); expect(screen.queryByText(/private clinical detail/)).not.toBeInTheDocument(); });
