import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { ReportingAdmin } from "@/features/program-reports/admin";
import { fixtureUser } from "./fixtures";
const session = vi.hoisted(() => ({ user: null as unknown, handleFailure: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ useSession: () => session, ME_QUERY_KEY: ["session", "me"] }));
const id = "11111111-1111-4111-8111-111111111111";
const candidate = { id, version: 0, state: "DRAFT", dataAsOf: "2026-10-15T10:00:00Z", catalogueVersion: "KEMENDAGRI_2025" };
beforeEach(() => { session.user = { ...fixtureUser, roles: [{ code: "SYSTEM_ADMIN", name: "Admin" }], permissions: ["REPORT_PUBLISH"] }; document.cookie = "XSRF-TOKEN=synthetic-csrf; path=/"; });
function start() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); client.setQueryData(["session", "me"], session.user); return render(<QueryClientProvider client={client}><ReportingAdmin /></QueryClientProvider>); }
it("never auto-publishes a capture and uses a fresh authoritative GET ETag after confirmation", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => { calls.push({ url, options }); return Response.json(options.method === "POST" && url.endsWith("/publish") ? { ...candidate, state: "PUBLISHED", version: 8 } : candidate, { headers: { ETag: options.method === "GET" ? '"7"' : '"0"' } }); }));
  start(); fireEvent.click(screen.getByRole("button", { name: "Tangkap snapshot" }));
  await screen.findByText(id);
  expect(calls).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Terbitkan snapshot" }));
  expect(calls).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Ya, terbitkan snapshot" }));
  await waitFor(() => expect(calls).toHaveLength(3));
  expect(calls[1].options.method).toBe("GET");
  expect(new Headers(calls[2].options.headers).get("If-Match")).toBe('"7"');
  expect(new Headers(calls[2].options.headers).get("X-XSRF-TOKEN")).toBe("synthetic-csrf");
  expect(JSON.parse(calls[2].options.body as string)).toEqual({ approved: true });
});
it("keeps publication and scope administration permissions independent", () => {
  start(); expect(screen.queryByRole("button", { name: "Cari pengguna" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tangkap snapshot" })).toBeInTheDocument();
});
it("does not replay a rejected publication or show private server details", async () => {
  let writes = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/publish")) { writes++; return Response.json({ title: "Private ledger details", detail: "Patient secret", code: "REPORT_PUBLICATION_WITHHELD" }, { status: 409, headers: { "Content-Type": "application/problem+json" } }); }
    return Response.json(candidate, { headers: { ETag: '"0"' } });
  }));
  start(); fireEvent.click(screen.getByRole("button", { name: "Tangkap snapshot" })); await screen.findByText(id);
  fireEvent.click(screen.getByRole("button", { name: "Terbitkan snapshot" })); fireEvent.click(screen.getByRole("button", { name: "Ya, terbitkan snapshot" }));
  await screen.findByText("Publikasi ditahan oleh pemeriksaan privasi atau kebaruan data.");
  expect(writes).toBe(1); expect(screen.queryByText(/Patient secret|Private ledger/)).not.toBeInTheDocument();
});
it("requires explicit assignment confirmation after exact lookup and keeps identity out of display", async () => {
  session.user = { ...(session.user as typeof fixtureUser), permissions: ["REPORT_SCOPE_MANAGE", "USER_MANAGE_FACILITY"] };
  const calls: { url: string; options: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    if (url.includes("/lookup?")) return Response.json({ userId: id, version: 0, email: "m***@example.invalid", phone: null, status: "ACTIVE", emailVerified: true, phoneVerified: false, roles: [{ code: "PROGRAM_MONITOR", name: "Monitor" }], activeFacilities: [], hasOtherFacilityAssignments: false });
    if (options.method === "POST") return Response.json({ id, userId: id, scope: "PROVINCE", regionCode: "33", catalogueVersion: "v", version: 0, assignedAt: candidate.dataAsOf, revokedAt: null });
    return Response.json([]);
  }));
  start(); fireEvent.change(screen.getByLabelText("Email atau telepon terverifikasi"), { target: { value: "monitor@example.invalid" } }); fireEvent.click(screen.getByRole("button", { name: "Cari pengguna" }));
  await screen.findByText("Pemantau aktif");
  expect(calls[0].url).toContain("identity=monitor%40example.invalid");
  expect(screen.getByLabelText("Email atau telepon terverifikasi")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Kode Kemendagri"), { target: { value: "33" } });
  fireEvent.click(screen.getByRole("button", { name: "Tetapkan wilayah" }));
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Ya, tetapkan wilayah" }));
  await waitFor(() => expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1));
  expect(JSON.parse(calls.find(c => c.options.method === "POST")!.options.body as string)).toEqual({ scope: "PROVINCE", regionCode: "33" });
});
it("binds revocation to the selected user and fresh grant detail ETag", async () => {
  session.user = { ...(session.user as typeof fixtureUser), permissions: ["REPORT_SCOPE_MANAGE", "USER_MANAGE_FACILITY"] };
  const grantId = "22222222-2222-4222-8222-222222222222", grant = { id: grantId, userId: id, scope: "PROVINCE", regionCode: "33", catalogueVersion: "v", version: 1, assignedAt: candidate.dataAsOf, revokedAt: null };
  const calls: { url: string; options: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    if (url.includes("/lookup?")) return Response.json({ userId: id, version: 0, email: "m***@example.invalid", phone: null, status: "ACTIVE", emailVerified: true, phoneVerified: false, roles: [{ code: "PROGRAM_MONITOR", name: "Monitor" }], activeFacilities: [], hasOtherFacilityAssignments: false });
    if (url.endsWith(grantId)) return Response.json(grant, { headers: { ETag: '"13"' } });
    return Response.json([grant]);
  }));
  start(); fireEvent.change(screen.getByLabelText("Email atau telepon terverifikasi"), { target: { value: "monitor@example.invalid" } }); fireEvent.click(screen.getByRole("button", { name: "Cari pengguna" }));
  await screen.findByText("Pemantau aktif");
  fireEvent.click(screen.getByRole("button", { name: "Cabut Provinsi 33" }));
  fireEvent.click(screen.getByRole("button", { name: "Ya, cabut provinsi 33" }));
  await waitFor(() => expect(calls.some(c => c.options.method === "DELETE")).toBe(true));
  const deletion = calls.find(c => c.options.method === "DELETE")!;
  expect(deletion.url).toBe(`/api/tbcall/v1/admin/users/${id}/reporting-scopes/${grantId}`);
  expect(new Headers(deletion.options.headers).get("If-Match")).toBe('"13"');
  expect(new Headers(deletion.options.headers).get("X-XSRF-TOKEN")).toBe("synthetic-csrf");
});
