import type { z } from "@/lib/validation";
import type * as s from "./schemas";
export type SchedulePrescription=z.infer<typeof s.schedulePrescriptionSchema>;
export type ScheduleRevision=z.infer<typeof s.scheduleRevisionSchema>;
export type ScheduleRevisionPage=z.infer<typeof s.scheduleRevisionPageSchema>;
export type ScheduleCalendarPage=z.infer<typeof s.scheduleCalendarPageSchema>;
export type ScheduleOccurrence=z.infer<typeof s.scheduleOccurrenceSchema>;
export type ScheduleLifecycle=z.infer<typeof s.scheduleLifecycleSchema>;
export type ScheduleDefinition=z.infer<typeof s.scheduleDefinitionSchema>;
