import { fireEvent, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { backend, renderF4, routing, failure } from "./f4-harness";
import * as f from "./f4-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/admin/users" }));
it("browsing parent facility pages never submits the containing edit form", async () => {
    const calls = backend(f.admin, c => c.url.includes("active=true") ? Response.json({ ...f.page({ ...f.summary, id: f.otherId, name: "Parent page" }), page: Number(new URL(c.url, "http://localhost").searchParams.get("page")), totalElements: 41 }) : undefined);
    await renderF4("facility");
    fireEvent.change(await screen.findByLabelText("Alamat"), { target: { value: "Draft must remain" } });
    await userEvent.type(screen.getByLabelText("Induk fasyankes"), "Pa");
    await userEvent.click(screen.getByRole("button", { name: "Cari induk fasyankes" }));
    await screen.findByText("Halaman 1 · 41 data");
    await userEvent.click(screen.getByRole("button", { name: "Berikutnya" }));
    await screen.findByText("Halaman 2 · 41 data");
    expect(calls.some(c => c.options.method === "PATCH" || c.options.method === "POST")).toBe(false);
    expect(screen.getByLabelText("Alamat")).toHaveValue("Draft must remain");
});
it("Enter in parent search searches parents without submitting the facility draft", async () => {
    const calls = backend();
    await renderF4("facility");
    fireEvent.change(await screen.findByLabelText("Alamat"), { target: { value: "Draft must remain" } });
    await userEvent.type(screen.getByLabelText("Induk fasyankes"), "Pa{Enter}");
    await waitFor(() => expect(calls.some(c => c.url.includes("query=Pa"))).toBe(true));
    expect(calls.some(c => c.options.method === "PATCH" || c.options.method === "POST")).toBe(false);
});
async function lookup() { fireEvent.change(await screen.findByLabelText("Email atau nomor telepon tepat"), { target: { value: "target@example.test" } }); await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" })); await screen.findByText("t***@example.test"); }
it.each(["facilities", "new", "facility", "integrations", "integration", "run"] as const)("%s denies an artificial grant on a wrong role without protected fetching", async (page) => {
    const calls = backend({ ...f.admin, roles: [{ code: "TB_OFFICER", name: "Petugas" }] });
    await renderF4(page);
    await screen.findByText("Akses tidak diizinkan");
    expect(calls).toHaveLength(1);
});
it("facility admin with no active assignment cannot mount user lookup", async () => { const calls = backend({ ...f.facilityAdmin, activeFacilities: [] }); await renderF4("users"); await screen.findByText("Akses tidak diizinkan"); expect(calls).toHaveLength(1); });
it("create mirrors FacilityInput, offers live labels and navigates only to returned detail", async () => {
    const calls = backend();
    await renderF4("new");
    fireEvent.change(await screen.findByLabelText("Nama fasyankes"), { target: { value: "  Baru  " } });
    await userEvent.selectOptions(screen.getByLabelText("Jenis fasyankes"), "PUSKESMAS");
    fireEvent.change(screen.getByLabelText("Lintang"), { target: { value: "-90" } });
    await userEvent.click(screen.getByRole("button", { name: "Buat fasyankes" }));
    await waitFor(() => expect(routing.push).toHaveBeenCalledWith(`/admin/facilities/${f.facilityId}`));
    const post = calls.find(c => c.options.method === "POST")!;
    expect(post.body).toEqual({ name: "Baru", facilityTypeCode: "PUSKESMAS", parentFacilityId: null, address: null, provinceCode: null, regencyCode: null, districtCode: null, villageCode: null, postalCode: null, latitude: -90, longitude: null });
    expect(new Headers(post.options.headers).get("If-Match")).toBeNull();
    expect(screen.queryByLabelText("Aktif")).not.toBeInTheDocument();
});
it("current inactive type remains a code fallback and is omitted from unrelated PATCH", async () => {
    const calls = backend(f.admin, c => c.url.endsWith(`/facilities/${f.facilityId}`) ? Response.json({ ...f.facility, facilityTypeCode: "OLD_TYPE" }, { headers: { ETag: '"9"' } }) : undefined);
    await renderF4("facility");
    await screen.findByText("OLD_TYPE (kode saat ini)");
    expect(screen.getByLabelText("Jenis fasyankes")).toHaveValue("OLD_TYPE");
    fireEvent.change(screen.getByLabelText("Alamat"), { target: { value: "Draft" } });
    await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(calls.find(c => c.options.method === "PATCH")?.body).toEqual({ address: "Draft" }));
});
it("parent search is active, submit-only, self-excluded and adds no hierarchy assumptions", async () => {
    const calls = backend(f.admin, c => c.url.includes("active=true") ? Response.json(f.page(f.summary, { ...f.summary, id: f.otherId, name: "Induk aktif" })) : undefined);
    await renderF4("facility");
    await userEvent.type(await screen.findByLabelText("Induk fasyankes"), "Pa");
    expect(calls.some(c => c.url.includes("query=Pa"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Cari induk fasyankes" }));
    await screen.findByRole("button", { name: "Pilih Induk aktif" });
    expect(screen.queryByRole("button", { name: "Pilih Fasyankes contoh" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pilih Induk aktif" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(calls.find(c => c.options.method === "PATCH")?.body).toEqual({ parentFacilityId: f.otherId }));
    expect(calls.find(c => c.url.includes("query=Pa"))?.url).toContain("active=true");
});
it.each([409, 428])("facility %s preserves draft, gets fresh tag and requires review with no replay", async (status) => {
    let patched = false;
    const calls = backend(f.admin, c => {
        if (c.options.method === "PATCH") {
            if (!patched) {
                patched = true;
                return failure(status, "OPTIMISTIC_LOCK_CONFLICT");
            }
            return Response.json(f.facility);
        }
        if (c.url.endsWith(`/facilities/${f.facilityId}`))
            return Response.json({ ...f.facility, address: patched ? "Alamat server baru" : f.facility.address }, { headers: { ETag: patched ? '"8"' : '"7"' } });
    });
    await renderF4("facility");
    fireEvent.change(await screen.findByLabelText("Alamat"), { target: { value: "Draft pribadi" } });
    await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await screen.findByText("Alamat server baru");
    expect(screen.getByLabelText("Alamat")).toHaveValue("Draft pribadi");
    expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
    expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Saya sudah meninjau data terbaru" }));
    expect(screen.getByLabelText("Alamat")).toHaveValue("Draft pribadi");
    await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(2));
    expect(new Headers(calls.filter(c => c.options.method === "PATCH")[1].options.headers).get("If-Match")).toBe('"8"');
});
it("missing detail tag blocks facility commands even with a detail version", async () => { const calls = backend(f.admin, c => c.url.endsWith(`/facilities/${f.facilityId}`) ? Response.json(f.facility) : undefined); await renderF4("facility"); fireEvent.change(await screen.findByLabelText("Alamat"), { target: { value: "Draft" } }); expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Nonaktifkan fasyankes" })).toBeDisabled(); expect(calls.every(c => !c.options.method || c.options.method === "GET")).toBe(true); });
it("deactivation has keyboard-accessible confirmation, uses real tag and refetches inactive state", async () => {
    let inactive = false;
    const calls = backend(f.admin, c => {
        if (c.url.endsWith("/deactivate")) {
            inactive = true;
            return Response.json({ ...f.facility, active: false });
        }
        if (c.url.endsWith(`/facilities/${f.facilityId}`))
            return Response.json({ ...f.facility, active: !inactive }, { headers: { ETag: inactive ? '"8"' : '"7"' } });
    });
    await renderF4("facility");
    const trigger = await screen.findByRole("button", { name: "Nonaktifkan fasyankes" });
    await userEvent.click(trigger);
    await screen.findByText("Menonaktifkan fasyankes tidak menghapus data. Tindakan akan ditolak bila masih ada penugasan pengguna aktif.");
    expect(calls.some(c => c.url.endsWith("/deactivate"))).toBe(false);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Ya, nonaktifkan fasyankes" }));
    await screen.findByText("Status: Tidak aktif");
    expect(new Headers(calls.find(c => c.url.endsWith("/deactivate"))!.options.headers).get("If-Match")).toBe('"7"');
    expect(screen.queryByRole("button", { name: /Aktifkan kembali fasyankes/ })).not.toBeInTheDocument();
});
it("single-character facility search cannot send a query and active filter stays in memory", async () => { const calls = backend(); await renderF4("facilities"); await screen.findByText("Fasyankes contoh"); await userEvent.type(screen.getByLabelText("Cari nama fasyankes"), " A "); expect(screen.getByRole("button", { name: "Cari fasyankes" })).toBeDisabled(); expect(calls.filter(c => c.url.includes("query="))).toHaveLength(0); await userEvent.clear(screen.getByLabelText("Cari nama fasyankes")); await userEvent.selectOptions(screen.getByLabelText("Status fasyankes"), "false"); await userEvent.click(screen.getByRole("button", { name: "Cari fasyankes" })); await waitFor(() => expect(calls.some(c => c.url.includes("active=false"))).toBe(true)); expect(location.search).toBe(""); });
it("facility admin uses only current actor facilities, hides global discovery and other-assignment details", async () => {
    const calls = backend(f.facilityAdmin, c => c.url.includes("/users/lookup") ? Response.json({ ...f.lookup, hasOtherFacilityAssignments: true }) : undefined);
    await renderF4("users");
    await lookup();
    await screen.findByText("Pengguna memiliki penugasan aktif lain di luar lingkup Anda.");
    expect(screen.queryByLabelText("Fasyankes aktif untuk penugasan")).not.toBeInTheDocument();
    expect(calls.some(c => c.url.includes("/admin/facilities"))).toBe(false);
    expect(within(screen.getByLabelText("Fasyankes penugasan")).getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByText("Peran global")).not.toBeInTheDocument();
    expect(screen.queryByText("Status akun", { selector: "h2" })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Fasyankes penugasan"), f.facilityId);
    await userEvent.click(screen.getByRole("checkbox", { name: "Penugasan utama" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan penugasan" }));
    await waitFor(() => expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(2));
    expect(calls.find(c => c.options.method === "POST")?.body).toEqual({ primary: true });
});
it("system admin without FACILITY_MANAGE can act on returned memberships but cannot discover new facilities", async () => { const calls = backend({ ...f.admin, permissions: f.admin.permissions.filter(p => p !== "FACILITY_MANAGE") }); await renderF4("users"); await lookup(); expect(screen.getByLabelText("Fasyankes penugasan")).toBeInTheDocument(); expect(screen.queryByLabelText("Fasyankes aktif untuk penugasan")).not.toBeInTheDocument(); await userEvent.click(screen.getByRole("button", { name: "Jadikan utama Fasyankes lingkup sendiri" })); await waitFor(() => expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(2)); expect(calls.some(c => c.url.includes("/admin/facilities?"))).toBe(false); });
it("live managed roles are independent of account-status permissions and use no If-Match", async () => { const calls = backend({ ...f.admin, permissions: ["USER_MANAGE_FACILITY", "ROLE_MANAGE"] }); await renderF4("users"); await lookup(); await userEvent.click(await screen.findByRole("button", { name: "Berikan Laboratorium hidup" })); await waitFor(() => expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(2)); const role = calls.find(c => c.url.includes("/roles/"))!; expect(role.url).toContain("/roles/LAB_STAFF"); expect(new Headers(role.options.headers).get("If-Match")).toBeNull(); expect(screen.queryByRole("button", { name: /Nonaktifkan akun/ })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /PATIENT|TREATMENT_SUPPORTER/ })).not.toBeInTheDocument(); });
it.each(["ACTIVE", "SUSPENDED", "DISABLED", "PENDING"])("status %s exposes only supported actions and inactive roles are read-only", async (status) => { backend(f.admin, c => c.url.includes("/users/lookup") ? Response.json({ ...f.lookup, status }) : undefined); await renderF4("users"); await lookup(); expect(!!screen.queryByRole("button", { name: "Tangguhkan akun" })).toBe(status === "ACTIVE"); expect(!!screen.queryByRole("button", { name: "Aktifkan kembali akun" })).toBe(status === "SUSPENDED"); expect(!!screen.queryByRole("button", { name: "Nonaktifkan akun" })).toBe(["ACTIVE", "SUSPENDED"].includes(status)); expect(!!screen.queryByRole("button", { name: "Berikan Laboratorium hidup" })).toBe(status === "ACTIVE"); });
it("stale status has no lookup/replay until explicit relookup, then quotes the new lookup version", async () => {
    let attempts = 0;
    const calls = backend(f.admin, c => c.url.endsWith("/suspend") ? ++attempts === 1 ? failure(409, "OPTIMISTIC_LOCK_CONFLICT") : Response.json({ id: f.targetId, status: "SUSPENDED", version: 14 }) : c.url.includes("/users/lookup") ? Response.json({ ...f.lookup, version: attempts ? 13 : 12 }) : undefined);
    await renderF4("users");
    await lookup();
    await userEvent.click(screen.getByRole("button", { name: "Tangguhkan akun" }));
    await userEvent.click(screen.getByRole("button", { name: "Ya, tangguhkan akun" }));
    await screen.findByText("Data telah berubah");
    expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Tangguhkan akun" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cari ulang pengguna" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Tangguhkan akun" })).not.toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Tangguhkan akun" }));
    await userEvent.click(screen.getByRole("button", { name: "Ya, tangguhkan akun" }));
    await waitFor(() => expect(attempts).toBe(2));
    const status = calls.filter(c => c.url.endsWith("/suspend"));
    expect(status.map(c => new Headers(c.options.headers).get("If-Match"))).toEqual(['"12"', '"13"']);
});
it("disable requires confirmation and relookup after the command", async () => { const calls = backend(); await renderF4("users"); await lookup(); await userEvent.click(screen.getByRole("button", { name: "Nonaktifkan akun" })); expect(calls.some(c => c.url.endsWith("/disable"))).toBe(false); await userEvent.click(screen.getByRole("button", { name: "Ya, nonaktifkan akun" })); await waitFor(() => expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(2)); expect(new Headers(calls.find(c => c.url.endsWith("/disable"))!.options.headers).get("If-Match")).toBe('"12"'); });
it("explicit clear aborts lookup and rejects a late result", async () => { let resolve!: (r: Response) => void, signal!: AbortSignal; backend(f.admin, c => c.url.includes("/users/lookup") ? (signal = c.options.signal as AbortSignal, new Promise(r => resolve = r)) : undefined); await renderF4("users"); fireEvent.change(await screen.findByLabelText("Email atau nomor telepon tepat"), { target: { value: "target@example.test" } }); await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" })); await waitFor(() => expect(resolve).toBeDefined()); await userEvent.click(screen.getByRole("button", { name: "Bersihkan hasil" })); expect(signal.aborted).toBe(true); await act(async () => resolve(Response.json(f.lookup))); expect(screen.queryByText("t***@example.test")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Cari ulang pengguna" })).not.toBeInTheDocument(); });
