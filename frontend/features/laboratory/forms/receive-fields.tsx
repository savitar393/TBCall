"use client";
import { useFormContext } from "react-hook-form";
import { Field } from "@/features/clinical-intake/forms/fields";
import { browserTimezone } from "../time";
import type { ReceiveValues } from "./values";
export function ReceiveFields() {
  const form = useFormContext<ReceiveValues>(); const possible = form.watch("examinationPossible");
  return <><h2 className="font-semibold">Penerimaan spesimen</h2><p className="text-xs">Zona waktu browser: {browserTimezone()}</p><div className="grid gap-5 sm:grid-cols-2"><Field name="receivedAt" label="Waktu penerimaan" type="datetime-local" required /><Field name="conditionOnReceipt" label="Kondisi saat diterima" /><Field name="examinationPossible" label="Dapat diperiksa" required options={[{ code: "true", name: "Ya" }, { code: "false", name: "Tidak" }]} onValueChange={value => { if (value === "true") form.setValue("rejectionReason", "", { shouldDirty: true, shouldValidate: true }); }} />{possible === "false" && <Field name="rejectionReason" label="Alasan penolakan" multiline required />}<Field name="notes" label="Catatan penerimaan" multiline /></div></>;
}
