"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/clinical-intake/components/query-state";
import { treatmentQueries } from "../queries";
import { treatmentApi } from "../api";
import { canTreatment,openTreatmentStatuses } from "../permissions";
import { startValues,startFormSchema } from "../forms/values";
import { startInput } from "../forms/mappers";
import { StartFields } from "../forms/fields";
import { TreatmentForm } from "./treatment-form";
export function CaseTreatments({id}:{id:string}){
 const {user}=useSession(),router=useRouter(),episodes=useQuery(treatmentQueries.episodes(user!.id,id)),references=useQuery(treatmentQueries.references(user!.id)),context=useQuery({...treatmentQueries.caseContext(user!.id,id),enabled:canTreatment(user,"CASE_READ")}),[starting,setStarting]=useState(false);
 const initial=useMemo(()=>startValues(),[]),c=context.data?.data,ref=references.data?.data,items=episodes.data?.data;
 const schema=useMemo(()=>startFormSchema.refine(v=>!!ref?.regimens.some(r=>r.code===v.regimenCode&&r.caseCategoryCode===c?.caseCategoryCode),{path:["regimenCode"],message:"Pilih paduan sesuai kategori kasus."}).refine(v=>v.drugs.every(d=>ref?.drugs.some(r=>r.code===d.drugCode)),{path:["drugs"],message:"Pilih obat dari katalog aktif."}),[ref,c?.caseCategoryCode]);
 if(!items)return <QueryState query={episodes}/>;
 const allow=canTreatment(user,"TREATMENT_WRITE")&&c?.status==="ACTIVE"&&!items.some(t=>openTreatmentStatuses.includes(t.status));
 const catalogAvailable=!!ref?.regimens.some(r=>r.caseCategoryCode===c?.caseCategoryCode)&&!!ref?.drugs.length;
 return <div className="space-y-5"><h1 className="text-2xl font-semibold">Episode pengobatan</h1>{canTreatment(user,"CASE_READ")&&<Link className="text-primary underline" href={`/cases/${id}`}>Buka kasus</Link>}{c?<section aria-label="Konteks kasus" className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{c.patient.fullName}</h2><p>{c.status} · {c.caseCategoryCode} · {c.currentFacility.name}</p></section>:canTreatment(user,"CASE_READ")?<QueryState query={context}/>:<p>Izin membaca kasus diperlukan untuk konteks dan tindakan terkait kasus.</p>}
 {episodes.isError&&<QueryState query={episodes}/>} {references.isError&&<QueryState query={references}/>}
 {!items.length&&<p>Belum ada episode pengobatan.</p>}{items.map(t=><article key={t.id} className="space-y-2 rounded-xl border bg-white p-5"><h2 className="font-semibold">{t.regimen?.name??"Paduan tidak tersedia"}</h2><p>{ref?.treatmentStatuses.find(o=>o.code===t.status)?.name??t.status} · {t.facility.name}</p><p>Mulai: {t.startDate} · Akhir rencana: {t.plannedEndDate??"—"} · Akhir aktual: {t.actualEndDate??"—"}</p><Link className="text-primary underline" href={`/treatments/${t.id}`}>Buka pengobatan</Link></article>)}
 {allow&&!starting&&(catalogAvailable?<Button disabled={episodes.isFetching||context.isFetching||references.isFetching||episodes.isError||context.isError||references.isError} onClick={()=>setStarting(true)}>Mulai pengobatan</Button>:<p role="status">Katalog paduan atau obat untuk kategori kasus ini belum tersedia.</p>)}
 {starting&&ref&&c&&<TreatmentForm initial={initial} schema={schema} caseId={id} available={allow&&catalogAvailable&&!episodes.isError&&!context.isError&&!references.isError} fetching={episodes.isFetching||context.isFetching||references.isFetching} submitLabel="Simpan pengobatan" save={(v,_,signal)=>treatmentApi.start(id,startInput(v),signal)} onSuccess={r=>router.push(`/treatments/${r.data.id}`)} onClose={()=>setStarting(false)}><StartFields references={ref} category={c.caseCategoryCode??""}/></TreatmentForm>}
 </div>;
}
