import { expect, it, vi } from "vitest";
import { labReferences, labDetail, labPage, labSpecimen, labResult, resultResponse, labOfficer, labStaff } from "./laboratory-fixtures";
const modules = import.meta.glob("../features/laboratory/**/*.ts");
async function module<T>(path: string): Promise<T> { const loader = modules[`../features/laboratory/${path}.ts`]; expect(loader, `Missing laboratory module ${path}`).toBeDefined(); return await loader!() as T; }
type Schemas = typeof import("@/features/laboratory/schemas");
it.each([["referenceDataSchema", labReferences], ["requestDetailSchema", labDetail], ["requestPageSchema", labPage], ["requestSummarySchema", labPage.content[0]], ["specimenSchema", labSpecimen], ["resultSchema", labResult], ["resultResponseSchema", resultResponse]] as const)("%s validates the exact full backend projection and rejects extra or missing fields", async (name, fixture) => {
  const schemas = await module<Schemas>("schemas");
  expect(schemas[name].safeParse(fixture).success).toBe(true);
  expect(schemas[name].safeParse({ ...fixture, patientSecret: "private" }).success).toBe(false);
  const missing = { ...fixture }; delete missing[Object.keys(missing)[0] as keyof typeof missing];
  expect(schemas[name].safeParse(missing).success).toBe(false);
});
it("rejects enriched patient identity and malformed nested versions/timestamps", async () => {
  const { requestDetailSchema } = await module<Schemas>("schemas");
  expect(requestDetailSchema.safeParse({ ...labDetail, patient: { ...labDetail.patient, nik: "1234567890123456" } }).success).toBe(false);
  expect(requestDetailSchema.safeParse({ ...labDetail, tests: [{ ...labDetail.tests[0], version: Number.MAX_SAFE_INTEGER + 1 }] }).success).toBe(false);
  expect(requestDetailSchema.safeParse({ ...labDetail, specimens: [{ ...labSpecimen, collectedAt: "2026-09-01T09:00" }] }).success).toBe(false);
});
it.each([0, 7, 11, Number.MAX_SAFE_INTEGER])("lab child version %s produces exactly its quoted integer", async version => {
  const { labEtagFromVersion } = await module<typeof import("@/features/laboratory/etag")>("etag");
  expect(labEtagFromVersion(version)).toBe(`"${version}"`);
});
it.each([-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])("invalid child version %s cannot produce an If-Match", async version => {
  const { labEtagFromVersion } = await module<typeof import("@/features/laboratory/etag")>("etag"); expect(() => labEtagFromVersion(version)).toThrow();
});
it("serializes datetime-local using actual browser local timezone and round-trips returned offsets", async () => {
  const time = await module<typeof import("@/features/laboratory/time")>("time");
  expect(time.localDateTimeToIso("2026-09-01T09:30")).toBe(new Date(2026, 8, 1, 9, 30).toISOString());
  expect(time.isoToLocalDateTime("2026-09-01T09:30:00+07:00")).toBe(time.isoToLocalDateTime("2026-09-01T02:30:00Z"));
  expect(time.browserTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
});
it.each(["", "2026-02-30T09:30", "2026-09-01T25:00", "2026-09-01T09:30Z"])("invalid local timestamp %s is rejected without normalization", async input => {
  const { localDateTimeToIso } = await module<typeof import("@/features/laboratory/time")>("time"); expect(() => localDateTimeToIso(input)).toThrow();
});
it("independent roles, permissions and facility scopes gate read/source/testing", async () => {
  const p = await module<typeof import("@/features/laboratory/permissions")>("permissions");
  expect(p.canLabRead(labOfficer)).toBe(true); expect(p.canLabRead(labStaff)).toBe(true);
  expect(p.canLabRead({ ...labOfficer, roles: [{ code: "PATIENT", name: "Pasien" }] })).toBe(false);
  expect(p.canLabRead({ ...labOfficer, permissions: [] })).toBe(false);
  expect(p.canLabSource(labOfficer, labDetail.requestingFacility.id)).toBe(true);
  expect(p.canLabSource(labOfficer, labDetail.testingFacility.id)).toBe(false);
  expect(p.canLabTesting(labStaff, labDetail.testingFacility.id)).toBe(true);
  expect(p.canLabTesting(labOfficer, labDetail.requestingFacility.id)).toBe(false);
});
it("explicit result and correction mappers convert time, clear blanks and never change correction lineage", async () => {
  const m = await module<typeof import("@/features/laboratory/forms/mappers")>("forms/mappers");
  const v = { specimenId: "", testedAt: "2026-09-01T09:30", resultCode: " FREE ", resultValue: "", resultText: " Narasi " };
  expect(m.resultInput(v)).toEqual({ specimenId: null, testedAt: new Date(2026, 8, 1, 9, 30).toISOString(), resultCode: "FREE", resultValue: null, resultText: "Narasi" });
  expect(m.correctionInput(v)).not.toHaveProperty("specimenId"); expect(m.correctionInput(v)).not.toHaveProperty("testId");
});
it("requires explicit receive boolean, rejection only for false, and clears stale rejection for true", async () => {
  const v = await module<typeof import("@/features/laboratory/forms/values")>("forms/values");
  const m = await module<typeof import("@/features/laboratory/forms/mappers")>("forms/mappers");
  const values = { receivedAt: "2026-09-01T09:30", conditionOnReceipt: "", examinationPossible: "", rejectionReason: "", notes: "" };
  expect(v.receiveFormSchema.safeParse(values).success).toBe(false);
  expect(v.receiveFormSchema.safeParse({ ...values, examinationPossible: "false" }).success).toBe(false);
  expect(m.receiveInput({ ...values, examinationPossible: "true", rejectionReason: "Old rejection" })).toMatchObject({ examinationPossible: true, rejectionReason: null });
});
it("validates specimen chronology and nonblank result content without interpreting values", async () => {
  const v = await module<typeof import("@/features/laboratory/forms/values")>("forms/values");
  expect(v.specimenFormSchema.safeParse({ specimenCode: "", specimenType: "Dahak", collectedAt: "2026-09-01T10:00", sentAt: "2026-09-01T09:00", notes: "" }).success).toBe(false);
  expect(v.resultFormSchema.safeParse({ specimenId: "", testedAt: "2026-09-01T09:00", resultCode: " ", resultValue: "", resultText: "" }).success).toBe(false);
  expect(v.resultFormSchema.safeParse({ specimenId: "", testedAt: "2026-09-01T09:00", resultCode: "", resultValue: "bitrary lab text", resultText: "" }).success).toBe(true);
});
it("all laboratory transport paths use the native v1 proxy, exact request/child ETags, AbortSignal and safe invalid responses", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const signal = new AbortController().signal;
  document.cookie = "XSRF-TOKEN=fixture; Path=/";
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const path = String(url);
    return Response.json(path.endsWith("laboratory-reference-data") ? labReferences : path.includes("?") ? labPage : path.endsWith("receive") || path.endsWith("specimens") ? labSpecimen : path.endsWith("results") || path.endsWith("corrections") ? resultResponse : labDetail, { headers: { ETag: '"request-header"' } });
  }));
  const { labApi } = await module<typeof import("@/features/laboratory/api")>("api");
  await labApi.references(signal); await labApi.requests({ page: 0, size: 20 }, signal); await labApi.request(labDetail.id, signal);
  await labApi.create({ registrationId: labDetail.owner.id, testingFacilityId: labDetail.testingFacility.id, requestReasonCode: "DIAGNOSIS", testTypeCodes: ["TCM"], sampleShippingMethod: null, courierName: null, notes: null }, signal);
  await labApi.specimen(labDetail.id, { specimenCode: null, specimenType: "Dahak", collectedAt: null, sentAt: null, notes: null }, '"request-header"', signal);
  await labApi.cancel(labDetail.id, '"request-header"', signal);
  await labApi.receive(labSpecimen.id, { receivedAt: "2026-09-01T03:00:00Z", conditionOnReceipt: null, examinationPossible: true, rejectionReason: null, notes: null }, '"8"', signal);
  await labApi.result(labDetail.tests[0].id, { specimenId: null, testedAt: "2026-09-01T04:00:00Z", resultCode: "FREE", resultValue: null, resultText: null }, '"7"', signal);
  await labApi.correct(labResult.id, { testedAt: "2026-09-01T04:00:00Z", resultCode: "FREE", resultValue: null, resultText: null }, '"11"', signal);
  expect(calls).toHaveLength(9);
  for (const call of calls) { expect(call.url).toMatch(/^\/api\/tbcall\/v1\//); expect(call.options.signal).toBe(signal); }
  expect(calls.slice(4).map(c => new Headers(c.options.headers).get("If-Match"))).toEqual(['"request-header"', '"request-header"', '"8"', '"7"', '"11"']);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ invalid: true })));
  await expect(labApi.references()).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
});
