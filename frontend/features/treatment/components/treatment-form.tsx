"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { FormProvider,useForm,useWatch,type FieldValues,type DefaultValues,type Resolver,type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { useTreatmentCommand } from "../use-command";
import type { Dirty } from "../forms/mappers";
import { TreatmentFeedback } from "./treatment-feedback";
export function TreatmentForm<T extends FieldValues,R>({initial,schema,children,available,fetching=false,submitLabel,save,onSuccess,onClose,caseId,confirmationField}:{initial:T;schema:z.ZodType<T>;children:ReactNode;available:boolean;fetching?:boolean;submitLabel:string;save(values:T,dirty:Dirty,signal:AbortSignal):Promise<R>;onSuccess?(result:R):void;onClose():void;caseId:string;confirmationField?:Path<T>}){
 const command=useTreatmentCommand(caseId),form=useForm<T>({defaultValues:initial as DefaultValues<T>,resolver:zodResolver(schema as Parameters<typeof zodResolver>[0]) as Resolver<T>}),previous=useRef(initial);const {reset}=form;void form.formState.dirtyFields;
 const confirmed=useWatch({control:form.control,name:confirmationField??("" as Path<T>)});
 useEffect(()=>{if(previous.current!==initial){previous.current=initial;reset(initial,{keepDirtyValues:true});}},[initial,reset]);
 return <FormProvider {...form}><form noValidate autoComplete="off" className="space-y-5 rounded-xl border bg-white p-5" onSubmit={form.handleSubmit(async v=>{if(!available||fetching)return;await command.run(signal=>save(v,form.formState.dirtyFields,signal),r=>{reset(initial);onSuccess?.(r);});})}>
  <fieldset className="space-y-5" disabled={command.pending||command.locked}>{children}</fieldset>
  {Object.entries(form.formState.errors).map(([key,value])=>typeof value?.message==="string"?<p key={key} role="alert" className="text-destructive">{value.message}</p>:null)}
  <TreatmentFeedback error={command.error}/>{!available&&<p role="status">Tindakan belum tersedia. Tinjau status dan data terbaru.</p>}
  {command.reviewRequired&&<div className="space-y-3"><p>Isian tetap dipertahankan. Tinjau data terbaru sebelum mengirim lagi.</p><Button type="button" variant="outline" disabled={command.pending||!available||fetching} onClick={command.reviewed}>Saya sudah meninjau data terbaru</Button></div>}
  <div className="flex flex-wrap gap-3"><Button type="submit" disabled={!available||fetching||command.pending||command.locked||command.reviewRequired||(confirmationField!==undefined&&!confirmed)}>{command.pending?"Menyimpan…":submitLabel}</Button><Button type="button" variant="outline" disabled={command.pending} onClick={()=>{if(!form.formState.isDirty||window.confirm("Menutup formulir akan membuang isian yang belum disimpan."))onClose();}}>Tutup formulir</Button></div>
 </form></FormProvider>;
}
