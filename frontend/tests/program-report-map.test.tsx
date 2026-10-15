import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramReports } from "@/features/program-reports/monitor";
import { reportApi, type Geography } from "@/features/program-reports/api";
import { fixtureUser } from "./fixtures";

vi.mock("@/features/program-reports/api", async original => ({ ...await original<typeof import("@/features/program-reports/api")>(), reportApi: { scopes: vi.fn(), bundle: vi.fn() } }));
const session = vi.hoisted(() => ({ user: null as unknown, handleFailure: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ useSession: () => session }));
const national: Geography = { scope: "NATIONAL", code: null, name: "Indonesia" };
const province: Geography = { scope: "PROVINCE", code: "33", name: "Jawa Tengah" };
const regency: Geography = { scope: "REGENCY", code: "33.01", name: "Kabupaten Cilacap" };
const counts = (n: number) => ({ caseEpisodes: n, activeCaseEpisodes: n / 2, completedCaseEpisodes: n / 2, activeTreatmentEpisodes: n / 2, recordedTreatmentOutcomes: n / 2, representedFacilities: 1 });
function bundle(g: Geography) {
  const stamp = { snapshotId: "release", dataAsOf: "2026-10-15T10:00:00Z" };
  return { summary: { ...stamp, state: "AVAILABLE", summary: { geography: g, indicators: counts(g.scope === "NATIONAL" ? 100 : 60) } }, breakdown: { ...stamp, state: g.scope === "REGENCY" ? "LEAF_SCOPE" : "AVAILABLE", geography: g, rows: g.scope === "REGENCY" ? [] : g.scope === "NATIONAL" ? [{ geography: province, indicators: counts(60) }, { geography: { scope: "PROVINCE", code: "34", name: "DI Yogyakarta" }, indicators: counts(0) }] : [{ geography: regency, indicators: counts(40) }] }, metadata: { ...stamp, catalogueVersion: "KEMENDAGRI_2025_2138_AMENDED_2430", minimumPatientSupport: 10, unattributedCaseEpisodes: null, sources: [] } };
}
function polygon(code: string, name: string, parent: string | null, x: number) {
  return { type: "Feature", properties: { code, name, parent }, geometry: { type: "Polygon", coordinates: [[[x, -8], [x + 1, -8], [x + 1, -7], [x, -7], [x, -8]]] } };
}
const provinces = { type: "FeatureCollection", features: [polygon("33", "Jawa Tengah", null, 109), polygon("34", "Daerah Istimewa Yogyakarta", null, 110)] };
const districts = { type: "FeatureCollection", features: [polygon("33.01", "Kabupaten Cilacap", "33", 109), polygon("33.02", "Kabupaten Banyumas", "33", 110)] };
function topology(input: { features: { properties: object; geometry: { coordinates: number[][][] } }[] }) {
  const arcs: number[][][] = [];
  const geometries = input.features.map(f => ({ type: "Polygon", properties: f.properties, arcs: f.geometry.coordinates.map(ring => {
    let x = 0, y = 0;
    const index = arcs.length;
    arcs.push(ring.map(p => { const nextX = Math.round(p[0] * 1e7), nextY = Math.round(p[1] * 1e7), d = [nextX - x, nextY - y]; x = nextX; y = nextY; return d; }));
    return [index];
  }) }));
  return { type: "Topology", transform: { scale: [1e-7, 1e-7], translate: [0, 0] }, objects: { regions: { type: "GeometryCollection", geometries } }, arcs };
}
beforeEach(() => {
  session.user = { ...fixtureUser, roles: [{ code: "PROGRAM_MONITOR", name: "Monitor" }], permissions: ["REPORT_READ"] };
  vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [national] } });
  vi.mocked(reportApi.bundle).mockImplementation(async g => bundle(g) as never);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(topology(url.includes("provinces") ? provinces : districts))));
});

