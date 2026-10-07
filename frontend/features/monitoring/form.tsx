"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FormProvider, useForm, type FieldValues, type DefaultValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { MonitoringFeedback } from "./feedback";
import { useMonitoringCommand, type RefreshScope } from "./use-command";
import type { Dirty } from "./types";
export function MonitoringForm<T extends FieldValues, R>({
  initial,
  schema,
  children,
  available,
  submitLabel,
  save,
  onSuccess,
  onClose,
  onReview,
  scope
}: {
  initial: T;
  schema: z.ZodType<T>;
  children: ReactNode;
  available: boolean;
  submitLabel: string;
  save(values: T, dirty: Dirty, signal: AbortSignal): Promise<R>;
  onSuccess?(result: R): void;
  onClose(): void;
  onReview?(): void;
  scope?: RefreshScope;
}) {
  const command = useMonitoringCommand(scope);
  const form = useForm<T>({
    defaultValues: initial as DefaultValues<T>,
    resolver: zodResolver(schema as Parameters<typeof zodResolver>[0]) as Resolver<T>
  });
  const region = useRef<HTMLDivElement>(null);
  const previous = useRef(initial);
  void form.formState.dirtyFields;
  const {
    reset
  } = form;
  useEffect(() => {
    if (previous.current !== initial) {
      previous.current = initial;
      reset(initial, {
        keepDirtyValues: true
      });
    }
  }, [initial, reset]);
  useEffect(() => {
    region.current?.focus();
  }, []);
  return <div ref={region} tabIndex={-1}>
  <FormProvider {...form}>
    <form autoComplete="off" noValidate className="space-y-5 rounded-xl border bg-white p-5" onSubmit={form.handleSubmit(async values => {
        if (available) await command.run(signal => save(values, form.formState.dirtyFields, signal), onSuccess);
      })}>
      <fieldset disabled={command.pending || command.locked} className="space-y-5">{children}</fieldset>
      {Object.entries(form.formState.errors).map(([k, v]) => typeof v?.message === "string" ? <p key={k} role="alert" className="text-destructive">{v.message}</p> : null)}
      <MonitoringFeedback error={command.error} />
      {!available && <p role="status">Tindakan belum tersedia. Muat ulang dan tinjau data terbaru.</p>}
      {command.reviewRequired && <div>
        <p>Isian tetap dipertahankan. Tinjau data terbaru sebelum mengirim lagi.</p>
        <Button type="button" variant="outline" disabled={!available} onClick={() => {
            onReview?.();
            command.reviewed();
          }}>Saya sudah meninjau data terbaru</Button>
      </div>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!available || command.pending || command.locked || command.reviewRequired}>{command.pending ? "Menyimpan…" : submitLabel}</Button>
        <Button type="button" variant="outline" disabled={command.pending} onClick={onClose}>Tutup formulir</Button>
      </div>
    </form>
  </FormProvider>
</div>;
}
