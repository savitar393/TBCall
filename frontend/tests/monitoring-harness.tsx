import type { ReactNode } from "react";
import type { Me } from "@/lib/auth/types";
import { expect } from "vitest";
import { backend, renderClinical, type Call } from "./clinical-harness";
import * as f from "./monitoring-fixtures";
export { failure, routing } from "./clinical-harness";
const modules = import.meta.glob("../features/monitoring/**/*.tsx");
export async function renderMonitoring(name: "target" | "plan" | "alerts" | "alert" | "notifications", id = f.plan.id, type: "TREATMENT" | "TPT" = "TREATMENT", extra?: ReactNode) {
  const files = {
    target: ["monitoring/target", "TargetMonitoring"],
    plan: ["monitoring/detail", "PlanDetail"],
    alerts: ["alerts/queue", "AlertQueue"],
    alert: ["alerts/detail", "AlertDetail"],
    notifications: ["notifications/list", "Notifications"]
  };
  const [file, exportName] = files[name];
  const loader = modules[`../features/monitoring/${file}.tsx`];
  const guard = modules["../features/monitoring/boundary.tsx"];
  expect(loader, "F2E screen implementation").toBeDefined();
  expect(guard, "F2E staff boundary").toBeDefined();
  const Component = ((await loader()) as Record<string, (props: {
    id: string;
    type: string;
  }) => ReactNode>)[exportName];
  const Boundary = ((await guard()) as Record<string, (props: {
    children: ReactNode;
    permission: string;
    targetPermission?: string;
    context: string;
  }) => ReactNode>).MonitoringBoundary;
  return renderClinical(<>
  {extra}
  <Boundary context={`${name}:${type}:${id}`} permission={name === "alerts" || name === "alert" ? "ALERT_READ" : name === "notifications" ? "NOTIFICATION_READ_SELF" : "MONITORING_READ"} targetPermission={name === "target" ? type === "TPT" ? "TPT_READ" : "TREATMENT_READ" : undefined}>
    <Component id={id} type={type} />
  </Boundary>
</>);
}
export function monitoringBackend(overrides?: (c: Call) => Response | Promise<Response> | undefined, user: Me = f.actor) {
  return backend(c => {
    const custom = overrides?.(c);
    if (custom) return custom;
    const path = c.url.split("?")[0];
    const get = c.options.method === "GET";
    document.cookie = "XSRF-TOKEN=fixture; Path=/";
    if (path.endsWith("/me")) return Response.json(user);
    if (path.endsWith("/monitoring-reference-data")) return Response.json(f.references);
    if (path.endsWith(`/treatments/${f.treatment.id}`)) return Response.json(f.treatment);
    if (path.endsWith(`/preventive-treatments/${f.tpt.id}`)) return Response.json(f.tpt);
    if (path.includes("/monitoring-plans") && !path.includes(`/monitoring-plans/${f.plan.id}`)) return Response.json(get ? f.page(f.plan) : f.plan);
    if (path.endsWith("/events")) return Response.json(get ? f.page(f.event) : f.event);
    if (path.includes("/monitoring-plans/")) return Response.json(f.plan, {
      headers: {
        ETag: '"plan-get"'
      }
    });
    if (path.includes("/monitoring-events/")) return Response.json(f.event, {
      headers: {
        ETag: '"event-get"'
      }
    });
    if (path.endsWith("/alerts")) return Response.json(f.page(f.alert));
    if (path.includes("/alerts/")) return Response.json(f.alert, {
      headers: {
        ETag: '"alert-get"'
      }
    });
    if (path.endsWith("/me/notifications")) return Response.json(f.page(f.notification));
    if (path.includes("/me/notifications/")) return Response.json(f.notification, {
      headers: {
        ETag: '"notification-get"'
      }
    });
  });
}
export const tag = (c: Call) => new Headers(c.options.headers).get("If-Match");
