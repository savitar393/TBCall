import { useFormContext } from "react-hook-form";
import { Field } from "@/features/clinical-intake/forms/fields";
import type { ReferenceData } from "../types";
import type { RequestValues } from "./values";
export function RequestFields({ references }: { references: ReferenceData }) {
  const form = useFormContext<RequestValues>(); const error = form.formState.errors.testTypeCodes?.message;
  return <><fieldset className="space-y-3"><legend className="text-sm font-medium">Jenis pemeriksaan (1–10 berbeda)</legend>{references.testTypes.map(t => <label key={t.code} className="flex min-h-11 items-center gap-3"><input type="checkbox" value={t.code} {...form.register("testTypeCodes")} />{t.name}</label>)}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</fieldset><Field name="sampleShippingMethod" label="Cara pengiriman sampel" /><Field name="courierName" label="Nama kurir" /><Field name="notes" label="Catatan permintaan" multiline /></>;
}
