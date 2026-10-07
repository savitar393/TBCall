"use client";
import { useFormContext } from "react-hook-form";
import type { ReferenceData } from "../types";
import { Field, CheckField, Group } from "./fields";
export function PatientFields({ references }: { references: ReferenceData }) {
  const { watch } = useFormContext(); const citizenship = watch("citizenship"); const unknown = watch("birthDateUnknown");
  return <><Group title="Identitas pasien"><Field name="fullName" label="Nama lengkap" required /><Field name="citizenship" label="Kewarganegaraan" options={references.citizenships} required />
    {citizenship === "WNA" ? <Field name="otherIdentityNumber" label="Nomor identitas lain" required /> : <Field name="nik" label="NIK" required />}
    <Field name="bpjsNumber" label="Nomor BPJS" /><Field name="birthPlace" label="Tempat lahir" /><Field name="birthDate" label="Tanggal lahir" type="date" disabled={unknown} />
    <CheckField name="birthDateUnknown" label="Tanggal lahir tidak diketahui" /><Field name="sexCode" label="Jenis kelamin" options={references.sexCodes} required />
  </Group><Group title="Kontak pasien"><Field name="phone" label="Nomor telepon" /><Field name="address" label="Alamat" multiline /></Group></>;
}
export function IdentityFields({ references }: { references: ReferenceData }) {
  const { watch } = useFormContext();
  return <Group title="Konfirmasi identitas tepat"><Field name="citizenship" label="Kewarganegaraan" options={references.citizenships} />
    {watch("citizenship") === "WNA" ? <Field name="otherIdentityNumber" label="Nomor identitas lain" /> : <Field name="nik" label="NIK" />}
    <Field name="fullName" label="Nama untuk konfirmasi" /><Field name="birthDate" label="Tanggal lahir untuk konfirmasi" type="date" /><Field name="bpjsNumber" label="BPJS untuk konfirmasi" />
  </Group>;
}
