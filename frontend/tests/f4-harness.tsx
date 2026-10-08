import type { ReactNode } from "react";
import { expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppProviders } from "@/app/providers";
import type { Me } from "@/lib/auth/types";
import * as f from "./f4-fixtures";
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
export { routing };
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/admin/facilities" }));
export type Call = {
    url: string;
    options: RequestInit;
    body: Record<string, unknown> | null;
};
export const failure = (status: number, code = "VALIDATION_ERROR") => Response.json({ status, code, title: "PRIVATE RAW TITLE", detail: "PRIVATE RAW DETAIL" }, { status, headers: { "Content-Type": "application/problem+json" } });
export function backend(actor: Me = f.admin, override?: (call: Call) => Response | Promise<Response> | undefined) {
    const calls: Call[] = [];
    document.cookie = "XSRF-TOKEN=fixture; Path=/";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, options = {}) => {
        const call = { url: String(url), options, body: typeof options.body === "string" ? JSON.parse(options.body) : null };
        calls.push(call);
        const custom = override?.(call);
        if (custom)
            return custom;
        const path = call.url.split("?")[0];
        if (path.endsWith("/me"))
            return Response.json(actor);
        if (path.endsWith("/admin/reference-data"))
            return Response.json(f.reference);
        if (path.endsWith("/admin/users/lookup"))
            return Response.json(f.lookup);
        if (path.endsWith("/admin/facilities"))
            return Response.json(options.method === "POST" ? f.facility : f.page(f.summary));
        if (path.match(/\/facilities\/[^/]+\/users\//))
            return Response.json({ userId: f.targetId, facilityId: f.facilityId, active: options.method !== "DELETE", primary: call.body?.primary ?? false });
        if (path.includes("/roles/"))
            return Response.json({ userId: f.targetId, roleCode: path.split("/").at(-1), assigned: options.method !== "DELETE" });
        if (path.match(/\/users\/[^/]+\/(suspend|reactivate|disable)$/))
            return Response.json({ id: f.targetId, status: path.endsWith("/reactivate") ? "ACTIVE" : path.endsWith("/disable") ? "DISABLED" : "SUSPENDED", version: 13 });
        if (path.endsWith("/deactivate"))
            return Response.json({ ...f.facility, active: false });
        if (path.includes("/admin/facilities/"))
            return Response.json(f.facility, { headers: { ETag: '"7"' } });
        if (path.endsWith("/integrations"))
            return Response.json(f.page(f.integration));
        if (path.endsWith("/external-identifiers"))
            return Response.json(f.page(f.identifier));
        if (path.endsWith("/authorities"))
            return Response.json(f.page(f.authority));
        if (path.endsWith("/sync-runs"))
            return Response.json(f.page(f.run));
        if (path.includes("/sync-runs/"))
            return Response.json({ run: f.run, items: f.page(f.item) });
        if (path.endsWith("/conflicts"))
            return Response.json(f.page(f.conflict));
        if (path.includes("/integrations/"))
            return Response.json(f.integration);
        throw new Error("Unexpected F4 API path");
    }));
    return calls;
}
const modules = import.meta.glob("../features/{administration,integration}/**/*.tsx");
export async function renderF4(page: "facilities" | "new" | "facility" | "users" | "integrations" | "integration" | "run", extra?: ReactNode) {
    const paths = { facilities: ["administration/facilities/list", "FacilityList"], new: ["administration/facilities/create", "FacilityCreate"], facility: ["administration/facilities/detail", "FacilityDetail"], users: ["administration/users/workspace", "UserWorkspace"], integrations: ["integration/list/workspace", "IntegrationList"], integration: ["integration/detail/workspace", "IntegrationDetail"], run: ["integration/run/workspace", "IntegrationRun"] };
    const [path, name] = paths[page];
    const loader = modules[`../features/${path}.tsx`], guard = modules["../features/administration/boundary.tsx"];
    expect(loader, path).toBeDefined();
    expect(guard, "F4 boundary").toBeDefined();
    type Props = {
        facilityId: string;
        code: string;
        runId: string;
    };
    const C = (await loader() as Record<string, (props: Props) => ReactNode>)[name];
    const B = (await guard() as {
        F4Boundary: (props: {
            kind: string;
            context: string;
            children: ReactNode;
        }) => ReactNode;
    }).F4Boundary;
    return render(<AppProviders>{extra}<B kind={page === "users" ? "users" : ["integrations", "integration", "run"].includes(page) ? "integration" : "facilities"} context={page}>
    <C facilityId={f.facilityId} code="SITB" runId={f.runId}/>
    </B>
    </AppProviders>);
}
