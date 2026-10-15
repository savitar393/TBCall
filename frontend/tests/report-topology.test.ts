import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeGeometry } from "@/features/program-reports/topology";

const props = { code: "33.01", name: "Kabupaten Cilacap", parent: "33" };
const ring = [[1_000_000_000, -80_000_000], [10, 0], [0, 10], [-10, 0], [0, -10]];
function input(refs: number[][] = [[0]], arcs = [ring]) {
  return { type: "Topology", transform: { scale: [1e-7, 1e-7], translate: [0, 0] }, objects: { regions: { type: "GeometryCollection", geometries: [{ type: "Polygon", properties: props, arcs: refs }] } }, arcs };
}
describe("qualified TopoJSON decoding", () => {
  it("decodes fixed-point delta coordinates, holes and reverse references", () => {
    const decoded = decodeGeometry(input([[0], [-1]]));
    expect(decoded.features[0].geometry.coordinates).toEqual([
      [[100, -8], [100.000001, -8], [100.000001, -7.999999], [100, -7.999999], [100, -8]],
      [[100, -8], [100, -7.999999], [100.000001, -7.999999], [100.000001, -8], [100, -8]],
    ]);
  });
  it("rejects disconnected arcs rather than silently replacing their endpoints", () => {
    expect(() => decodeGeometry(input([[0, 1]], [ring.slice(0, 3), ring]))).toThrow("Disconnected geometry arcs");
  });
  it("rejects missing arcs, unclosed rings and unsupported transforms", () => {
    expect(() => decodeGeometry(input([[2]]))).toThrow();
    expect(() => decodeGeometry(input([[0]], [ring.slice(0, 4)]))).toThrow();
    const data = input(); data.transform.translate = [1, 0];
    expect(() => decodeGeometry(data)).toThrow();
  });
  it("rejects clinical attributes embedded in public geometry", () => {
    const data = input(); Object.assign(data.objects.regions.geometries[0].properties, { patients: 10 });
    expect(() => decodeGeometry(data)).toThrow();
  });
  it.each([NaN, Infinity, 1.5, "10", null, 2_147_483_648])("rejects invalid deltas: %s", delta => {
    const data = input();
    (data.arcs[0][1] as unknown[])[0] = delta;
    expect(() => decodeGeometry(data)).toThrow();
  });
  it("rejects oversized tuples and decoded coordinates outside the geographic bounds", () => {
    const data = input(); data.arcs[0][1].push(0);
    expect(() => decodeGeometry(data)).toThrow();
    const outside = input(); outside.arcs[0][0][0] = 1_810_000_000;
    expect(() => decodeGeometry(outside)).toThrow();
  });
  it("reads the actual shipped national geometry, including multipart islands", () => {
    const data = JSON.parse(readFileSync("public/geography/hdx-2020/provinces.topo.json", "utf8"));
    const decoded = decodeGeometry(data);
    expect(decoded.features).toHaveLength(38);
    expect(new Set(decoded.features.map(f => f.properties.code)).size).toBe(38);
    expect(decoded.features.every(f => f.properties.parent === null)).toBe(true);
    expect(decoded.features.some(f => f.geometry.type === "MultiPolygon")).toBe(true);
  });
});
