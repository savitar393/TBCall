import { z } from "@/lib/validation";
import { apiRequest, type ApiOptions } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), text = z.string(), uuid = z.uuid();
export const geography = z.object({ scope: z.enum(["NATIONAL", "PROVINCE", "REGENCY"]), code: text.nullable(), name: text }).strict();
export type Geography = z.infer<typeof geography>;
export const indicators = z.object({ caseEpisodes: count, activeCaseEpisodes: count, completedCaseEpisodes: count, activeTreatmentEpisodes: count, recordedTreatmentOutcomes: count, representedFacilities: count }).strict();
export type Indicator = keyof z.infer<typeof indicators>;
const cell = z.object({ geography, indicators }).strict();
const stamp = { snapshotId: uuid, dataAsOf: text };
const summary = z.object({ ...stamp, state: z.literal("AVAILABLE"), summary: cell }).strict();
const breakdown = z.object({ ...stamp, state: z.enum(["AVAILABLE", "LEAF_SCOPE"]), geography, rows: z.array(cell).max(514) }).strict();
const definition = z.object({ code: text, countingUnit: text, inclusion: text, attribution: text, dateBasis: text, limitation: text }).strict();
const metadata = z.object({ ...stamp, dataSource: z.literal("TBCALL_HELD_RECORDS_NOT_OFFICIAL_SURVEILLANCE"), reportingBasis: z.literal("APPROVED_CURRENT_STATE_SNAPSHOT"), catalogueVersion: text, codeNamespace: text, effectiveOn: text, catalogueCheckedOn: text, sources: z.array(z.object({ url: z.url(), sha256: text }).strict()), geography, minimumPatientSupport: count, disclosurePolicy: text, dataQuality: text, unattributedCaseEpisodes: count.nullable(), indicators: z.array(definition), limitations: z.array(text) }).strict();
const scopes = z.object({ catalogueVersion: text, scopes: z.array(geography).max(553) }).strict();
export const grantSchema = z.object({ id: uuid, userId: uuid, scope: geography.shape.scope, regionCode: text.nullable(), catalogueVersion: text, version: count, assignedAt: text, revokedAt: text.nullable() }).strict();
export const candidateSchema = z.object({ id: uuid, version: count, state: z.enum(["DRAFT", "PUBLISHED"]), dataAsOf: text, catalogueVersion: text }).strict();
export type Grant = z.infer<typeof grantSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
async function request<S extends z.ZodType>(path: string, schema: S, options: ApiOptions = {}) {
  const response = await apiRequest<unknown>(path, options), parsed = schema.safeParse(response.data);
  if (!parsed.success) throw new ApiError({ status: 502, title: "Respons laporan tidak valid", code: "INVALID_RESPONSE" });
  return { ...response, data: parsed.data as z.infer<S> };
}
export function consistentSnapshot(parts: { snapshotId: string }[]) {
  if (parts.length !== 3 || parts.some(p => p.snapshotId !== parts[0].snapshotId)) throw new ApiError({ status: 503, title: "Snapshot sedang berubah", code: "REPORT_SNAPSHOT_CHANGED" });
}
export function requiredEtag(etag?: string) {
  if (!etag) throw new ApiError({ status: 428, title: "Muat ulang versi server", code: "PRECONDITION_REQUIRED" });
  return etag;
}
const base = "/v1/program-reports", admin = "/v1/admin", segment = encodeURIComponent;
export const reportApi = {
  scopes: (signal: AbortSignal) => request(`${base}/scopes`, scopes, { signal }),
  async bundle(target: Geography, signal: AbortSignal) {
    const query = new URLSearchParams({ scope: target.scope }); if (target.code !== null) query.set("regionCode", target.code);
    const [s, b, m] = await Promise.all([request(`${base}/summary?${query}`, summary, { signal }), request(`${base}/breakdown?${query}`, breakdown, { signal }), request(`${base}/metadata?${query}`, metadata, { signal })]);
    consistentSnapshot([s.data, b.data, m.data]);
    const same = (g: Geography) => g.scope === target.scope && g.code === target.code;
    if (![s.data.summary.geography, b.data.geography, m.data.geography].every(same) || new Set([s.data.dataAsOf, b.data.dataAsOf, m.data.dataAsOf]).size !== 1)
      throw new ApiError({ status: 502, title: "Lingkup laporan tidak sesuai", code: "INVALID_RESPONSE" });
    return { summary: s.data, breakdown: b.data, metadata: m.data };
  },
  grants: (user: string, signal: AbortSignal) => request(`${admin}/users/${segment(user)}/reporting-scopes`, z.array(grantSchema).max(553), { signal }),
  grant: (user: string, id: string, signal: AbortSignal) => request(`${admin}/users/${segment(user)}/reporting-scopes/${segment(id)}`, grantSchema, { signal }),
  assign: (user: string, scope: Geography["scope"], regionCode: string, signal: AbortSignal) => request(`${admin}/users/${segment(user)}/reporting-scopes`, grantSchema, { method: "POST", body: { scope, ...(scope === "NATIONAL" ? {} : { regionCode }) }, signal }),
  revoke: (user: string, id: string, etag: string, signal: AbortSignal) => request(`${admin}/users/${segment(user)}/reporting-scopes/${segment(id)}`, grantSchema, { method: "DELETE", etag: requiredEtag(etag), signal }),
  capture: (signal: AbortSignal) => request(`${admin}/reporting-snapshots`, candidateSchema, { method: "POST", signal }),
  candidate: (id: string, signal: AbortSignal) => request(`${admin}/reporting-snapshots/${segment(id)}`, candidateSchema, { signal }),
  publish: (id: string, etag: string, signal: AbortSignal) => request(`${admin}/reporting-snapshots/${segment(id)}/publish`, candidateSchema, { method: "POST", body: { approved: true }, etag: requiredEtag(etag), signal }),
};
export type ReportBundle = Awaited<ReturnType<typeof reportApi.bundle>>;
