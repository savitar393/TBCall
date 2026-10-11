"use client";
import { useId } from "react";
import { useFormContext } from "react-hook-form";
import { Field } from "@/features/clinical-intake/forms/fields";
import { Label } from "@/components/ui/label";
import { browserTimezone } from "../time";
import type { ResultValues } from "./values";
import { AppFormSection } from "@/components/application-patterns";
export type LineageChoice = { id: string | null; name: string };
export function ResultFields({ choices, correction = false, lineage }: { choices: LineageChoice[]; correction?: boolean; lineage?: string }) {
  const id = useId(); const form = useFormContext<ResultValues>(); const error = form.formState.errors.specimenId?.message;
  return <><AppFormSection title="Keterkaitan spesimen">{correction ? <p>Spesimen tetap: {lineage}</p> : <div className="space-y-2"><Label htmlFor={id}>Spesimen hasil</Label><select id={id} {...form.register("specimenId")} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"><option value="UNSELECTED" disabled>Pilih spesimen…</option>{choices.map(c => <option key={c.id ?? "null"} value={c.id ?? ""}>{c.name}</option>)}</select>{error && <p id={`${id}-error`} role="alert">Pilih spesimen yang tersedia.</p>}</div>}</AppFormSection>
    <AppFormSection title="Catatan pemeriksaan"><p className="text-xs text-muted-foreground">Zona waktu browser: {browserTimezone()}</p><div className="clinical-form-grid"><Field name="testedAt" label="Waktu pemeriksaan" type="datetime-local" required /><Field name="resultCode" label="Kode hasil" /><Field name="resultValue" label="Nilai hasil" /><Field name="resultText" label="Narasi hasil" multiline /></div><p className="text-xs text-muted-foreground">Isi sekurangnya satu kode, nilai atau narasi. Hasil ditampilkan sesuai catatan laboratorium.</p></AppFormSection></>;
}
