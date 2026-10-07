"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { Field } from "@/features/continuity/fields";
import { Button } from "@/components/ui/button";
import { emptyEvent } from "./forms";
export const manualGuidance = "TBCall tidak membuat jadwal pemantauan otomatis. Tambahkan setiap kegiatan dan waktunya berdasarkan rencana yang telah ditetapkan petugas.";
export function EventFields({
  types,
  prefix = "",
  number
}: {
  types: {
    code: string;
    name: string;
  }[];
  prefix?: string;
  number?: number;
}) {
  return <>
  <Field name={`${prefix}eventType`} label={`Jenis kegiatan${number ? ` ${number}` : ""}`} options={types} required />
  <Field name={`${prefix}scheduledAt`} label={`Jadwal kegiatan${number ? ` ${number}` : ""}`} type="datetime-local" required />
  <Field name={`${prefix}dueAt`} label={`Batas waktu kegiatan${number ? ` ${number}` : ""}`} type="datetime-local" />
</>;
}
export function InitialEvents({
  types
}: {
  types: {
    code: string;
    name: string;
  }[];
}) {
  const {
    control
  } = useFormContext();
  const rows = useFieldArray({
    control,
    name: "events"
  });
  return <section className="space-y-4" aria-label="Kegiatan manual">
  <p>{manualGuidance}</p>
  <p>Isi 1–100 kegiatan secara eksplisit.</p>
  {rows.fields.map((row, i) => <fieldset key={row.id} className="space-y-4 rounded-lg border p-4">
    <legend> Kegiatan nomor {i + 1}</legend>
    <EventFields types={types} prefix={`events.${i}.`} number={i + 1} />
    <Button type="button" variant="outline" disabled={rows.fields.length === 1} onClick={() => rows.remove(i)} aria-label={`Hapus kegiatan ${i + 1}`}> Hapus kegiatan {i + 1}</Button>
  </fieldset>)}
  <Button type="button" disabled={rows.fields.length >= 100} onClick={() => rows.append(emptyEvent())}>Tambah kegiatan manual</Button>
</section>;
}
