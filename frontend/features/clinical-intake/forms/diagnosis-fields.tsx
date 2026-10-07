"use client";
import { useFormContext } from "react-hook-form";
import type { ReferenceData } from "../types";
import { Field, Group } from "./fields";
import { FacilitySearch } from "../components/facility-search";
export function DiagnosisFields({ references, currentFacilityId, initialDestination }: { references: ReferenceData; currentFacilityId?: string; initialDestination?: { id: string; name: string } | null }) {
  const form = useFormContext();
  return <><Group title="Diagnosis"><Field name="diagnosisDate" label="Tanggal diagnosis" type="date" required /><Field name="anatomicalSiteCode" label="Lokasi anatomi" options={references.anatomicalSites} required /><Field name="diagnosisTypeCode" label="Jenis diagnosis" options={references.diagnosisTypes} required /><Field name="diagnosisResult" label="Hasil diagnosis" required /><Field name="icd10Code" label="Kode ICD-10" /><Field name="treatmentDisposition" label="Disposisi pengobatan" options={references.treatmentDispositions} required onValueChange={value => { if (value !== "REFERRED") form.setValue("referredToFacilityId", "", { shouldDirty: true }); }} />
    {form.watch("treatmentDisposition") === "REFERRED" && <FacilitySearch currentFacilityId={currentFacilityId} initialDestination={initialDestination} />}
  </Group><Group title="Foto toraks dan catatan"><Field name="chestXrayResult" label="Hasil foto toraks" /><Field name="chestXrayDate" label="Tanggal foto toraks" type="date" /><Field name="chestXraySerial" label="Nomor foto toraks" /><Field name="chestXrayImpression" label="Kesan foto toraks" multiline /><Field name="notes" label="Catatan diagnosis" multiline /></Group></>;
}
