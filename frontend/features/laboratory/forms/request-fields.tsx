import { useFormContext } from "react-hook-form";
import { Field } from "@/features/clinical-intake/forms/fields";
import type { ReferenceData } from "../types";
import type { RequestValues } from "./values";
import { AppFormSection } from "@/components/application-patterns";
export function RequestFields({ references }: { references: ReferenceData }) {
  const form = useFormContext<RequestValues>(); const error = form.formState.errors.testTypeCodes?.message;
  return <><AppFormSection title="Jenis pemeriksaan (1–10 berbeda)"><div className="clinical-form-grid">{references.testTypes.map(t => <label key={t.code} className="flex min-h-11 items-center gap-3 rounded-lg border px-3"><input type="checkbox" value={t.code} {...form.register("testTypeCodes")} />{t.name}</label>)}</div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</AppFormSection><AppFormSection title="Pengiriman dan catatan"><div className="clinical-form-grid"><Field name="sampleShippingMethod" label="Cara pengiriman sampel" /><Field name="courierName" label="Nama kurir" /><Field name="notes" label="Catatan permintaan" multiline /></div></AppFormSection></>;
}
