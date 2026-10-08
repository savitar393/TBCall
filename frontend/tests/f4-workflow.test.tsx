import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { backend, renderF4, routing, failure } from "./f4-harness";
import * as f from "./f4-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/admin/facilities" }));
it("facility list renders safe summaries without detail enrichment and filters only on explicit submit", async () => {
    const calls = backend();
    await renderF4("facilities");
    await screen.findByText("Fasyankes contoh");
    expect(calls.some(c => c.url.includes(`/facilities/${f.facilityId}`))).toBe(false);
    await userEvent.type(screen.getByLabelText("Cari nama fasyankes"), "  Kl  ");
    expect(calls.filter(c => c.url.includes("query=")).length).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Cari fasyankes" }));
    await waitFor(() => expect(calls.some(c => c.url.includes("query=Kl"))).toBe(true));
});
it("facility dirty PATCH uses detail tag and explicit null for optional clear", async () => {
    const calls = backend();
    await renderF4("facility");
    const address = await screen.findByLabelText("Alamat");
    await userEvent.clear(address);
    await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(calls.some(c => c.options.method === "PATCH")).toBe(true));
    const patch = calls.find(c => c.options.method === "PATCH")!;
    expect(patch.body).toEqual({ address: null });
    expect(new Headers(patch.options.headers).get("If-Match")).toBe('"7"');
});
it("exact user lookup is submit-only and displays masked response with transient input cleared", async () => {
    const calls = backend();
    await renderF4("users");
    const input = await screen.findByLabelText("Email atau nomor telepon tepat");
    await userEvent.type(input, "target@example.test");
    expect(calls.some(c => c.url.includes("/users/lookup"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" }));
    await screen.findByText("t***@example.test");
    expect(input).toHaveValue("");
    expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(1);
    expect(location.href).not.toContain("target@example.test");
});
it("lookup 404 is neutral and renders no raw backend prose", async () => {
    backend(f.admin, c => c.url.includes("/users/lookup") ? failure(404) : undefined);
    await renderF4("users");
    fireEvent.change(await screen.findByLabelText("Email atau nomor telepon tepat"), { target: { value: "absent@example.test" } });
    await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" }));
    await screen.findByText("Pengguna dengan identitas terverifikasi tersebut tidak ditemukan.");
    expect(screen.queryByText(/PRIVATE RAW/)).not.toBeInTheDocument();
});
it.each(["integrations", "integration", "run"] as const)("%s shows read-only local metadata with no mutation", async (page) => {
    const calls = backend();
    await renderF4(page);
    await screen.findByText(/Integrasi pada tahap ini hanya menampilkan metadata lokal TBCall/);
    await waitFor(() => expect(calls.some(c => c.url.includes("/integrations"))).toBe(true));
    expect(calls.every(c => !c.options.method || c.options.method === "GET")).toBe(true);
    expect(screen.queryByRole("button", { name: /Connect|Configure|Aktifkan|Mulai sinkronisasi|Resolusi/ })).not.toBeInTheDocument();
});
