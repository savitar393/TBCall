"use client";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
export function Confirm({ title, children, pending, blocked = false, onConfirm, onCancel }: {
    title: string;
    children: ReactNode;
    pending: boolean;
    blocked?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return <div role="dialog" aria-label={title} className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">{title}</h3>{children}<div className="flex gap-2">
    <Button disabled={pending || blocked} onClick={onConfirm}>Konfirmasi {title.toLowerCase()}</Button>
    <Button variant="outline" disabled={pending} onClick={onCancel}>Batal</Button>
    </div>
    </div>;
}
