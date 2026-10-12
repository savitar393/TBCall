import type { Alert, References } from "../types";
import { DisplayFields } from "@/features/continuity/display";
import { AppStatusBadge } from "@/components/application-patterns";
import { label, eventTypes } from "../references";
export function AlertFields({
  alert: a,
  references: r,
  headingLevel = "h3"
}: {
  alert: Alert;
  references?: References;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return <>
  <div className="clinical-context-heading"><Heading className="font-semibold">{label(r?.alertTypes, a.alertType)}</Heading><AppStatusBadge tone={a.status === "RESOLVED" ? "complete" : "neutral"}>{label(r?.alertStatuses, a.status)}</AppStatusBadge></div>
  <p className="break-words">{a.message}</p>
  <DisplayFields values={[["Tingkat", label(r?.alertSeverities, a.severity)], ["Jenis target", label(r?.alertTargetTypes, a.targetType)], ["Jenis kegiatan", a.eventType ? label(r ? eventTypes(r, a.targetType) : undefined, a.eventType) : null], ["Dipicu", a.triggeredAt], ["Batas waktu", a.dueAt], ["Diakui", a.acknowledgedAt], ["Diselesaikan", a.resolvedAt]]} />
</>;
}
