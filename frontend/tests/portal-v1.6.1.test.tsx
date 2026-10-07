import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { portalNavigation } from "@/features/portal/permissions";
import { localToday } from "@/features/portal/local-date";
import { portalBackend, renderPortal, routing } from "./portal-harness";
import * as f from "./portal-fixtures";
import { references } from "./portal-reference-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));

const workspacePermissions = ["TREATMENT_READ", "ADHERENCE_READ", "ADHERENCE_RECORD", "MONITORING_READ", "ALERT_READ"];

it.each(["patient", "supporter"] as const)("%s uses changed live dose and administration options without local code filters", async actor => {
    const option = { code: "LIVE_DOSE_OPTION", name: "Pilihan dosis dari server" };
    const mode = { code: "LIVE_ADMIN_OPTION", name: "Cara dari server" };
    const calls = portalBackend(actor === "patient" ? f.patient : f.supporter, c => c.url.endsWith("/portal-reference-data") ? Response.json({
        ...references,
        patientDoseStatuses: actor === "patient" ? [option] : references.patientDoseStatuses,
        supporterDoseStatuses: actor === "supporter" ? [option] : references.supporterDoseStatuses,
        administrationModes: [mode],
    }) : undefined);
    await renderPortal(actor === "patient" ? "treatment" : "case");
    const status = await screen.findByLabelText("Status laporan");
    expect(within(status).getByRole("option", { name: option.name })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Cara pemberian")).getByRole("option", { name: mode.name })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tanggal dosis"), { target: { value: f.date } });
    await userEvent.selectOptions(status, option.code);
    await userEvent.selectOptions(screen.getByLabelText("Cara pemberian"), mode.code);
    await userEvent.click(screen.getByRole("button", { name: "Simpan laporan dosis" }));
    await screen.findByText("Laporan dosis tersimpan.");
    expect(calls.filter(c => c.options.method === "POST").map(c => c.body)).toEqual([
        { scheduledDate: f.date, status: option.code, administrationMode: mode.code },
    ]);
});

it.each([[], ["NOTIFICATION_READ_SELF"], ["ALERT_ACKNOWLEDGE"]].map(permissions => ({ permissions })))("supporter with only $permissions cannot navigate to the case workspace", ({ permissions }) => {
    const links = portalNavigation({ ...f.supporter, permissions }).map(n => n.href);
    expect(links).not.toContain("/supporting-cases");
    expect(links).toEqual(permissions.includes("NOTIFICATION_READ_SELF") ? ["/portal/notifications"] : []);
});

it.each(["supporters", "case"] as const)("notification-only supporter direct %s route is denied without resource queries", async page => {
    const calls = portalBackend({ ...f.supporter, permissions: ["NOTIFICATION_READ_SELF"] });
    await renderPortal(page);
    await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});

it.each(["supporters", "case"] as const)("acknowledgement-only supporter direct %s route is denied", async page => {
    const calls = portalBackend({ ...f.supporter, permissions: ["ALERT_ACKNOWLEDGE"] });
    await renderPortal(page);
    await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});

it("notification-only supporter retains the notification route", async () => {
    const calls = portalBackend({ ...f.supporter, permissions: ["NOTIFICATION_READ_SELF"] });
    await renderPortal("notifications");
    await screen.findByText("Terkirim");
    expect(calls.some(c => c.url.split("?")[0].endsWith("/me/notifications"))).toBe(true);
    expect(screen.queryByRole("link", { name: "Pendampingan" })).not.toBeInTheDocument();
    expect(calls.some(c => c.url.includes("/supporting-cases/"))).toBe(false);
});

it.each(workspacePermissions)("%s alone allows supporter navigation and linked workspace routes", async permission => {
    const user = { ...f.supporter, permissions: [permission] };
    expect(portalNavigation(user).map(n => n.href)).toEqual(["/supporting-cases"]);
    portalBackend(user);
    const list = await renderPortal("supporters");
    await screen.findByRole("link", { name: "Buka pendampingan 1" });
    list.unmount();
    await renderPortal("case");
    await screen.findByRole("heading", { name: "Pendampingan kasus" });
    expect(screen.queryByRole("heading", { name: "Akses tidak diizinkan" })).not.toBeInTheDocument();
});

it.each(workspacePermissions)("%s does not bypass the supporter role or detail case-ID allowlist", async permission => {
    expect(portalNavigation({ ...f.patient, permissions: [permission] }).map(n => n.href)).not.toContain("/supporting-cases");
    const calls = portalBackend({ ...f.supporter, permissions: [permission], supporterCaseIds: [] });
    await renderPortal("case");
    await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});

function localCalendar(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

it.each(["patient", "supporter"] as const)("%s dose input has browser-local today as max", async actor => {
    portalBackend(actor === "patient" ? f.patient : f.supporter);
    await renderPortal(actor === "patient" ? "treatment" : "case");
    const input = await screen.findByLabelText("Tanggal dosis");
    expect(input).toHaveAttribute("max", localCalendar(new Date()));
    expect(input).toHaveValue("");
});

it.each(["patient", "supporter"] as const)("%s future dose submit sends no POST, preserves draft and accepts corrected today", async actor => {
    const calls = portalBackend(actor === "patient" ? f.patient : f.supporter);
    await renderPortal(actor === "patient" ? "treatment" : "case");
    const input = await screen.findByLabelText("Tanggal dosis");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const future = localCalendar(tomorrow);
    fireEvent.change(input, { target: { value: future } });
    await userEvent.selectOptions(screen.getByLabelText("Status laporan"), "MISSED");
    await userEvent.selectOptions(screen.getByLabelText("Cara pemberian"), "OTHER");
    fireEvent.change(screen.getByLabelText("Catatan dosis"), { target: { value: "Draft tetap ada" } });
    const form = screen.getByRole("button", { name: "Simpan laporan dosis" }).closest("form")!;
    // Bypass HTML date validity to prove the pre-POST guard independently.
    fireEvent.submit(form);
    expect(await screen.findByText("Tanggal dosis tidak boleh setelah hari ini.")).toHaveAttribute("role", "alert");
    expect(calls.filter(c => c.options.method === "POST")).toHaveLength(0);
    expect(input).toHaveValue(future);
    expect(screen.getByLabelText("Status laporan")).toHaveValue("MISSED");
    expect(screen.getByLabelText("Cara pemberian")).toHaveValue("OTHER");
    expect(screen.getByLabelText("Catatan dosis")).toHaveValue("Draft tetap ada");
    fireEvent.change(input, { target: { value: localCalendar(new Date()) } });
    fireEvent.submit(form);
    await screen.findByText("Laporan dosis tersimpan.");
    expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
});

it("local-date helper uses local calendar fields across midnight/year boundaries, never UTC slicing", async () => {
    const utc = vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => { throw new Error("UTC conversion is forbidden"); });
    expect(localToday(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
    expect(localToday()).toBe(localCalendar(new Date()));
    expect(utc).not.toHaveBeenCalled();
});
