import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ME_QUERY_KEY } from "@/lib/auth/session";
import type { Me } from "@/lib/auth/types";
import * as f from "./account-linking-fixtures";
import { backend, renderLinking, selectSupporter, acknowledge, tagged, client, failure, type Call } from "./account-linking-harness";
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/patients" }));
const changes = {
    account: { ...f.actor, id: "other-actor" },
    roles: { ...f.actor, roles: [...f.actor.roles, { code: "PROGRAM_MONITOR", name: "Monitor" }] },
    permissions: { ...f.actor, permissions: [...f.actor.permissions, "EXTRA"] },
    facilities: { ...f.actor, activeFacilities: [{ id: f.ids.destination, name: "Other facility" }] },
} satisfies Record<string, Me>;
type Operation = "patient resolve" | "patient link" | "patient revoke" | "supporter resolve" | "supporter link" | "supporter unlink" | "supporter create";
const operations: Operation[] = ["patient resolve", "patient link", "patient revoke", "supporter resolve", "supporter link", "supporter unlink", "supporter create"];
function isCommand(operation: Operation, c: Call) {
    if (operation.endsWith("resolve"))
        return c.url.endsWith("/resolve-user");
    if (operation === "supporter create")
        return c.url.endsWith("/supporters") && c.options.method === "POST";
    if (operation === "patient revoke")
        return c.options.method === "DELETE";
    return c.url.endsWith("/account-link") && c.options.method === (operation.endsWith("unlink") ? "DELETE" : "POST");
}
async function start(operation: Operation) {
    if (operation.endsWith("resolve")) {
        fireEvent.change(await screen.findByLabelText("Email atau telepon login terverifikasi (persis)"), { target: { value: "exact@example.test" } });
        fireEvent.click(screen.getByRole("button", { name: "Cari akun terverifikasi" }));
        return;
    }
    if (operation === "supporter create") {
        fireEvent.click(await screen.findByRole("button", { name: "Tambah pendamping" }));
        fireEvent.change(screen.getByLabelText("Nama pendamping"), { target: { value: "PRIVATE DRAFT" } });
        fireEvent.click(screen.getByRole("button", { name: "Simpan pendamping" }));
        return;
    }
    const patient = operation.startsWith("patient"), unlink = operation.endsWith("unlink") || operation.endsWith("revoke");
    if (!unlink)
        await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: patient ? unlink ? "Cabut tautan pasien" : "Periksa tautan pasien" : unlink ? "Lepas akun pendamping" : "Periksa tautan pendamping" }));
    fireEvent.click(await screen.findByRole("button", { name: patient ? unlink ? "Konfirmasi cabut tautan pasien" : "Konfirmasi tautkan akun pasien" : unlink ? "Konfirmasi lepas akun pendamping" : "Konfirmasi tautkan akun pendamping" }));
}
for (const operation of operations)
    for (const [change, next] of Object.entries(changes)) {
        it(`${operation} suppresses late completion after ${change} context change`, async () => {
            let complete!: (r: Response) => void, armed = false;
            const { calls, state } = backend(f.actor, c => armed && isCommand(operation, c) ? new Promise<Response>(r => { complete = r; }) : undefined);
            if (operation === "patient revoke")
                state.patient = f.patientState;
            if (operation === "supporter unlink")
                state.supporter = { ...f.detail, linkedUser: { userId: f.userId, ...f.maskedAccount } };
            await renderLinking(operation.startsWith("patient") ? "patient" : "supporter");
            if (operation.startsWith("supporter") && operation !== "supporter create")
                await selectSupporter();
            if (operation === "patient revoke")
                await screen.findByRole("button", { name: "Cabut tautan pasien" });
            armed = true;
            await start(operation);
            await waitFor(() => expect(complete).toBeDefined());
            const oldCommand = calls.findLast(c => isCommand(operation, c))!, oldKeys = client.getQueryCache().getAll().filter(q => q.queryKey[0] === "account-linking").map(q => JSON.stringify(q.queryKey));
            await act(async () => { client.setQueryData(ME_QUERY_KEY, next); });
            // React Query schedules observer notifications; await the new-context render.
            await waitFor(() => expect(screen.queryByText(/Akun tujuan:/)).not.toBeInTheDocument());
            await act(async () => { complete(tagged(operation.endsWith("resolve") ? f.candidate : operation === "supporter create" ? f.detail : operation.startsWith("patient") ? f.patientResponse : f.supporterResponse)); });
            expect(oldCommand.options.signal?.aborted).toBe(true);
            expect(screen.queryByText(/tersimpan\.|dicabut\.|dilepas\.|Akun tujuan:/)).not.toBeInTheDocument();
            expect(screen.queryByDisplayValue("PRIVATE DRAFT")).not.toBeInTheDocument();
            expect(screen.queryByDisplayValue("exact@example.test")).not.toBeInTheDocument();
            expect(client.getMutationCache().getAll()).toHaveLength(0);
            expect(routing.replace).not.toHaveBeenCalled();
            await waitFor(() => expect(client.getQueryCache().getAll().filter(q => q.queryKey[0] === "account-linking" && oldKeys.includes(JSON.stringify(q.queryKey)) && q.state.data !== undefined)).toHaveLength(0));
        });
    }
