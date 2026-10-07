"use client";
import { useState } from "react";
import { FormProvider,useForm,useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { identityFormSchema,type IdentityValues } from "@/features/clinical-intake/forms/values";
import { identityInput } from "@/features/clinical-intake/forms/mappers";
import { Button } from "@/components/ui/button";
import { ContinuityFeedback } from "../feedback";
import { Field } from "../fields";
import { Confirmation } from "../confirmation";
import { continuityApi } from "../api";
import { useContinuityCommand } from "../use-command";
import { identityConfirmationSchema } from "../schemas";
import type { Body } from "../types";
export function ContactLink({id,etag,available,onClose,onLinked}:{id:string;etag?:string;available:boolean;onClose():void;onLinked():void}){
 const command=useContinuityCommand(),[original,setOriginal]=useState<Body|null>(null),[resolved,setResolved]=useState<z.infer<typeof identityConfirmationSchema>|null>(null),[confirmed,setConfirmed]=useState(false),form=useForm<IdentityValues>({defaultValues:{citizenship:"WNI",nik:"",otherIdentityNumber:"",fullName:"",birthDate:"",bpjsNumber:""},resolver:zodResolver(identityFormSchema)}),citizenship=useWatch({control:form.control,name:"citizenship"});
 const clear=()=>{setOriginal(null);setResolved(null);setConfirmed(false);form.reset();};
 return <Confirmation title="Tautkan pasien dengan identitas persis" onClose={()=>{clear();onClose();}}><p>Gunakan identitas persis dan konfirmasi nama atau tanggal lahir. Tidak ada pencarian samar atau pengisian UUID pasien.</p>{!resolved?<FormProvider {...form}><form autoComplete="off" noValidate className="space-y-4" onSubmit={form.handleSubmit(async values=>{if(!available)return;const exact=identityInput(values);await command.run(signal=>continuityApi.resolve(exact,signal),r=>{setOriginal({...exact});setResolved(r.data);form.reset();},false);})}><fieldset disabled={command.pending||command.locked} className="space-y-4"><Field name="citizenship" label="Kewarganegaraan" options={[{code:"WNI",name:"WNI"},{code:"WNA",name:"WNA"}]} required/>{citizenship==="WNI"?<Field name="nik" label="NIK persis" required/>:<Field name="otherIdentityNumber" label="Nomor identitas asing persis" required/>}<Field name="fullName" label="Konfirmasi nama lengkap"/><Field name="birthDate" label="Konfirmasi tanggal lahir" type="date"/><Field name="bpjsNumber" label="BPJS persis (opsional)"/></fieldset><Button type="submit" disabled={!available||command.pending||command.locked||command.reviewRequired}>Cari pasien persis</Button></form></FormProvider>:<div className="space-y-4"><h2 className="font-semibold">Konfirmasi pasien tersamarkan</h2><p>{resolved.fullName} · {resolved.birthDate??"Tanggal lahir tidak diketahui"}</p><p>{resolved.nik??resolved.otherIdentityNumber??"—"} · {resolved.bpjsNumber??"—"}</p><label className="flex items-center gap-3"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Saya mengonfirmasi pasien ini untuk ditautkan</label><Button disabled={!available||!etag||!confirmed||command.pending||command.locked||command.reviewRequired} onClick={()=>void command.run(signal=>continuityApi.link(id,{...original!,patientId:resolved.patientId},etag!,signal),()=>{clear();onLinked();})}>Tautkan pasien</Button></div>}<ContinuityFeedback error={command.error}/>{command.reviewRequired&&<><p>Tinjau data terbaru dan konfirmasi persis sebelum mengirim lagi.</p><Button variant="outline" disabled={!available} onClick={()=>{setConfirmed(false);command.reviewed();}}>Saya sudah meninjau data terbaru</Button></>}<Button variant="outline" disabled={command.pending} onClick={()=>{clear();onClose();}}>Batal tautkan</Button></Confirmation>;
}
