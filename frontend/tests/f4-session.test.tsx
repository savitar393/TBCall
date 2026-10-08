import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSession, ME_QUERY_KEY } from "@/lib/auth/session";
import { AppProviders } from "@/app/providers";
import { useAdministrationCommand } from "@/features/administration/use-command";
import { administrationApi } from "@/features/administration/api";
import { administrationQueries } from "@/features/administration/queries";
import { expect, it, vi } from "vitest";
import { backend, renderF4, routing, failure } from "./f4-harness";
import * as f from "./f4-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/admin/users" }));
it("deactivation refetches a previously visited inactive facility list cache", async () => {
    let inactive = false, client!: QueryClient;
    const list = administrationQueries.facilities(f.admin, { page: 0 });
    function Probe() { client = useQueryClient(); return <button onClick={() => void client.fetchQuery(list)}>Visit list cache</button>; }
    const calls = backend(f.admin, c => c.url.endsWith("/deactivate") ? (inactive = true, Response.json({ ...f.facility, active: false })) : c.url.includes("/admin/facilities?") ? Response.json(f.page({ ...f.summary, active: !inactive })) : c.url.endsWith(`/facilities/${f.facilityId}`) ? Response.json({ ...f.facility, active: !inactive }, { headers: { ETag: '"7"' } }) : undefined);
    await renderF4("facility", <Probe />);
    await screen.findByLabelText("Alamat");
    await userEvent.click(screen.getByRole("button", { name: "Visit list cache" }));
    await waitFor(() => expect(client.getQueryData(list.queryKey)).toBeDefined());
    await userEvent.click(screen.getByRole("button", { name: "Nonaktifkan fasyankes" }));
    await userEvent.click(screen.getByRole("button", { name: "Ya, nonaktifkan fasyankes" }));
    await screen.findByText("Status: Tidak aktif");
    expect(calls.filter(c => c.url.includes("/admin/facilities?"))).toHaveLength(2);
    expect(client.getQueryData<{
        data: {
            content: {
                active: boolean;
            }[];
        };
    }>(list.queryKey)?.data.content[0].active).toBe(false);
});
it("lookup preflight rejects an old submit handler before the new Me observer rerenders", async () => {
    let client!: QueryClient;
    function Probe() { client = useQueryClient(); return null; }
    const calls = backend();
    await renderF4("users", <Probe />);
    const input = await screen.findByLabelText("Email atau nomor telepon tepat");
    fireEvent.change(input, { target: { value: "target@example.test" } });
    await act(async () => {
        client.setQueryData(ME_QUERY_KEY, { ...f.admin, permissions: [] });
        fireEvent.submit(input.closest("form")!);
    });
    expect(calls.some(c => c.url.includes("/users/lookup"))).toBe(false);
});
it("old handler cannot begin a command after cached Me changes before rerender", async () => {
    const calls = backend();
    let client!: QueryClient, run!: ReturnType<typeof useAdministrationCommand>["run"];
    function Probe() {
        const { user } = useSession();
        client = useQueryClient();
        const command = useAdministrationCommand();
        if (user)
            run = command.run;
        return <p>{user ? "Ready" : "Loading"}</p>;
    }
    render(<AppProviders>
    <Probe />
    </AppProviders>);
    await screen.findByText("Ready");
    const old = run;
    await act(async () => { client.setQueryData(ME_QUERY_KEY, { ...f.admin, permissions: [] }); await old(signal => administrationApi.create({ name: "Old" }, signal)); });
    expect(calls.some(c => c.options.method === "POST")).toBe(false);
});
it.each(["facility", "integration"] as const)("stale %s GET aborts and cannot populate another actor or navigate", async (page) => {
    let changed = false, resolve!: (r: Response) => void, signal!: AbortSignal, client!: QueryClient;
    const next = { ...f.admin, id: f.otherId };
    backend(f.admin, c => c.url.endsWith("/me") ? Response.json(changed ? next : f.admin) : c.url.endsWith(page === "facility" ? `/facilities/${f.facilityId}` : "/integrations/SITB") ? changed ? Response.json(page === "facility" ? { ...f.facility, name: "New context" } : { ...f.integration, name: "New context" }, { headers: { ETag: '"8"' } }) : (signal = c.options.signal as AbortSignal, new Promise(r => resolve = r)) : undefined);
    function Switch() { const session = useSession(); client = useQueryClient(); return <button onClick={() => { changed = true; void session.refresh(); }}>Ganti konteks</button>; }
    await renderF4(page, <Switch />);
    await waitFor(() => expect(resolve).toBeDefined());
    await userEvent.click(screen.getByText("Ganti konteks"));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toEqual(next));
    if (page === "facility")
        await screen.findByDisplayValue("New context");
    else
        await screen.findByText("New context");
    routing.replace.mockClear();
    await act(async () => resolve(failure(401, "AUTHENTICATION_REQUIRED")));
    expect(routing.replace).not.toHaveBeenCalled();
    expect(client.getQueryCache().findAll({ queryKey: [page === "facility" ? "administration" : "integration", f.adminId] })).toHaveLength(0);
});
it.each(["account", "scope", "role", "permission"] as const)("%s change aborts membership and clears exact identity without late invalidation/relookup", async (context) => {
    const actor = context === "scope" ? f.facilityAdmin : f.admin;
    const next = { ...actor, ...(context === "account" ? { id: f.otherId } : context === "scope" ? { activeFacilities: [{ id: f.otherId, name: "Lingkup baru" }] } : context === "role" ? { roles: [] } : { permissions: [] }) };
    let changed = false, resolve!: (r: Response) => void, signal!: AbortSignal, client!: QueryClient;
    const calls = backend(actor, c => c.url.endsWith("/me") ? Response.json(changed ? next : actor) : c.options.method === "POST" ? (signal = c.options.signal as AbortSignal, new Promise(r => resolve = r)) : undefined);
    function Switch() { const session = useSession(); client = useQueryClient(); return <button onClick={() => { changed = true; void session.refresh().then(() => client.setQueryData(["administration", next.id, "sentinel"], "new-context")); }}>Ganti konteks</button>; }
    await renderF4("users", <Switch />);
    fireEvent.change(await screen.findByLabelText("Email atau nomor telepon tepat"), { target: { value: "target@example.test" } });
    await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" }));
    await screen.findByText("t***@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Jadikan utama Fasyankes lingkup sendiri" }));
    await waitFor(() => expect(resolve).toBeDefined());
    await userEvent.click(screen.getByText("Ganti konteks"));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await waitFor(() => expect(client.getQueryData(["administration", next.id, "sentinel"])).toBe("new-context"));
    const count = calls.length;
    routing.replace.mockClear();
    routing.push.mockClear();
    await act(async () => resolve(failure(401, "AUTHENTICATION_REQUIRED")));
    expect(calls).toHaveLength(count);
    expect(screen.queryByText("t***@example.test")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cari ulang pengguna" })).not.toBeInTheDocument();
    expect(routing.replace).not.toHaveBeenCalled();
    expect(client.getQueryData(["administration", next.id, "sentinel"])).toBe("new-context");
});
it.each([false, true])("old-account facility PATCH suppresses late success/error=%s and draft", async (fails) => {
    let changed = false, resolve!: (r: Response) => void, signal!: AbortSignal;
    const calls = backend(f.admin, c => c.url.endsWith("/me") ? Response.json({ ...f.admin, id: changed ? f.otherId : f.adminId }) : c.options.method === "PATCH" ? (signal = c.options.signal as AbortSignal, new Promise(r => resolve = r)) : undefined);
    function Switch() { const session = useSession(); return <button onClick={() => { changed = true; void session.refresh(); }}>Ganti konteks</button>; }
    await renderF4("facility", <Switch />);
    fireEvent.change(await screen.findByLabelText("Alamat"), { target: { value: "Old draft" } });
    await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(resolve).toBeDefined());
    await userEvent.click(screen.getByText("Ganti konteks"));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await waitFor(() => expect(screen.getByLabelText("Alamat")).toHaveValue(f.facility.address));
    const count = calls.length;
    routing.replace.mockClear();
    await act(async () => resolve(fails ? failure(401, "AUTHENTICATION_REQUIRED") : Response.json(f.facility)));
    expect(calls).toHaveLength(count);
    expect(screen.queryByDisplayValue("Old draft")).not.toBeInTheDocument();
    expect(routing.replace).not.toHaveBeenCalled();
});
it("same-account facility scope change aborts an audited exact lookup", async () => {
    let changed = false, resolve!: (r: Response) => void, signal!: AbortSignal;
    const calls = backend(f.facilityAdmin, c => c.url.endsWith("/me") ? Response.json({ ...f.facilityAdmin, activeFacilities: changed ? [{ id: f.otherId, name: "Nouveau" }] : f.facilityAdmin.activeFacilities }) : c.url.includes("/users/lookup") ? (signal = c.options.signal as AbortSignal, new Promise(r => resolve = r)) : undefined);
    function Switch() { const session = useSession(); return <button onClick={() => { changed = true; void session.refresh(); }}>Ganti konteks</button>; }
    await renderF4("users", <Switch />);
    fireEvent.change(await screen.findByLabelText("Email atau nomor telepon tepat"), { target: { value: "target@example.test" } });
    await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" }));
    await waitFor(() => expect(resolve).toBeDefined());
    await userEvent.click(screen.getByText("Ganti konteks"));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => resolve(Response.json(f.lookup)));
    expect(screen.queryByText("t***@example.test")).not.toBeInTheDocument();
    expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(1);
    expect(screen.getByLabelText("Email atau nomor telepon tepat")).toHaveValue("");
});
it.each(["membership", "role", "status"] as const)("self %s refreshes Me before relookup and blocks obsolete context", async (kind) => {
    let mutated = false;
    const calls = backend(f.admin, c => c.url.endsWith("/me") ? Response.json({ ...f.admin, permissions: mutated ? [] : f.admin.permissions }) : c.url.includes("/users/lookup") ? Response.json({ ...f.lookup, userId: f.adminId }) : ["POST", "DELETE"].includes(c.options.method ?? "") ? (mutated = true, kind === "role" ? Response.json({ userId: f.adminId, roleCode: "LAB_STAFF", assigned: true }) : kind === "status" ? Response.json({ id: f.adminId, status: "SUSPENDED", version: 13 }) : Response.json({ userId: f.adminId, facilityId: f.facilityId, active: true, primary: true })) : undefined);
    await renderF4("users");
    fireEvent.change(await screen.findByLabelText("Email atau nomor telepon tepat"), { target: { value: "admin@example.test" } });
    await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" }));
    await screen.findByText("t***@example.test");
    await userEvent.click(screen.getByRole("button", { name: kind === "membership" ? "Jadikan utama Fasyankes lingkup sendiri" : kind === "role" ? "Berikan Laboratorium hidup" : "Tangguhkan akun" }));
    if (kind === "status")
        await userEvent.click(screen.getByRole("button", { name: "Ya, tangguhkan akun" }));
    await screen.findByText("Akses tidak diizinkan");
    const mutation = calls.findIndex(c => ["POST", "DELETE"].includes(c.options.method ?? ""));
    expect(calls[mutation + 1].url).toBe("/api/tbcall/v1/me");
    expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(1);
});
it("self disable refreshes Me and permits legitimate login redirect without target relookup", async () => {
    let disabled = false;
    const calls = backend(f.admin, c => c.url.endsWith("/me") ? disabled ? failure(401, "AUTHENTICATION_REQUIRED") : Response.json(f.admin) : c.url.includes("/users/lookup") ? Response.json({ ...f.lookup, userId: f.adminId }) : c.url.endsWith("/disable") ? (disabled = true, Response.json({ id: f.adminId, status: "DISABLED", version: 13 })) : undefined);
    await renderF4("users");
    fireEvent.change(await screen.findByLabelText("Email atau nomor telepon tepat"), { target: { value: "admin@example.test" } });
    await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" }));
    await screen.findByText("t***@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Nonaktifkan akun" }));
    await userEvent.click(screen.getByRole("button", { name: "Ya, nonaktifkan akun" }));
    await waitFor(() => expect(routing.replace).toHaveBeenCalledWith("/login"));
    expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(1);
});
