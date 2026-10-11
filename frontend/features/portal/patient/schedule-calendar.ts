import { dateKey, monthDates, weekDates } from "@/lib/date-format";
import type { ScheduleCalendarPage, ScheduleOccurrence, SchedulePrescription } from "@/features/medication-schedule/types";
import type { CalendarEvent } from "./events";
export type CalendarMode = "day" | "week" | "month";
export function scheduleRanges(selected: string, view: CalendarMode) {
  const days = view === "month" ? monthDates(selected) : view === "week" ? weekDates(selected) : [selected];
  return Array.from({length: Math.ceil(days.length / 31)}, (_, i) => ({from: days[i * 31], to: days[Math.min(i * 31 + 30, days.length - 1)]}));
}
export function prescribedToday(zone?: string, now = new Date()) {
  if (!zone) return dateKey(now);
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function medicationEvents(occurrences: ScheduleOccurrence[], href = "/portal/treatment"): CalendarEvent[] {
  return occurrences.map(o => ({key: `medication-${o.id}`, date: o.localDate, kind: "medication", title: "Waktu minum obat", status: "Terjadwal", state: "scheduled", time: o.scheduledAt, localTime: o.localTime, timeZone: o.timeZone, detail: "Sesuai jadwal yang diresepkan petugas.", href}));
}
type LoadedPage = {data?: {data: ScheduleCalendarPage} | null; isPending: boolean; isFetching: boolean; error: unknown};
// Publish the complete requested range together. Old or partial pages are never a complete calendar.
export function completeSchedulePages(ranges: {from: string; to: string}[], pages: LoadedPage[]): Pick<ScheduleCalendarPage,"content"|"exceptions"|"lifecycle"> | null {
  if (!ranges.length || pages.length !== ranges.length || pages.some((p,i) => p.isPending || p.isFetching || p.error || !p.data || p.data.data.from !== ranges[i].from || p.data.data.to !== ranges[i].to)) return null;
  const values = pages.map(p => p.data!.data), lifecycle = values[0].lifecycle;
  if (values.some(p => JSON.stringify(p.lifecycle) !== JSON.stringify(lifecycle))) return null;
  return {content: values.flatMap(p => p.content), exceptions: values.flatMap(p => p.exceptions), lifecycle};
}

export function consistentSchedulePages(prescription: SchedulePrescription | undefined, loaded: ReturnType<typeof completeSchedulePages>) {
  if (!prescription || !loaded || JSON.stringify(loaded.lifecycle) !== JSON.stringify(prescription.lifecycle)) return null;
  if (loaded.content.some(o => o.treatmentId !== prescription.treatmentId || o.scheduleId !== prescription.id || (prescription.cancelledAt && Date.parse(o.scheduledAt) >= Date.parse(prescription.cancelledAt)) || (prescription.currentRevision && Date.parse(o.scheduledAt) >= Date.parse(prescription.currentRevision.validFrom) && o.revisionId !== prescription.currentRevision.id))) return null;
  return loaded;
}