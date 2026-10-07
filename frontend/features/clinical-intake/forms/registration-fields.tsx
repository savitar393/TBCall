import type { ReferenceData } from "../types";
import { Field, Group } from "./fields";
export function RegistrationFields({ references }: { references: ReferenceData }) {
  return <><Group title="Data registrasi"><Field name="registrationDate" label="Tanggal registrasi" type="date" required />
    <Field name="facilityRegistrationNumber" label="Nomor registrasi fasilitas" /><Field name="medicalRecordNumber" label="Nomor rekam medis" /><Field name="specimenIdentityNumber" label="Identitas spesimen" />
    <Field name="suspectTypeCode" label="Jenis terduga" options={references.suspectTypes} required /><Field name="previousTreatmentCategoryCode" label="Kategori pengobatan sebelumnya" options={references.previousTreatmentCategories} required />
    <Field name="initialWeightKg" label="Berat awal (kg)" type="text" /><Field name="hivStatusCode" label="Status HIV" options={references.hivStatuses} /><Field name="dmStatusCode" label="Status DM" options={references.dmStatuses} />
  </Group><Group title="Informasi asal rujukan"><Field name="referredByType" label="Jenis pemberi rujukan" /><Field name="referredByReference" label="Referensi pemberi rujukan" /><Field name="referralNotes" label="Catatan rujukan" multiline /></Group></>;
}
