"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { AppDisclosure, AppPageHeader, AppSection, AppStatusBadge, AppViewLinks } from "@/components/application-patterns";
import { clinicalApi } from "../api";
import { clinicalQueries } from "../queries";
import { canClinical } from "../permissions";
import { patientFormSchema, patientValues } from "../forms/values";
import { patientPatch } from "../forms/mappers";
import { PatientFields } from "../forms/patient-fields";
import { RecordForm } from "./record-form";
import { DisplayFields, WorklistLink } from "./record-display";
import { QueryState } from "./query-state";
import { PatientAccountLinkSection } from "@/features/account-linking/patient-section";
import { canLink } from "@/features/account-linking/permissions";
export function PatientDetail({ id }: { id: string }) {
  const { user } = useSession(); const [editing, setEditing] = useState(false);
  const query = useQuery(clinicalQueries.patient(user!.id, id));
  const references = useQuery(clinicalQueries.references(user!.id));
  const initial = useMemo(() => patientValues(query.data?.data), [query.data?.data]);
  if (!query.data) return <QueryState query={query} />;
  const d = query.data.data.demographics;
  return <article className="clinical-workspace">
    <AppPageHeader title="Detail pasien" eyebrow="Ruang kerja pasien" actions={<WorklistLink />} />
    {references.isError && references.data && <QueryState query={references} />}
    <section aria-label="Konteks pasien" className="clinical-context">
      <div className="clinical-context-heading"><div><p className="eyebrow">Pasien</p><h2 className="section-title">{d.fullName}</h2><p className="mt-2 text-sm text-muted-foreground">{d.sex?.name ?? "Jenis kelamin belum diisi"} · {d.birthDateUnknown ? "Tanggal lahir tidak diketahui" : d.birthDate ?? "Tanggal lahir belum diisi"}</p></div>{canClinical(user, "PATIENT_UPDATE") && <Button variant="outline" onClick={() => setEditing(!editing)} aria-expanded={editing} aria-controls="patient-editor">{editing ? "Tutup editor pasien" : "Ubah pasien"}</Button>}</div>
      <dl className="clinical-context-meta"><div><dt>Registrasi dalam cakupan</dt><dd>{query.data.data.registrations.length}</dd></div><div><dt>Kasus dalam cakupan</dt><dd>{query.data.data.cases.length}</dd></div></dl>
    </section>
    <AppViewLinks label="Bagian detail pasien" items={[{ label: "Identitas pasien", href: "#patient-identity", current: false }, { label: "Registrasi saat ini", href: "#patient-registrations", current: false }, { label: "Kasus saat ini", href: "#patient-cases", current: false }, ...(canLink(user, "PATIENT_LINK_VERIFY") ? [{ label: "Akun pasien", href: "#patient-account", current: false }] : [])]} />
    <div id="patient-identity" className="clinical-section" tabIndex={-1}><AppSection title="Identitas pasien" description="Identitas dan informasi kontak pada rekam pasien.">
      <div className="clinical-data-grid"><DisplayFields values={[["Nama lengkap", d.fullName], ["Jenis kelamin", d.sex?.name], ["Tempat lahir", d.birthPlace], ["Tanggal lahir", d.birthDateUnknown ? "Tidak diketahui" : d.birthDate], ["Telepon", d.phone], ["Alamat", d.address]]} /></div>
      <AppDisclosure title="Identitas administratif dan wilayah"><div className="clinical-data-grid"><DisplayFields values={[["Kewarganegaraan", d.citizenship], ["NIK", d.nik], ["Nomor identitas lain", d.otherIdentityNumber], ["BPJS", d.bpjsNumber], ["Provinsi", d.provinceCode], ["Kabupaten/kota", d.regencyCode], ["Kecamatan", d.districtCode], ["Desa", d.villageCode]]} /></div></AppDisclosure>
    </AppSection></div>
    <div id="patient-editor" hidden={!editing}>
    {editing && canClinical(user, "PATIENT_UPDATE") && (!references.data ? <QueryState query={references} /> : <RecordForm initial={initial} schema={patientFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError} save={(values, dirty, signal) => clinicalApi.patchPatient(id, patientPatch(values, dirty), query.data!.etag!, signal)}><PatientFields references={references.data!.data} /></RecordForm>)}
    </div>
    <div id="patient-registrations" className="clinical-section" tabIndex={-1}><AppSection title="Registrasi saat ini">{!query.data.data.registrations.length && <p>Belum ada registrasi dalam cakupan Anda.</p>}<ul className="clinical-record-list">{query.data.data.registrations.map(r => <li key={r.id} className="clinical-record-row"><div className="clinical-record-main"><p className="font-medium">{r.facility.name}</p><p className="text-sm text-muted-foreground">Registrasi · {r.registrationDate}</p><AppStatusBadge tone={r.status === "OPEN" ? "active" : "neutral"}>{references.data?.data.registrationStatusFilters.find(o => o.code === r.status)?.name ?? r.status}</AppStatusBadge></div>{canClinical(user, "REGISTRATION_READ") && <div className="clinical-record-actions"><Button asChild variant="outline"><Link href={`/registrations/${r.id}`}>Buka registrasi</Link></Button></div>}</li>)}</ul></AppSection></div>
    <div id="patient-cases" className="clinical-section" tabIndex={-1}><AppSection title="Kasus saat ini">{!query.data.data.cases.length && <p>Belum ada kasus dalam cakupan Anda.</p>}<ul className="clinical-record-list">{query.data.data.cases.map(({ summary: c }) => <li key={c.id} className="clinical-record-row"><div className="clinical-record-main"><p className="font-medium">{c.caseCategory?.name ?? "Kasus TBC"}</p><p className="text-sm text-muted-foreground">{c.currentFacility.name}</p><AppStatusBadge tone={c.status === "ACTIVE" ? "active" : c.status === "REFERRED" ? "warning" : "neutral"}>{references.data?.data.caseStatusFilters.find(o => o.code === c.status)?.name ?? c.status}</AppStatusBadge></div>{canClinical(user, "CASE_READ") && <div className="clinical-record-actions"><Button asChild variant="outline"><Link href={`/cases/${c.id}`}>Buka kasus</Link></Button></div>}</li>)}</ul></AppSection></div>
    {canLink(user, "PATIENT_LINK_VERIFY") && <div id="patient-account" className="clinical-section" tabIndex={-1}><PatientAccountLinkSection patientId={id} /></div>}
  </article>;
}
