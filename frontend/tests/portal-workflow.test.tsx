import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { portalBackend, renderPortal, routing, failure } from "./portal-harness";
import * as f from "./portal-fixtures";
import { references } from "./portal-reference-fixture";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));
it("unlinked patient gets neutral account state and no self profile call", async () => {
    const calls = portalBackend({ ...f.patient, patientLink: null });
    await renderPortal("home");
    expect(await screen.findByText(/Akun belum terhubung/)).toBeInTheDocument();
    await waitFor(() => expect(calls.some(c => c.url.endsWith("/me/patient"))).toBe(false));
});
it.each(["home", "treatment", "tpt", "monitoring", "alerts", "notifications", "supporters", "case"] as const)("staff-only artificial portal grants cannot mount %s resource queries", async (page) => {
    const calls = portalBackend({ ...f.patient, roles: [{ code: "TB_OFFICER", name: "Petugas" }] });
    await renderPortal(page);
    expect(await screen.findByRole("heading", { name: "Akses tidak diizinkan" })).toBeInTheDocument();
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});
it.each(["treatment", "tpt", "monitoring", "alerts"] as const)("unlinked patient suppresses %s resource calls", async (page) => {
    const calls = portalBackend({ ...f.patient, patientLink: null });
    await renderPortal(page);
    await screen.findByRole("heading", { name: "Akun belum terhubung" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});
it.each(["treatment", "tpt", "monitoring", "alerts", "notifications"] as const)("missing independent permission denies patient %s route", async (page) => {
    const calls = portalBackend({ ...f.patient, permissions: [] });
    await renderPortal(page);
    await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});
it("unlinked supporter route ID is rejected before any resource request", async () => {
    const calls = portalBackend(f.supporter);
    await renderPortal("case", undefined, f.id);
    await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});
it("empty supporter case list is normal and makes no enrichment requests", async () => {
    const calls = portalBackend({ ...f.supporter, supporterCaseIds: [] });
    await renderPortal("supporters");
    await screen.findByText("Belum ada kasus pendampingan yang terhubung.");
    expect(calls.filter(c => !c.url.endsWith("/me"))).toHaveLength(0);
});
it("linked supporter card remains when safe treatment returns 404", async () => {
    const calls = portalBackend(f.supporter, c => c.url.endsWith("/treatment") ? failure(404, "RESOURCE_NOT_FOUND") : undefined);
    await renderPortal("supporters");
    await screen.findByText("Belum ada catatan pengobatan untuk pendampingan ini.");
    expect(screen.getByRole("link", { name: "Buka pendampingan 1" })).toHaveAttribute("href", `/supporting-cases/${f.caseId}`);
    expect(calls.every(c => c.url.includes("/v1/me"))).toBe(true);
    expect(routing.replace).not.toHaveBeenCalledWith("/forbidden");
});
it.each(["treatment", "tpt"] as const)("patient %s 404 is a neutral empty state", async (page) => {
    portalBackend(f.patient, c => c.url.endsWith(`/me/${page}`) ? failure(404, "RESOURCE_NOT_FOUND") : undefined);
    await renderPortal(page);
    await screen.findByText(page === "tpt" ? "Belum ada catatan TPT." : "Belum ada catatan pengobatan.");
    expect(routing.replace).not.toHaveBeenCalledWith("/forbidden");
});
it("TPT ambiguity gives safe conflict guidance without choosing an episode", async () => {
    const calls = portalBackend(f.patient, c => c.url.endsWith("/tpt") ? failure(409, "ACTIVE_TPT_AMBIGUOUS") : undefined);
    await renderPortal("tpt");
    await screen.findByText(/Terdapat lebih dari satu catatan TPT aktif/);
    expect(screen.queryByText(/private clinical/)).not.toBeInTheDocument();
    expect(calls.every(c => c.options.method === "GET")).toBe(true);
});
it.each(["patient", "supporter"] as const)("%s dose form uses live actor choices and explicit no-default payload without ETag", async (actor) => {
    const calls = portalBackend(actor === "patient" ? f.patient : f.supporter, c => c.url.endsWith("/portal-reference-data") ? Response.json({ ...references, patientDoseStatuses: references.patientDoseStatuses.map(o => ({ ...o, name: `Live ${o.code}` })), supporterDoseStatuses: references.supporterDoseStatuses.map(o => ({ ...o, name: `Live ${o.code}` })) }) : undefined);
    await renderPortal(actor === "patient" ? "treatment" : "case");
    const status = await screen.findByLabelText("Status laporan");
    expect(status).toHaveValue("");
    expect(screen.getByLabelText("Tanggal dosis")).toHaveValue("");
    expect(within(status).queryByRole("option", { name: "Live DISPENSED_HOME" })).not.toBeInTheDocument();
    if (actor === "patient")
        expect(within(status).queryByRole("option", { name: "Live TAKEN_OBSERVED" })).not.toBeInTheDocument();
    else
        expect(within(status).getByRole("option", { name: "Live TAKEN_OBSERVED" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan laporan dosis" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tanggal dosis"), { target: { value: f.date } });
    await userEvent.selectOptions(status, actor === "patient" ? "TAKEN_SELF_REPORTED" : "TAKEN_OBSERVED");
    await userEvent.selectOptions(screen.getByLabelText("Cara pemberian"), "DIRECTLY_OBSERVED");
    await userEvent.type(screen.getByLabelText("Catatan dosis"), "Laporan eksplisit");
    await userEvent.click(screen.getByRole("button", { name: "Simpan laporan dosis" }));
    await screen.findByText("Laporan dosis tersimpan.");
    const post = calls.find(c => c.options.method === "POST")!;
    expect(post.url).toBe(actor === "patient" ? "/api/tbcall/v1/me/treatment/dose-events" : `/api/tbcall/v1/me/supporting-cases/${f.caseId}/dose-events`);
    expect(post.body).toEqual({ scheduledDate: f.date, status: actor === "patient" ? "TAKEN_SELF_REPORTED" : "TAKEN_OBSERVED", administrationMode: "DIRECTLY_OBSERVED", notes: "Laporan eksplisit" });
    expect(new Headers(post.options.headers).has("If-Match")).toBe(false);
    expect(status).toHaveValue("");
    expect(screen.getByLabelText("Catatan dosis")).toHaveValue("");
    expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
});
it.each(["PLANNED", "PAUSED", "TRANSFERRED", "COMPLETED", "STOPPED", "CANCELLED"])("patient %s treatment cannot expose a dose command", async (status) => {
    portalBackend(f.patient, c => c.url.endsWith("/me/treatment") ? Response.json({ ...f.treatment, status }) : undefined);
    await renderPortal("treatment");
    await screen.findByText("Laporan dosis tersedia hanya untuk pengobatan aktif yang dapat ditampilkan.");
    expect(screen.queryByLabelText("Status laporan")).not.toBeInTheDocument();
});
it.each([400, 403, 409, 503])("failed dose %s preserves draft and never replays", async (status) => {
    const calls = portalBackend(f.patient, c => c.options.method === "POST" ? failure(status, status === 403 ? "CSRF_INVALID" : "TREATMENT_STATE_CONFLICT") : undefined);
    await renderPortal("treatment");
    await screen.findByLabelText("Status laporan");
    fireEvent.change(screen.getByLabelText("Tanggal dosis"), { target: { value: f.date } });
    await userEvent.selectOptions(screen.getByLabelText("Status laporan"), "MISSED");
    await userEvent.type(screen.getByLabelText("Catatan dosis"), "Simpan draf");
    await userEvent.click(screen.getByRole("button", { name: "Simpan laporan dosis" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Simpan laporan dosis" })).toBeEnabled());
    expect(screen.getByLabelText("Catatan dosis")).toHaveValue("Simpan draf");
    expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
    expect(screen.queryByText(/private clinical/)).not.toBeInTheDocument();
});
it.each(["patient", "supporter"] as const)("%s acknowledgement records a personal receipt without ETag or staff transition", async (actor) => {
    const calls = portalBackend(actor === "patient" ? f.patient : f.supporter);
    await renderPortal(actor === "patient" ? "alerts" : "case");
    await userEvent.click(await screen.findByRole("button", { name: "Tandai sudah diketahui" }));
    await screen.findByText("Peringatan telah ditandai sudah diketahui oleh Anda.");
    const post = calls.find(c => c.options.method === "POST")!;
    expect(post.url).toContain(actor === "patient" ? "/me/alerts/" : `/me/supporting-cases/${f.caseId}/alerts/`);
    expect(post.body).toEqual({});
    expect(new Headers(post.options.headers).has("If-Match")).toBe(false);
    expect(post.url).toContain("/acknowledge");
});
it.each(["patient", "supporter"] as const)("%s notifications read obtains authoritative detail ETag rather than list version", async (actor) => {
    const calls = portalBackend(actor === "patient" ? f.patient : f.supporter);
    await renderPortal("notifications");
    await userEvent.click(await screen.findByRole("button", { name: "Tandai notifikasi 1 dibaca" }));
    await screen.findByText("Notifikasi ditandai dibaca.");
    const post = calls.find(c => c.options.method === "POST")!;
    expect(new Headers(post.options.headers).get("If-Match")).toBe('"authoritative-detail"');
    expect(new Headers(post.options.headers).get("If-Match")).not.toBe('"91"');
    expect(calls.some(c => c.options.method === "GET" && c.url.endsWith(`/notifications/${f.id}`))).toBe(true);
    expect(document.querySelector(`a[href="/alerts/${f.id}"]`)).not.toBeInTheDocument();
});
it.each(["READ", "PENDING", "FAILED", "CANCELLED"])("notification %s is read-only", async (status) => {
    const calls = portalBackend(f.patient, c => c.url.split("?")[0].endsWith("/notifications") ? Response.json(f.page({ ...f.notification, status })) : undefined);
    await renderPortal("notifications");
    await screen.findByText(references.notificationStatuses.find(o => o.code === status)!.name);
    expect(screen.queryByRole("button", { name: /Tandai notifikasi/ })).not.toBeInTheDocument();
    expect(calls.every(c => c.options.method === "GET")).toBe(true);
});
it.each(["missing-etag", "READ", "SMS"])("notification detail %s blocks POST instead of inventing a precondition", async (changed) => {
    const calls = portalBackend(f.patient, c => c.url.endsWith(`/notifications/${f.id}`) ? Response.json({ ...f.notification, ...(changed === "READ" ? { status: "READ" } : changed === "SMS" ? { channel: "SMS" } : {}) }, { headers: changed === "missing-etag" ? {} : { ETag: '"detail"' } }) : undefined);
    await renderPortal("notifications");
    await userEvent.click(await screen.findByRole("button", { name: "Tandai notifikasi 1 dibaca" }));
    await screen.findByRole("alert");
    expect(calls.filter(c => c.options.method === "POST")).toHaveLength(0);
});
it.each(["tpt", "monitoring"] as const)("%s is read-only and never requests staff APIs", async (page) => {
    const calls = portalBackend();
    await renderPortal(page);
    await screen.findByText(page === "tpt" ? "TPT tercatat" : "Tinjauan klinis");
    expect(calls.every(c => c.options.method === "GET" && c.url.includes("/v1/me"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Simpan|Buat|Ubah|Selesai/ })).not.toBeInTheDocument();
});
it("linked supporter treatment remains safe and raw counts never claim an adherence score", async () => {
    portalBackend(f.supporter);
    await renderPortal("case");
    expect(await screen.findByText("Nama pasien privat")).toBeInTheDocument();
    expect(screen.getByText("Jumlah laporan bukti dosis, bukan skor kepatuhan.")).toBeInTheDocument();
});
