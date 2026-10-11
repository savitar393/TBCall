"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppPageHeader,AppSection,AppStatusBadge } from "@/components/application-patterns";
import { formatDate,formatDateTime } from "@/lib/date-format";
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
 return <div className="clinical-workspace"><AppPageHeader title="Detail kontak" eyebrow="Investigasi kontak" description="Identitas kontak, hubungan dengan kasus indeks, dan riwayat layanan."/>
 <section aria-label="Konteks kontak" className="clinical-context"><div className="clinical-context-heading"><h2>{c.fullName}</h2><AppStatusBadge>{c.linkedPatient?"Pasien tertaut":"Pasien belum tertaut"}</AppStatusBadge></div><p>{c.birthDate?formatDate(c.birthDate):"Tanggal lahir belum dicatat"} · {sex.data?.data.sexCodes.find(o=>o.code===c.sexCode)?.name??c.sexCode??"Jenis kelamin belum dicatat"}</p><p>{c.relationshipToIndexCase??"Hubungan belum dicatat"} · Serumah: {c.householdContact==null?"Belum ditentukan":c.householdContact?"Ya":"Tidak"}</p></section>
 {saved&&<p role="status" className="clinical-saved">Perubahan kontak tersimpan.</p>}{query.isError&&<QueryState query={query}/>}
 <AppSection title="Tindakan kontak"><div className="app-actions">{canContinuity(user,"CONTACT_WRITE")&&<Button disabled={!available||!!editor} onClick={()=>{setSaved(false);setEditor("edit");}}>Ubah kontak</Button>}{!c.linkedPatient&&canContinuity(user,"CONTACT_WRITE","PATIENT_IDENTITY_RESOLVE")&&<Button disabled={!available||!!editor} onClick={()=>setEditor("link")}>Tautkan pasien persis</Button>}</div></AppSection>
 <div className="clinical-section"><AppSection title="Identitas dan hubungan kontak"><DisplayFields values={[["Tanggal lahir",c.birthDate],["Jenis kelamin",sex.data?.data.sexCodes.find(o=>o.code===c.sexCode)?.name??c.sexCode],["Telepon tersamarkan",c.phone],["Alamat",c.address],["Hubungan",c.relationshipToIndexCase],["Serumah",c.householdContact],["Pasien tertaut",c.linkedPatient]]}/></AppSection></div>

 {editor==="edit"&&<ContinuityForm initial={initial} schema={contactFormSchema} title="Ubah kontak" available={available} submitLabel="Simpan perubahan kontak" onClose={()=>setEditor(null)} onSuccess={()=>{setSaved(true);setEditor(null);}} save={(v,dirty,signal)=>continuityApi.updateContact(id,contactPatch(v,dirty),query.data!.etag!,signal)}><p>Telepon tersimpan tetap tersamarkan. Isian telepon baru tidak menggunakan nilai tersamarkan.</p><ContactFields sex={!sex.isError?sex.data?.data.sexCodes:undefined}/></ContinuityForm>}
 {editor==="link"&&<ContactLink id={id} etag={query.data?.etag} available={available&&!c.linkedPatient&&canContinuity(user,"PATIENT_IDENTITY_RESOLVE")} onClose={()=>setEditor(null)} onLinked={()=>{setSaved(true);setEditor(null);}}/>}
 <div className="clinical-section"><AppSection title="Investigasi kontak">{!c.investigations.length&&<p>Belum ada investigasi yang dapat dibaca.</p>}{c.investigations.map(i=><article key={i.id} className="clinical-record-row"><div className="clinical-context-heading"><h3>{label(ref.data?.data.workflowTypes,i.workflowType)}</h3><AppStatusBadge>{label(ref.data?.data.investigationStatuses,i.status)}</AppStatusBadge></div><p>Diminta: {formatDateTime(i.requestedAt)}</p><Link className="text-primary underline" href={`/contact-investigations/${i.id}`}>Buka investigasi</Link></article>)}</AppSection></div>{canContinuity(user,"TPT_READ")&&<TptHistory contactId={id}/>}</div>;
}
