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
import { canTreatment } from "@/features/treatment/permissions";
import { canContinuity } from "@/features/continuity/permissions";
import { caseFormSchema, caseValues } from "../forms/values";
import { casePatch } from "../forms/mappers";
import { CaseFields } from "../forms/case-fields";
import { RecordForm } from "./record-form";
import { DisplayFields, WorklistLink, registrationStatusLabel } from "./record-display";
import { DeduplicatedQueryState as QueryState } from "./query-state";
import { CaseSupporterSection } from "@/features/account-linking/supporter-section";
import { canLink } from "@/features/account-linking/permissions";
import { formatDate } from "@/lib/date-format";
export function CaseDetail({ id }: { id: string }) {
  const { user } = useSession(); const [editing, setEditing] = useState(false);
  const query = useQuery(clinicalQueries.tbCase(user!.id, id));
  const references = useQuery({ ...clinicalQueries.references(user!.id), enabled: canClinical(user, "PATIENT_READ") });
  const initial = useMemo(() => caseValues(query.data?.data), [query.data?.data]);
  if (!query.data) return <QueryState query={query} />;
  const c = query.data.data; const ref = references.data?.data; const editable = c.status === "ACTIVE" || c.status === "REFERRED";
  const statusLabel = ref?.caseStatusFilters.find(o => o.code === c.status)?.name ?? (c.status === "COMPLETED" ? "Selesai" : c.status);
  const label = (group: "caseCategories" | "drugResistancePatterns" | "pregnancyStatuses" | "bcgStatuses" | "previousTreatmentCategories" | "hivStatuses" | "dmStatuses", code: string | null) => ref?.[group].find(o => o.code === code)?.name ?? code;
  return <article className="clinical-workspace">
    <AppPageHeader title="Detail kasus" eyebrow="Ruang kerja kasus" actions={<WorklistLink />} />
    {references.isError && references.data && <QueryState query={references} />}
    <section aria-label="Konteks kasus" className="clinical-context">
      <div className="clinical-context-heading"><div><p className="eyebrow">Pasien</p><h2 className="section-title">{c.status !== "COMPLETED" && canClinical(user, "PATIENT_READ") ? <Link className="text-primary underline" href={`/patients/${c.patient.patientId}`}>{c.patient.fullName}</Link> : c.patient.fullName}</h2><p className="mt-2 text-sm text-muted-foreground">{label("caseCategories", c.caseCategoryCode) ?? "Kategori kasus belum diisi"} · {c.currentFacility.name}</p></div><AppStatusBadge tone={c.status === "ACTIVE" ? "active" : c.status === "REFERRED" ? "warning" : c.status === "COMPLETED" ? "complete" : "neutral"}>{statusLabel}</AppStatusBadge></div>
      {c.status === "COMPLETED" && <div className="space-y-2"><p role="status" className="text-sm">Kasus selesai. Data kasus dan pengobatan tersedia untuk dibaca sebagai riwayat.</p><Link className="text-sm text-primary underline" href="/cases/history">Kembali ke riwayat kasus selesai</Link></div>}
      <div className="app-actions">
        {editable && canClinical(user, "CASE_WRITE") && <Button variant="outline" aria-expanded={editing} aria-controls="case-editor" onClick={() => setEditing(!editing)}>{editing ? "Tutup editor kasus" : "Ubah kasus"}</Button>}
        {editable && canContinuity(user,"REFERRAL_WRITE") && <Button asChild variant="outline"><Link href={`/cases/${id}/referrals/new`}>Buat rujukan</Link></Button>}
        {canClinical(user, "LAB_REQUEST_WRITE") && c.status === "ACTIVE" && <Button asChild variant="outline"><Link href={`/laboratory/requests/new/case/${id}`}>Buat permintaan laboratorium</Link></Button>}
      </div>
    </section>
    <AppViewLinks label="Navigasi kasus" items={[{ label: "Detail kasus", href: `/cases/${id}`, current: true }, { label: "Ringkasan kasus", href: `/cases/${id}/summary`, current: false }, ...(canTreatment(user) ? [{ label: "Pengobatan", href: `/cases/${id}/treatments`, current: false }] : []), ...(canContinuity(user, "CONTACT_READ") ? [{ label: "Kontak", href: `/cases/${id}/contacts`, current: false }] : [])]} />
    <AppViewLinks label="Bagian detail kasus" items={[{ label: "Data kasus", href: "#case-data", current: false }, { label: "Registrasi dan diagnosis konfirmasi", href: "#case-origin", current: false }, ...(canLink(user, "SUPPORTER_LINK_MANAGE") ? [{ label: "Pendamping kasus", href: "#case-supporters", current: false }] : [])]} />
    <div id="case-data" className="clinical-section" tabIndex={-1}><AppSection title="Data kasus" description="Klasifikasi dan kondisi klinis yang tercatat pada kasus ini.">
      <div className="clinical-data-grid"><DisplayFields values={[["Kategori kasus", label("caseCategories", c.caseCategoryCode)], ["Pola resistansi obat", label("drugResistancePatterns", c.drugResistancePatternCode)], ["Pengobatan sebelumnya", label("previousTreatmentCategories", c.previousTreatmentCategoryCode)], ["Kehamilan", label("pregnancyStatuses", c.pregnancyStatusCode)], ["Tinggi (cm)", c.heightCm], ["Berat (kg)", c.weightKg], ["BCG", label("bcgStatuses", c.bcgStatusCode)], ["HIV", label("hivStatuses", c.hivStatusCode)], ["DM", label("dmStatuses", c.dmStatusCode)]]} /></div>
      <AppDisclosure title="Pencatatan dan penanggung jawab"><div className="clinical-data-grid"><DisplayFields values={[["Status", statusLabel], ["Fasilitas saat ini", c.currentFacility.name], ["Tenaga kesehatan", c.healthWorker], ["ICD-10", c.icd10Code], ["Dikonfirmasi pada", c.confirmedAt]]} /></div></AppDisclosure>
    </AppSection></div>
    <div id="case-origin" className="clinical-section" tabIndex={-1}><AppSection title="Registrasi dan diagnosis konfirmasi" description="Rekam yang menjadi dasar konfirmasi kasus."><ul className="clinical-record-list"><li className="clinical-record-row"><div className="clinical-record-main"><p className="font-medium">Registrasi · {formatDate(c.registration.registrationDate)}</p><p className="text-sm text-muted-foreground">{c.registration.facility.name}</p><AppStatusBadge>{registrationStatusLabel(c.registration.status, ref?.registrationStatusFilters)}</AppStatusBadge></div>{canClinical(user, "REGISTRATION_READ") && <div className="clinical-record-actions"><Button asChild variant="outline"><Link href={`/registrations/${c.registration.id}`}>Buka registrasi</Link></Button></div>}</li>{c.confirmingDiagnosis && <li className="clinical-record-row"><div className="clinical-record-main"><p className="font-medium">Diagnosis · {formatDate(c.confirmingDiagnosis.diagnosisDate)}</p><p className="text-sm text-muted-foreground">{c.confirmingDiagnosis.anatomicalSite?.name} · {c.confirmingDiagnosis.diagnosisType?.name}</p></div>{canClinical(user, "DIAGNOSIS_READ") && <div className="clinical-record-actions"><Button asChild variant="outline"><Link href={`/diagnoses/${c.confirmingDiagnosis.id}`}>Buka diagnosis</Link></Button></div>}</li>}</ul></AppSection></div>
    <div id="case-editor" hidden={!editing}>
    {editable && editing && canClinical(user, "CASE_WRITE") && (!canClinical(user, "PATIENT_READ") ? <p>Izin membaca referensi klinis diperlukan untuk mengedit.</p> : !references.data ? <QueryState query={references} /> : <RecordForm initial={initial} schema={caseFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError} save={(values, dirty, signal) => clinicalApi.patchCase(id, casePatch(values, dirty), query.data!.etag!, signal)}><CaseFields references={ref!} /></RecordForm>)}
    </div>
    {canLink(user, "SUPPORTER_LINK_MANAGE") && <div id="case-supporters" className="clinical-section" tabIndex={-1}><CaseSupporterSection caseId={id} caseStatus={c.status} /></div>}
  </article>;
}
