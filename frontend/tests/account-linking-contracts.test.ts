import { expect, it, vi } from "vitest";
import type { z } from "@/lib/validation";
import type { Me } from "@/lib/auth/types";
import * as f from "./account-linking-fixtures";
const modules = import.meta.glob("../features/account-linking/*.ts");
async function load(name: string) { const loader = modules[`../features/account-linking/${name}.ts`]; expect(loader, name).toBeDefined(); return await loader() as Record<string, unknown>; }
const samples = { candidateSchema: f.candidate, matchedLoginSchema: f.candidate.matchedLogin, maskedAccountSchema: f.maskedAccount, patientLinkStateSchema: f.link, patientStateSchema: f.patientState, pairStateSchema: f.pairState, supporterSummarySchema: f.summary, supporterPageSchema: f.page, supporterDetailSchema: f.detail, patientLinkResponseSchema: f.patientResponse, supporterLinkResponseSchema: f.supporterResponse };
for (const [name, value] of Object.entries(samples)) {
    it(`${name} accepts only its approved projection`, async () => { const schemas = await load("schemas"); const schema = schemas[name] as z.ZodType; expect(schema.safeParse(value).success).toBe(true); expect(schema.safeParse({ ...value, privateField: "secret" }).success).toBe(false); });
}
it.each(["SYSTEM_ADMIN", "FACILITY_ADMIN", "PATIENT", "TREATMENT_SUPPORTER", "LAB_STAFF", "PROGRAM_MONITOR"])("rejects synthetic linking grants for %s", async (role) => {
    const { canLink } = await load("permissions") as {
        canLink: (m: Me | null, p: string) => boolean;
    };
    expect(canLink({ ...f.actor, roles: [{ code: role, name: role }] }, "PATIENT_LINK_VERIFY")).toBe(false);
});
it("requires linking grants independently of host read grants", async () => {
    const { canLink } = await load("permissions") as {
        canLink: (m: Me | null, p: string) => boolean;
    };
    expect(canLink(f.actor, "PATIENT_LINK_VERIFY")).toBe(true);
    expect(canLink({ ...f.actor, permissions: ["PATIENT_READ"] }, "PATIENT_LINK_VERIFY")).toBe(false);
    expect(canLink({ ...f.actor, permissions: ["CASE_READ"] }, "SUPPORTER_LINK_MANAGE")).toBe(false);
    expect(canLink(null, "PATIENT_LINK_VERIFY")).toBe(false);
});
it("strictly rejects nested candidate fields and unmasked identities", async () => {
    const { candidateSchema } = await load("schemas") as {
        candidateSchema: z.ZodType;
    };
    for (const matchedLogin of [{ ...f.candidate.matchedLogin, email: "raw@example.test" }, { kind: "EMAIL", maskedValue: "raw@example.test" }, { kind: "PHONE", maskedValue: "081234567890" }, { kind: "NIK", maskedValue: "***" }])
        expect(candidateSchema.safeParse({ ...f.candidate, matchedLogin }).success).toBe(false);
});
it("sends exact resolve identity only in an explicit POST body", async () => {
    document.cookie = "XSRF-TOKEN=fixture; Path=/";
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(f.candidate));
    vi.stubGlobal("fetch", transport);
    const { linkingApi } = await load("api") as {
        linkingApi: {
            resolvePatient: (p: string, i: string, s: AbortSignal) => Promise<unknown>;
        };
    };
    await linkingApi.resolvePatient(f.ids.patient, "exact@example.test", new AbortController().signal);
    const [url, options] = transport.mock.calls[0];
    expect(String(url)).toBe(`/api/tbcall/v1/patients/${f.ids.patient}/account-link/resolve-user`);
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options!.body as string)).toEqual({ identity: "exact@example.test" });
    expect(new Headers(options?.headers).has("If-Match")).toBe(false);
});
