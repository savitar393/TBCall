"use client";
import { useEffect,useId,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormContext } from "react-hook-form";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { continuityQueries } from "./queries";
import { Pagination,QueryState } from "./display";
export function FacilitySearch({exclude}:{exclude?:string}){
 const {user}=useSession(),form=useFormContext(),id=useId(),[typed,setTyped]=useState(""),[query,setQuery]=useState(""),[page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(typed.trim());setPage(0);},300);return()=>clearTimeout(timer);},[typed]);
 const result=useQuery({...continuityQueries.facilities(user!.id,query,page),enabled:query.length>=2&&query.length<=255});
 const error=form.getFieldState("destinationFacilityId",form.formState).error;
 return <section className="space-y-3" aria-label="Pilih fasilitas tujuan"><Label htmlFor={id}>Cari fasilitas tujuan</Label><Input id={id} autoComplete="off" value={typed} maxLength={255} onChange={e=>{setTyped(e.target.value);setSelected(null);form.setValue("destinationFacilityId","",{shouldDirty:true});}}/><p className="text-sm">Ketik sekurangnya 2 karakter, lalu pilih tujuan secara eksplisit.</p>{selected&&<p role="status">Tujuan dipilih: {selected}</p>}
 {query.length>=2&&(result.isPending||result.isError)&&<QueryState query={result}/>}{result.data&&query.length>=2&&<><ul className="space-y-2">{result.data.data.content.filter(f=>f.id!==exclude).map(f=><li key={f.id}><Button type="button" variant="outline" onClick={()=>{form.setValue("destinationFacilityId",f.id,{shouldDirty:true,shouldValidate:true});setSelected(f.name);}}>Pilih {f.name}</Button></li>)}</ul>{!result.data.data.content.filter(f=>f.id!==exclude).length&&<p>Belum ada tujuan yang cocok pada halaman ini.</p>}<Pagination page={page} total={result.data.data.totalElements} setPage={setPage}/></>}{error?.message&&<p role="alert">{error.message}</p>}</section>;
}
