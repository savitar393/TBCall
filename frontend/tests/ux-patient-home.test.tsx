import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ME_QUERY_KEY } from "@/lib/auth/session";
import { failure, portalBackend, renderPortal, routing, type Call } from "./portal-harness";
import * as f from "./portal-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));

const lifecycle = {
  treatmentStatus: "ACTIVE",
  futureExpectationsAllowed: true,
  actualEndDate: null,
  historyBoundaryKnown: false,
};
const prescription = {
  kind: "PRESCRIBED_SCHEDULE",
  id: f.id,
  treatmentId: f.id,
  version: 0,
  status: "ACTIVE",
  currentRevision: {
    id: f.caseId,
    revisionNumber: 1,
    status: "ACTIVE",
    timeZone: "Asia/Makassar",
    startDate: "2026-10-01",
    endDate: null,
    recurrence: "DAILY",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    times: ["08:45"],
    validFrom: "2026-10-01T00:00:00Z",
    validUntil: null,
    createdAt: "2026-10-01T00:00:00Z",
  },
  cancelledAt: null,
  lifecycle,
};

function scheduleBackend(
  actor = f.patient,
  override?: (call: Call) => Response | undefined,
) {
  return portalBackend(actor, call => {
    const custom = override?.(call);
    if (custom) return custom;
    if (call.url.endsWith("/medication-schedule")) {
      return Response.json(prescription);
    }
    if (call.url.includes("/medication-schedule/occurrences")) {
      const params = new URL(call.url, "https://test").searchParams;
      const from = params.get("from")!;
      const to = params.get("to")!;
      const containsUpcoming = from <= "2026-10-07" && to >= "2026-10-07";
      return Response.json({
        from,
        to,
        content: containsUpcoming ? [{
          kind: "EXPECTED_OCCURRENCE",
          id: `${f.caseId}/2026-10-07/08:45`,
          scheduleId: f.id,
          revisionId: f.caseId,
          treatmentId: f.id,
          localDate: "2026-10-07",
          localTime: "08:45",
          timeZone: "Asia/Makassar",
          scheduledAt: "2026-10-07T08:45:00+08:00",
          offsetResolution: "UNAMBIGUOUS",
        }] : [],
        exceptions: [],
        lifecycle,
      });
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T00:30:00Z"));
});
afterEach(() => vi.useRealTimers());

function ActivityCacheControls({ permission, cacheName }: { permission: string; cacheName: string }) {
  const client = useQueryClient();
  return <>
    <button onClick={() => void client.invalidateQueries({ queryKey: ["portal", f.patient.id, cacheName] })}>Refresh activity fixture</button>
    <button onClick={() => client.setQueryData(ME_QUERY_KEY, {
      ...f.patient,
      permissions: f.patient.permissions.filter(value => value !== permission),
    })}>Remove activity permission fixture</button>
  </>;
}

const activityCases = [
  ["ADHERENCE_READ", "doses", "/dose-events", "Laporan dosis"],
  ["FOLLOW_UP_READ", "follow-ups", "/follow-ups", "Tindak lanjut"],
  ["MONITORING_READ", "monitoring", "/monitoring", "Tinjauan klinis"],
] as const;

it.each(activityCases)("home hides retained %s activity after a failed refresh and reports incomplete coverage", async (permission, cacheName, path, title) => {
  let failRead = false;
  scheduleBackend(f.patient, call => failRead && call.url.split("?")[0].endsWith(path)
    ? failure(503, "UNAVAILABLE")
    : undefined);
  await renderPortal("home", <ActivityCacheControls permission={permission} cacheName={cacheName}/>);
  const today = (await screen.findByRole("heading", { name: "Kegiatan hari ini" })).closest("section")!;
  await within(today).findByText(title);
  await within(today).findByText("3 catatan tersedia");
  failRead = true;
  await userEvent.click(screen.getByRole("button", { name: "Refresh activity fixture" }));
  await within(today).findByRole("button", { name: "Coba kembali" });
  expect(within(today).queryByText(title)).not.toBeInTheDocument();
  expect(within(today).getByText(/Catatan belum lengkap/)).toBeInTheDocument();
  expect(within(today).getAllByRole("article")).toHaveLength(2);
});

it.each(activityCases)("home removes cached %s activity immediately when its read permission is removed", async (permission, cacheName, path, title) => {
  const calls = scheduleBackend();
  await renderPortal("home", <ActivityCacheControls permission={permission} cacheName={cacheName}/>);
  let today = (await screen.findByRole("heading", { name: "Kegiatan hari ini" })).closest("section")!;
  await within(today).findByText(title);
  await within(today).findByText("3 catatan tersedia");
  const previousReads = calls.filter(call => call.url.split("?")[0].endsWith(path)).length;
  await userEvent.click(screen.getByRole("button", { name: "Remove activity permission fixture" }));
  today = screen.getByRole("heading", { name: "Kegiatan hari ini" }).closest("section")!;
  await within(today).findByText("2 catatan tersedia");
  expect(within(today).queryByText(title)).not.toBeInTheDocument();
  expect(within(today).getAllByRole("article")).toHaveLength(2);
  expect(calls.filter(call => call.url.split("?")[0].endsWith(path))).toHaveLength(previousReads);
});

it("home shows the prescribed upcoming time in its prescription zone separately from dose reports", async () => {
  scheduleBackend();
  await renderPortal("home");
  const agenda = await screen.findByRole("region", { name: "Jadwal minum obat" });
  const upcoming = await within(agenda).findByText("Waktu berikutnya dalam periode yang dimuat");
  expect(within(upcoming.parentElement!).getByText("08:45")).toBeInTheDocument();
  expect(within(upcoming.parentElement!).getByText(/WITA · Waktu Indonesia Tengah/)).toBeInTheDocument();
  expect(within(agenda).getByText(/Laporan minum obat ditampilkan terpisah/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Laporan dosis terbaru" })).toBeInTheDocument();
  expect(screen.queryByText(/Waktu minum obat yang diresepkan belum tersedia/)).not.toBeInTheDocument();
});

it("home leaves an absent prescription empty without inventing times or loading occurrences", async () => {
  const calls = portalBackend();
  await renderPortal("home");
  await screen.findByText("Belum ada jadwal obat");
  expect(calls.some(call => call.url.includes("/occurrences"))).toBe(false);
  expect(screen.queryByText("08:45")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Laporan dosis terbaru" })).toBeInTheDocument();
});

it.each([
  ["TREATMENT_READ", "/medication-schedule"],
  ["ADHERENCE_READ", "/dose-events"],
  ["FOLLOW_UP_READ", "/follow-ups"],
  ["MONITORING_READ", "/monitoring"],
  ["NOTIFICATION_READ_SELF", "/notifications"],
])("home independently gates %s without hiding other readable sections", async (permission, path) => {
  const calls = scheduleBackend({
    ...f.patient,
    permissions: f.patient.permissions.filter(value => value !== permission),
  });
  await renderPortal("home");
  if (permission === "TREATMENT_READ") {
    await screen.findByText(/Izin baca jadwal belum tersedia/);
    await waitFor(() => expect(calls.some(call => call.url.split("?")[0].endsWith("/dose-events"))).toBe(true));
  } else {
    await screen.findByText(/Jadwal lengkap untuk/);
  }
  expect(calls.some(call => call.url.split("?")[0].endsWith(path))).toBe(false);
  expect(screen.getByRole("heading", { name: "Kegiatan hari ini" })).toBeInTheDocument();
});

it("an unlinked home explains account linking and issues no clinical reads", async () => {
  const calls = scheduleBackend({ ...f.patient, patientLink: null });
  await renderPortal("home");
  await screen.findByRole("heading", { name: "Akun belum terhubung" });
  await screen.findByRole("heading", { name: "Notifikasi untuk Anda" });
  expect(calls.some(call => /\/(medication-schedule|dose-events|follow-ups|monitoring|patient|treatment)(\/|\?|$)/.test(call.url))).toBe(false);
  expect(screen.getByRole("link", { name: "Bantuan Langkah untuk menghubungi petugas" })).toHaveAttribute("href", "/portal/support");
  expect(screen.queryByText("08:45")).not.toBeInTheDocument();
});

it("home withholds upcoming occurrences when one calendar chunk fails and preserves dose evidence", async () => {
  let chunk = 0;
  const calls = scheduleBackend(f.patient, call => {
    if (call.url.includes("/occurrences") && ++chunk === 2) {
      return failure(503, "UNAVAILABLE");
    }
  });
  await renderPortal("home");
  await screen.findByText(/belum dapat ditampilkan lengkap/);
  expect(calls.filter(call => call.url.includes("/occurrences"))).toHaveLength(2);
  expect(screen.queryByText("Waktu berikutnya dalam periode yang dimuat")).not.toBeInTheDocument();
  const reports = screen.getByRole("heading", { name: "Laporan dosis terbaru" }).closest("section")!;
  expect(await within(reports).findByText("Tidak diminum")).toBeInTheDocument();
  expect(screen.queryByText(/private clinical detail/)).not.toBeInTheDocument();
});

it("home opens the existing calendar and refreshes its schedule using reads only", async () => {
  const calls = scheduleBackend();
  await renderPortal("home");
  await screen.findByText(/Jadwal lengkap untuk/);
  expect(screen.getByRole("link", { name: "Buka kalender" })).toHaveAttribute("href", "/portal/calendar");
  expect(screen.getByRole("link", { name: "Profil Informasi pribadi dan registrasi" })).toHaveAttribute("href", "/portal/profile");
  const priorReads = calls.filter(call => call.url.endsWith("/medication-schedule")).length;
  await userEvent.click(screen.getByRole("button", { name: "Perbarui jadwal" }));
  await waitFor(() => expect(calls.filter(call => call.url.endsWith("/medication-schedule")).length).toBeGreaterThan(priorReads));
  await screen.findByText(/Jadwal lengkap untuk/);
  expect(calls.every(call => !call.options.method || call.options.method === "GET")).toBe(true);
});
