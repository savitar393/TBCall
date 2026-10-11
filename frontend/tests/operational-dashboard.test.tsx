import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { backend, renderClinical, failure } from "./clinical-harness";
import DashboardPage from "@/app/dashboard/page";
import { dashboardSchema } from "@/features/operational-dashboard/contracts";
import { clinicalNavigation } from "@/features/clinical-intake/permissions";
import { useSession } from "@/lib/auth/session";
import { officer, ids, facility } from "./clinical-fixtures";
const actor = { ...officer, permissions: [...officer.permissions, "LAB_REQUEST_READ", "TREATMENT_READ", "FOLLOW_UP_READ"] };
const follow = { id: ids.diagnosis, treatmentId: ids.tbCase, patientName: "Fictional follow-up", followUpType: "Recorded review", scheduledAt: "2026-10-12T00:00:00Z", facility: null };
const lab = { id: ids.registration, patientName: "Fictional lab", status: "PARTIAL", requestedAt: "2026-10-10T00:00:00Z", requestingFacility: facility, testingFacility: facility };
const page = <T,>(content: T[] = [], totalElements = content.length, current = 0) => ({ content, page: current, size: 10, totalElements });
const fixture = { asOf: "2026-10-11T00:00:00Z", upcomingUntil: "2026-10-18T00:00:00Z", cases: { state: "AVAILABLE", data: { active: 7, completed: 3 } }, followUps: { state: "AVAILABLE", data: { upcoming: page([follow]), overdue: page([{ ...follow, id: ids.patient, patientName: "Fictional overdue", scheduledAt: "2026-10-10T00:00:00Z" }]) } }, laboratory: { state: "AVAILABLE", data: page([lab]) } };
function serve(value: unknown = fixture, user = actor) { return backend(call => call.url.endsWith("/me") ? Response.json(user) : call.url.includes("/operational-dashboard?") ? Response.json(value) : undefined); }
const start = () => renderClinical(<DashboardPage />);
const loaded = () => screen.findByRole("region", { name: "Kasus" });
it.each([["CASE_READ"], ["LAB_REQUEST_READ"], ["TREATMENT_READ", "FOLLOW_UP_READ"]])("offers navigation with independent eligible permissions %s", (...permissions) => {
  expect(clinicalNavigation({ ...officer, permissions })).toContainEqual({ label: "Pemantauan operasional", href: "/dashboard" });
});
it("renders precise counts and existing detail links with GET only", async () => {
  const calls = serve(); start(); await loaded();
  expect(screen.getByText("7")).toBeInTheDocument(); expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText(/REFERRED tidak dihitung/)).toBeInTheDocument(); expect(screen.getByText(/7 × 24 jam/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Fictional follow-up/ })).toHaveAttribute("href", `/treatments/${ids.tbCase}`);
  expect(screen.getByRole("link", { name: /Fictional lab/ })).toHaveAttribute("href", `/laboratory/requests/${ids.registration}`);
  expect(screen.getAllByText(/Fasilitas tindak lanjut tercatat: Belum dicatat/)).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /Catat|Mulai pengobatan|Hasil akhir/ })).not.toBeInTheDocument(); expect(calls.every(call => call.options.method === "GET")).toBe(true);
});
it.each(["CASE_READ", "TREATMENT_READ", "FOLLOW_UP_READ", "LAB_REQUEST_READ"])("redacts a section without %s even if the server overreturns", async permission => {
  serve(fixture, { ...actor, permissions: actor.permissions.filter(p => p !== permission) }); start(); await loaded();
  if (permission === "CASE_READ") { expect(screen.queryByText("7")).not.toBeInTheDocument(); expect(within(screen.getByRole("region", { name: "Kasus" })).queryByRole("link")).not.toBeInTheDocument(); }
  else if (permission === "LAB_REQUEST_READ") expect(screen.queryByRole("link", { name: /Fictional lab/ })).not.toBeInTheDocument();
  else expect(screen.queryByRole("link", { name: /Fictional follow-up|Fictional overdue/ })).not.toBeInTheDocument();
  expect(screen.getByText("Bagian ini memerlukan izin baca yang sesuai.")).toBeInTheDocument();
});
it("omits the patient shortcut without PATIENT_READ", async () => {
  serve(fixture, { ...actor, permissions: ["CASE_READ"] }); start(); await loaded();
  expect(screen.queryByRole("link", { name: "Daftar pasien saat ini" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Kasus" })).getByRole("link", { name: "Riwayat kasus selesai" })).toHaveAttribute("href", "/cases/history");
});
it.each(["PATIENT", "LAB_STAFF", "TREATMENT_SUPPORTER", "FACILITY_ADMIN", "SYSTEM_ADMIN", "PROGRAM_MONITOR"])("rejects %s before clinical reads", async role => {
  const calls = serve(fixture, { ...actor, roles: [{ code: role, name: role }] }); start();
  await screen.findByRole("heading", { name: "Akses tidak diizinkan" }); expect(calls.every(call => call.url.endsWith("/me"))).toBe(true);
});
it.each(["permissions", "facilities"])("rejects missing %s before loading metrics", async missing => {
  const user = missing === "permissions" ? { ...actor, permissions: ["PATIENT_READ", "FOLLOW_UP_READ"] } : { ...actor, activeFacilities: [] };
  const calls = serve(fixture, user); start(); await screen.findByRole("heading", { name: "Akses tidak diizinkan" });
  expect(calls.every(call => call.url.endsWith("/me"))).toBe(true); expect(clinicalNavigation(user).some(link => link.href === "/dashboard")).toBe(false);
});
it("distinguishes empty queues and zeros from restricted sections", async () => {
  serve({ ...fixture, cases: { state: "AVAILABLE", data: { active: 0, completed: 0 } }, followUps: { state: "AVAILABLE", data: { upcoming: page(), overdue: page() } }, laboratory: { state: "PERMISSION_DENIED", data: null } }); start(); await loaded();
  expect(within(screen.getByRole("region", { name: "Kasus" })).getAllByText("0")).toHaveLength(2);
  expect(screen.getByText("Tidak ada tindak lanjut terlambat.")).toBeInTheDocument();
  expect(screen.getByText("Belum ada jadwal dalam 7 hari ke depan.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sebelumnya" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Berikutnya" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Laboratorium" })).getByText("Bagian ini memerlukan izin baca yang sesuai.")).toBeInTheDocument();
});
it("keeps single-page queues compact and definitions optional", async () => {
  serve(); start(); await loaded();
  expect(screen.queryByRole("button", { name: "Berikutnya" })).not.toBeInTheDocument();
  expect(screen.getByText("Definisi & lingkup data").closest("details")).not.toHaveAttribute("open");
  const metrics = within(screen.getByRole("region", { name: "Ringkasan pekerjaan" }));
  expect(metrics.getByText("Tindak lanjut terlambat")).toBeInTheDocument();
  expect(metrics.getByText("Laboratorium tertunda")).toBeInTheDocument();
});
it("does not turn denied follow-up or laboratory counts into zeros", async () => {
  serve({ ...fixture, followUps: { state: "PERMISSION_DENIED", data: null }, laboratory: { state: "PERMISSION_DENIED", data: null } }); start(); await loaded();
  const metrics = within(screen.getByRole("region", { name: "Ringkasan pekerjaan" }));
  expect(metrics.queryByText("0")).not.toBeInTheDocument();
  expect(metrics.getAllByText("Akses terbatas")).toHaveLength(2);
});
it("paginates queues independently and keeps totals", async () => {
  const calls = backend(call => {
    if (call.url.endsWith("/me")) return Response.json(actor);
    if (call.url.includes("/operational-dashboard?")) {
      const current = Number(new URL(call.url, "https://fixture.invalid").searchParams.get("upcomingPage"));
      return Response.json({ ...fixture, followUps: { ...fixture.followUps, data: { ...fixture.followUps.data, upcoming: page(current ? [{ ...follow, patientName: "Fictional second page" }] : [follow], 11, current) } } });
    }
  }); start(); await loaded();
  await userEvent.click(within(screen.getByRole("region", { name: "Tindak lanjut mendatang" })).getByRole("button", { name: "Berikutnya" }));
  await screen.findByRole("link", { name: /Fictional second page/ }); expect(calls.at(-1)?.url).toContain("upcomingPage=1&overduePage=0&labPage=0");
  expect(within(screen.getByRole("region", { name: "Tindak lanjut mendatang" })).getByRole("button", { name: "Berikutnya" })).toBeDisabled();
  expect(screen.getByRole("link", { name: /Fictional overdue/ })).toBeInTheDocument();
});
it("shows loading without fabricated zeros", async () => {
  let resolve!: (response: Response) => void;
  backend(call => call.url.endsWith("/me") ? Response.json(actor) : call.url.includes("/operational-dashboard?") ? new Promise<Response>(done => { resolve = done; }) : undefined);
  start(); await screen.findByText("Memuat data…"); expect(screen.queryByText("0")).not.toBeInTheDocument(); resolve(Response.json(fixture)); await loaded();
});
it.each([403, 500])("shows safe HTTP %s failure without automatic retry", async status => {
  const calls = backend(call => call.url.endsWith("/me") ? Response.json(actor) : call.url.includes("/operational-dashboard?") ? failure(status, status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR") : undefined);
  start(); await screen.findByRole("button", { name: "Coba kembali" }); expect(screen.queryByText(/private server details|never display clinical prose/)).not.toBeInTheDocument();
  expect(calls.filter(call => call.url.includes("/operational-dashboard?")).length).toBe(1);
});
it("hides stale protected rows after a failed refresh", async () => {
  let requests = 0;
  backend(call => call.url.endsWith("/me") ? Response.json(actor) : call.url.includes("/operational-dashboard?") ? ++requests === 1 ? Response.json(fixture) : failure(403, "FORBIDDEN") : undefined);
  start(); await loaded(); await userEvent.click(screen.getByRole("button", { name: "Perbarui" }));
  await screen.findByRole("button", { name: "Coba kembali" }); expect(screen.queryByRole("link", { name: /Fictional follow-up/ })).not.toBeInTheDocument(); expect(requests).toBe(2);
});
it("rejects unexpected private fields and oversized queues", async () => {
  expect(dashboardSchema.safeParse({ ...fixture, nik: "PRIVATE" }).success).toBe(false);
  expect(dashboardSchema.safeParse({ ...fixture, laboratory: { state: "AVAILABLE", data: page(Array.from({ length: 11 }, () => lab)) } }).success).toBe(false);
  serve({ ...fixture, address: "PRIVATE" }); start(); await screen.findByRole("button", { name: "Coba kembali" }); expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
});
it.each(["permission", "facility"])("clears dashboard content after losing its %s scope", async context => {
  let changed = false;
  backend(call => call.url.endsWith("/me") ? Response.json(changed ? context === "permission" ? { ...actor, permissions: ["PATIENT_READ"] } : { ...actor, activeFacilities: [] } : actor) : call.url.includes("/operational-dashboard?") ? Response.json(fixture) : undefined);
  function Refresh() { const session = useSession(); return <button onClick={() => { changed = true; void session.refresh(); }}>Refresh context</button>; }
  renderClinical(<><Refresh /><DashboardPage /></>); await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Refresh context" }));
  await screen.findByRole("heading", { name: "Akses tidak diizinkan" }); expect(screen.queryByRole("link", { name: /Fictional follow-up/ })).not.toBeInTheDocument(); expect(screen.queryByText("7")).not.toBeInTheDocument();
});
