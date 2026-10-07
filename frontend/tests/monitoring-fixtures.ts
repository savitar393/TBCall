import { officer } from "./clinical-fixtures";
import { treatmentDetail as treatment } from "./treatment-fixtures";
import { tpt } from "./continuity-fixtures";
export { treatment, tpt };
export const actor = {
  ...officer,
  permissions: [...officer.permissions, "TREATMENT_READ", "TPT_READ", "MONITORING_READ", "MONITORING_MANAGE", "ALERT_READ", "ALERT_ACKNOWLEDGE", "ALERT_RESOLVE", "NOTIFICATION_READ_SELF"]
};
export const plan = {
  id: "30000000-0000-4000-8000-000000000001",
  version: 901,
  targetType: "TREATMENT",
  targetId: treatment.id,
  status: "ACTIVE",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  rulesVersion: "MANUAL_V1",
  notes: "Private plan notes",
  eventCounts: {
    SCHEDULED: 1,
    DUE: 0,
    OVERDUE: 0,
    COMPLETED: 0,
    CANCELLED: 0
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};
export const event = {
  id: "30000000-0000-4000-8000-000000000002",
  version: 902,
  eventType: "CLINICAL_REVIEW",
  scheduledAt: "2026-01-01T10:15:00.123456+07:00",
  dueAt: "2026-01-02T10:15:00.123456+07:00",
  completedAt: null,
  status: "SCHEDULED" as const
};
export const alert = {
  id: "30000000-0000-4000-8000-000000000003",
  version: 903,
  alertType: "MONITORING_OVERDUE",
  severity: "WARNING",
  status: "OPEN",
  triggeredAt: "2026-01-03T00:00:00Z",
  dueAt: event.dueAt,
  acknowledgedAt: null,
  resolvedAt: null,
  monitoringEventId: event.id,
  eventType: event.eventType,
  scheduledAt: event.scheduledAt,
  targetType: plan.targetType,
  targetId: plan.targetId,
  message: "Kegiatan pemantauan telah melewati waktu jatuh tempo."
};
export const notification = {
  id: "30000000-0000-4000-8000-000000000004",
  version: 904,
  alertId: alert.id,
  channel: "IN_APP",
  status: "SENT",
  scheduledAt: "2026-01-03T00:00:00Z",
  deliveredAt: null,
  readAt: null,
  alertType: alert.alertType,
  severity: alert.severity
};
const options = (codes: string[]) => codes.map(code => ({
  code,
  name: `Live ${code}`
}));
export const references = {
  treatmentEventTypes: options(["CLINICAL_REVIEW", "BACTERIOLOGY_FOLLOW_UP", "SAFETY_MONITORING"]),
  tptEventTypes: options(["CLINICAL_REVIEW", "BACTERIOLOGY_FOLLOW_UP", "SAFETY_MONITORING"]),
  planStatuses: options(["ACTIVE", "CANCELLED"]),
  eventStatuses: options(["SCHEDULED", "DUE", "OVERDUE", "COMPLETED", "CANCELLED"]),
  alertTypes: options(["MONITORING_OVERDUE"]),
  alertStatuses: options(["OPEN", "ACKNOWLEDGED", "RESOLVED"]),
  alertSeverities: options(["WARNING"]),
  alertTargetTypes: options(["TREATMENT", "TPT"]),
  notificationStatuses: options(["PENDING", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"]),
  notificationChannels: options(["IN_APP", "SMS"])
};
export const page = (record: unknown) => ({
  content: [record],
  page: 0,
  size: 20,
  totalElements: 1
});
