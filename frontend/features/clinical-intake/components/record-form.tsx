"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { FormProvider, useForm, type FieldValues, type Resolver, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { useClinicalCommand } from "../use-command";
import { ClinicalFeedback } from "./clinical-feedback";

// Shared form lifecycle only; domain fields and request mapping remain explicit.
export function RecordForm<T extends FieldValues, R>({ initial, schema, etag, fetching, children, save, submitLabel = "Simpan perubahan", onSuccess, create = false, unavailable = false }: {
  initial: T; schema: z.ZodType<T>; etag?: string; fetching: boolean; children: ReactNode; submitLabel?: string; create?: boolean; unavailable?: boolean;
  save(values: T, dirty: Partial<Record<keyof T, boolean>>, signal: AbortSignal): Promise<R>; onSuccess?(result: R): void;
}) {
  const command = useClinicalCommand();
  const form = useForm<T>({ resolver: zodResolver(schema as Parameters<typeof zodResolver>[0]) as Resolver<T>, defaultValues: initial as DefaultValues<T> });
  const previous = useRef(initial);
  const { dirtyFields, isDirty } = form.formState; // Subscribe so keepDirtyValues retains edited controls.
  const { reset } = form;
  useEffect(() => { if (previous.current !== initial) { previous.current = initial; reset(initial, { keepDirtyValues: true }); } }, [initial, reset]);
  return <FormProvider {...form}><form noValidate autoComplete="off" className="space-y-5" onSubmit={form.handleSubmit(async values => {
    if (!etag || fetching || unavailable || (!create && !isDirty)) return;
    const result = await command.run(signal => save(values, dirtyFields as Partial<Record<keyof T, boolean>>, signal));
    if (result !== undefined) { reset(values); onSuccess?.(result); }
  })}>
    <fieldset disabled={command.pending || command.locked} className="space-y-5">{children}</fieldset>
    <ClinicalFeedback error={command.error} />
    {!etag && <p role="alert">Versi server belum tersedia. Muat ulang sebelum menyimpan.</p>}
    {command.reviewRequired && <div className="space-y-3 rounded-xl border bg-white p-4"><p>Isian yang belum disimpan tetap dipertahankan. Tinjau tampilan terbaru sebelum mengirim lagi.</p><Button variant="outline" type="button" disabled={fetching || unavailable || !etag} onClick={command.reviewed}>Saya sudah meninjau data terbaru</Button></div>}
    <Button type="submit" disabled={command.pending || command.locked || command.reviewRequired || fetching || unavailable || !etag || (!create && !isDirty)}>{command.pending ? "Menyimpan…" : submitLabel}</Button>
  </form></FormProvider>;
}
