import { z } from "@/lib/validation";
const id = z.uuid();
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const time = z.iso.datetime({
  offset: true
});
const date = z.iso.date();
const option = z.strictObject({
  code: z.string().min(1),
  name: z.string()
});
export const referencesSchema = z.strictObject({
  treatmentEventTypes: z.array(option),
  tptEventTypes: z.array(option),
  planStatuses: z.array(option),
  eventStatuses: z.array(option),
  alertTypes: z.array(option),
  alertStatuses: z.array(option),
  alertSeverities: z.array(option),
  alertTargetTypes: z.array(option),
  notificationStatuses: z.array(option),
  notificationChannels: z.array(option)
});
export const planSchema = z.strictObject({
  id,
  version,
  targetType: z.enum(["TREATMENT", "TPT"]),
  targetId: id,
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]),
  startDate: date,
  endDate: date.nullable(),
  rulesVersion: z.string(),
  notes: z.string().nullable(),
  eventCounts: z.strictObject({
    SCHEDULED: version,
    DUE: version,
    OVERDUE: version,
    COMPLETED: version,
    CANCELLED: version
  }),
  createdAt: time,
  updatedAt: time
});
export const eventSchema = z.strictObject({
  id,
  version,
  eventType: z.string(),
  scheduledAt: time,
  dueAt: time.nullable(),
  completedAt: time.nullable(),
  status: z.enum(["SCHEDULED", "DUE", "OVERDUE", "COMPLETED", "CANCELLED"])
});
export const alertSchema = z.strictObject({
  id,
  version,
  alertType: z.string(),
  severity: z.string(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
  triggeredAt: time,
  dueAt: time.nullable(),
  acknowledgedAt: time.nullable(),
  resolvedAt: time.nullable(),
  monitoringEventId: id.nullable(),
  eventType: z.string().nullable(),
  scheduledAt: time.nullable(),
  targetType: z.enum(["TREATMENT", "TPT"]),
  targetId: id,
  message: z.string()
});
export const notificationSchema = z.strictObject({
  id,
  version,
  alertId: id.nullable(),
  channel: z.string(),
  status: z.enum(["PENDING", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"]),
  scheduledAt: time,
  deliveredAt: time.nullable(),
  readAt: time.nullable(),
  alertType: z.string().nullable(),
  severity: z.string().nullable()
});
const page = <T extends z.ZodType,>(item: T) => z.strictObject({
  content: z.array(item),
  page: version,
  size: z.number().int().min(1).max(50),
  totalElements: version
});
export const planPageSchema = page(planSchema),
  eventPageSchema = page(eventSchema),
  alertPageSchema = page(alertSchema),
  notificationPageSchema = page(notificationSchema);
