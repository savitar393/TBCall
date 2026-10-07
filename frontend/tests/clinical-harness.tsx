import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { ids, officer, patientPage, patientDetail, registration, diagnosis, caseView, references, facilityPage } from "./clinical-fixtures";
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
export { routing };
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/patients" }));
export type Call = { url: string; options: RequestInit; body: Record<string, unknown> | null };
export function backend(overrides?: (call: Call) => Response | Promise<Response> | undefined) {
  const calls: Call[] = [];
  const transport = vi.fn<typeof fetch>().mockImplementation(async (url, options = {}) => {
    const call = { url: String(url), options, body: typeof options.body === "string" ? JSON.parse(options.body) as Record<string, unknown> : null };
    calls.push(call);
    const replacement = overrides?.(call); if (replacement) return replacement;
    const path = call.url.split("?")[0];
    document.cookie = "XSRF-TOKEN=fixture; Path=/";
    if (path.endsWith("/me")) return Response.json(officer);
    if (path.endsWith("/clinical-reference-data")) return Response.json(references);
    if (path.endsWith("/clinical-facilities")) return Response.json(facilityPage);
    if (path.endsWith("/patients")) return Response.json(patientPage);
    if (path.endsWith(`/patients/${ids.patient}`)) return Response.json(patientDetail, { headers: { ETag: '"patient-server-tag"' } });
    if (path.endsWith(`/registrations/${ids.registration}/diagnoses`)) return Response.json([diagnosis]);
    if (path.endsWith(`/registrations/${ids.registration}`)) return Response.json(registration, { headers: { ETag: '"registration-server-tag"' } });
    if (path.endsWith(`/diagnoses/${ids.diagnosis}`)) return Response.json(diagnosis, { headers: { ETag: '"diagnosis-server-tag"' } });
    if (path.endsWith(`/cases/${ids.tbCase}`)) return Response.json(caseView, { headers: { ETag: '"case-server-tag"' } });
    throw new Error("Unexpected test contract path");
  });
  vi.stubGlobal("fetch", transport); return calls;
}
export function renderClinical(children: React.ReactNode) { return render(<AppProviders>{children}</AppProviders>); }
export function failure(status: number, code: string) { return Response.json({ status, code, title: "private server details", detail: "never display clinical prose" }, { status, headers: { "Content-Type": "application/problem+json" } }); }
