"use client";
import { useEffect, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scheduleKeys, scheduleQueries } from "@/features/medication-schedule/queries";
import { ScheduleSummary } from "@/features/medication-schedule/components/schedule-summary";
import { formatScheduleDate, scheduleTimeZoneLabel } from "@/features/medication-schedule/display";
import { PortalState } from "../display";
import { completeSchedulePages, consistentSchedulePages, medicationEvents, prescribedToday, scheduleRanges, type CalendarMode } from "./schedule-calendar";
export function useMedicationCalendar(userId: string, enabled: boolean, selected: string | null, view: CalendarMode, caseId?: string) {
  const prescription = useQuery({...caseId ? scheduleQueries.supporter(userId,caseId) : scheduleQueries.patient(userId), enabled});
  const schedule = !prescription.error && !prescription.isFetching ? prescription.data?.data : undefined;
  const today = prescribedToday(schedule?.currentRevision?.timeZone);
  const date = selected ?? today, ranges = scheduleRanges(date, view);
  const queries = useQueries({queries:ranges.map(range => ({...caseId ? scheduleQueries.supporterOccurrences(userId,caseId,range.from,range.to) : scheduleQueries.patientOccurrences(userId,range.from,range.to), enabled: enabled && !!schedule?.id}))});
  const loaded = enabled && schedule?.id ? completeSchedulePages(ranges, queries) : null;
  const valid = consistentSchedulePages(schedule,loaded);
  const error = queries.find(q => q.error)?.error;
  const loading = prescription.isFetching || queries.some(q => q.isFetching || (q.isPending && !!schedule?.id));
  const events = valid ? medicationEvents(valid.content,caseId ? `/supporting-cases/${caseId}` : undefined) : [];
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({queryKey:scheduleKeys(userId)});
  return {prescription,schedule,today,date,ranges,loaded:valid,events,error,loading,refresh};
}
export function MedicationAgenda({calendar,enabled}:{calendar:ReturnType<typeof useMedicationCalendar>;enabled:boolean}) {
  const {prescription,schedule,loaded,loading,error,refresh,ranges}=calendar;
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return ()=>clearInterval(timer);},[]);
  const upcoming = schedule?.status === "ACTIVE" && loaded?.lifecycle.futureExpectationsAllowed ? loaded.content.filter(o=>Date.parse(o.scheduledAt)>now).sort((a,b)=>Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt))[0] : undefined;
  return <section className="surface space-y-4" aria-label="Jadwal minum obat"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock aria-hidden="true" className="size-5 text-teal-700"/>Jadwal minum obat</h2>{enabled&&<Button variant="outline" size="sm" disabled={loading} onClick={()=>void refresh()}><RefreshCw aria-hidden="true" className="size-4"/>Perbarui jadwal</Button>}</div>
    {!enabled?<p>Izin baca jadwal belum tersedia. Hubungi petugas.</p>:prescription.isPending||prescription.error?<PortalState query={prescription} empty="Belum ada pengobatan dengan jadwal obat."/>:loading?<p role="status">Memuat seluruh jadwal pada periode ini…</p>:!schedule?<p>Belum ada pengobatan dengan jadwal obat. Ikuti arahan petugas.</p>:<><ScheduleSummary prescription={schedule} compact/>{schedule.id&&(error||!loaded)?<div role="alert"><p>Jadwal pada periode ini belum dapat ditampilkan lengkap. Catatan lainnya tetap ditampilkan terpisah.</p>{error&&<PortalState query={{isPending:false,error,refetch:refresh}}/>}{!error&&<Button variant="outline" onClick={()=>void refresh()}>Muat ulang jadwal</Button>}</div>:loaded&&<><div className="rounded-xl border border-teal-200 bg-teal-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Waktu berikutnya dalam periode yang dimuat</p>{upcoming?<><p className="mt-2 text-3xl font-bold text-teal-950">{upcoming.localTime}</p><p className="mt-1 text-sm text-teal-900">{formatScheduleDate(upcoming.localDate)} · {scheduleTimeZoneLabel(upcoming.timeZone)}</p></>:<p className="mt-2 text-sm">Tidak ada waktu mendatang dalam jadwal yang dimuat.</p>}</div><p className="text-xs text-muted-foreground">Jadwal lengkap untuk {formatScheduleDate(ranges[0].from)} – {formatScheduleDate(ranges.at(-1)!.to)}. Waktu obat mengikuti zona resep; kegiatan lainnya mengikuti zona perangkat.</p>{loaded.exceptions.length>0&&<p role="status" className="text-sm text-amber-900">{loaded.exceptions.length} waktu lokal tidak tersedia akibat perubahan zona waktu. Hubungi petugas; kalender tidak mengganti waktu resep.</p>}</>}</>}
  </section>;
}
