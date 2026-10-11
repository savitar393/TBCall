"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { clinicalQueries } from "@/features/clinical-intake/queries";
import { canClinical } from "@/features/clinical-intake/permissions";
import { DeduplicatedQueryState as QueryState } from "@/features/clinical-intake/components/query-state";
import { labQueries } from "../queries";
import { labApi } from "../api";
import { canLabRead, canLabSource } from "../permissions";
import type { OwnerType } from "../types";
import { requestFormSchema, requestValues } from "../forms/values";
import { createInput } from "../forms/mappers";
import { RequestFields } from "../forms/request-fields";
import { LabForm } from "./lab-form";
import { TestingFacility } from "./testing-facility";
import { QueueLink } from "./request-display";
import { AppPageHeader, AppFormSection } from "@/components/application-patterns";
export function RequestCreate({ ownerType, id }: { ownerType: OwnerType; id: string }) {
  const { user } = useSession(); const router = useRouter(); const mayRead = canClinical(user, ownerType === "REGISTRATION" ? "REGISTRATION_READ" : "CASE_READ");
  const registration = useQuery({ ...clinicalQueries.registration(user!.id, id), enabled: mayRead && ownerType === "REGISTRATION" });
  const tbCase = useQuery({ ...clinicalQueries.tbCase(user!.id, id), enabled: mayRead && ownerType === "CASE" });
  const references = useQuery({ ...labQueries.references(user!.id), enabled: canLabRead(user) });
  const initial = useMemo(() => requestValues(), []);
  if (!mayRead) return <p role="alert">Izin membaca pemilik diperlukan untuk membuat permintaan.</p>;
  if (!canLabRead(user)) return <p role="alert">Izin membaca laboratorium diperlukan untuk katalog pemeriksaan.</p>;
  const ownerQuery = ownerType === "REGISTRATION" ? registration : tbCase;
  const facility = ownerType === "REGISTRATION" ? registration.data?.data.facility : tbCase.data?.data.currentFacility;
  if (!facility || !references.data) return <QueryState query={!facility ? ownerQuery : references} />;
  const eligible = ownerType === "REGISTRATION" ? ["OPEN", "DIAGNOSED"].includes(registration.data!.data.status) : tbCase.data!.data.status === "ACTIVE";
  const reasonCode = ownerType === "REGISTRATION" ? "DIAGNOSIS" : "FOLLOW_UP"; const reason = references.data.data.requestReasons.find(r => r.code === reasonCode);
  return <div className="clinical-workspace"><AppPageHeader title="Permintaan laboratorium baru" eyebrow="Pemeriksaan" description="Pilih fasilitas pemeriksa dan pemeriksaan yang diminta." /><QueueLink /><section className="clinical-context" aria-label="Konteks permintaan baru"><div className="clinical-context-heading"><h2>{ownerQuery.data?.data.patient.fullName}</h2></div><p className="text-sm">Fasilitas peminta: {facility.name}</p>{reason ? <p className="text-sm">{reason.name}</p> : <p role="alert">Alasan permintaan aktif belum tersedia.</p>}</section>
    {!eligible && <p role="alert">Pemilik tidak tersedia untuk permintaan laboratorium pada status ini.</p>}{ownerQuery.isError && <QueryState query={ownerQuery} />}{references.isError && <QueryState query={references} />}
    <LabForm initial={initial} schema={requestFormSchema} available={!!reason && eligible && canLabSource(user, facility.id) && !ownerQuery.isError && !references.isError} fetching={ownerQuery.isFetching || references.isFetching} submitLabel="Simpan permintaan" save={async (v, signal) => {
      if (!v.testTypeCodes.every(code => references.data!.data.testTypes.some(t => t.code === code))) throw new Error("Pilihan pemeriksaan telah berubah.");
      return labApi.create(createInput(v, ownerType, id), signal);
    }} onConflict={() => ownerQuery.refetch()} onSuccess={result => router.push(`/laboratory/requests/${result.data.id}`)}><AppFormSection title="Fasilitas pemeriksa"><TestingFacility owner={facility} /></AppFormSection><RequestFields references={references.data.data} /></LabForm>
  </div>;
}
