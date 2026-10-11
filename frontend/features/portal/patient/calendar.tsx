"use client";
import { useState } from "react";
import { CalendarView } from "./calendar-view";
import { usePatientActivity } from "./activity-data";
import { patientEvents } from "./events";
import { Pagination, PortalState } from "../display";
export function PatientCalendar() {
  const [dosePage, setDosePage] = useState(0), [monitoringPage, setMonitoringPage] = useState(0);
  const { user, can, doses, followUps, monitoring, refs } = usePatientActivity(dosePage, monitoringPage);
  const events = patientEvents(doses.data?.data.content ?? [], followUps.data?.data ?? [], monitoring.data?.data.content ?? [], refs.data?.data);
  return <><div><p className="eyebrow">Langkah demi langkah</p><h1 className="page-title">Kalender pengobatan</h1><p className="page-description">Lihat tindak lanjut dan laporan yang telah dicatat.</p></div>
    <div className="notice"><h2 className="font-semibold">Jadwal minum obat belum tersedia</h2><p className="mt-2 text-sm">Kalender ini belum memuat waktu minum obat yang diresepkan. Ikuti instruksi petugas; laporan dosis bukan jadwal atau penilaian kepatuhan. Waktu kegiatan ditampilkan dalam zona waktu perangkat Anda.</p></div>
    {!['ADHERENCE_READ', 'FOLLOW_UP_READ', 'MONITORING_READ'].some(can) && <p>Izin baca catatan kalender belum tersedia. Hubungi petugas untuk bantuan.</p>}
    {([['ADHERENCE_READ', 'Laporan dosis', doses], ['FOLLOW_UP_READ', 'Tindak lanjut', followUps], ['MONITORING_READ', 'Pemantauan', monitoring]] as const).map(([permission, title, query]) => can(permission) && (query.isPending || query.error) ? <section key={permission} className="surface"><h2 className="font-semibold">{title}</h2><PortalState query={query}/></section> : null)}
    <CalendarView events={events} canTreatment={user.permissions.includes('TREATMENT_READ')}/>
    <section className="surface space-y-4"><h2 className="font-semibold">Cakupan catatan yang dimuat</h2><p className="text-sm text-muted-foreground">Kalender menampilkan halaman laporan dan pemantauan yang dipilih, serta tindak lanjut yang tersedia. Tanggal kosong tidak berarti tidak ada catatan pada halaman lain.</p>{can('ADHERENCE_READ') && doses.data && <div><p className="mb-2 text-sm">Laporan dosis · {doses.data.data.totalElements} catatan tersedia</p><Pagination page={dosePage} total={doses.data.data.totalElements} onPage={setDosePage}/></div>}{can('MONITORING_READ') && monitoring.data && <div><p className="mb-2 text-sm">Pemantauan · {monitoring.data.data.totalElements} catatan tersedia</p><Pagination page={monitoringPage} total={monitoring.data.data.totalElements} onPage={setMonitoringPage}/></div>}</section>
  </>;
}
