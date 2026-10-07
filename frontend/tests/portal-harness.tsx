import type { ReactNode } from "react";
import { expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppProviders } from "@/app/providers";
import type { Me } from "@/lib/auth/types";
import * as f from "./portal-fixtures";
import { references } from "./portal-reference-fixture";
const routing = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
export { routing };
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));
export type Call = {
    url: string;
    options: RequestInit;
    body: Record<string, unknown> | null;
};
export const failure = (status: number, code: string) => Response.json({ status, code, title: "private problem", detail: "private clinical detail" }, { status, headers: { "Content-Type": "application/problem+json" } });
export function portalBackend(user: Me = f.patient, override?: (c: Call) => Response | Promise<Response> | undefined) {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, options = {}) => {
        const call = { url: String(url), options, body: typeof options.body === "string" ? JSON.parse(options.body) : null };
        calls.push(call);
        const custom = override?.(call);
        if (custom)
            return custom;
        document.cookie = "XSRF-TOKEN=fixture; Path=/";
        const path = call.url.split("?")[0];
        if (path.endsWith("/me"))
            return Response.json(user);
        if (path.endsWith("/portal-reference-data"))
            return Response.json(references);
        if (path.endsWith("/me/patient"))
            return Response.json(f.selfPatient);
        if (path.endsWith("/treatment"))
            return Response.json(path.includes("/supporting-cases/") ? f.supporterTreatment : f.treatment);
        if (path.endsWith("/dose-events"))
            return Response.json(options.method === "POST" ? f.dose : f.page(f.dose));
        if (path.endsWith("/follow-ups"))
            return Response.json([f.followUp]);
        if (path.endsWith("/tpt"))
            return Response.json(f.tpt);
        if (path.endsWith("/monitoring"))
            return Response.json(f.page(f.event));
        if (path.endsWith("/alerts"))
            return Response.json(f.page(f.alert));
        if (path.endsWith("/acknowledge"))
            return Response.json({ ...f.alert, acknowledged: true });
        if (path.endsWith("/notifications"))
            return Response.json(f.page(f.notification));
        if (path.includes("/notifications/"))
            return Response.json(options.method === "POST" ? { ...f.notification, status: "READ" } : f.notification, { headers: { ETag: '"authoritative-detail"' } });
        throw new Error("Unexpected portal API path");
    }));
    return calls;
}
const modules = import.meta.glob("../features/portal/**/*.tsx");
export async function renderPortal(screen: "home" | "treatment" | "tpt" | "monitoring" | "alerts" | "notifications" | "supporters" | "case", extra?: ReactNode, caseId = f.caseId) {
    const paths = { home: ["patient/home", "PatientHome"], treatment: ["patient/treatment", "PatientTreatment"], tpt: ["patient/tpt", "PatientTpt"], monitoring: ["patient/monitoring", "PatientMonitoring"], alerts: ["patient/alerts", "PatientAlerts"], notifications: ["notifications/list", "PortalNotifications"], supporters: ["supporter/list", "SupportingCases"], case: ["supporter/detail", "SupportingCase"] };
    const [path, name] = paths[screen];
    const loader = modules[`../features/portal/${path}.tsx`], guard = modules["../features/portal/boundary.tsx"];
    expect(loader, "F3 screen").toBeDefined();
    expect(guard, "F3 boundary").toBeDefined();
    const C = (await loader() as Record<string, (props: {
        caseId: string;
    }) => ReactNode>)[name];
    const B = (await guard() as Record<string, (props: {
        children: ReactNode;
        mode: string;
        permission?: string;
        requireLink?: boolean;
        caseId?: string;
        context: string;
    }) => ReactNode>).PortalBoundary;
    const permissions = { home: undefined, treatment: "TREATMENT_READ", tpt: "TPT_READ", monitoring: "MONITORING_READ", alerts: "ALERT_READ", notifications: "NOTIFICATION_READ_SELF", supporters: undefined, case: undefined };
    return render(<AppProviders>{extra}<B mode={screen === "notifications" ? "either" : screen === "supporters" || screen === "case" ? "supporter" : "patient"} permission={permissions[screen]} requireLink={["treatment", "tpt", "monitoring", "alerts"].includes(screen)} caseId={screen === "case" ? caseId : undefined} context={screen}><C caseId={caseId}/></B></AppProviders>);
}
