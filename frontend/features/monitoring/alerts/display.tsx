import type { Alert, References } from "../types";
import { DisplayFields } from "@/features/continuity/display";
import { label, eventTypes } from "../references";
export function AlertFields({
  alert: a,
  references: r
}: {
  alert: Alert;
  references?: References;
}) {
  return <>
  <p className="break-words">{a.message}</p>
  <DisplayFields values={[["Tingkat", label(r?.alertSeverities, a.severity)], ["Jenis peringatan", label(r?.alertTypes, a.alertType)], ["Status", label(r?.alertStatuses, a.status)], ["Jenis target", label(r?.alertTargetTypes, a.targetType)], ["Jenis kegiatan", a.eventType ? label(r ? eventTypes(r, a.targetType) : undefined, a.eventType) : null], ["Dipicu", a.triggeredAt], ["Batas waktu", a.dueAt], ["Diakui", a.acknowledgedAt], ["Diselesaikan", a.resolvedAt]]} />
</>;
}
