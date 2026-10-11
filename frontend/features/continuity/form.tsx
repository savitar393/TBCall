"use client";
import { useEffect,useRef,useState,type ReactNode } from "react";
import { FormProvider,useForm,type FieldValues,type DefaultValues,type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { ContinuityFeedback } from "./feedback";
import { useContinuityCommand } from "./use-command";
import type { Dirty,Context } from "./types";
// Field components announce their own errors. Keep messages for checkboxes,
// hidden fields, form-wide validation, and array/root errors in this summary.
function remainingErrors(errors:unknown,inline:Set<string>,path=""): [string,string][] {
 if(!errors||typeof errors!=="object")return [];
 const error=errors as Record<string,unknown>;
 const own: [string,string][] = typeof error.message==="string"&&!inline.has(path)?[[path,error.message]]:[];
 return [...own,...Object.entries(error).filter(([key])=>!["message","type","types","ref"].includes(key)).flatMap(([key,value])=>remainingErrors(value,inline,path?`${path}.${key}`:key))];
}
export function ContinuityForm<T extends FieldValues,R>({initial,schema,children,available,submitLabel,title,save,onSuccess,onClose,context,confirmation=false}:{initial:T;schema:z.ZodType<T>;children:ReactNode;available:boolean;submitLabel:string;title?:string;save(values:T,dirty:Dirty,signal:AbortSignal):Promise<R>;onSuccess?(result:R):void;onClose():void;context?:Context;confirmation?:boolean}){
 const command=useContinuityCommand(context),form=useForm<T>({defaultValues:initial as DefaultValues<T>,resolver:zodResolver(schema as Parameters<typeof zodResolver>[0]) as Resolver<T>}),previous=useRef(initial),region=useRef<HTMLDivElement>(null),[inline,setInline]=useState<Set<string>>(()=>new Set());const {reset}=form;void form.formState.dirtyFields;
 useEffect(()=>{if(confirmation)return;const origin=document.activeElement instanceof HTMLElement?document.activeElement:null;const heading=region.current?.querySelector<HTMLElement>("h2");(heading??region.current)?.focus();return()=>{if(origin?.isConnected)origin.focus();};},[confirmation]);
 useEffect(()=>{if(previous.current!==initial){previous.current=initial;reset(initial,{keepDirtyValues:true});}},[initial,reset]);
 return <div ref={region} tabIndex={-1} className={confirmation?undefined:"clinical-editor"} role="region" aria-label={confirmation?"Konfirmasi tindakan":title??submitLabel}>{!confirmation&&<h2 tabIndex={-1} className="section-title">{title??submitLabel}</h2>}<FormProvider {...form}><form autoComplete="off" noValidate className="clinical-form space-y-5" onSubmit={event=>{void form.handleSubmit(async values=>{if(!available)return;await command.run(signal=>save(values,form.formState.dirtyFields,signal),r=>{reset(initial);onSuccess?.(r);});},()=>{setInline(new Set(Array.from(region.current?.querySelectorAll<HTMLElement>("input:not([type=checkbox])[name],select[name],textarea[name],[data-field-name]")??[]).map(control=>control.getAttribute("name")??control.dataset.fieldName??"")));})(event);}}>
 <fieldset disabled={command.pending||command.locked} className="space-y-5">{children}</fieldset>
 {remainingErrors(form.formState.errors,inline).map(([key,message])=><p key={key} role="alert" className="text-destructive">{message}</p>)}
 <ContinuityFeedback error={command.error}/>{!available&&<p role="status">Tindakan belum tersedia. Tinjau status dan data terbaru.</p>}
 {command.reviewRequired&&<div><p>Isian tetap dipertahankan. Tinjau data terbaru sebelum mengirim lagi.</p><Button type="button" variant="outline" disabled={!available} onClick={command.reviewed}>Saya sudah meninjau data terbaru</Button></div>}
 <div className="flex flex-wrap gap-3"><Button type="submit" disabled={!available||command.pending||command.locked||command.reviewRequired}>{command.pending?"Menyimpan…":submitLabel}</Button><Button type="button" variant="outline" disabled={command.pending} onClick={()=>{reset();onClose();}}>Tutup formulir</Button></div>
 </form></FormProvider></div>;
}
