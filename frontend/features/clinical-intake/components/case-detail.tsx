"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { clinicalApi } from "../api";
import { clinicalQueries } from "../queries";
import { canClinical } from "../permissions";
import { caseFormSchema, caseValues } from "../forms/values";
import { casePatch } from "../forms/mappers";
import { CaseFields } from "../forms/case-fields";
import { RecordForm } from "./record-form";
import { DisplayFields, PatientHeading, WorklistLink } from "./record-display";
import { QueryState } from "./query-state";
export function CaseDetail({ id }: { id: string }) {
  const { user } = useSession(); const [editing, setEditing] = useState(false);
  const query = useQuery(clinicalQueries.tbCase(user!.id, id));
  const references = useQuery({ ...clinicalQueries.references(user!.id), enabled: canClinical(user, "PATIENT_READ") });
  const initial = useMemo(() => caseValues(query.data?.data), [query.data?.data]);
  if (!query.data) return <QueryState query={query} />;
  const c = query.data.data; const ref = references.data?.data;
  const label = (group: "caseCategories" | "drugResistancePatterns" | "pregnancyStatuses" | "bcgStatuses" | "previousTreatmentCategories" | "hivStatuses" | "dmStatuses", code: string | null) => ref?.[group].find(o => o.code === code)?.name ?? code;
  return <>{references.isError && references.data && <QueryState query={references} />}<h1 className="text-2xl font-semibold">Detail kasus</h1><WorklistLink /><PatientHeading patientId={c.patient.patientId} name={c.patient.fullName} />
    <DisplayFields values={[["Status", ref?.caseStatusFilters.find(o => o.code === c.status)?.name ?? c.status], ["Fasilitas saat ini", c.currentFacility.name], ["Kategori kasus", label("caseCategories", c.caseCategoryCode)], ["Pola resistansi obat", label("drugResistancePatterns", c.drugResistancePatternCode)], ["Tenaga kesehatan", c.healthWorker], ["Kehamilan", label("pregnancyStatuses", c.pregnancyStatusCode)], ["Tinggi (cm)", c.heightCm], ["Berat (kg)", c.weightKg], ["BCG", label("bcgStatuses", c.bcgStatusCode)], ["Pengobatan sebelumnya", label("previousTreatmentCategories", c.previousTreatmentCategoryCode)], ["HIV", label("hivStatuses", c.hivStatusCode)], ["DM", label("dmStatuses", c.dmStatusCode)], ["ICD-10", c.icd10Code], ["Dikonfirmasi pada", c.confirmedAt]]} />
    <section className="space-y-2 rounded-xl border bg-white p-5"><h2 className="font-semibold">Registrasi dan diagnosis konfirmasi</h2><p className="text-sm">{c.registration.registrationDate} · {c.registration.facility.name} · {c.registration.status}</p>{canClinical(user, "REGISTRATION_READ") && <Link className="text-sm text-primary underline" href={`/registrations/${c.registration.id}`}>Buka registrasi</Link>}{c.confirmingDiagnosis && <><p className="text-sm">{c.confirmingDiagnosis.diagnosisDate} · {c.confirmingDiagnosis.anatomicalSite?.name} · {c.confirmingDiagnosis.diagnosisType?.name}</p>{canClinical(user, "DIAGNOSIS_READ") && <Link className="inline-block text-sm text-primary underline" href={`/diagnoses/${c.confirmingDiagnosis.id}`}>Buka diagnosis</Link>}</>}</section>
    {canClinical(user, "CASE_WRITE") && <Button variant="outline" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? "Tutup editor kasus" : "Ubah kasus"}</Button>}
    {editing && canClinical(user, "CASE_WRITE") && (!canClinical(user, "PATIENT_READ") ? <p>Izin membaca referensi klinis diperlukan untuk mengedit.</p> : !references.data ? <QueryState query={references} /> : <RecordForm initial={initial} schema={caseFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError} save={(values, dirty, signal) => clinicalApi.patchCase(id, casePatch(values, dirty), query.data!.etag!, signal)}><CaseFields references={ref!} /></RecordForm>)}
  </>;
}
