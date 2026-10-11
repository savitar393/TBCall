"use client";
import { useState } from "react";
import { useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
export function UnlinkedAccount() {
 const session=useSession();const [pending,setPending]=useState(false);const [error,setError]=useState<ApiError|null>(null);
 const user=session.user;
 if(!user || user.roles.length || user.patientLink || user.supporterCaseIds.length)return null;
 return <section className="rounded-2xl border border-primary/20 bg-secondary p-6 sm:p-8" aria-labelledby="unlinked-heading">
 <h2 id="unlinked-heading" className="text-xl font-semibold">Akun Anda sudah terverifikasi</h2>
 <p className="mt-3 leading-relaxed">Hubungi fasilitas kesehatan untuk menghubungkan catatan pengobatan Anda.</p>
 <p className="mt-2 text-sm text-muted-foreground">Petugas akan mengonfirmasi identitas Anda. Jangan kirim kode verifikasi atau kata sandi. Akun yang belum tertaut tidak memiliki akses ke catatan klinis.</p>
 <Button className="mt-5" type="button" variant="outline" disabled={pending} onClick={async()=>{setPending(true);setError(null);try{await session.refresh();}catch(failure){setError(failure instanceof ApiError?failure:new ApiError({status:0,title:"Layanan belum tersedia"}));}finally{setPending(false);}}}>{pending?"Memeriksa…":"Periksa akses terbaru"}</Button>
 <div className="mt-4"><ApiFeedback error={error}/></div></section>;
}
