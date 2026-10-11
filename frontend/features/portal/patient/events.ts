import type { z } from "@/lib/validation";
import type { safeDoseSchema, safeFollowUpSchema, safeEventSchema } from "../schemas";
import type { PortalReferenceData } from "../types";
import { dateKey } from "@/lib/date-format";
export type CalendarEvent = { key: string; date: string; kind: "dose" | "follow-up" | "monitoring"; title: string; status: string; state: "recorded" | "scheduled" | "completed" | "other"; time?: string; detail?: string; href: string };
const refLabel = (options: {code: string; name: string}[] | undefined, code: string) => options?.find(item => item.code === code)?.name ?? "Label belum tersedia";
export function patientEvents(doses: z.infer<typeof safeDoseSchema>[], followUps: z.infer<typeof safeFollowUpSchema>[], monitoring: z.infer<typeof safeEventSchema>[], refs?: PortalReferenceData): CalendarEvent[] {
  const events: CalendarEvent[] = [
    ...doses.map(d => ({ key: `dose-${d.id}`, date: d.scheduledDate, kind: "dose" as const, title: "Laporan dosis", status: refLabel([...(refs?.patientDoseStatuses ?? []), ...(refs?.supporterDoseStatuses ?? [])], d.status), state: "recorded" as const, detail: "Laporan tercatat, bukan jadwal minum obat.", href: "/portal/treatment" })),
    ...followUps.map(f => ({ key: `follow-${f.id}`, date: dateKey(new Date(f.scheduledAt)), kind: "follow-up" as const, title: "Tindak lanjut", status: refLabel(refs?.followUpStatuses, f.status), state: f.status === "SCHEDULED" ? "scheduled" as const : f.status === "COMPLETED" ? "completed" as const : "other" as const, time: f.scheduledAt, detail: f.facility?.name, href: "/portal/treatment" })),
    ...monitoring.map((m, index) => ({ key: `monitor-${m.targetType}-${m.eventType}-${m.scheduledAt}-${index}`, date: dateKey(new Date(m.scheduledAt)), kind: "monitoring" as const, title: refLabel(m.targetType === "TREATMENT" ? refs?.treatmentMonitoringEventTypes : refs?.tptMonitoringEventTypes, m.eventType), status: refLabel(refs?.monitoringEventStatuses, m.status), state: m.status === "SCHEDULED" ? "scheduled" as const : m.status === "COMPLETED" ? "completed" as const : "other" as const, time: m.scheduledAt, href: "/portal/monitoring" })),
  ];
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ? new Date(a.time).getTime() : 0) - (b.time ? new Date(b.time).getTime() : 0));
}
