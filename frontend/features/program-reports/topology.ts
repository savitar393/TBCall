import { z } from "@/lib/validation";

const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const rings = z.array(z.array(point).min(4).max(100_000)).min(1).max(10_000);
const properties = z.object({ code: z.string(), name: z.string(), parent: z.string().nullable() }).strict();
const geometry = z.discriminatedUnion("type", [z.object({ type: z.literal("Polygon"), coordinates: rings }).strict(), z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(rings).min(1).max(10_000) }).strict()]);
const feature = z.object({ type: z.literal("Feature"), properties, geometry }).strict();
export type MapFeature = z.infer<typeof feature>;
const integer = z.number().int().min(-2_147_483_648).max(2_147_483_647);
const arc = z.array(integer).min(1).max(10_000);
const polygon = z.array(arc).min(1).max(10_000);
const encodedGeometry = z.discriminatedUnion("type", [z.object({ type: z.literal("Polygon"), properties, arcs: polygon }).strict(), z.object({ type: z.literal("MultiPolygon"), properties, arcs: z.array(polygon).min(1).max(10_000) }).strict()]);
const topology = z.object({
  type: z.literal("Topology"),
  // This reader intentionally accepts only the fixed precision of our qualified assets.
  transform: z.object({ scale: z.tuple([z.literal(1e-7), z.literal(1e-7)]), translate: z.tuple([z.literal(0), z.literal(0)]) }).strict(),
  objects: z.object({ regions: z.object({ type: z.literal("GeometryCollection"), geometries: z.array(encodedGeometry).min(1).max(514) }).strict() }).strict(),
  arcs: z.array(z.array(z.tuple([integer, integer])).min(2).max(100_000)).max(20_000),
}).strict();

/** TopoJSON delta arcs, per the published specification. No external runtime or map requests. */
export function decodeGeometry(input: unknown): { features: MapFeature[] } {
  const data = topology.parse(input);
  const arcs = data.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x / 1e7, y / 1e7]; });
  });
  function ring(refs: number[]) {
    const result: number[][] = [];
    for (const ref of refs) {
      const index = ref < 0 ? ~ref : ref;
      if (!arcs[index]) throw new Error("Invalid geometry arc");
      const points = ref < 0 ? [...arcs[index]].reverse() : arcs[index];
      if (result.length) {
        const last = result.at(-1)!;
        if (last[0] !== points[0][0] || last[1] !== points[0][1]) throw new Error("Disconnected geometry arcs");
        result.pop(); // Adjacent arcs repeat their shared endpoint.
      }
      for (const point of points) result.push(point);
    }
    if (result.length < 4 || result[0][0] !== result.at(-1)![0] || result[0][1] !== result.at(-1)![1]) throw new Error("Unclosed geometry ring");
    return result;
  }
  return { features: data.objects.regions.geometries.map(g => feature.parse({ type: "Feature", properties: g.properties, geometry: g.type === "Polygon" ? { type: g.type, coordinates: g.arcs.map(ring) } : { type: g.type, coordinates: g.arcs.map(p => p.map(ring)) } })) };
}
