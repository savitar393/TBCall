"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { clinicalApi } from "../api";
import { clinicalQueries } from "../queries";
import { canClinical } from "../permissions";
import { registrationFormSchema, registrationValues, diagnosisFormSchema, diagnosisValues, caseFormSchema, caseValues } from "../forms/values";
import { registrationPatch, diagnosisInput, caseInput } from "../forms/mappers";
import { RegistrationFields } from "../forms/registration-fields";
import { DiagnosisFields } from "../forms/diagnosis-fields";
import { CaseFields } from "../forms/case-fields";
import { Field } from "../forms/fields";
import { RecordForm } from "./record-form";
import { DisplayFields, PatientHeading, WorklistLink } from "./record-display";
import { QueryState } from "./query-state";
const confirmationSchema = caseFormSchema.extend({ diagnosisId: z.uuid("Pilih diagnosis untuk konfirmasi.") });
export function RegistrationDetail({ id }: { id: string }) {
  const { user } = useSession(); const router = useRouter();
  const [editing, setEditing] = useState(false); const [creating, setCreating] = useState(false); const [confirming, setConfirming] = useState(false);
  const query = useQuery(clinicalQueries.registration(user!.id, id));
  const references = useQuery({ ...clinicalQueries.references(user!.id), enabled: canClinical(user, "PATIENT_READ") });
  const diagnoses = useQuery({ ...clinicalQueries.diagnoses(user!.id, id), enabled: canClinical(user, "DIAGNOSIS_READ") });
  const initial = useMemo(() => registrationValues(query.data?.data), [query.data?.data]);
  const newDiagnosis = useMemo(() => diagnosisValues(), []);
  const newCase = useMemo(() => ({ ...caseValues(), diagnosisId: "" }), []);
  if (!query.data) return <QueryState query={query} />;
  const r = query.data.data; const ref = references.data?.data;
  const eligible = diagnoses.data?.data.filter(d => d.treatmentDisposition === "TREAT_HERE" || d.treatmentDisposition === "REFERRED") ?? [];
  const referenceState = !canClinical(user, "PATIENT_READ") ? <p>Izin membaca referensi klinis diperlukan untuk mengisi formulir.</p> : !references.data ? <QueryState query={references} /> : null;
  return <>{references.isError && references.data && <QueryState query={references} />}<h1 className="text-2xl font-semibold">Detail registrasi</h1><WorklistLink /><PatientHeading patientId={r.patient.patientId} name={r.patient.fullName} />
    <DisplayFields values={[["Status", ref?.registrationStatusFilters.find(o => o.code === r.status)?.name ?? r.status], ["Fasilitas registrasi", r.facility.name], ["Tanggal registrasi", r.registrationDate], ["Nomor registrasi fasilitas", r.facilityRegistrationNumber], ["Nomor rekam medis", r.medicalRecordNumber], ["Identitas spesimen", r.specimenIdentityNumber], ["Jenis terduga", ref?.suspectTypes.find(o => o.code === r.suspectTypeCode)?.name ?? r.suspectTypeCode], ["Pengobatan sebelumnya", ref?.previousTreatmentCategories.find(o => o.code === r.previousTreatmentCategoryCode)?.name ?? r.previousTreatmentCategoryCode], ["Jenis pemberi rujukan", r.referredByType], ["Referensi pemberi rujukan", r.referredByReference], ["Catatan rujukan", r.referralNotes], ["Berat awal (kg)", r.initialWeightKg], ["HIV", ref?.hivStatuses.find(o => o.code === r.hivStatusCode)?.name ?? r.hivStatusCode], ["DM", ref?.dmStatuses.find(o => o.code === r.dmStatusCode)?.name ?? r.dmStatusCode]]} />
    {canClinical(user, "REGISTRATION_WRITE") && r.status === "OPEN" && <Button variant="outline" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? "Tutup editor registrasi" : "Ubah registrasi"}</Button>}
    {editing && canClinical(user, "REGISTRATION_WRITE") && (referenceState ?? <RecordForm initial={initial} schema={registrationFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError || r.status !== "OPEN"} save={(values, dirty, signal) => clinicalApi.patchRegistration(id, registrationPatch(values, dirty), query.data!.etag!, signal)}><RegistrationFields references={ref!} /></RecordForm>)}
    <section className="space-y-4"><h2 className="font-semibold">Diagnosis registrasi</h2>{canClinical(user, "DIAGNOSIS_READ") ? diagnoses.isPending || diagnoses.isError ? <QueryState query={diagnoses} /> : <>{!diagnoses.data!.data.length && <p>Belum ada diagnosis.</p>}<ul className="space-y-3">{diagnoses.data!.data.map(d => <li key={d.id} className="space-y-2 rounded-xl border bg-white p-5 text-sm"><p>{d.diagnosisDate} · {d.anatomicalSite?.name} · {d.diagnosisType?.name}</p><p>{d.diagnosisResult}</p><p>{ref?.treatmentDispositions.find(o => o.code === d.treatmentDisposition)?.name ?? d.treatmentDisposition}</p><Link className="inline-block text-primary underline" href={`/diagnoses/${d.id}`}>Buka diagnosis</Link></li>)}</ul></> : <p>Izin membaca diagnosis belum tersedia.</p>}
      {canClinical(user, "DIAGNOSIS_WRITE") && ["OPEN", "DIAGNOSED"].includes(r.status) && <Button variant="outline" aria-expanded={creating} onClick={() => setCreating(!creating)}>{creating ? "Tutup formulir diagnosis" : "Tambah diagnosis"}</Button>}
      {creating && canClinical(user, "DIAGNOSIS_WRITE") && (referenceState ?? <RecordForm initial={newDiagnosis} schema={diagnosisFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError || !["OPEN", "DIAGNOSED"].includes(r.status)} create submitLabel="Simpan diagnosis" save={(values, _dirty, signal) => clinicalApi.createDiagnosis(id, diagnosisInput(values), query.data!.etag!, signal)} onSuccess={() => setCreating(false)}><DiagnosisFields references={ref!} currentFacilityId={r.facility.id} /></RecordForm>)}
    </section>
    {canClinical(user, "CASE_WRITE", "DIAGNOSIS_READ") && r.status === "DIAGNOSED" && !!eligible.length && !diagnoses.isError && <Button variant="outline" aria-expanded={confirming} onClick={() => setConfirming(!confirming)}>{confirming ? "Tutup konfirmasi kasus" : "Konfirmasi kasus"}</Button>}
    {confirming && canClinical(user, "CASE_WRITE", "DIAGNOSIS_READ") && (referenceState ?? <RecordForm initial={newCase} schema={confirmationSchema} etag={query.data.etag} fetching={query.isFetching || diagnoses.isFetching} unavailable={query.isError || references.isError || diagnoses.isError || r.status !== "DIAGNOSED"} create submitLabel="Simpan konfirmasi kasus" save={async (values, _dirty, signal) => {
      if (!eligible.some(d => d.id === values.diagnosisId)) return undefined;
      const result = await clinicalApi.confirmCase(id, { diagnosisId: values.diagnosisId, ...caseInput(values) }, query.data!.etag!, signal);
      return result;
    }} onSuccess={result => { if (result) router.push(`/cases/${result.data.id}`); }}>
      <Field name="diagnosisId" label="Diagnosis untuk konfirmasi" options={eligible.map(d => ({ code: d.id, name: `${d.diagnosisDate} · ${d.anatomicalSite?.name ?? "Diagnosis"} · ${d.diagnosisResult ?? ""}` }))} />
      <CaseFields references={ref!} />
    </RecordForm>)}
  </>;
}
