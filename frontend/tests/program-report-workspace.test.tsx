import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramReports } from "@/features/program-reports/monitor";
import { reportApi } from "@/features/program-reports/api";
import { fixtureUser } from "./fixtures";
import { ApiError } from "@/lib/api/problem";

vi.mock("@/features/program-reports/api", async original => ({ ...await original<typeof import("@/features/program-reports/api")>(), reportApi: { scopes: vi.fn(), bundle: vi.fn() } }));
const session = vi.hoisted(() => ({ user: null as unknown, handleFailure: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ useSession: () => session }));
const province = { scope: "PROVINCE" as const, code: "33", name: "Jawa Tengah" };
const regency = { scope: "REGENCY" as const, code: "33.01", name: "Cilacap" };
const bundle = { summary: { snapshotId: "release", dataAsOf: "2026-10-15T10:00:00Z", state: "AVAILABLE", summary: { geography: province, indicators: { caseEpisodes: 20, activeCaseEpisodes: 10, completedCaseEpisodes: 10, activeTreatmentEpisodes: 10, recordedTreatmentOutcomes: 10, representedFacilities: 1 } } }, breakdown: { snapshotId: "release", dataAsOf: "2026-10-15T10:00:00Z", state: "AVAILABLE", geography: province, rows: [{ geography: regency, indicators: { caseEpisodes: 20, activeCaseEpisodes: 10, completedCaseEpisodes: 10, activeTreatmentEpisodes: 10, recordedTreatmentOutcomes: 10, representedFacilities: 1 } }] }, metadata: { snapshotId: "release", dataAsOf: "2026-10-15T10:00:00Z", minimumPatientSupport: 10, catalogueVersion: "KEMENDAGRI_2025", dataQuality: "ALL_CASES_ATTRIBUTED", unattributedCaseEpisodes: null, sources: [], indicators: [], limitations: [] } };
beforeEach(() => {
  session.user = { ...fixtureUser, roles: [{ code: "PROGRAM_MONITOR", name: "Pemantau" }], permissions: ["REPORT_READ"] };
  vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [province] } });
  vi.mocked(reportApi.bundle).mockResolvedValue(bundle as never);
});
describe("monitor reporting workspace", () => {
  it("renders approved counts and fixed geographic navigation without clinical links", async () => {
    render(<ProgramReports />);
    expect(await screen.findByRole("heading", { name: "Pemantauan program" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Episode kasus" })).toBeInTheDocument();
    expect(screen.getByText("Data yang tercatat dalam TBCall — bukan statistik surveilans nasional resmi.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pasien/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cilacap" }));
    await waitFor(() => expect(reportApi.bundle).toHaveBeenLastCalledWith(regency, expect.any(AbortSignal)));
  });
  it("clears rendered results and cancels pending work on observed grant revocation", async () => {
    render(<ProgramReports />); await screen.findByRole("heading", { name: "Episode kasus" });
    vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [] } });
    fireEvent.focus(window);
    await screen.findByText("Belum ada penugasan wilayah");
    expect(screen.queryByRole("heading", { name: "Episode kasus" })).not.toBeInTheDocument();
  });
  it("never retains counts on forbidden, unpublished or mixed-snapshot responses", async () => {
    vi.mocked(reportApi.bundle).mockRejectedValue(new ApiError({ status: 503, title: "Berubah", code: "REPORT_SNAPSHOT_CHANGED" }));
    render(<ProgramReports />); await screen.findByText("Snapshot sedang diperbarui");
    expect(screen.queryByRole("heading", { name: "Episode kasus" })).not.toBeInTheDocument();
    vi.mocked(reportApi.bundle).mockRejectedValue(new ApiError({ status: 403, title: "Ditolak" }));
    fireEvent.focus(window); await screen.findByText("Akses laporan tidak tersedia");
    expect(screen.queryByText("20")).not.toBeInTheDocument();
  });
  it("does not show the previous account's data while a replacement request is pending", async () => {
    const view = render(<ProgramReports />); await screen.findByRole("heading", { name: "Episode kasus" });
    vi.mocked(reportApi.scopes).mockImplementation(() => new Promise(() => {}));
    session.user = { ...(session.user as typeof fixtureUser), id: "new-monitor" };
    view.rerender(<ProgramReports />);
    expect(screen.queryByRole("heading", { name: "Episode kasus" })).not.toBeInTheDocument();
    await act(async () => {});
  });
  it("rejects stale responses after an in-flight request is replaced", async () => {
    let resolve!: (value: never) => void;
    vi.mocked(reportApi.bundle).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<ProgramReports />); await waitFor(() => expect(reportApi.bundle).toHaveBeenCalled());
    vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [] } });
    fireEvent.focus(window); await screen.findByText("Belum ada penugasan wilayah");
    await act(async () => resolve(bundle as never));
    expect(screen.queryByRole("heading", { name: "Episode kasus" })).not.toBeInTheDocument();
  });
  it("preserves indicator, table page and keyboard focus during unchanged revalidation", async () => {
    vi.mocked(reportApi.bundle).mockResolvedValue({ ...bundle, breakdown: { ...bundle.breakdown, rows: Array.from({ length: 11 }, (_, i) => ({ ...bundle.breakdown.rows[0], geography: { ...regency, code: `fixture-${i}`, name: `Wilayah ${i}` } })) } } as never);
    render(<ProgramReports />); await screen.findByRole("heading", { name: "Episode kasus" });
    const select = screen.getByRole("combobox", { name: "Indikator" });
    fireEvent.change(select, { target: { value: "activeTreatmentEpisodes" } });
    fireEvent.click(screen.getByRole("button", { name: "Berikutnya" })); select.focus();
    fireEvent.focus(window);
    await waitFor(() => expect(reportApi.bundle).toHaveBeenCalledTimes(2));
    expect(select).toHaveValue("activeTreatmentEpisodes"); expect(select).toHaveFocus();
    expect(screen.getByText("11–11 dari 11")).toBeInTheDocument();
  });
  it("polls only while visible and stops when the workspace unmounts", async () => {
    vi.useFakeTimers();
    try {
      let view!: ReturnType<typeof render>;
      await act(async () => { view = render(<ProgramReports />); });
      expect(screen.getByRole("heading", { name: "Episode kasus" })).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(reportApi.scopes).toHaveBeenCalledTimes(2);
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(reportApi.scopes).toHaveBeenCalledTimes(2);
      view.unmount(); await vi.advanceTimersByTimeAsync(15_000);
      expect(reportApi.scopes).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it("does not fetch protected reports for no-grant or wrong-role users", async () => {
    vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [] } });
    const view = render(<ProgramReports />); await screen.findByText("Belum ada penugasan wilayah");
    expect(reportApi.bundle).not.toHaveBeenCalled();
    session.user = fixtureUser; view.rerender(<ProgramReports />);
    await screen.findByText("Akses laporan tidak tersedia");
    expect(reportApi.scopes).toHaveBeenCalledTimes(1);
  });
});
