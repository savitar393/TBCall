"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileCheck2, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { civilDate, dateKey, formatDate, formatDateTime, monthDates, shiftDate, shiftMonth, weekDates } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { scheduleTimeZoneLabel } from "@/features/medication-schedule/display";
import type { CalendarMode } from "./schedule-calendar";
import type { CalendarEvent } from "./events";
export function EventCard({ event, link = true }: { event: CalendarEvent; link?: boolean }) {
  const Icon = event.kind === "dose" ? FileCheck2 : event.kind === "medication" ? Pill : Clock3;
  return <article className={cn("flex items-start gap-3 rounded-xl border p-4", event.kind === "medication" ? "border-teal-200 bg-teal-50/70" : event.state === "recorded" ? "border-sky-200 bg-sky-50/60" : event.state === "completed" ? "border-emerald-200 bg-emerald-50/60" : event.state === "scheduled" ? "border-amber-200 bg-amber-50/60" : "bg-muted/50")}>
    <Icon className="mt-1 size-5 shrink-0" aria-hidden="true"/><div className="min-w-0 flex-1"><p className="font-semibold">{event.title}</p><span className="mt-2 inline-flex rounded-full border bg-white/75 px-2.5 py-1 text-xs font-medium">{event.status}</span>{event.time && <p className="mt-2 text-sm text-muted-foreground">{event.localTime && event.timeZone ? `${formatDate(event.date)} · ${event.localTime} · ${scheduleTimeZoneLabel(event.timeZone)}` : formatDateTime(event.time)}</p>}{event.detail && <p className="mt-2 text-sm text-muted-foreground">{event.detail}</p>}{link && <Link className="mt-3 inline-flex items-center text-sm font-semibold text-primary underline underline-offset-4" href={event.href}>Buka catatan</Link>}</div>
  </article>;
}
export function CalendarView({ events, today = dateKey(new Date()), canTreatment = false, selected: controlledSelected, view: controlledView, onSelected, onView }: { events: CalendarEvent[]; today?: string; canTreatment?: boolean; selected?: string; view?: CalendarMode; onSelected?: (date: string) => void; onView?: (view: CalendarMode) => void }) {
  const [localSelected, setLocalSelected] = useState(today), [localView, setLocalView] = useState<CalendarMode>("month");
  const selected = controlledSelected ?? localSelected, view = controlledView ?? localView;
  const setSelected = onSelected ?? setLocalSelected, setView = onView ?? setLocalView;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const days = view === "month" ? monthDates(selected) : view === "week" ? weekDates(selected) : [selected];
  const selectedEvents = events.filter(event => view === "week" ? days.includes(event.date) : event.date === selected);
  const selectFocus = (key: string) => { setSelected(key); requestAnimationFrame(() => buttons.current.get(key)?.focus()); };
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | undefined;
    if (event.key in deltas) next = shiftDate(date, deltas[event.key]);
    else if (event.key === "Home") next = weekDates(date)[0];
    else if (event.key === "End") next = weekDates(date)[6];
    else if (event.key === "PageUp" || event.key === "PageDown") next = shiftMonth(date, event.key === "PageUp" ? -1 : 1);
    if (next) { event.preventDefault(); selectFocus(next); }
  }
  const move = (delta: number) => setSelected(view === "month" ? shiftMonth(selected, delta) : shiftDate(selected, delta * (view === "week" ? 7 : 1)));
  return <section className="surface space-y-5" aria-label="Kalender catatan pengobatan">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays aria-hidden="true" className="size-5 text-primary"/>Kalender Anda</h2><div className="flex rounded-xl bg-muted p-1" aria-label="Tampilan kalender">{([['day', 'Hari'], ['week', 'Minggu'], ['month', 'Bulan']] as const).map(([key, title]) => <Button key={key} variant={view === key ? "default" : "ghost"} size="sm" aria-pressed={view === key} onClick={() => setView(key)}>{title}</Button>)}</div></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold" aria-live="polite">{new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(civilDate(selected)!)}</p><div className="flex gap-1"><Button variant="outline" aria-label="Periode sebelumnya" onClick={() => move(-1)}><ChevronLeft aria-hidden="true"/></Button><Button variant="outline" onClick={() => setSelected(today)}>Hari ini</Button><Button variant="outline" aria-label="Periode berikutnya" onClick={() => move(1)}><ChevronRight aria-hidden="true"/></Button></div></div>
    <div className={cn("calendar-workspace", view === "day" && "calendar-day")}>{view !== "day" && <div className="-mx-3 sm:mx-0 xl:rounded-xl xl:border xl:px-3 xl:pb-3"><div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">{['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => <span key={d} className="py-3">{d}</span>)}</div><div className="grid grid-cols-7 gap-y-1" aria-label="Pilih tanggal">{days.map(day => { const count = events.filter(e => e.date === day).length; return <button key={day} ref={node => { if (node) buttons.current.set(day, node); else buttons.current.delete(day); }} type="button" tabIndex={selected === day ? 0 : -1} aria-pressed={selected === day} aria-current={day === today ? "date" : undefined} aria-label={`${formatDate(day)}${count ? `, ${count} catatan` : ', tanpa catatan'}`} onClick={() => setSelected(day)} onKeyDown={e => keyboard(e, day)} className={cn("relative mx-auto flex min-h-12 w-full max-w-14 sm:min-h-16 sm:max-w-18 flex-col items-center justify-center rounded-xl text-sm transition-colors", selected === day ? "bg-primary font-semibold text-white shadow-sm" : "hover:bg-accent", day.slice(0,7) !== selected.slice(0,7) && "text-muted-foreground", day === today && selected !== day && "ring-1 ring-inset ring-primary")}><span>{civilDate(day)!.getDate()}</span><span className={cn("mt-1 h-1 w-1 rounded-full", count ? selected === day ? "bg-white" : "bg-primary" : "bg-transparent")} aria-hidden="true"/></button>; })}</div></div>}
    <div className="rounded-xl border bg-muted/20 p-4"><h3 className="mb-4 font-semibold">{view === "week" ? `Catatan minggu ${formatDate(days[0])}` : formatDate(selected)}</h3><div className="grid gap-3">{selectedEvents.length ? selectedEvents.map(event => <EventCard key={event.key} event={event} link={event.kind === "monitoring" || canTreatment}/>) : <p className="rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground ">Belum ada catatan pada {view === "week" ? "minggu" : "tanggal"} ini dalam data yang dimuat. Ini tidak menunjukkan apakah obat telah diminum.</p>}</div></div></div>
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>● Laporan tercatat</span><span>◷ Terjadwal</span><span>✓ Selesai sesuai catatan</span></div>
  </section>;
}
