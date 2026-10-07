"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FormProvider, useForm, useWatch, type FieldValues, type Resolver, type DefaultValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { useLabCommand } from "../use-command";
import { LabFeedback } from "./lab-feedback";
export function LabForm<T extends FieldValues, R>({ initial, schema, children, available, fetching = false, submitLabel, save, onSuccess, onConflict, confirmationField, onClose }: {
  initial: T; schema: z.ZodType<T>; children: ReactNode; available: boolean; fetching?: boolean; submitLabel: string;
  save(values: T, signal: AbortSignal): Promise<R>; onSuccess?(result: R): void; onConflict?(): Promise<unknown>; confirmationField?: Path<T>; onClose?(): void;
}) {
  const command = useLabCommand(); const form = useForm<T>({ defaultValues: initial as DefaultValues<T>, resolver: zodResolver(schema as Parameters<typeof zodResolver>[0]) as Resolver<T> });
  const previous = useRef(initial); const { reset } = form; void form.formState.dirtyFields;
  const [closing, setClosing] = useState(false);
  const confirmed = useWatch({ control: form.control, name: confirmationField ?? ("" as Path<T>) });
  useEffect(() => { if (previous.current !== initial) { previous.current = initial; reset(initial, { keepDirtyValues: true }); } }, [initial, reset]);
  return <FormProvider {...form}><form noValidate autoComplete="off" className="space-y-5 rounded-xl border bg-white p-5" onSubmit={form.handleSubmit(async values => {
    if (!available || fetching) return;
    await command.run(signal => save(values, signal), { onConflict, onSuccess: result => { reset(initial); onSuccess?.(result); } });
  })}><fieldset className="space-y-5" disabled={command.pending || command.locked}>{children}</fieldset><LabFeedback error={command.error} />
    {!available && <p role="status">Tindakan belum tersedia. Tinjau status dan data terbaru.</p>}
    {command.reviewRequired && <div className="space-y-3"><p>Isian tetap dipertahankan. Tinjau data terbaru sebelum mengirim lagi.</p><Button type="button" variant="outline" disabled={command.pending || !available || fetching} onClick={command.reviewed}>Saya sudah meninjau data terbaru</Button></div>}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={!available || fetching || command.pending || command.locked || command.reviewRequired || (confirmationField !== undefined && !confirmed)}>{command.pending ? "Menyimpan…" : submitLabel}</Button>{onClose && <Button type="button" variant="outline" disabled={command.pending} onClick={() => setClosing(true)}>Tutup formulir</Button>}</div>
    {closing && <div role="alert" className="space-y-3"><p>Menutup formulir akan membuang isian yang belum disimpan.</p><div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setClosing(false)}>Pertahankan isian</Button><Button type="button" variant="destructive" disabled={command.pending} onClick={onClose}>Buang isian dan tutup</Button></div></div>}
    </form></FormProvider>;
}
