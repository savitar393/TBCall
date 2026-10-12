"use client";
import { useQuery } from "@tanstack/react-query";
import { AppDisclosure, AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { Fields, PortalState } from "../display";
const episodeLabel = (status: string) => ({ OPEN: "Terbuka", DIAGNOSED: "Terdiagnosis", CONVERTED_TO_CASE: "Menjadi kasus", CLOSED: "Ditutup", CANCELLED: "Dibatalkan", ACTIVE: "Aktif", REFERRED: "Dirujuk", COMPLETED: "Selesai" } as Record<string, string>)[status] ?? status;
export function PatientProfile() {
  const { user } = useSession();
  const query = useQuery({ ...portalQueries.patient(user!.id), enabled: !!user!.patientLink && user!.permissions.includes("PATIENT_READ") });
  const p = query.data?.data;
  return <div className="clinical-workspace"><AppPageHeader title="Profil"/>
    <AppSection title="Akun Anda" className="clinical-section"><div id="akun"><Fields items={{ Email: user!.email, Telepon: user!.phone, Peran: user!.roles.map(role => role.name).join(" · ") }}/></div></AppSection>
    {!user!.patientLink ? <AppSection title="Akun belum terhubung"><p>Hubungi petugas untuk memeriksa tautan akun Anda.</p></AppSection>
      : !user!.permissions.includes("PATIENT_READ") ? <p>Izin baca profil belum tersedia.</p>
      : query.isPending || query.error ? <PortalState query={query}/>
      : p && <>
        <section className="clinical-context" aria-label="Data pribadi"><h2 className="section-title">Data pribadi</h2><div className="clinical-context-heading"><h3 className="text-lg font-semibold">{p.fullName}</h3><AppStatusBadge>Pasien tertaut</AppStatusBadge></div>
          <Fields items={{ "Jenis kelamin": p.sex?.name, "Tempat lahir": p.birthPlace, "Tanggal lahir": p.birthDateUnknown ? "Tidak diketahui" : p.birthDate, Telepon: p.phone, Alamat: p.address }}/>
        </section>
        <AppSection title="Rekam saat ini">
          <AppDisclosure title="Registrasi saat ini">{p.registrations.length ? <ul className="clinical-record-list">{p.registrations.map(r => <li key={r.id} className="clinical-record-row"><Fields items={{ Status: episodeLabel(r.status), Tanggal: r.registrationDate, Fasilitas: r.facility?.name }}/></li>)}</ul> : <p>Belum ada registrasi saat ini.</p>}</AppDisclosure>
          <AppDisclosure title="Kasus saat ini">{p.cases.length ? <ul className="clinical-record-list">{p.cases.map(c => <li key={c.id} className="clinical-record-row"><Fields items={{ Status: episodeLabel(c.status), Kategori: c.caseCategory?.name, Fasilitas: c.currentFacility?.name, "Tanggal diagnosis": c.diagnosis?.diagnosisDate, "Jenis diagnosis": c.diagnosis?.diagnosisType?.name, "Lokasi anatomi": c.diagnosis?.anatomicalSite?.name }}/></li>)}</ul> : <p>Belum ada kasus saat ini.</p>}</AppDisclosure>
        </AppSection>
      </>}
  </div>;
}