describe("indicative geographic reporting map", () => {
  it("makes administrative polygons the primary view with one six-indicator selector", async () => {
    render(<ProgramReports />);
    const map = await screen.findByRole("region", { name: "Peta wilayah" });
    expect(await within(map).findByRole("button", { name: /Jawa Tengah.*60/ })).toBeInTheDocument();
    expect(within(map).getByRole("button", { name: /Daerah Istimewa Yogyakarta.*0/ })).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: "Indikator" })).toHaveLength(1);
    expect(within(screen.getByRole("combobox", { name: "Indikator" })).getAllByRole("option")).toHaveLength(6);
    expect(screen.getByText(/Batas indikatif/)).toBeInTheDocument();
    expect(screen.getByText("Peringkat & tabel wilayah").closest("details")).not.toHaveAttribute("open");
    fireEvent.change(screen.getByRole("combobox", { name: "Indikator" }), { target: { value: "activeTreatmentEpisodes" } });
    expect(within(map).getByRole("button", { name: /Jawa Tengah.*30/ })).toBeInTheDocument();
  });
  it("uses authorized detail APIs for keyboard province/district drill-down and parent return", async () => {
    render(<ProgramReports />);
    fireEvent.keyDown(await screen.findByRole("button", { name: /Jawa Tengah.*60/ }), { key: "Enter" });
    await waitFor(() => expect(reportApi.bundle).toHaveBeenLastCalledWith(province, expect.any(AbortSignal)));
    fireEvent.click(await screen.findByRole("button", { name: /Kabupaten Cilacap.*40/ }));
    await waitFor(() => expect(reportApi.bundle).toHaveBeenLastCalledWith(regency, expect.any(AbortSignal)));
    const map = screen.getByRole("region", { name: "Peta wilayah" });
    expect(await within(map).findByRole("button", { name: /Kabupaten Cilacap.*60/ })).toBeInTheDocument();
    expect(within(map).queryByRole("button", { name: /Banyumas/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kembali ke Jawa Tengah" }));
    await waitFor(() => expect(reportApi.bundle).toHaveBeenLastCalledWith(province, expect.any(AbortSignal)));
  });
  it("restricts a regency root to its own geometry and never requests a parent report", async () => {
    vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [regency] } });
    render(<ProgramReports />);
    expect(await screen.findByRole("button", { name: /Kabupaten Cilacap.*60/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Banyumas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kembali ke/ })).not.toBeInTheDocument();
    expect(reportApi.bundle).toHaveBeenCalledTimes(1);
    expect(reportApi.bundle).toHaveBeenCalledWith(regency, expect.any(AbortSignal));
  });
  it("distinguishes unavailable values from actual zero without inventing a zero", async () => {
    vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [province] } });
    render(<ProgramReports />);
    const missing = await screen.findByRole("button", { name: /Kabupaten Banyumas.*Data tidak tersedia/ });
    expect(missing).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(missing);
    expect(reportApi.bundle).toHaveBeenCalledTimes(1);
  });
  it("reports missing geometry safely and retains the authorized data alternative", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    render(<ProgramReports />);
    expect(await screen.findByText("Peta belum tersedia")).toBeInTheDocument();
    expect(screen.getByText("Peringkat & tabel wilayah")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Episode kasus" })).toBeInTheDocument();
  });
  it("provides zoom controls and focus information without requiring hover", async () => {
    render(<ProgramReports />);
    const path = await screen.findByRole("button", { name: /Jawa Tengah.*60/ });
    fireEvent.focus(path);
    expect(screen.getByRole("status", { name: "Wilayah dipilih" })).toHaveTextContent("Jawa Tengah");
    const svg = path.closest("svg")!;
    const initial = svg.getAttribute("viewBox");
    fireEvent.click(screen.getByRole("button", { name: "Perbesar peta" }));
    expect(svg.getAttribute("viewBox")).not.toBe(initial);
    fireEvent.click(screen.getByRole("button", { name: "Atur ulang peta" }));
    expect(svg.getAttribute("viewBox")).toBe(initial);
  });
  it("rejects altered identity metadata and unexpected private fields in geometry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(topology({ features: [{ ...provinces.features[0], properties: { ...provinces.features[0].properties, patientId: "forbidden-fixture" } }] }))));
    render(<ProgramReports />);
    expect(await screen.findByText("Peta belum tersedia")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Jawa Tengah.*60/ })).not.toBeInTheDocument();
  });
  it("never permits geometry to substitute for a denied reporting grant", async () => {
    session.user = { ...fixtureUser, roles: [{ code: "SYSTEM_ADMIN", name: "Admin" }], permissions: ["REPORT_READ"] };
    render(<ProgramReports />);
    expect(await screen.findByText("Akses laporan tidak tersedia")).toBeInTheDocument();
    expect(reportApi.bundle).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("discards a late national geometry response after switching to a provincial assignment", async () => {
    vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [national, province] } });
    let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("provinces") ? new Promise<Response>(r => { finish = r; }) : Promise.resolve(Response.json(topology(districts)))));
    render(<ProgramReports />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("combobox", { name: "Wilayah penugasan" }), { target: { value: "PROVINCE:33" } });
    expect(await screen.findByRole("button", { name: /Kabupaten Cilacap.*40/ })).toBeInTheDocument();
    finish(Response.json(topology(provinces)));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Jawa Tengah.*60/ })).not.toBeInTheDocument());
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).startsWith("/geography/hdx-2020/"))).toBe(true);
  });
  it("clears the map on observed remote revocation and never retains a tooltip value", async () => {
    render(<ProgramReports />);
    fireEvent.focus(await screen.findByRole("button", { name: /Jawa Tengah.*60/ }));
    expect(screen.getByRole("status", { name: "Wilayah dipilih" })).toHaveTextContent("60");
    vi.mocked(reportApi.scopes).mockResolvedValue({ data: { catalogueVersion: "v", scopes: [] } });
    fireEvent.focus(window);
    expect(await screen.findByText("Belum ada penugasan wilayah")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Peta wilayah" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Wilayah dipilih" })).not.toBeInTheDocument();
  });
  it("keeps real zero, unavailable cells, colors and legend labels distinct for every indicator", async () => {
    render(<ProgramReports />);
    const positive = await screen.findByRole("button", { name: /Jawa Tengah.*60/ });
    const zero = screen.getByRole("button", { name: /Daerah Istimewa Yogyakarta.*0/ });
    expect(positive).toHaveAttribute("fill", "#006d5b");
    expect(zero).toHaveAttribute("fill", "#f5f8fa");
    const legend = screen.getByLabelText("Legenda peta");
    expect(legend).toHaveTextContent("49–60");
    expect(legend).toHaveTextContent("Tidak tersedia");
    for (const metric of ["activeCaseEpisodes", "completedCaseEpisodes", "activeTreatmentEpisodes", "recordedTreatmentOutcomes", "representedFacilities"]) {
      fireEvent.change(screen.getByRole("combobox", { name: "Indikator" }), { target: { value: metric } });
      expect(positive).toHaveAttribute("fill", metric === "representedFacilities" ? "#ccece6" : "#006d5b");
      expect(positive.querySelector("title")).toHaveTextContent("Jawa Tengah");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("clears selection from an older publication and renders only the new snapshot's values", async () => {
    render(<ProgramReports />);
    fireEvent.focus(await screen.findByRole("button", { name: /Jawa Tengah.*60/ }));
    expect(screen.getByRole("status", { name: "Wilayah dipilih" })).toHaveTextContent("60");
    const next = bundle(national);
    for (const part of [next.summary, next.breakdown, next.metadata]) part.snapshotId = "new-publication";
    next.summary.summary.indicators = counts(200);
    next.breakdown.rows[0].indicators = counts(120);
    vi.mocked(reportApi.bundle).mockResolvedValue(next as never);
    fireEvent.click(screen.getByRole("button", { name: "Perbarui" }));
    await screen.findByRole("button", { name: /Jawa Tengah.*120/ });
    expect(screen.getByRole("status", { name: "Wilayah dipilih" })).toHaveTextContent("Indonesia");
    expect(screen.queryByRole("button", { name: /Jawa Tengah.*60/ })).not.toBeInTheDocument();
  });
});
