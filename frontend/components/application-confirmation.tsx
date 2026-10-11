"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./ui/button";

export function AppConfirmation({ label, description, disabled, onConfirm }: { label: string; description: string; disabled: boolean; onConfirm(): void }) {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button variant="outline" disabled={disabled}>{label}</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/35" />
      <Dialog.Content className="app-confirmation fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-2xl border bg-white p-6 shadow-xl sm:p-8">
        <Dialog.Title className="text-xl font-semibold">Konfirmasi {label.toLowerCase()}</Dialog.Title>
        <Dialog.Description className="text-sm leading-6 text-muted-foreground">{description}</Dialog.Description>
        <div className="app-actions justify-end"><Dialog.Close asChild><Button variant="outline">Batal</Button></Dialog.Close><Button disabled={disabled} onClick={() => { setOpen(false); onConfirm(); }}>Ya, {label.toLowerCase()}</Button></div>
      </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
