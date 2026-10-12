"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { AppDisclosure, AppPageHeader, AppSection, AppStatusBadge, AppViewLinks } from "@/components/application-patterns";
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
import { DisplayFields, WorklistLink, registrationStatusLabel } from "./record-display";
import { QueryState } from "./query-state";
import { formatDate } from "@/lib/date-format";
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
  return <article className="clinical-workspace">
    <AppPageHeader title="Detail registrasi" eyebrow="Ruang kerja registrasi" actions={<WorklistLink />} />
    {references.isError && references.data && <QueryState query={references} />}
    <section aria-label="Konteks registrasi" className="clinical-context">
      <div className="clinical-context-heading"><div><p className="eyebrow">Pasien</p><h2 className="section-title">{canClinical(user, "PATIENT_READ") ? <Link className="text-primary underline" href={`/patients/${r.patient.patientId}`}>{r.patient.fullName}</Link> : r.patient.fullName}</h2><p className="mt-2 text-sm text-muted-foreground">Registrasi · {formatDate(r.registrationDate)} · {r.facility.name}</p></div><AppStatusBadge tone={r.status === "OPEN" ? "active" : "neutral"}>{registrationStatusLabel(r.status, ref?.registrationStatusFilters)}</AppStatusBadge></div>
      <div className="app-actions">
        {canClinical(user, "REGISTRATION_WRITE") && r.status === "OPEN" && <Button variant="outline" aria-expanded={editing} aria-controls="registration-editor" onClick={() => setEditing(!editing)}>{editing ? "Tutup editor registrasi" : "Ubah registrasi"}</Button>}
        {canClinical(user, "LAB_REQUEST_WRITE") && ["OPEN", "DIAGNOSED"].includes(r.status) && <Button asChild variant="outline"><Link href={`/laboratory/requests/new/registration/${id}`}>Buat permintaan laboratorium</Link></Button>}
      </div>
    </section>
    <AppViewLinks label="Bagian detail registrasi" items={[{ label: "Data registrasi", href: "#registration-data", current: false }, { label: "Diagnosis registrasi", href: "#registration-diagnoses", current: false }, ...(canClinical(user, "CASE_WRITE", "DIAGNOSIS_READ") ? [{ label: "Konfirmasi kasus", href: "#registration-confirmation", current: false }] : [])]} />
    <div id="registration-data" className="clinical-section" tabIndex={-1}><AppSection title="Data registrasi" description="Informasi awal dan rujukan yang dicatat saat registrasi.">
      <div className="clinical-data-grid"><DisplayFields values={[["Jenis terduga", ref?.suspectTypes.find(o => o.code === r.suspectTypeCode)?.name ?? r.suspectTypeCode], ["Pengobatan sebelumnya", ref?.previousTreatmentCategories.find(o => o.code === r.previousTreatmentCategoryCode)?.name ?? r.previousTreatmentCategoryCode], ["Berat awal (kg)", r.initialWeightKg], ["HIV", ref?.hivStatuses.find(o => o.code === r.hivStatusCode)?.name ?? r.hivStatusCode], ["DM", ref?.dmStatuses.find(o => o.code === r.dmStatusCode)?.name ?? r.dmStatusCode], ["Jenis pemberi rujukan", r.referredByType], ["Referensi pemberi rujukan", r.referredByReference], ["Catatan rujukan", r.referralNotes]]} /></div>
      <AppDisclosure title="Nomor dan pencatatan registrasi"><div className="clinical-data-grid"><DisplayFields values={[["Status", registrationStatusLabel(r.status, ref?.registrationStatusFilters)], ["Fasilitas registrasi", r.facility.name], ["Tanggal registrasi", r.registrationDate], ["Nomor registrasi fasilitas", r.facilityRegistrationNumber], ["Nomor rekam medis", r.medicalRecordNumber], ["Identitas spesimen", r.specimenIdentityNumber]]} /></div></AppDisclosure>
    </AppSection></div>
    <div id="registration-editor" hidden={!editing}>
    {editing && canClinical(user, "REGISTRATION_WRITE") && (referenceState ?? <RecordForm initial={initial} schema={registrationFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError || r.status !== "OPEN"} save={(values, dirty, signal) => clinicalApi.patchRegistration(id, registrationPatch(values, dirty), query.data!.etag!, signal)}><RegistrationFields references={ref!} /></RecordForm>)}
    </div>
    <div id="registration-diagnoses" className="clinical-section" tabIndex={-1}><AppSection title="Diagnosis registrasi" actions={canClinical(user, "DIAGNOSIS_WRITE") && ["OPEN", "DIAGNOSED"].includes(r.status) && <Button variant="outline" aria-expanded={creating} aria-controls="registration-diagnosis-form" onClick={() => setCreating(!creating)}>{creating ? "Tutup formulir diagnosis" : "Tambah diagnosis"}</Button>}>
      {canClinical(user, "DIAGNOSIS_READ") ? diagnoses.isPending || diagnoses.isError ? <QueryState query={diagnoses} /> : <>{!diagnoses.data!.data.length && <p>Belum ada diagnosis.</p>}<ul className="clinical-record-list">{diagnoses.data!.data.map(d => <li key={d.id} className="clinical-record-row"><div className="clinical-record-main"><p className="font-medium">Diagnosis · {formatDate(d.diagnosisDate)}</p><p className="text-sm text-muted-foreground">{d.anatomicalSite?.name} · {d.diagnosisType?.name}</p><p className="text-sm whitespace-pre-wrap">{d.diagnosisResult}</p><AppStatusBadge>{ref?.treatmentDispositions.find(o => o.code === d.treatmentDisposition)?.name ?? d.treatmentDisposition}</AppStatusBadge></div><div className="clinical-record-actions"><Button asChild variant="outline"><Link href={`/diagnoses/${d.id}`}>Buka diagnosis</Link></Button></div></li>)}</ul></> : <p>Izin membaca diagnosis belum tersedia.</p>}
      <div id="registration-diagnosis-form" hidden={!creating}>
      {creating && canClinical(user, "DIAGNOSIS_WRITE") && (referenceState ?? <RecordForm initial={newDiagnosis} schema={diagnosisFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError || !["OPEN", "DIAGNOSED"].includes(r.status)} create submitLabel="Simpan diagnosis" save={(values, _dirty, signal) => clinicalApi.createDiagnosis(id, diagnosisInput(values), query.data!.etag!, signal)} onSuccess={() => setCreating(false)}><DiagnosisFields references={ref!} currentFacilityId={r.facility.id} /></RecordForm>)}
      </div>
    </AppSection></div>
    {canClinical(user, "CASE_WRITE", "DIAGNOSIS_READ") && <div id="registration-confirmation" className="clinical-section" tabIndex={-1}><AppSection title="Konfirmasi kasus" description="Pilih diagnosis yang memenuhi syarat untuk melanjutkan registrasi menjadi kasus.">
    {r.status === "DIAGNOSED" && !!eligible.length && !diagnoses.isError ? <Button variant="outline" aria-expanded={confirming} aria-controls="registration-confirmation-form" onClick={() => setConfirming(!confirming)}>{confirming ? "Tutup konfirmasi kasus" : "Konfirmasi kasus"}</Button> : <p className="text-sm text-muted-foreground">Konfirmasi tersedia untuk registrasi berstatus sudah didiagnosis dengan diagnosis yang memenuhi syarat.</p>}
    <div id="registration-confirmation-form" hidden={!confirming}>
    {confirming && canClinical(user, "CASE_WRITE", "DIAGNOSIS_READ") && (referenceState ?? <RecordForm initial={newCase} schema={confirmationSchema} etag={query.data.etag} fetching={query.isFetching || diagnoses.isFetching} unavailable={query.isError || references.isError || diagnoses.isError || r.status !== "DIAGNOSED"} create submitLabel="Simpan konfirmasi kasus" save={async (values, _dirty, signal) => {
      if (!eligible.some(d => d.id === values.diagnosisId)) return undefined;
      const result = await clinicalApi.confirmCase(id, { diagnosisId: values.diagnosisId, ...caseInput(values) }, query.data!.etag!, signal);
      return result;
    }} onSuccess={result => { if (result) router.push(`/cases/${result.data.id}`); }}>
      <Field name="diagnosisId" label="Diagnosis untuk konfirmasi" options={eligible.map(d => ({ code: d.id, name: `${formatDate(d.diagnosisDate)} · ${d.anatomicalSite?.name ?? "Diagnosis"} · ${d.diagnosisResult ?? ""}` }))} />
      <CaseFields references={ref!} />
    </RecordForm>)}
    </div>
    </AppSection></div>}
  </article>;
}
