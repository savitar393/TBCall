"use client";
import { useEffect, useId, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { clinicalQueries } from "../queries";
import { QueryState } from "./query-state";
export function FacilitySearch({ currentFacilityId, initialDestination }: { currentFacilityId?: string; initialDestination?: { id: string; name: string } | null }) {
  const { user } = useSession(); const form = useFormContext(); const id = useId();
  const [search, setSearch] = useState(""); const [debounced, setDebounced] = useState(""); const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(initialDestination ?? null);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(timer); }, [search]);
  const valid = search.trim().length >= 2 && search.trim().length <= 255 && debounced === search.trim() && !!currentFacilityId;
  const query = useQuery({ ...clinicalQueries.facilities(user!.id, debounced, page), enabled: valid });
  const message = form.formState.errors.referredToFacilityId?.message;
  return <div className="space-y-4 rounded-xl border p-4 sm:col-span-2"><Label htmlFor={id}>Cari fasyankes tujuan</Label><Input id={id} value={search} maxLength={255} autoComplete="off" disabled={!currentFacilityId} onChange={event => { setSearch(event.target.value); setPage(0); }} aria-describedby={`${id}-hint`} />
    <p id={`${id}-hint`} className="text-xs text-muted-foreground">Ketik minimal 2 karakter. Tujuan harus berbeda dari fasilitas registrasi.</p>
    {!currentFacilityId && <p role="alert">Baca registrasi terlebih dahulu dengan izin yang sesuai untuk memilih tujuan rujukan.</p>}
    {selected && form.watch("referredToFacilityId") === selected.id && <p className="text-sm">Tujuan dipilih: {selected.name}</p>}
    {typeof message === "string" && <p role="alert" className="text-sm text-destructive">{message}</p>}
    {valid && (query.isPending || query.isError ? <QueryState query={query} /> : <><ul className="space-y-2">{query.data!.data.content.filter(f => f.id !== currentFacilityId).map(f => <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3 text-sm"><div><p className="font-medium">{f.name}</p><p>Provinsi {f.provinceCode ?? "—"} · Kabupaten/kota {f.regencyCode ?? "—"}</p></div><Button type="button" variant="outline" aria-label={`Pilih ${f.name}`} onClick={() => { form.setValue("referredToFacilityId", f.id, { shouldDirty: true, shouldValidate: true }); setSelected({ id: f.id, name: f.name }); }}>Pilih</Button></li>)}</ul>{!query.data!.data.content.some(f => f.id !== currentFacilityId) && <p className="text-sm">Tidak ada tujuan yang sesuai pada halaman ini.</p>}<div className="flex gap-3"><Button type="button" variant="outline" disabled={!page || query.isFetching} onClick={() => setPage(p => p - 1)}>Tujuan sebelumnya</Button><Button type="button" variant="outline" disabled={(page + 1) * 20 >= query.data!.data.totalElements || query.isFetching} onClick={() => setPage(p => p + 1)}>Tujuan berikutnya</Button></div></>)}
  </div>;
}
