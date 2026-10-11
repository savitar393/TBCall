"use client";
import { useFormContext } from "react-hook-form";
import { Field } from "@/features/clinical-intake/forms/fields";
import { browserTimezone } from "../time";
import type { ReceiveValues } from "./values";
import { AppFormSection } from "@/components/application-patterns";
export function ReceiveFields() {
  const form = useFormContext<ReceiveValues>(); const possible = form.watch("examinationPossible");
  return <AppFormSection title="Kondisi dan penerimaan"><p className="text-xs text-muted-foreground">Zona waktu browser: {browserTimezone()}</p><div className="clinical-form-grid"><Field name="receivedAt" label="Waktu penerimaan" type="datetime-local" required /><Field name="conditionOnReceipt" label="Kondisi saat diterima" /><Field name="examinationPossible" label="Dapat diperiksa" required options={[{ code: "true", name: "Ya" }, { code: "false", name: "Tidak" }]} onValueChange={value => { if (value === "true") form.setValue("rejectionReason", "", { shouldDirty: true, shouldValidate: true }); }} />{possible === "false" && <Field name="rejectionReason" label="Alasan penolakan" multiline required />}<Field name="notes" label="Catatan penerimaan" multiline /></div></AppFormSection>;
}
