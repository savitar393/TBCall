"use client";
import { useId } from "react";
import { useFormContext } from "react-hook-form";
import { Field } from "@/features/clinical-intake/forms/fields";
import { Label } from "@/components/ui/label";
import { browserTimezone } from "../time";
import type { ResultValues } from "./values";
export type LineageChoice = { id: string | null; name: string };
export function ResultFields({ choices, correction = false, lineage }: { choices: LineageChoice[]; correction?: boolean; lineage?: string }) {
  const id = useId(); const form = useFormContext<ResultValues>(); const error = form.formState.errors.specimenId?.message;
  return <><h2 className="font-semibold">{correction ? "Koreksi hasil" : "Catat hasil"}</h2>{correction ? <p>Lineage tetap: {lineage}</p> : <div className="space-y-2"><Label htmlFor={id}>Spesimen hasil</Label><select id={id} {...form.register("specimenId")} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"><option value="UNSELECTED" disabled>Pilih lineage…</option>{choices.map(c => <option key={c.id ?? "null"} value={c.id ?? ""}>{c.name}</option>)}</select>{error && <p id={`${id}-error`} role="alert">Pilih lineage yang tersedia.</p>}</div>}
    <p className="text-xs">Zona waktu browser: {browserTimezone()}</p><div className="grid gap-5 sm:grid-cols-2"><Field name="testedAt" label="Waktu pemeriksaan" type="datetime-local" required /><Field name="resultCode" label="Kode hasil" /><Field name="resultValue" label="Nilai hasil" /><Field name="resultText" label="Narasi hasil" multiline /></div><p className="text-xs text-muted-foreground">Isi sekurangnya satu kode, nilai atau narasi. Hasil ditampilkan sesuai catatan laboratorium.</p></>;
}
