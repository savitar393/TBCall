"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
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
  return <>{references.isError && references.data && <QueryState query={references} />}<h1 className="text-2xl font-semibold">Detail pasien</h1><WorklistLink />
    <DisplayFields values={[["Nama lengkap", d.fullName], ["Kewarganegaraan", d.citizenship], ["NIK", d.nik], ["Nomor identitas lain", d.otherIdentityNumber], ["BPJS", d.bpjsNumber], ["Tempat lahir", d.birthPlace], ["Tanggal lahir", d.birthDateUnknown ? "Tidak diketahui" : d.birthDate], ["Jenis kelamin", d.sex?.name], ["Telepon", d.phone], ["Alamat", d.address], ["Provinsi", d.provinceCode], ["Kabupaten/kota", d.regencyCode], ["Kecamatan", d.districtCode], ["Desa", d.villageCode]]} />
    {canClinical(user, "PATIENT_UPDATE") && <Button variant="outline" onClick={() => setEditing(!editing)} aria-expanded={editing}>{editing ? "Tutup editor pasien" : "Ubah pasien"}</Button>}
    {editing && canClinical(user, "PATIENT_UPDATE") && (!references.data ? <QueryState query={references} /> : <RecordForm initial={initial} schema={patientFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError} save={(values, dirty, signal) => clinicalApi.patchPatient(id, patientPatch(values, dirty), query.data!.etag!, signal)}><PatientFields references={references.data!.data} /></RecordForm>)}
    <section className="space-y-3"><h2 className="font-semibold">Registrasi saat ini</h2>{!query.data.data.registrations.length && <p>Belum ada registrasi dalam cakupan Anda.</p>}<ul className="space-y-2">{query.data.data.registrations.map(r => <li key={r.id} className="rounded-xl border bg-white p-4 text-sm">{r.registrationDate} · {r.facility.name} · {references.data?.data.registrationStatusFilters.find(o => o.code === r.status)?.name ?? r.status} {canClinical(user, "REGISTRATION_READ") && <Link className="text-primary underline" href={`/registrations/${r.id}`}>Buka registrasi</Link>}</li>)}</ul></section>
    <section className="space-y-3"><h2 className="font-semibold">Kasus saat ini</h2>{!query.data.data.cases.length && <p>Belum ada kasus dalam cakupan Anda.</p>}<ul className="space-y-2">{query.data.data.cases.map(({ summary: c }) => <li key={c.id} className="rounded-xl border bg-white p-4 text-sm">{c.caseCategory?.name ?? "Kasus TBC"} · {c.currentFacility.name} · {references.data?.data.caseStatusFilters.find(o => o.code === c.status)?.name ?? c.status} {canClinical(user, "CASE_READ") && <Link className="text-primary underline" href={`/cases/${c.id}`}>Buka kasus</Link>}</li>)}</ul></section>
    {canLink(user, "PATIENT_LINK_VERIFY") && <PatientAccountLinkSection patientId={id} />}
  </>;
}
