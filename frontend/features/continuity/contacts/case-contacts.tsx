"use client";
import { useMemo,useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { continuityQueries as q } from "../queries";
import { continuityApi } from "../api";
import { canContinuity } from "../permissions";
import { QueryState,Pagination,label } from "../display";
import { ContinuityForm } from "../form";
import { contactValues,contactCreateSchema,contactInput } from "./forms";
import { ContactFields } from "./contact-fields";
export function CaseContacts({id}:{id:string}){
 const {user}=useSession(),router=useRouter(),[page,setPage]=useState(0),[editor,setEditor]=useState(false),query=useQuery(q.contacts(user!.id,id,page)),ref=useQuery(q.contactReferences(user!.id)),sex=useQuery({...q.clinicalReferences(user!.id),enabled:canContinuity(user,"PATIENT_READ")}),context=useQuery({...q.caseContext(user!.id,id),enabled:canContinuity(user,"CASE_READ")}),initial=useMemo(()=>contactValues(),[]);
 return <><h1 className="text-2xl font-semibold">Kontak kasus</h1>{canContinuity(user,"CASE_READ")&&<Link href={`/cases/${id}`} className="text-primary underline">Buka kasus</Link>}{canContinuity(user,"CONTACT_WRITE")&&<Button disabled={editor||ref.isError||!ref.data} onClick={()=>setEditor(true)}>Tambah kontak</Button>}{editor&&<ContinuityForm initial={initial} schema={contactCreateSchema.refine(v=>!!ref.data?.data.creatableWorkflowTypes.some(w=>w.code===v.workflowType),{path:["workflowType"],message:"Pilih alur dari referensi aktif."})} available={!query.isFetching&&!query.isError&&!ref.isError&&!!ref.data&&canContinuity(user,"CONTACT_WRITE")} submitLabel="Simpan kontak" context={{caseId:id}} onClose={()=>setEditor(false)} onSuccess={(r:Awaited<ReturnType<typeof continuityApi.createContact>>) =>router.push(`/contacts/${r.data.id}`)} save={(v,_,signal)=>continuityApi.createContact(id,contactInput(v),signal)}><ContactFields create workflows={ref.data?.data.creatableWorkflowTypes} sex={!sex.isError?sex.data?.data.sexCodes:undefined} exclude={context.data?.data.currentFacility.id}/></ContinuityForm>}{ref.isError&&<QueryState query={ref}/>}<p>Kontak hanya menampilkan hubungan dan ringkasan yang diberikan server, tanpa membuka identitas pasien tertaut.</p>{query.isPending||query.isError?<QueryState query={query}/>:<>{!query.data.data.content.length&&<p>Belum ada kontak.</p>}<div className="grid gap-4 md:grid-cols-2">{query.data.data.content.map(c=><article key={c.id} className="space-y-2 rounded-xl border bg-white p-5 break-words"><h2 className="font-semibold">{c.fullName}</h2><p>{c.birthDate??"—"} · {sex.data?.data.sexCodes.find(o=>o.code===c.sexCode)?.name??c.sexCode??"—"} · {c.phone??"—"}</p><p>{c.relationshipToIndexCase??"—"} · Serumah: {c.householdContact==null?"Belum ditentukan":c.householdContact?"Ya":"Tidak"}</p><p>Pasien tertaut: {c.linkedPatient?"Ya":"Tidak"}</p>{c.investigations[0]&&<p>{label(ref.data?.data.investigationStatuses,c.investigations[0].status)} · {c.investigations[0].requestedAt}</p>}{canContinuity(user,"TPT_READ")&&c.tpt[0]&&<p>TPT: {c.tpt[0].status} · {c.tpt[0].startDate} · {c.tpt[0].facility?.name??"—"}</p>}<Link href={`/contacts/${c.id}`} className="text-primary underline">Buka kontak</Link></article>)}</div><Pagination page={page} total={query.data.data.totalElements} setPage={setPage}/></>}</>;
}
