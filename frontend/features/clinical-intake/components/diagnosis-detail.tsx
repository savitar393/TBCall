"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { clinicalApi } from "../api";
import { clinicalQueries } from "../queries";
import { canClinical } from "../permissions";
import { diagnosisFormSchema, diagnosisValues } from "../forms/values";
import { diagnosisPatch } from "../forms/mappers";
import { DiagnosisFields } from "../forms/diagnosis-fields";
import { RecordForm } from "./record-form";
import { DisplayFields, WorklistLink } from "./record-display";
import { QueryState } from "./query-state";
export function DiagnosisDetail({ id }: { id: string }) {
  const { user } = useSession(); const [editing, setEditing] = useState(false);
  const query = useQuery(clinicalQueries.diagnosis(user!.id, id));
  const references = useQuery({ ...clinicalQueries.references(user!.id), enabled: canClinical(user, "PATIENT_READ") });
  const registration = useQuery({ ...clinicalQueries.registration(user!.id, query.data?.data.registrationId ?? ""), enabled: !!query.data && canClinical(user, "REGISTRATION_READ") });
  const initial = useMemo(() => diagnosisValues(query.data?.data), [query.data?.data]);
  if (!query.data) return <QueryState query={query} />;
  const d = query.data.data;
  return <>{references.isError && references.data && <QueryState query={references} />}<h1 className="text-2xl font-semibold">Detail diagnosis</h1><WorklistLink />
    {canClinical(user, "REGISTRATION_READ") && <Link className="inline-block text-sm text-primary underline" href={`/registrations/${d.registrationId}`}>Buka registrasi</Link>}
    <DisplayFields values={[["Tanggal diagnosis", d.diagnosisDate], ["Lokasi anatomi", d.anatomicalSite?.name ?? d.anatomicalSite?.code], ["Jenis diagnosis", d.diagnosisType?.name ?? d.diagnosisType?.code], ["Hasil diagnosis", d.diagnosisResult], ["Hasil foto toraks", d.chestXrayResult], ["Tanggal foto toraks", d.chestXrayDate], ["Nomor foto toraks", d.chestXraySerial], ["Kesan foto toraks", d.chestXrayImpression], ["ICD-10", d.icd10Code], ["Disposisi pengobatan", references.data?.data.treatmentDispositions.find(o => o.code === d.treatmentDisposition)?.name ?? d.treatmentDisposition], ["Fasyankes tujuan", d.referredToFacility?.name], ["Catatan diagnosis", d.notes]]} />
    {canClinical(user, "DIAGNOSIS_WRITE") && <Button variant="outline" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? "Tutup editor diagnosis" : "Ubah diagnosis"}</Button>}
    {editing && canClinical(user, "DIAGNOSIS_WRITE") && (!canClinical(user, "PATIENT_READ") ? <p>Izin membaca referensi klinis diperlukan untuk mengedit.</p> : !references.data ? <QueryState query={references} /> : <RecordForm initial={initial} schema={diagnosisFormSchema} etag={query.data.etag} fetching={query.isFetching} unavailable={query.isError || references.isError} save={(values, dirty, signal) => clinicalApi.patchDiagnosis(id, diagnosisPatch(values, dirty), query.data!.etag!, signal)}><DiagnosisFields references={references.data!.data} currentFacilityId={registration.isError ? undefined : registration.data?.data.facility.id} initialDestination={d.referredToFacility} /></RecordForm>)}
  </>;
}
