"use client";
import { useId } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label as FormLabel } from "@/components/ui/label";
import type { Label } from "../types";
const controlClass = "min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-60";
export function Field({ name, label, type = "text", options, multiline = false, disabled = false, required = false, hint, onValueChange }: { name: string; label: string; type?: string; options?: Label[]; multiline?: boolean; disabled?: boolean; required?: boolean; hint?: string; onValueChange?(value: string): void }) {
  const id = useId(); const form = useFormContext();
  const message = form.formState.errors[name]?.message;
  const props = { id, disabled, "aria-invalid": !!message, "aria-describedby": message ? `${id}-error` : hint ? `${id}-hint` : undefined, ...form.register(name) };
  return <div className="space-y-2"><FormLabel htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</FormLabel>
    {options ? <select {...props} onChange={event => { void props.onChange(event); onValueChange?.(event.target.value); }} className={controlClass}><option value="">{required ? "Pilih…" : "Belum diisi / hapus"}</option>{options.map(option => <option key={option.code} value={option.code}>{option.name ?? option.code}</option>)}</select>
      : multiline ? <textarea {...props} rows={3} className={controlClass} autoComplete="off" />
      : <Input {...props} type={type} inputMode={name === "nik" ? "numeric" : type === "decimal" ? "decimal" : undefined} autoComplete="off" />}
    {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    {typeof message === "string" && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{message}</p>}
  </div>;
}
export function CheckField({ name, label }: { name: string; label: string }) {
  const id = useId(); const { register } = useFormContext();
  return <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm"><input id={id} type="checkbox" {...register(name)} className="size-5" />{label}</label>;
}
export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="space-y-5 rounded-xl border bg-white p-5"><legend className="px-2 font-semibold">{title}</legend><div className="grid gap-5 sm:grid-cols-2">{children}</div></fieldset>;
}
