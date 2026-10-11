"use client";
import { Field } from "@/features/clinical-intake/forms/fields";
import { browserTimezone } from "../time";
import { AppFormSection } from "@/components/application-patterns";
export function SpecimenFields() {
  return <AppFormSection title="Identitas dan pengiriman spesimen"><p className="text-xs text-muted-foreground">Zona waktu browser: {browserTimezone()}</p><div className="clinical-form-grid"><Field name="specimenCode" label="Kode spesimen" /><Field name="specimenType" label="Jenis spesimen" required /><Field name="collectedAt" label="Waktu pengumpulan" type="datetime-local" /><Field name="sentAt" label="Waktu pengiriman" type="datetime-local" /><Field name="notes" label="Catatan spesimen" multiline /></div></AppFormSection>;
}
