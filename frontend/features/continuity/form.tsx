"use client";
import { useEffect,useRef,type ReactNode } from "react";
import { FormProvider,useForm,type FieldValues,type DefaultValues,type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { ContinuityFeedback } from "./feedback";
import { useContinuityCommand } from "./use-command";
import type { Dirty,Context } from "./types";
export function ContinuityForm<T extends FieldValues,R>({initial,schema,children,available,submitLabel,save,onSuccess,onClose,context,confirmation=false}:{initial:T;schema:z.ZodType<T>;children:ReactNode;available:boolean;submitLabel:string;save(values:T,dirty:Dirty,signal:AbortSignal):Promise<R>;onSuccess?(result:R):void;onClose():void;context?:Context;confirmation?:boolean}){
 const command=useContinuityCommand(context),form=useForm<T>({defaultValues:initial as DefaultValues<T>,resolver:zodResolver(schema as Parameters<typeof zodResolver>[0]) as Resolver<T>}),previous=useRef(initial),region=useRef<HTMLDivElement>(null);const {reset}=form;void form.formState.dirtyFields;
 useEffect(()=>{region.current?.focus();},[]);
 useEffect(()=>{if(previous.current!==initial){previous.current=initial;reset(initial,{keepDirtyValues:true});}},[initial,reset]);
 return <div ref={region} tabIndex={-1} role={confirmation?"region":undefined} aria-label={confirmation?"Konfirmasi tindakan":undefined}><FormProvider {...form}><form autoComplete="off" noValidate className="space-y-5 rounded-xl border bg-white p-5" onSubmit={form.handleSubmit(async values=>{if(!available)return;await command.run(signal=>save(values,form.formState.dirtyFields,signal),r=>{reset(initial);onSuccess?.(r);});})}>
 <fieldset disabled={command.pending||command.locked} className="space-y-5">{children}</fieldset>
 {Object.entries(form.formState.errors).map(([k,v])=>typeof v?.message==="string"?<p key={k} role="alert" className="text-destructive">{v.message}</p>:null)}
 <ContinuityFeedback error={command.error}/>{!available&&<p role="status">Tindakan belum tersedia. Tinjau status dan data terbaru.</p>}
 {command.reviewRequired&&<div><p>Isian tetap dipertahankan. Tinjau data terbaru sebelum mengirim lagi.</p><Button type="button" variant="outline" disabled={!available} onClick={command.reviewed}>Saya sudah meninjau data terbaru</Button></div>}
 <div className="flex flex-wrap gap-3"><Button type="submit" disabled={!available||command.pending||command.locked||command.reviewRequired}>{command.pending?"Menyimpan…":submitLabel}</Button><Button type="button" variant="outline" disabled={command.pending} onClick={()=>{reset();onClose();}}>Tutup formulir</Button></div>
 </form></FormProvider></div>;
}
