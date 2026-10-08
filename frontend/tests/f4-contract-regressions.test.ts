import { expect, it, vi } from "vitest";
import type { z } from "@/lib/validation";
import * as a from "@/features/administration/schemas";
import * as i from "@/features/integration/schemas";
import { administrationQueries as aq, administrationKeys } from "@/features/administration/queries";
import { integrationQueries as iq, integrationKeys } from "@/features/integration/queries";
import { administrationApi, facilityEtag } from "@/features/administration/api";
import { integrationApi } from "@/features/integration/api";
import { canFacilities, canUsers, canRoles, canStatuses } from "@/features/administration/permissions";
import { canIntegration } from "@/features/integration/permissions";
import { facilityFormSchema } from "@/features/administration/facilities/form";
import { backend } from "./f4-harness";
import * as f from "./f4-fixtures";
const schemas: [
    string,
    z.ZodType,
    Record<string, unknown>
][] = [
    ["facility summary", a.facilitySummarySchema, f.summary], ["facility page", a.facilityPageSchema, f.page(f.summary)],
    ["facility detail", a.facilitySchema, f.facility], ["references", a.referencesSchema, f.reference],
    ["lookup", a.userLookupSchema, f.lookup], ["membership", a.membershipSchema, { userId: f.targetId, facilityId: f.facilityId, active: true, primary: false }],
    ["role", a.roleSchema, { userId: f.targetId, roleCode: "TB_OFFICER", assigned: true }], ["status", a.statusSchema, { id: f.targetId, status: "ACTIVE", version: 12 }],
    ["integration", i.integrationSchema, f.integration], ["identifier", i.identifierSchema, f.identifier], ["authority", i.authoritySchema, f.authority],
    ["run", i.runSummarySchema, f.run], ["item", i.itemSchema, f.item], ["conflict", i.conflictSchema, f.conflict],
    ["run detail", i.runDetailSchema, { run: f.run, items: f.page(f.item) }], ["integration page", i.pageSchema(i.integrationSchema), f.page(f.integration)],
];
it.each(schemas)("%s accepts the approved DTO", (_name, schema, valid) => expect(schema.parse(valid)).toEqual(valid));
it.each(schemas)("%s rejects unapproved/raw fields", (_name, schema, valid) => expect(schema.safeParse({ ...valid, rawPayload: { private: true } }).success).toBe(false));
it.each(schemas)("%s rejects missing required fields", (_name, schema, valid) => { const copy = { ...valid }; delete copy[Object.keys(copy)[0]]; expect(schema.safeParse(copy).success).toBe(false); });
it.each(["PATIENT", "TREATMENT_SUPPORTER"])("references and lookup reject unsupported managed role %s", code => {
    expect(a.referencesSchema.safeParse({ ...f.reference, adminManagedRoles: [{ code, name: "unsupported" }] }).success).toBe(false);
    expect(a.userLookupSchema.safeParse({ ...f.lookup, roles: [{ code, name: "unsupported" }] }).success).toBe(false);
});
it("nested integration payload and list versions are rejected", () => {
    expect(i.runDetailSchema.safeParse({ run: { ...f.run, rawError: "private" }, items: f.page(f.item) }).success).toBe(false);
    expect(a.facilityPageSchema.safeParse(f.page({ ...f.summary, version: 7 })).success).toBe(false);
});
it.each([["facilities", canFacilities, "FACILITY_MANAGE"], ["roles", canRoles, "ROLE_MANAGE"], ["statuses", canStatuses, "USER_ACCOUNT_MANAGE"], ["integration", canIntegration, "INTEGRATION_MANAGE"]] as const)("%s needs explicit system role AND grant", (_name, gate, grant) => {
    expect(gate({ ...f.admin, permissions: [grant] })).toBe(true);
    expect(gate({ ...f.admin, permissions: [] })).toBe(false);
    expect(gate({ ...f.facilityAdmin, permissions: [grant] })).toBe(false);
    expect(gate(null)).toBe(false);
});
it("exact user administration requires role, grant and current scope", () => {
    expect(canUsers(f.admin)).toBe(true);
    expect(canUsers(f.facilityAdmin)).toBe(true);
    expect(canUsers({ ...f.facilityAdmin, activeFacilities: [] })).toBe(false);
    expect(canUsers({ ...f.facilityAdmin, permissions: [] })).toBe(false);
    expect(canUsers({ ...f.facilityAdmin, roles: [{ code: "TB_OFFICER", name: "Petugas" }] })).toBe(false);
    expect(canUsers(null)).toBe(false);
});
const queries = [aq.facilities(f.adminId, { page: 0 }), aq.facility(f.adminId, f.facilityId), aq.references(f.adminId), iq.list(f.adminId, 0), iq.detail(f.adminId, "SITB"), iq.identifiers(f.adminId, "SITB", 0), iq.authorities(f.adminId, "SITB", 0), iq.runs(f.adminId, "SITB", 0), iq.conflicts(f.adminId, "SITB", 0), iq.run(f.adminId, "SITB", f.runId, 0)];
it.each(queries.map((q, index) => [String(index), q] as const))("query %s is actor scoped, abortable and explicit-only", async (_name, q) => {
    const calls = backend(), signal = new AbortController().signal;
    expect(q.queryKey.slice(0, 2)).toEqual([q.queryKey[0], f.adminId]);
    expect(q.retry).toBe(false);
    expect(q.refetchOnWindowFocus).toBe(false);
    expect(q.refetchOnReconnect).toBe(false);
    expect(q.refetchOnMount).toBe(false);
    if (typeof q.queryFn !== "function")
        throw new Error("Missing query function");
    await q.queryFn({ signal } as never);
    expect(calls[0].options.signal).toBe(signal);
    expect(calls[0].options.cache).toBe("no-store");
});
it("query namespaces do not cross accounts or domains", () => { expect(administrationKeys(f.adminId)).toEqual(["administration", f.adminId]); expect(integrationKeys(f.targetId)).toEqual(["integration", f.targetId]); expect(aq.references(f.adminId).staleTime).toBe(300000); });
it("facility ETags are authoritative headers with no version fallback", async () => {
    backend();
    const response = await administrationApi.facility(f.facilityId, new AbortController().signal);
    expect(response.etag).toBe('"7"');
    expect(response.data.version).toBe(99);
    expect(() => facilityEtag()).toThrow();
});
it.each(["administration", "integration"])("%s maps malformed response to INVALID_RESPONSE", async (area) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ rawPayload: "private" })));
    await expect(area === "administration" ? administrationApi.lookup("private@example.test", new AbortController().signal) : integrationApi.detail("SITB", new AbortController().signal)).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE", status: 502 } });
});
it("membership and role requests omit ETags while status quotes fresh lookup version", async () => {
    const calls = backend(), signal = new AbortController().signal;
    await administrationApi.membership(f.facilityId, f.targetId, false, signal);
    await administrationApi.membership(f.facilityId, f.targetId, null, signal);
    await administrationApi.role(f.targetId, "TB_OFFICER", false, signal);
    await administrationApi.status(f.targetId, "suspend", 12, signal);
    expect(calls[0].body).toEqual({ primary: false });
    expect(calls[1].options.method).toBe("DELETE");
    expect(calls[1].body).toBeNull();
    calls.slice(0, 3).forEach(c => expect(new Headers(c.options.headers).get("If-Match")).toBeNull());
    expect(new Headers(calls[3].options.headers).get("If-Match")).toBe('"12"');
});
const draft = { name: "Facility", facilityTypeCode: "", parentFacilityId: "", address: "", provinceCode: "", regencyCode: "", districtCode: "", villageCode: "", postalCode: "", latitude: "", longitude: "" };
it.each([{ name: " " }, { postalCode: "12345678901" }, { provinceCode: "1".repeat(21) }, { latitude: "90.000001" }, { longitude: "-180.000001" }, { latitude: "1.1234567" }, { longitude: "1e2" }, { parentFacilityId: "invalid" }])("facility structural validation rejects %j", change => expect(facilityFormSchema.safeParse({ ...draft, ...change }).success).toBe(false));
it("facility validation accepts blank optional fields and exact range boundaries without defaults", () => expect(facilityFormSchema.parse({ ...draft, latitude: "-90.000000", longitude: "180" })).toEqual({ ...draft, latitude: "-90.000000", longitude: "180" }));
