"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { continuityQueries as q } from "../queries";
import { QueryState,Pagination,label } from "../display";
export function TptHistory({contactId}:{contactId:string}){const {user}=useSession(),[page,setPage]=useState(0),query=useQuery(q.history(user!.id,contactId,page)),ref=useQuery(q.tptReferences(user!.id));return <section className="space-y-3"><h2 className="font-semibold">Riwayat TPT</h2>{query.isPending||query.isError?<QueryState query={query}/>:<>{!query.data.data.content.length&&<p>Belum ada TPT yang dapat dibaca.</p>}{query.data.data.content.map(t=><article key={t.id} className="space-y-2 rounded-xl border p-4"><p>{label(ref.data?.data.tptStatuses,t.status)} · {t.startDate} · {t.facility.name}</p><Link href={`/preventive-treatments/${t.id}`} className="text-primary underline">Buka TPT</Link></article>)}<Pagination page={page} total={query.data.data.totalElements} setPage={setPage}/></>}</section>;}
