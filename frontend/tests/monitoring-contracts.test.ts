import { expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { monitoringQueries as q } from "@/features/monitoring/queries";
import { monitoringApi as api } from "@/features/monitoring/api";
import * as s from "@/features/monitoring/schemas";
import { eventTypes, channels } from "@/features/monitoring/references";
import { createSchema, eventInputSchema, emptyEvent, emptyPlan, planEditSchema, planPatch, rescheduleSchema, rescheduleValues, eventPatch, completionSchema } from "@/features/monitoring/monitoring/forms";
import { localDateTimeToIso } from "@/features/monitoring/time";
import * as f from "./monitoring-fixtures";
import { monitoringBackend, tag } from "./monitoring-harness";
it("completion at truncated original millisecond is before microsecond schedule", () => {
  expect(completionSchema(f.event).safeParse({
    completedAt: rescheduleValues(f.event).scheduledAt
  }).success).toBe(false);
});
it("alert without event accepts the existing nullable safe projection", () => {
  expect(s.alertSchema.safeParse({
    ...f.alert,
    monitoringEventId: null,
    eventType: null,
    scheduledAt: null
  }).success).toBe(true);
});
it("event counts require exact known five groups", () => {
  expect(s.planSchema.safeParse({
    ...f.plan,
    eventCounts: {
      SCHEDULED: 1,
      DUE: 0,
      OVERDUE: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      UNKNOWN: 2
    }
  }).success).toBe(false);
  expect(s.planSchema.safeParse({
    ...f.plan,
    eventCounts: {
      SCHEDULED: 1
    }
  }).success).toBe(false);
});
it.each(Object.keys(f.references))("reference group %s is required", group => {
  const dto = {
    ...f.references
  };
  delete dto[group as keyof typeof dto];
  expect(s.referencesSchema.safeParse(dto).success).toBe(false);
});
it("strict references reject extra groups and extra option properties", () => {
  expect(s.referencesSchema.safeParse({
    ...f.references,
    frequency: 7
  }).success).toBe(false);
  expect(s.referencesSchema.safeParse({
    ...f.references,
    planStatuses: [{
      code: "ACTIVE",
      name: "Live",
      extra: true
    }]
  }).success).toBe(false);
});
it("target types and channels use live labels but exclude unsupported options", () => {
  expect(eventTypes(f.references, "TPT")).toEqual([{
    code: "CLINICAL_REVIEW",
    name: "Live CLINICAL_REVIEW"
  }]);
  expect(eventTypes(f.references, "TREATMENT")).toEqual(f.references.treatmentEventTypes);
  expect(channels(f.references)).toEqual([{
    code: "IN_APP",
    name: "Live IN_APP"
  }]);
});
it.each([[s.planSchema, f.plan], [s.eventSchema, f.event], [s.alertSchema, f.alert], [s.notificationSchema, f.notification]] as const)("safe detail schema rejects injected clinical fields", (schema, dto) => {
  expect(schema.safeParse(dto).success).toBe(true);
  expect(schema.safeParse({
    ...dto,
    payload: {
      patient: "private"
    }
  }).success).toBe(false);
});
it.each(["plan", "event", "alert", "notification"] as const)("%s malformed API responses map to INVALID_RESPONSE", async method => {
  monitoringBackend(() => Response.json({
    clinical: "private"
  }));
  await expect(api[method](f.plan.id)).rejects.toMatchObject({
    problem: {
      code: "INVALID_RESPONSE"
    }
  });
});
const options = [q.references(f.actor.id), q.target(f.actor.id, "TREATMENT", f.treatment.id), q.target(f.actor.id, "TPT", f.tpt.id), q.history(f.actor.id, "TREATMENT", f.treatment.id, 0), q.activePlan(f.actor.id, "TREATMENT", f.treatment.id), q.plan(f.actor.id, f.plan.id), q.events(f.actor.id, f.plan.id, 0), q.event(f.actor.id, f.event.id), q.alerts(f.actor.id, "OPEN", "TREATMENT", 0, 20), q.alert(f.actor.id, f.alert.id), q.notifications(f.actor.id, 0), q.notification(f.actor.id, f.notification.id)];
it.each(options)("query $queryKey uses user prefix and TanStack AbortSignal", async option => {
  const calls = monitoringBackend();
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
  expect(option.queryKey.slice(0, 2)).toEqual(["monitoring", f.actor.id]);
  await client.fetchQuery(option as ReturnType<typeof q.references>);
  expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
  client.clear();
});
it.each([() => api.patchPlan(f.plan.id, {}, undefined), () => api.cancelPlan(f.plan.id, undefined), () => api.addEvent(f.plan.id, {}, undefined), () => api.reschedule(f.event.id, {}, undefined), () => api.eventAction(f.event.id, "cancel", {}, undefined), () => api.alertAction(f.alert.id, "resolve", undefined), () => api.read(f.notification.id, undefined)])("missing actual ETag rejects safely before HTTP command", async command => {
  const calls = monitoringBackend();
  await expect(Promise.resolve().then(async () => await command())).rejects.toMatchObject({
    problem: {
      status: 428
    }
  });
  expect(calls).toHaveLength(0);
});
it("create requires manual 1..100 complete rows and sends no If-Match", async () => {
  const schema = createSchema(f.references.treatmentEventTypes, {
    startDate: "2026-01-01",
    plannedEndDate: "2026-12-31"
  });
  const values = {
    ...emptyPlan(),
    startDate: "2026-01-01",
    events: [{
      eventType: "CLINICAL_REVIEW",
      scheduledAt: "2026-01-02T10:00",
      dueAt: ""
    }]
  };
  expect(schema.safeParse(emptyPlan()).success).toBe(false);
  expect(schema.safeParse({
    ...values,
    events: []
  }).success).toBe(false);
  expect(schema.safeParse({
    ...values,
    events: Array.from({
      length: 100
    }, () => values.events[0])
  }).success).toBe(true);
  expect(schema.safeParse({
    ...values,
    events: Array.from({
      length: 101
    }, () => values.events[0])
  }).success).toBe(false);
  const calls = monitoringBackend();
  await api.create("TREATMENT", f.treatment.id, {
    startDate: values.startDate,
    events: [{
      eventType: "CLINICAL_REVIEW",
      scheduledAt: "2026-01-02T03:00:00Z"
    }]
  });
  expect(tag(calls[0])).toBeNull();
});
it.each([{
  startDate: "2025-12-31",
  endDate: ""
}, {
  startDate: "2026-02-01",
  endDate: "2026-01-01"
}, {
  startDate: "2026-02-01",
  endDate: "2027-01-01"
}])("create rejects structural date range $startDate / $endDate", dates => {
  expect(createSchema(f.references.treatmentEventTypes, {
    startDate: "2026-01-01",
    plannedEndDate: "2026-12-31"
  }).safeParse({
    ...emptyPlan(),
    ...dates,
    events: [{
      eventType: "CLINICAL_REVIEW",
      scheduledAt: "2026-02-01T10:00",
      dueAt: ""
    }]
  }).success).toBe(false);
});
it("manual event requires valid type and due >= scheduled", () => {
  const schema = eventInputSchema([{
    code: "CLINICAL_REVIEW"
  }]);
  expect(schema.safeParse(emptyEvent()).success).toBe(false);
  expect(schema.safeParse({
    eventType: "SAFETY_MONITORING",
    scheduledAt: "2026-01-02T10:00",
    dueAt: ""
  }).success).toBe(false);
  expect(schema.safeParse({
    eventType: "CLINICAL_REVIEW",
    scheduledAt: "2026-01-02T10:00",
    dueAt: "2026-01-01T10:00"
  }).success).toBe(false);
});
it("plan patch explicit null and dirty-only fields", () => {
  expect(planPatch({
    endDate: "",
    notes: ""
  }, {
    endDate: true,
    notes: true
  })).toEqual({
    endDate: null,
    notes: null
  });
  expect(planPatch({
    endDate: "2026-02-01",
    notes: "private"
  }, {
    notes: true
  })).toEqual({
    notes: "private"
  });
  expect(planEditSchema("2026-01-01").safeParse({
    endDate: "2025-01-01",
    notes: ""
  }).success).toBe(false);
});
it("event due clear and schedule edit preserve omitted backend timestamp", () => {
  expect(eventPatch({
    ...rescheduleValues(f.event),
    dueAt: ""
  }, {
    dueAt: true
  })).toEqual({
    dueAt: null
  });
  const v = {
    ...rescheduleValues(f.event),
    scheduledAt: "2026-01-01T10:00"
  };
  expect(eventPatch(v, {
    scheduledAt: true
  })).toEqual({
    scheduledAt: localDateTimeToIso(v.scheduledAt)
  });
});
it("unchanged ambiguous original timestamp does not block editing only dueAt", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const original = {
      ...f.event,
      scheduledAt: "2026-11-01T01:30:00.123456-04:00",
      dueAt: null
    };
    const v = {
      ...rescheduleValues(original),
      dueAt: "2026-11-02T12:00"
    };
    expect(rescheduleSchema(original).safeParse(v).success).toBe(true);
    expect(eventPatch(v, {
      dueAt: true
    })).toEqual({
      dueAt: "2026-11-02T17:00:00.000Z"
    });
    expect(() => localDateTimeToIso("2026-11-01T01:30")).toThrow();
    expect(() => localDateTimeToIso("2026-03-08T02:30")).toThrow();
  } finally {
    process.env.TZ = previous;
  }
});
it("unchanged microsecond scheduled timestamp participates in due comparison exactly", () => {
  const v = {
    ...rescheduleValues(f.event),
    dueAt: rescheduleValues({
      ...f.event,
      scheduledAt: "2026-01-01T10:14:59.999+07:00"
    }).scheduledAt
  };
  expect(rescheduleSchema(f.event).safeParse(v).success).toBe(false);
});
it("edited due at truncated original millisecond is before original microsecond schedule", () => {
  const v = {
    ...rescheduleValues(f.event),
    dueAt: rescheduleValues(f.event).scheduledAt
  };
  expect(rescheduleSchema(f.event).safeParse(v).success).toBe(false);
});
it("completion supports blank server now, forbids before schedule/future", () => {
  const schema = completionSchema(f.event);
  expect(schema.safeParse({
    completedAt: ""
  }).success).toBe(true);
  expect(schema.safeParse({
    completedAt: "2020-01-01T00:00"
  }).success).toBe(false);
  expect(schema.safeParse({
    completedAt: "2099-01-01T00:00"
  }).success).toBe(false);
});
