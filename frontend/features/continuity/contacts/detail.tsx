"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { continuityQueries as q } from "../queries";
import { continuityApi } from "../api";
import { canContinuity } from "../permissions";
import { QueryState,DisplayFields,label } from "../display";
import { ContinuityForm } from "../form";
import { contactValues,contactFormSchema,contactPatch } from "./forms";
import { ContactFields } from "./contact-fields";
import { ContactLink } from "./link";
import { TptHistory } from "../tpt/history";
export function ContactDetail({id}:{id:string}){
 const {user}=useSession(),query=useQuery(q.contact(user!.id,id)),ref=useQuery(q.contactReferences(user!.id)),sex=useQuery({...q.clinicalReferences(user!.id),enabled:canContinuity(user,"PATIENT_READ")}),[editor,setEditor]=useState<"edit"|"link"|null>(null),[saved,setSaved]=useState(false),initial=useMemo(()=>contactValues(query.data?.data),[query.data?.data]),c=query.data?.data;
 if(!c)return <QueryState query={query}/>;const available=!!query.data?.etag&&!query.isFetching&&!query.isError&&canContinuity(user,"CONTACT_WRITE");
 return <><h1 className="text-2xl font-semibold">Detail kontak</h1>{saved&&<p role="status">Perubahan kontak tersimpan.</p>}{query.isError&&<QueryState query={query}/>}<DisplayFields values={[["Nama",c.fullName],["Tanggal lahir",c.birthDate],["Jenis kelamin",sex.data?.data.sexCodes.find(o=>o.code===c.sexCode)?.name??c.sexCode],["Telepon tersamarkan",c.phone],["Alamat",c.address],["Hubungan",c.relationshipToIndexCase],["Serumah",c.householdContact],["Pasien tertaut",c.linkedPatient]]}/><div className="flex flex-wrap gap-3">{canContinuity(user,"CONTACT_WRITE")&&<Button disabled={!available||!!editor} onClick={()=>{setSaved(false);setEditor("edit");}}>Ubah kontak</Button>}{!c.linkedPatient&&canContinuity(user,"CONTACT_WRITE","PATIENT_IDENTITY_RESOLVE")&&<Button disabled={!available||!!editor} onClick={()=>setEditor("link")}>Tautkan pasien persis</Button>}</div>
 {editor==="edit"&&<ContinuityForm initial={initial} schema={contactFormSchema} available={available} submitLabel="Simpan perubahan kontak" onClose={()=>setEditor(null)} onSuccess={()=>{setSaved(true);setEditor(null);}} save={(v,dirty,signal)=>continuityApi.updateContact(id,contactPatch(v,dirty),query.data!.etag!,signal)}><p>Telepon tersimpan tetap tersamarkan. Isian telepon baru tidak menggunakan nilai tersamarkan.</p><ContactFields sex={!sex.isError?sex.data?.data.sexCodes:undefined}/></ContinuityForm>}
 {editor==="link"&&<ContactLink id={id} etag={query.data?.etag} available={available&&!c.linkedPatient&&canContinuity(user,"PATIENT_IDENTITY_RESOLVE")} onClose={()=>setEditor(null)} onLinked={()=>{setSaved(true);setEditor(null);}}/>}
 <section className="space-y-3"><h2 className="font-semibold">Investigasi kontak</h2>{!c.investigations.length&&<p>Belum ada investigasi yang dapat dibaca.</p>}{c.investigations.map(i=><article key={i.id} className="rounded-xl border p-4 space-y-2"><p>{label(ref.data?.data.workflowTypes,i.workflowType)} · {label(ref.data?.data.investigationStatuses,i.status)} · {i.requestedAt}</p><Link className="text-primary underline" href={`/contact-investigations/${i.id}`}>Buka investigasi</Link></article>)}</section>{canContinuity(user,"TPT_READ")&&<TptHistory contactId={id}/>}</>;
}
