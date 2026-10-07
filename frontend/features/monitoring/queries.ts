import { queryOptions } from "@tanstack/react-query";
import { treatmentApi } from "@/features/treatment/api";
import { continuityApi } from "@/features/continuity/api";
import { monitoringApi as api } from "./api";
import type { TargetType } from "./types";
const explicitReads = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false
};
export const monitoringKeys = (userId: string) => ["monitoring", userId] as const;
export const monitoringQueries = {
  references: (u: string) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "references"],
    queryFn: ({
      signal
    }) => api.references(signal),
    staleTime: 300000
  }),
  target: (u: string, type: TargetType, id: string) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "target", type, id],
    queryFn: async ({
      signal
    }) => {
      if (type === "TPT") return await continuityApi.tpt(id, signal);
      return await treatmentApi.detail(id, signal);
    }
  }),
  history: (u: string, type: TargetType, id: string, page: number) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "history", type, id, page],
    queryFn: ({
      signal
    }) => api.history(type, id, page, signal)
  }),
  activePlan: (u: string, type: TargetType, id: string) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "history", type, id, "active-check"],
    queryFn: async ({
      signal
    }) => {
      let page = 0;
      let seen = 0;
      while (true) {
        signal.throwIfAborted();
        const result = await api.history(type, id, page, signal);
        const data = result.data;
        if (data.content.some(plan => plan.status === "ACTIVE")) return true;
        seen += data.content.length;
        if (seen >= data.totalElements) return false;
        if (!data.content.length) throw new Error("Incomplete monitoring history");
        page++;
      }
    }
  }),
  plan: (u: string, id: string) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "plan", id],
    queryFn: ({
      signal
    }) => api.plan(id, signal)
  }),
  events: (u: string, id: string, page: number) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "events", id, page],
    queryFn: ({
      signal
    }) => api.events(id, page, signal)
  }),
  event: (u: string, id: string) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "event", id],
    queryFn: ({
      signal
    }) => api.event(id, signal)
  }),
  alerts: (u: string, status: string, targetType: string, page: number, size: number) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "alerts", status, targetType, page, size],
    queryFn: ({
      signal
    }) => api.alerts(status, targetType, page, size, signal)
  }),
  alert: (u: string, id: string) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "alert", id],
    queryFn: ({
      signal
    }) => api.alert(id, signal)
  }),
  notifications: (u: string, page: number) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "notifications", page],
    queryFn: ({
      signal
    }) => api.notifications(page, signal)
  }),
  notification: (u: string, id: string) => queryOptions({
    ...explicitReads,
    queryKey: [...monitoringKeys(u), "notification", id],
    queryFn: ({
      signal
    }) => api.notification(id, signal)
  })
};
