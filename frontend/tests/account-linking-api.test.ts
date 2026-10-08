import { expect, it, vi } from "vitest";
import { linkingApi as api } from "@/features/account-linking/api";
import { linkingQueries } from "@/features/account-linking/queries";
import * as f from "./account-linking-fixtures";
const signal = () => new AbortController().signal;
const contracts = [
    { name: "patient", value: f.patientState, run: () => api.patient(f.ids.patient, signal()), method: "GET", body: undefined },
    { name: "pair", value: f.pairState, run: () => api.pair(f.ids.patient, f.userId, signal()), method: "GET", body: undefined },
    { name: "roster", value: f.page, run: () => api.supporters(f.ids.tbCase, 2, signal()), method: "GET", body: undefined },
    { name: "detail", value: f.detail, run: () => api.supporter(f.ids.tbCase, f.supporterId, signal()), method: "GET", body: undefined },
    { name: "create", value: f.detail, run: () => api.createSupporter(f.ids.tbCase, { supporterType: "COMPANION", fullName: "Nama", phone: "" }, signal()), method: "POST", body: { supporterType: "COMPANION", fullName: "Nama" } },
    { name: "patient resolver", value: f.candidate, run: () => api.resolvePatient(f.ids.patient, "exact@example.test", signal()), method: "POST", body: { identity: "exact@example.test" } },
    { name: "supporter resolver", value: f.candidate, run: () => api.resolveSupporter(f.ids.tbCase, f.supporterId, "081234567890", signal()), method: "POST", body: { identity: "081234567890" } },
    { name: "patient link", value: f.patientResponse, run: () => api.linkPatient(f.ids.patient, f.userId, undefined, signal()), method: "POST", body: { userId: f.userId } },
    { name: "patient revoke", value: f.patientResponse, run: () => api.revokePatient(f.ids.patient, f.linkId, '"13"', signal()), method: "DELETE", body: undefined },
    { name: "supporter link", value: f.supporterResponse, run: () => api.linkSupporter(f.ids.tbCase, f.supporterId, f.userId, '"13"', signal()), method: "POST", body: { userId: f.userId } },
    { name: "supporter unlink", value: { ...f.supporterResponse, linkedUserId: null }, run: () => api.unlinkSupporter(f.ids.tbCase, f.supporterId, '"13"', signal()), method: "DELETE", body: undefined },
];
for (const contract of contracts) {
    it(`${contract.name} sends the approved method/body and AbortSignal`, async () => {
        document.cookie = "XSRF-TOKEN=fixture; Path=/";
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(contract.value, { headers: { ETag: '"31"' } }));
        vi.stubGlobal("fetch", fetcher);
        expect((await contract.run()).data).toEqual(contract.value);
        const [url, options] = fetcher.mock.calls[0];
        expect(options?.method).toBe(contract.method);
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        expect(options?.body === undefined ? undefined : JSON.parse(options.body as string)).toEqual(contract.body);
        expect(String(url)).not.toContain("exact@example.test");
        expect(String(url)).not.toContain("081234567890");
        expect(String(url)).not.toContain("/admin/");
        if (["patient revoke", "supporter link", "supporter unlink"].includes(contract.name))
            expect(new Headers(options?.headers).get("If-Match")).toBe('"13"');
        else
            expect(new Headers(options?.headers).has("If-Match")).toBe(false);
    });
    it(`${contract.name} rejects additional private fields instead of stripping them`, async () => {
        document.cookie = "XSRF-TOKEN=fixture; Path=/";
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...contract.value, privateField: "RAW PRIVATE DATA" }, { headers: { ETag: '"31"' } })));
        await expect(contract.run()).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
    });
}
for (const target of ["patient", "pair", "detail"] as const)
    for (const etag of [undefined, 'W/"2"', "2", '"case-version"']) {
        it(`${target} rejects missing or invalid authoritative ETag ${etag}`, async () => {
            const contract = contracts.find(c => c.name === target)!;
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(contract.value, { headers: etag ? { ETag: etag } : {} })));
            await expect(contract.run()).rejects.toMatchObject({ problem: { code: etag ? "INVALID_RESPONSE" : "PRECONDITION_REQUIRED" } });
        });
    }
it.each(["patient", "pair"] as const)("%s null state has no invented ETag", async (target) => {
    const data = target === "patient" ? { link: null } : { ...f.pairState, pair: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    expect((await contracts.find(c => c.name === target)!.run()).etag).toBeUndefined();
});
it.each(["patient", "pair", "detail"] as const)("%s rejects a projection from a different resource", async (target) => {
    const contract = contracts.find(c => c.name === target)!;
    const data = target === "patient" ? { link: { ...f.link, patientId: f.ids.destination } } : target === "pair" ? { ...f.pairState, userId: f.ids.destination } : { ...f.detail, caseId: f.ids.destination };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data, { headers: { ETag: '"31"' } })));
    await expect(contract.run()).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
});
it("read query keys contain context and resource IDs without exact identity or actor PII", async () => {
    const queries = [linkingQueries.patient(f.actor.id, "opaque-context", f.ids.patient), linkingQueries.supporters(f.actor.id, "opaque-context", f.ids.tbCase, 2), linkingQueries.supporter(f.actor.id, "opaque-context", f.ids.tbCase, f.supporterId)];
    for (const q of queries) {
        expect(q.queryKey.slice(0, 3)).toEqual(["account-linking", f.actor.id, "opaque-context"]);
        expect(JSON.stringify(q.queryKey)).not.toContain(f.actor.email!);
        expect(q.retry).toBe(false);
        expect(q.refetchOnWindowFocus).toBe(false);
        expect(q.refetchOnReconnect).toBe(false);
    }
});
it("missing CSRF token sends no resolver request", async () => {
    document.cookie = "XSRF-TOKEN=; Max-Age=0; Path=/";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(api.resolvePatient(f.ids.patient, "exact@example.test", signal())).rejects.toMatchObject({ problem: { code: "CSRF_INVALID" } });
    expect(fetcher).not.toHaveBeenCalled();
});
