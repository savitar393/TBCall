"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { portalNavigation } from "../permissions";
import { card, Fields, PortalState } from "../display";
const episodeLabel = (status: string) => ({ OPEN: 'Terbuka', DIAGNOSED: 'Terdiagnosis', CONVERTED_TO_CASE: 'Menjadi kasus', CLOSED: 'Ditutup', CANCELLED: 'Dibatalkan', ACTIVE: 'Aktif', REFERRED: 'Dirujuk', COMPLETED: 'Selesai' } as Record<string,string>)[status] ?? status;
export function PatientProfile() {
    const { user } = useSession();
    const query = useQuery({ ...portalQueries.patient(user!.id), enabled: !!user!.patientLink && user!.permissions.includes("PATIENT_READ") });
    const p = query.data?.data;
    return <><h1 className="page-title">Data diri saya</h1><section id="akun" className={card}><h2 className="section-title">Akun & akses</h2><Fields items={{ Email: user!.email, Telepon: user!.phone, Peran: user!.roles.map(role => role.name).join(' · ') }}/></section>
    {!user!.patientLink ? <section className={card}><h2>Akun belum terhubung</h2><p>Hubungi petugas untuk memeriksa tautan akun Anda.</p></section> : !user!.permissions.includes("PATIENT_READ") ? <p>Izin baca profil belum tersedia.</p> : !p ? <PortalState query={query}/> : <section className={card}><h2 className="text-lg font-semibold">Profil Saya</h2><Fields items={{ Nama: p.fullName, "Jenis kelamin": p.sex?.name, "Tempat lahir": p.birthPlace, "Tanggal lahir": p.birthDateUnknown ? "Tidak diketahui" : p.birthDate, Telepon: p.phone, Alamat: p.address }}/>
    <h3>Registrasi saat ini</h3>{p.registrations.length ? p.registrations.map(r => <Fields key={r.id} items={{ Status: episodeLabel(r.status), Tanggal: r.registrationDate, Fasilitas: r.facility?.name }}/>) : <p>Belum ada registrasi saat ini.</p>}
    <h3>Kasus saat ini</h3>{p.cases.length ? p.cases.map(c => <Fields key={c.id} items={{ Status: episodeLabel(c.status), Kategori: c.caseCategory?.name, Fasilitas: c.currentFacility?.name, "Tanggal diagnosis": c.diagnosis?.diagnosisDate, "Jenis diagnosis": c.diagnosis?.diagnosisType?.name, "Lokasi anatomi": c.diagnosis?.anatomicalSite?.name }}/>) : <p>Belum ada kasus saat ini.</p>}</section>}
    <section aria-label="Bagian portal" className="grid gap-4 sm:grid-cols-2">{portalNavigation(user!).filter(l => l.href !== "/portal" && l.href !== "/supporting-cases").map(l => <Link className={card} key={l.href} href={l.href}>{l.label}</Link>)}</section>
  </>;
}
