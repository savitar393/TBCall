"use client";
import type { ReactNode } from "react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
export function Confirmation({title,onClose,children}:{title:string;onClose():void;children:ReactNode}){
 const [trigger]=useState(()=>document.activeElement instanceof HTMLElement?document.activeElement:null);
 return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/40"/><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-5" onCloseAutoFocus={e=>{e.preventDefault();trigger?.focus();}} onEscapeKeyDown={e=>e.preventDefault()} onInteractOutside={e=>e.preventDefault()}><Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title><Dialog.Description className="my-3">Tinjau konsekuensi dan konfirmasikan tindakan secara eksplisit. Formulir dapat ditutup sebelum pengiriman.</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
