import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import * as f from "./account-linking-fixtures";
import { backend, renderLinking, selectSupporter, acknowledge, tagged, failure } from "./account-linking-harness";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/patients" }));
it.each(["patient", "supporter"] as const)("%s acknowledgement removal invalidates prepared confirmation", async (kind) => {
    backend();
    await renderLinking(kind);
    if (kind === "supporter")
        await selectSupporter();
    await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: kind === "patient" ? "Periksa tautan pasien" : "Periksa tautan pendamping" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("replacement confirmation can be cancelled before extra acknowledgement", async () => {
    const { state } = backend();
    state.supporter = { ...f.detail, linkedUser: { userId: f.userId, ...f.maskedAccount } };
    await renderLinking("supporter");
    await selectSupporter();
    await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Periksa tautan pendamping" }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Batal" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it.each(["patient", "supporter"] as const)("%s resolver cancel clears candidate and acknowledgement", async (kind) => {
    backend();
    await renderLinking(kind);
    if (kind === "supporter")
        await selectSupporter();
    await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Batalkan pencarian" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Akun tujuan:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email atau telepon login terverifikasi (persis)")).toHaveValue("");
});
it("supporter changed linked identity at equal ETag prevents confirmed write", async () => {
    const { calls, state } = backend();
    await renderLinking("supporter");
    await selectSupporter();
    await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Periksa tautan pendamping" }));
    await screen.findByRole("dialog");
    state.supporter = { ...f.detail, linkedUser: { userId: f.ids.destination, ...f.maskedAccount } };
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi tautkan akun pendamping" }));
    await screen.findByText(/Data atau status tautan telah berubah/);
    expect(calls.some(c => c.options.method === "POST" && c.url.endsWith("/account-link"))).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("patient pair ETag change after review requires new acknowledgement", async () => {
    let tag = '"1"';
    const { calls } = backend(f.actor, c => c.url.includes("/precondition?") ? tagged(f.pairState, tag) : undefined);
    await renderLinking("patient");
    await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Periksa tautan pasien" }));
    await screen.findByRole("dialog");
    tag = '"2"';
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi tautkan akun pasien" }));
    await screen.findByText(/Data atau status tautan telah berubah/);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(calls.some(c => c.options.method === "POST" && c.url.endsWith("/account-link"))).toBe(false);
});
it.each(["link", "unlink"])("supporter %s 409 never replays and refetches detail", async (action) => {
    const { calls, state } = backend(f.actor, c => c.url.endsWith("/account-link") && c.options.method === (action === "link" ? "POST" : "DELETE") ? failure(409) : undefined);
    if (action === "unlink")
        state.supporter = { ...f.detail, linkedUser: { userId: f.userId, ...f.maskedAccount } };
    await renderLinking("supporter");
    await selectSupporter();
    if (action === "link")
        await acknowledge();
    fireEvent.click(screen.getByRole("button", { name: action === "link" ? "Periksa tautan pendamping" : "Lepas akun pendamping" }));
    fireEvent.click(await screen.findByRole("button", { name: action === "link" ? "Konfirmasi tautkan akun pendamping" : "Konfirmasi lepas akun pendamping" }));
    await screen.findByText(/Data atau status tautan telah berubah/);
    expect(calls.filter(c => c.url.endsWith("/account-link") && c.options.method != "GET")).toHaveLength(1);
    await waitFor(() => expect(calls.filter(c => c.options.method === "GET" && c.url.endsWith(`/supporters/${f.supporterId}`)).length).toBeGreaterThanOrEqual(4));
});
