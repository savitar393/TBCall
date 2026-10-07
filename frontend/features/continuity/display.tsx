"use client";
import { Button } from "@/components/ui/button";
export { QueryState } from "@/features/clinical-intake/components/query-state";
export { DisplayFields } from "@/features/clinical-intake/components/record-display";
export function label(options:{code:string;name:string}[]|undefined,code:string){return options?.find(o=>o.code===code)?.name??code;}
export function Pagination({page,total,setPage}:{page:number;total:number;setPage(page:number):void}){return <nav aria-label="Halaman daftar" className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={page===0} onClick={()=>setPage(page-1)}>Sebelumnya</Button><p>Halaman {page+1} · {total} catatan</p><Button variant="outline" disabled={(page+1)*20>=total} onClick={()=>setPage(page+1)}>Berikutnya</Button></nav>;}
