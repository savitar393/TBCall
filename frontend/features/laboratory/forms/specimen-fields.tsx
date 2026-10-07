"use client";
import { Field } from "@/features/clinical-intake/forms/fields";
import { browserTimezone } from "../time";
export function SpecimenFields() {
  return <><h2 className="font-semibold">Catat spesimen</h2><p className="text-xs">Zona waktu browser: {browserTimezone()}</p><div className="grid gap-5 sm:grid-cols-2"><Field name="specimenCode" label="Kode spesimen" /><Field name="specimenType" label="Jenis spesimen" required /><Field name="collectedAt" label="Waktu pengumpulan" type="datetime-local" /><Field name="sentAt" label="Waktu pengiriman" type="datetime-local" /><Field name="notes" label="Catatan spesimen" multiline /></div></>;
}
