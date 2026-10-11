"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bell, CalendarDays, HeartHandshake, Pill, UserRound } from "lucide-react";
import { useLocalClock } from "@/lib/use-local-clock";
import { dateKey, formatDate, formatDateTime } from "@/lib/date-format";
import { portalQueries } from "../queries";
import { label } from "../references";
import { PortalState } from "../display";
import { usePatientActivity } from "./activity-data";
import { patientEvents } from "./events";
import { EventCard } from "./calendar-view";
import { MedicationAgenda, useMedicationCalendar } from "./medication-agenda";

export function PatientHome() {
  const now = useLocalClock();
  const { user, can, doses, followUps, monitoring, refs } = usePatientActivity();
  const today = dateKey(now);
  const linked = !!user.patientLink;
  const canReadNotifications = user.permissions.includes("NOTIFICATION_READ_SELF");
  const calendar = useMedicationCalendar(user.id, can("TREATMENT_READ"), null, "month");
  const notifications = useQuery({
    ...portalQueries.notifications(user.id, 0),
    enabled: canReadNotifications,
  });
  const doseRecords = can("ADHERENCE_READ") && !doses.error ? doses.data?.data.content ?? [] : [];
  const followUpRecords = can("FOLLOW_UP_READ") && !followUps.error ? followUps.data?.data ?? [] : [];
  const monitoringRecords = can("MONITORING_READ") && !monitoring.error ? monitoring.data?.data.content ?? [] : [];
  const events = patientEvents(
    doseRecords,
    followUpRecords,
    monitoringRecords,
    refs.data?.data,
  );
  const todaysEvents = events.filter(event => event.date === today);
  const activityQueries = [
    ["ADHERENCE_READ", doses],
    ["FOLLOW_UP_READ", followUps],
    ["MONITORING_READ", monitoring],
  ] as const;
  const readableActivities = activityQueries.filter(([permission]) => can(permission));
  const loadingToday = readableActivities.some(([, query]) => query.isPending);
  const activityError = readableActivities.some(([, query]) => query.error);
  const nextFollowUp = followUpRecords
    .filter(item => item.status === "SCHEDULED" && !item.completedAt && Date.parse(item.scheduledAt) >= now.getTime())
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
  const recentDoses = [...doseRecords]
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
    .slice(0, 3);
  const links = [
    { href: "/portal/calendar", title: "Kalender pengobatan", text: "Jadwal obat, tindak lanjut, dan laporan", icon: CalendarDays },
    ...(can("TREATMENT_READ") ? [{ href: "/portal/treatment", title: "Pengobatan", text: "Obat dan laporan sesuai catatan", icon: Pill }] : []),
    { href: "/portal/profile", title: "Profil", text: "Informasi pribadi dan registrasi", icon: UserRound },
    { href: "/portal/support", title: "Bantuan", text: "Langkah untuk menghubungi petugas", icon: HeartHandshake },
  ];

  return <>
    <section className="patient-welcome flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-emerald-100">Hari ini · {formatDate(today)}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Langkah Anda hari ini.</h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-emerald-50">Lihat jadwal obat, kegiatan terdekat, dan catatan pengobatan Anda.</p>
      </div>
      <Link href="/portal/calendar" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-primary">
        Buka kalender <ArrowUpRight aria-hidden="true" className="size-5"/>
      </Link>
    </section>

    {!linked && <section className="notice">
      <h2 className="font-semibold">Akun belum terhubung</h2>
      <p>Hubungi petugas untuk memeriksa tautan akun Anda. Jadwal dan catatan pengobatan tersedia setelah akun terhubung.</p>
    </section>}

    {linked && <>
      <MedicationAgenda calendar={calendar} enabled={can("TREATMENT_READ")}/>
      <div className="grid items-start gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="surface space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Kegiatan hari ini</h2>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium">
              {loadingToday ? "Memuat catatan…" : activityError ? "Catatan belum lengkap" : `${todaysEvents.length} catatan tersedia`}
            </span>
          </div>
          {!readableActivities.length ? <p className="text-sm text-muted-foreground">Izin baca kegiatan belum tersedia.</p> : <>
            {readableActivities.map(([permission, query]) => query.isPending || query.error
              ? <PortalState key={permission} query={query}/>
              : null)}
            {todaysEvents.map(event => <EventCard key={event.key} event={event} link={event.kind === "monitoring" || can("TREATMENT_READ")}/>)}
            {!loadingToday && !activityError && !todaysEvents.length && <p className="rounded-xl bg-muted/50 p-5 text-sm leading-6 text-muted-foreground">
              Belum ada kegiatan dalam catatan hari ini yang dimuat. Ini bukan penilaian apakah obat telah diminum.
            </p>}
          </>}
        </section>

        <section className="surface space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" aria-hidden="true"/>
            <h2 className="section-title">Tindak lanjut berikutnya</h2>
          </div>
          {!can("FOLLOW_UP_READ") ? <p>Izin baca tindak lanjut belum tersedia.</p>
            : followUps.isPending || followUps.error ? <PortalState query={followUps}/>
            : nextFollowUp ? <>
              <p className="text-xl font-semibold text-primary">{formatDateTime(nextFollowUp.scheduledAt)}</p>
              <p>{nextFollowUp.facility?.name ?? "Fasilitas belum dicantumkan"}</p>
              <p className="text-sm text-muted-foreground">{label(refs.data?.data.followUpStatuses, nextFollowUp.status)}</p>
              <Link href="/portal/calendar" className="inline-flex text-sm font-semibold text-primary underline">Lihat di kalender</Link>
            </> : <p className="text-sm leading-6 text-muted-foreground">
              Belum ada tindak lanjut mendatang yang terjadwal. Hubungi petugas jika Anda perlu memastikan kunjungan berikutnya.
            </p>}
        </section>
      </div>
    </>}

    <section aria-label="Bagian portal" className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {links.map(({ href, title, text, icon: Icon }) => <Link className="surface group flex items-start gap-3 hover:border-primary/40" key={href} href={href}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Icon aria-hidden="true" className="size-5"/></span>
        <div>
          <h2 className="text-sm font-semibold group-hover:text-primary">{title}</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
        </div>
      </Link>)}
    </section>

    <div className="grid items-start gap-5 lg:grid-cols-2">
      {linked && <section className="surface space-y-4">
        <h2 className="section-title">Laporan dosis terbaru</h2>
        {!can("ADHERENCE_READ") ? <p className="text-sm text-muted-foreground">Izin baca laporan dosis belum tersedia.</p>
          : doses.isPending || doses.error ? <PortalState query={doses}/>
          : recentDoses.length ? recentDoses.map(dose => <div key={dose.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <p className="font-medium">{formatDate(dose.scheduledDate)}</p>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-sm text-sky-900">
              {label([...(refs.data?.data.patientDoseStatuses ?? []), ...(refs.data?.data.supporterDoseStatuses ?? [])], dose.status)}
            </span>
          </div>) : <p className="text-sm text-muted-foreground">Belum ada laporan dosis yang tercatat.</p>}
        <p className="text-xs text-muted-foreground">Laporan adalah bukti pencatatan, bukan penilaian keberhasilan terapi. Riwayat dapat ditelusuri melalui halaman kalender.</p>
      </section>}

      <section className="surface space-y-4">
        <h2 className="section-title flex items-center gap-2"><Bell aria-hidden="true" className="size-5 text-primary"/>Notifikasi untuk Anda</h2>
        {!canReadNotifications ? <p>Izin baca notifikasi belum tersedia.</p>
          : notifications.isPending || notifications.error ? <PortalState query={notifications}/>
          : notifications.data?.data.content.length ? notifications.data.data.content.slice(0, 3).map(notification => <div key={notification.id} className="rounded-xl bg-muted/50 p-4">
            <p className="font-medium">{notification.alertType ? label(refs.data?.data.alertTypes, notification.alertType) : "Pemberitahuan akun"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label(refs.data?.data.notificationStatuses, notification.status)} · {formatDateTime(notification.scheduledAt)}</p>
          </div>) : <p className="text-sm text-muted-foreground">Belum ada notifikasi.</p>}
        {canReadNotifications && <Link className="inline-flex text-sm font-semibold text-primary underline" href="/portal/notifications">Notifikasi Saya</Link>}
      </section>
    </div>
  </>;
}