for (const operation of operations)
    it(`${operation} suppresses old-scope forbidden error and navigation`, async () => {
        let complete!: (r: Response) => void, armed = false;
        const { state } = backend(f.actor, c => armed && isCommand(operation, c) ? new Promise<Response>(r => { complete = r; }) : undefined);
        if (operation === "patient revoke")
            state.patient = f.patientState;
        if (operation === "supporter unlink")
            state.supporter = { ...f.detail, linkedUser: { userId: f.userId, ...f.maskedAccount } };
        await renderLinking(operation.startsWith("patient") ? "patient" : "supporter");
        if (operation.startsWith("supporter") && operation !== "supporter create")
            await selectSupporter();
        if (operation === "patient revoke")
            await screen.findByRole("button", { name: "Cabut tautan pasien" });
        armed = true;
        await start(operation);
        await waitFor(() => expect(complete).toBeDefined());
        await act(async () => { client.setQueryData(ME_QUERY_KEY, changes.facilities); });
        await act(async () => { complete(failure(403, "ACCESS_DENIED")); });
        expect(screen.queryByText(/Akun Anda tidak memiliki akses/)).not.toBeInTheDocument();
        expect(routing.replace).not.toHaveBeenCalled();
    });
it("supporter selection change aborts old resolver and suppresses candidate", async () => {
    let complete!: (r: Response) => void;
    const second = { ...f.detail, id: f.ids.destination, fullName: "Pendamping Kedua" };
    const { calls, state } = backend(f.actor, c => c.url.endsWith("/resolve-user") ? new Promise<Response>(r => { complete = r; }) : c.url.endsWith(`/supporters/${f.ids.destination}`) ? tagged(second) : undefined);
    state.page = { ...f.page, content: [f.summary, { ...f.summary, id: second.id, fullName: second.fullName }], totalElements: 2 };
    await renderLinking("supporter");
    await selectSupporter();
    await start("supporter resolve");
    await waitFor(() => expect(complete).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Buka pendamping Pendamping Kedua" }));
    await screen.findByText("Pendamping Kedua · PMO");
    await act(async () => { complete(Response.json(f.candidate)); });
    expect(screen.queryByText(/Akun tujuan:/)).not.toBeInTheDocument();
    expect(calls.find(c => c.url.endsWith("/resolve-user"))!.options.signal?.aborted).toBe(true);
});
for (const operation of operations)
    it(`${operation} route change aborts old command without old-context effects`, async () => {
        let complete!: (r: Response) => void, armed = false;
        const { calls, state } = backend(f.actor, c => armed && isCommand(operation, c) ? new Promise<Response>(r => { complete = r; }) : c.options.method === "GET" && c.url.includes(f.ids.destination) ? c.url.includes("/patients/") ? Response.json({ link: null }) : Response.json({ ...f.page, content: [] }) : undefined);
        if (operation === "patient revoke")
            state.patient = f.patientState;
        if (operation === "supporter unlink")
            state.supporter = { ...f.detail, linkedUser: { userId: f.userId, ...f.maskedAccount } };
        const view = await renderLinking(operation.startsWith("patient") ? "patient" : "supporter");
        if (operation.startsWith("supporter") && operation !== "supporter create")
            await selectSupporter();
        if (operation === "patient revoke")
            await screen.findByRole("button", { name: "Cabut tautan pasien" });
        armed = true;
        await start(operation);
        await waitFor(() => expect(complete).toBeDefined());
        view.navigate(f.ids.destination);
        await act(async () => { complete(tagged(operation.endsWith("resolve") ? f.candidate : operation === "supporter create" ? f.detail : operation.startsWith("patient") ? f.patientResponse : f.supporterResponse)); });
        expect(calls.findLast(c => isCommand(operation, c))!.options.signal?.aborted).toBe(true);
        expect(screen.queryByText(/tersimpan\.|dicabut\.|dilepas\.|Akun tujuan:/)).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
it("selection change aborts supporter link after it was explicitly submitted", async () => {
    let complete!: (r: Response) => void;
    const { calls, state } = backend(f.actor, c => c.url.endsWith("/account-link") && c.options.method === "POST" ? new Promise<Response>(r => { complete = r; }) : c.url.endsWith(`/supporters/${f.ids.destination}`) ? tagged({ ...f.detail, id: f.ids.destination, fullName: "Pendamping Kedua" }) : undefined);
    state.page = { ...f.page, content: [f.summary, { ...f.summary, id: f.ids.destination, fullName: "Pendamping Kedua" }], totalElements: 2 };
    await renderLinking("supporter");
    await selectSupporter();
    await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Periksa tautan pendamping" }));
    fireEvent.click(await screen.findByRole("button", { name: "Konfirmasi tautkan akun pendamping" }));
    await waitFor(() => expect(complete).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Buka pendamping Pendamping Kedua" }));
    await screen.findByText("Pendamping Kedua · PMO");
    await act(async () => { complete(tagged(f.supporterResponse)); });
    expect(screen.queryByText("Tautan akun pendamping tersimpan.")).not.toBeInTheDocument();
    expect(calls.find(c => c.url.endsWith("/account-link") && c.options.method === "POST")!.options.signal?.aborted).toBe(true);
});
it("same-user permission removal clears resolver draft and feature caches", async () => {
    backend();
    await renderLinking("patient");
    fireEvent.change(await screen.findByLabelText("Email atau telepon login terverifikasi (persis)"), { target: { value: "exact@example.test" } });
    await act(async () => { client.setQueryData(ME_QUERY_KEY, { ...f.actor, permissions: f.actor.permissions.filter(p => p !== "PATIENT_LINK_VERIFY") }); });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Akun pasien" })).not.toBeInTheDocument());
    await waitFor(() => expect(client.getQueryCache().getAll().filter(q => q.queryKey[0] === "account-linking" && q.state.data)).toHaveLength(0));
});
