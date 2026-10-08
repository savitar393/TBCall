"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
export function ConfirmAction({ label, description, disabled, onConfirm }: {
    label: string;
    description: string;
    disabled: boolean;
    onConfirm: () => void;
}) {
    const [open, setOpen] = useState(false);
    return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild>
    <Button variant="outline" disabled={disabled}>{label}</Button>
    </Dialog.Trigger>
    <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40"/>
    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-xl bg-white p-6">
    <Dialog.Title className="text-lg font-semibold">Konfirmasi {label.toLowerCase()}</Dialog.Title>
    <Dialog.Description>{description}</Dialog.Description>
    <div className="flex flex-wrap gap-3">
    <Dialog.Close asChild>
    <Button variant="outline">Batal</Button>
    </Dialog.Close>
    <Button disabled={disabled} onClick={() => { setOpen(false); onConfirm(); }}>Ya, {label.toLowerCase()}</Button>
    </div>
    </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>;
}
