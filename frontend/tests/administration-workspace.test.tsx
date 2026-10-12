import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { backend, renderF4, routing } from "./f4-harness";
import * as f from "./f4-fixtures";
import { ApiFeedbackBoundary } from "@/components/api-feedback";
import { ApiError } from "@/lib/api/problem";
import { QueryState, Refresh } from "@/features/administration/display";

vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/admin/users" }));

it("administration read feedback deduplicates only the exact presented error and retains refresh", async () => {
  const outer = new ApiError({ status: 503, title: "Synthetic read failure" });
  const inner = new ApiError({ status: 503, title: "Synthetic read failure" });
  const refetch = vi.fn();
  const { rerender } = render(<ApiFeedbackBoundary error={outer}><QueryState pending={false} error={outer}/><Refresh busy={false} onClick={refetch}/></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Muat ulang" }));
  expect(refetch).toHaveBeenCalledOnce();
  rerender(<ApiFeedbackBoundary error={outer}><QueryState pending={false} error={inner}/></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  rerender(<ApiFeedbackBoundary error={null}><QueryState pending={false} error={inner}/></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

it("administration read feedback remains available without a presenting shell", () => {
  const { rerender } = render(<QueryState pending={false} error={new ApiError({ status: 503, title: "Synthetic read failure" })}/>);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  rerender(<QueryState pending={true} error={new Error("Synthetic unknown failure")}/>);
  expect(screen.getByText("Memuat data…")).toBeInTheDocument();
  expect(screen.getByText("Layanan belum tersedia.")).toBeInTheDocument();
});

async function lookup() {
  fireEvent.change(await screen.findByLabelText("Email atau nomor telepon tepat"), { target: { value: "target@example.test" } });
  await userEvent.click(screen.getByRole("button", { name: "Cari pengguna tepat" }));
  await screen.findByText("t***@example.test");
}

it("facility context uses the authorized reference label rather than a raw type code", async () => {
  backend(); await renderF4("facility");
  const context = await screen.findByRole("region", { name: "Konteks fasyankes" });
  expect(context).toHaveTextContent("Label fasilitas hidup");
  expect(within(context).queryByText("KLINIK")).not.toBeInTheDocument();
});

it("facility queue exposes compact rows, status and detail links", async () => {
  backend();
  await renderF4("facilities");
  const table = await screen.findByRole("table", { name: "Daftar fasyankes" });
  expect(within(table).getByText("Fasyankes contoh")).toBeInTheDocument();
  expect(within(table).getByText("Aktif")).toBeInTheDocument();
  expect(within(table).getByRole("link", { name: "Buka detail Fasyankes contoh" })).toHaveAttribute("href", `/admin/facilities/${f.facilityId}`);
  expect(screen.queryByRole("navigation", { name: "Halaman data" })).not.toBeInTheDocument();
});

it("later empty facility page keeps a route back when the total shrinks", async () => {
  backend(f.admin, c => {
    if (!c.url.split("?")[0].endsWith("/admin/facilities")) return;
    const page = Number(new URL(c.url, "http://localhost").searchParams.get("page"));
    return Response.json(page === 0 ? { ...f.page(f.summary), totalElements: 21 } : { content: [], page: 1, size: 20, totalElements: 0 });
  });
  await renderF4("facilities");
  await userEvent.click(await screen.findByRole("button", { name: "Berikutnya" }));
  await screen.findByText("Tidak ada fasyankes.");
  expect(screen.getByRole("button", { name: "Sebelumnya" })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Sebelumnya" }));
  await screen.findByText("Fasyankes contoh");
});

it("facility form groups identity, location and hierarchy without changing create payload", async () => {
  const calls = backend();
  await renderF4("new");
  const identity = await screen.findByRole("group", { name: "Identitas fasyankes" });
  expect(within(identity).getByLabelText("Nama fasyankes")).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Lokasi" })).getByLabelText("Alamat")).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Induk fasyankes" })).getByLabelText("Induk fasyankes")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nama fasyankes"), { target: { value: "  Baru  " } });
  await userEvent.click(screen.getByRole("button", { name: "Buat fasyankes" }));
  await waitFor(() => expect(calls.find(c => c.options.method === "POST")?.body).toEqual({ name: "Baru", facilityTypeCode: null, parentFacilityId: null, address: null, provinceCode: null, regencyCode: null, districtCode: null, villageCode: null, postalCode: null, latitude: null, longitude: null }));
});

it("masked result presents account, role and membership state with folded metadata", async () => {
  backend();
  await renderF4("users");
  await lookup();
  expect(screen.getByRole("region", { name: "Hasil pengguna tepat" })).toHaveTextContent("Aktif");
  expect(screen.getByRole("table", { name: "Penugasan pengguna" })).toHaveTextContent("Bukan utama");
  expect(screen.getByRole("table", { name: "Peran global pengguna" })).toHaveTextContent("Diberikan");
  const metadata = screen.getByText("Verifikasi dan metadata pengguna").closest("details");
  expect(metadata).not.toHaveAttribute("open");
  expect(screen.queryByText("target@example.test")).not.toBeInTheDocument();
});

it("membership and role changes wait for confirmation and preserve request contracts", async () => {
  const calls = backend();
  await renderF4("users");
  await lookup();
  await userEvent.click(screen.getByRole("button", { name: "Jadikan utama Fasyankes lingkup sendiri" }));
  expect(calls.some(c => c.options.method === "POST")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Batal" }));
  expect(calls.some(c => c.options.method === "POST")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Berikan Laboratorium hidup" }));
  expect(calls.some(c => c.url.includes("/roles/"))).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Ya, berikan laboratorium hidup" }));
  await waitFor(() => expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(2));
  const role = calls.find(c => c.url.includes("/roles/"))!;
  expect(role.options.method).toBe("POST");
  expect(new Headers(role.options.headers).get("If-Match")).toBeNull();
  expect(new Headers(role.options.headers).get("X-XSRF-TOKEN")).toBe("fixture");
});

it("facility administrator sees only permitted membership actions", async () => {
  const calls = backend(f.facilityAdmin);
  await renderF4("users");
  await lookup();
  expect(screen.queryByRole("table", { name: "Peran global pengguna" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nonaktifkan akun" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Fasyankes aktif untuk penugasan")).not.toBeInTheDocument();
  expect(calls.some(c => c.url.includes("/admin/facilities"))).toBe(false);
  await userEvent.selectOptions(screen.getByLabelText("Fasyankes penugasan"), f.facilityId);
  await userEvent.click(screen.getByRole("button", { name: "Simpan penugasan" }));
  expect(calls.some(c => c.options.method === "POST")).toBe(false);
  expect(screen.getByRole("dialog")).toHaveTextContent("Fasyankes lingkup sendiri");
  expect(screen.getByRole("dialog")).toHaveTextContent("t***@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Ya, simpan penugasan" }));
  await waitFor(() => expect(calls.find(c => c.options.method === "POST")?.body).toEqual({ primary: false }));
});

it("reactivation confirms the masked target, permits cancellation, and keeps lookup version", async () => {
  const calls = backend(f.admin, c => c.url.includes("/users/lookup") ? Response.json({ ...f.lookup, status: "SUSPENDED" }) : undefined);
  await renderF4("users");
  await lookup();
  const trigger = screen.getByRole("button", { name: "Aktifkan kembali akun" });
  await userEvent.click(trigger);
  expect(screen.getByRole("dialog")).toHaveTextContent("t***@example.test");
  expect(calls.some(c => c.url.endsWith("/reactivate"))).toBe(false);
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(calls.some(c => c.url.endsWith("/reactivate"))).toBe(false);
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("button", { name: "Ya, aktifkan kembali akun" }));
  await waitFor(() => expect(calls.filter(c => c.url.includes("/users/lookup"))).toHaveLength(2));
  const reactivation = calls.find(c => c.url.endsWith("/reactivate"))!;
  expect(new Headers(reactivation.options.headers).get("If-Match")).toBe('"12"');
  expect(calls.filter(c => c.url.endsWith("/reactivate"))).toHaveLength(1);
});
