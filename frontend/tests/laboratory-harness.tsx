import type { ComponentType, ReactNode } from "react";
import { backend, renderClinical, routing, failure, type Call } from "./clinical-harness";
import { labOfficer, labReferences, labPage, labDetail, labSpecimen, resultResponse } from "./laboratory-fixtures";
import type { Me } from "@/lib/auth/types";
export { routing, failure, renderClinical };
const modules = import.meta.glob("../features/laboratory/**/*.{ts,tsx}");
export async function loadLab<T>(path: string): Promise<T> { const loader = modules[`../features/laboratory/${path}`]; if (!loader) throw new Error(`Laboratory component not implemented: ${path}`); return await loader() as T; }
export async function renderLab(name: "queue" | "create" | "detail", props: { ownerType?: "REGISTRATION" | "CASE"; id?: string } = {}, extra?: ReactNode) {
  const file = { queue: "request-queue", create: "request-create", detail: "request-detail" }[name];
  const exports = await loadLab<Record<string, ComponentType<typeof props>>>(`components/${file}.tsx`);
  const Component = exports[{ queue: "RequestQueue", create: "RequestCreate", detail: "RequestDetail" }[name]];
  const { LaboratoryBoundary } = await loadLab<typeof import("@/features/laboratory/components/laboratory-boundary")>("components/laboratory-boundary.tsx");
  return renderClinical(<>{extra}<LaboratoryBoundary mode={name === "create" ? "source" : "read"}><Component {...props} /></LaboratoryBoundary></>);
}
export function labBackend(overrides?: (call: Call) => Response | Promise<Response> | undefined, actor: Me = labOfficer) {
  return backend(c => {
    document.cookie = "XSRF-TOKEN=fixture; Path=/";
    const custom = overrides?.(c); if (custom) return custom;
    if (c.url.endsWith("/me")) return Response.json(actor);
    if (c.url.endsWith("/laboratory-reference-data")) return Response.json(labReferences);
    if (c.url.includes("/lab-requests?")) return Response.json(labPage);
    if (c.url.endsWith("/receive") || c.url.endsWith("/specimens")) return Response.json(labSpecimen);
    if (c.url.endsWith("/results") || c.url.endsWith("/corrections")) return Response.json(resultResponse);
    if (c.url.includes("/lab-requests")) return Response.json(labDetail, { headers: { ETag: '"actual-request-tag"' } });
  });
}
