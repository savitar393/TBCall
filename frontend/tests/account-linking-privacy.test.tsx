import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import * as f from "./account-linking-fixtures";
import { backend, renderLinking, selectSupporter, acknowledge, resolve, failure, tagged, client } from "./account-linking-harness";
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/patients" }));
it.each(["patient", "supporter"] as const)("%s missing-resource GET has resource wording rather than candidate lookup wording", async (kind) => {
    backend(f.actor, c => c.options.method === "GET" && !c.url.endsWith("/me") ? failure(404, "RESOURCE_NOT_FOUND") : undefined);
    await renderLinking(kind);
    await screen.findByText("Data tidak ditemukan atau tidak lagi dalam cakupan Anda. Muat ulang dan periksa konteks.");
    expect(screen.queryByText("Tidak ditemukan akun aktif yang memenuhi syarat untuk ditautkan.")).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE RAW/)).not.toBeInTheDocument();
});
it.each(["patient", "supporter"] as const)("%s exact identity stays outside caches/storage/history/logs/metadata", async (kind) => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")], storage = vi.spyOn(Storage.prototype, "setItem"), history = [vi.spyOn(window.history, "pushState"), vi.spyOn(window.history, "replaceState")];
    const title = document.title, metadata = document.head.innerHTML;
    const { calls } = backend();
    await renderLinking(kind);
    if (kind === "supporter")
        await selectSupporter();
    await resolve();
    expect(JSON.stringify(client.getQueryCache().getAll().map(q => ({ key: q.queryKey, data: q.state.data })))).not.toContain("exact@example.test");
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(storage).not.toHaveBeenCalled();
    for (const log of logs)
        expect(log).not.toHaveBeenCalled();
    for (const call of history)
        expect(call).not.toHaveBeenCalled();
    expect(document.title).toBe(title);
    expect(document.head.innerHTML).toBe(metadata);
    expect(routing.push).not.toHaveBeenCalled();
    expect(routing.replace).not.toHaveBeenCalled();
    expect(calls.filter(c => c.url.includes("exact@example.test"))).toHaveLength(0);
    expect(calls.filter(c => JSON.stringify(c.body).includes("exact@example.test"))).toHaveLength(1);
    expect(screen.queryByText("exact@example.test")).not.toBeInTheDocument();
});
it.each(["patient", "supporter"] as const)("%s new candidate resets acknowledgement and prepared confirmation", async (kind) => {
    let second = false;
    backend(f.actor, c => c.url.endsWith("/resolve-user") && second ? Response.json({ ...f.candidate, userId: f.ids.destination, matchedLogin: { kind: "PHONE", maskedValue: "***5678" } }) : undefined);
    await renderLinking(kind);
    if (kind === "supporter")
        await selectSupporter();
    await acknowledge();
    second = true;
    fireEvent.change(screen.getByLabelText("Email atau telepon login terverifikasi (persis)"), { target: { value: "081234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "Cari akun terverifikasi" }));
    await screen.findByText(/Telepon \*\*\*5678/);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it.each(["patient", "supporter"] as const)("%s malformed resolver response never exposes raw private fields", async (kind) => {
    backend(f.actor, c => c.url.endsWith("/resolve-user") ? Response.json({ ...f.candidate, email: "PRIVATE RAW EMAIL" }) : undefined);
    await renderLinking(kind);
    if (kind === "supporter")
        await selectSupporter();
    fireEvent.change(await screen.findByLabelText("Email atau telepon login terverifikasi (persis)"), { target: { value: "exact@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Cari akun terverifikasi" }));
    await screen.findByText(/Respons layanan tidak valid/);
    expect(screen.queryByText(/PRIVATE RAW/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("CSRF failure refreshes current session without replaying resolver", async () => {
    const { calls } = backend(f.actor, c => c.url.endsWith("/resolve-user") ? failure(403, "CSRF_INVALID") : undefined);
    await renderLinking("patient");
    fireEvent.change(await screen.findByLabelText("Email atau telepon login terverifikasi (persis)"), { target: { value: "exact@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Cari akun terverifikasi" }));
    await screen.findByText(/Keamanan sesi telah diperbarui/);
    await waitFor(() => expect(calls.filter(c => c.url.endsWith("/me"))).toHaveLength(2));
    expect(calls.filter(c => c.url.endsWith("/resolve-user"))).toHaveLength(1);
    expect(screen.queryByText(/PRIVATE RAW/)).not.toBeInTheDocument();
});
it.each([true, false])("patient success refreshes /me only when target is actor: %s", async (self) => {
    const { calls } = backend({ ...f.actor, id: self ? f.userId : f.actor.id });
    await renderLinking("patient");
    await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Periksa tautan pasien" }));
    fireEvent.click(await screen.findByRole("button", { name: "Konfirmasi tautkan akun pasien" }));
    await screen.findByText("Tautan akun pasien tersimpan.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cabut tautan pasien" })).not.toBeDisabled());
    expect(calls.filter(c => c.url.endsWith("/me"))).toHaveLength(self ? 2 : 1);
    expect(calls.some(c => c.url.includes("/admin/"))).toBe(false);
});
it("supporter source lock survives selection but clears on actual route context change", async () => {
    const { calls } = backend(f.actor, c => c.options.method === "POST" && c.url.endsWith("/supporters") ? failure(409, "SOURCE_AUTHORITY_CONFLICT") : undefined);
    const view = await renderLinking("supporter");
    fireEvent.click(await screen.findByRole("button", { name: "Tambah pendamping" }));
    fireEvent.change(screen.getByLabelText("Nama pendamping"), { target: { value: "Nama" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan pendamping" }));
    await screen.findByText(/Data ini hanya dapat dibaca/);
    fireEvent.click(screen.getByRole("button", { name: "Batal buat pendamping" }));
    await selectSupporter();
    expect(screen.getByRole("button", { name: "Tambah pendamping" })).toBeDisabled();
    view.navigate(f.ids.destination);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tambah pendamping" })).not.toBeDisabled());
    expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
});
it("patient missing current GET ETag disables revoke with safe precondition error", async () => {
    backend(f.actor, c => c.options.method === "GET" && c.url.endsWith("/account-link") ? Response.json(f.patientState) : undefined);
    await renderLinking("patient");
    await screen.findByText("Muat ulang data untuk memperoleh versi server sebelum mengirim perubahan.");
    expect(screen.queryByRole("button", { name: "Cabut tautan pasien" })).not.toBeInTheDocument();
});
it("roster pagination stays local and clears selected candidate", async () => {
    const { state, calls } = backend();
    state.page = { ...f.page, totalElements: 21 };
    await renderLinking("supporter");
    await selectSupporter();
    await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    await screen.findByText("Halaman 2");
    expect(screen.queryByText(/Akun tujuan:/)).not.toBeInTheDocument();
    expect(calls.some(c => c.url.includes("page=1&size=20"))).toBe(true);
    expect(window.location.search).toBe("");
    expect(routing.push).not.toHaveBeenCalled();
});
it("old detail GET is cancelled and cannot populate another selection", async () => {
    let complete!: (r: Response) => void;
    const { state, calls } = backend(f.actor, c => c.url.endsWith(`/supporters/${f.supporterId}`) ? new Promise<Response>(r => { complete = r; }) : c.url.endsWith(`/supporters/${f.ids.destination}`) ? tagged({ ...f.detail, id: f.ids.destination, fullName: "Pendamping Kedua" }) : undefined);
    state.page = { ...f.page, content: [f.summary, { ...f.summary, id: f.ids.destination, fullName: "Pendamping Kedua" }], totalElements: 2 };
    await renderLinking("supporter");
    fireEvent.click(await screen.findByRole("button", { name: "Buka pendamping Pendamping Contoh" }));
    await waitFor(() => expect(complete).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Buka pendamping Pendamping Kedua" }));
    await screen.findByText("Pendamping Kedua · PMO");
    await act(async () => { complete(tagged({ ...f.detail, linkedUser: { userId: f.userId, ...f.maskedAccount } })); });
    expect(screen.queryByText(/Akun tertaut:/)).not.toBeInTheDocument();
    expect(calls.find(c => c.url.endsWith(`/supporters/${f.supporterId}`))!.options.signal?.aborted).toBe(true);
});
