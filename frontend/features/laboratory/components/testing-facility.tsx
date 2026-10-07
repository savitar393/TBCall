"use client";
import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { clinicalQueries } from "@/features/clinical-intake/queries";
import { canClinical } from "@/features/clinical-intake/permissions";
import { Field } from "@/features/clinical-intake/forms/fields";
import { QueryState } from "@/features/clinical-intake/components/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function TestingFacility({ owner }: { owner: { id: string; name: string } }) {
  const { user } = useSession(); const form = useFormContext(); const [search, setSearch] = useState(""); const [debounced, setDebounced] = useState(""); const [page, setPage] = useState(0); const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(timer); }, [search]);
  const { setValue } = form;
  useEffect(() => { if (selected) setValue("testingFacilityId", selected.id, { shouldDirty: true, shouldValidate: true }); }, [selected, setValue]);
  const permitted = canClinical(user, "PATIENT_READ"); const valid = permitted && search.trim().length >= 2 && search.trim().length <= 255 && debounced === search.trim();
  const query = useQuery({ ...clinicalQueries.facilities(user!.id, debounced, page), enabled: valid });
  const choices = [...new Map([owner, ...user!.activeFacilities, ...(selected ? [selected] : [])].map(f => [f.id, { code: f.id, name: f.name }])).values()];
  return <div className="space-y-4"><Field name="testingFacilityId" label="Fasilitas pemeriksa" required options={choices} />{permitted && <><Label htmlFor="testing-search">Cari fasilitas pemeriksa</Label><Input id="testing-search" autoComplete="off" maxLength={255} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><p className="text-xs text-muted-foreground">Ketik minimal 2 karakter. Pemilihan fasilitas tidak memberikan izin menulis.</p>
    {valid && (query.isPending || query.isError ? <QueryState query={query} /> : <><ul className="space-y-2">{query.data!.data.content.map(f => <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div>{f.name}<p>Provinsi {f.provinceCode ?? "—"} · Kabupaten/kota {f.regencyCode ?? "—"}</p></div><Button type="button" variant="outline" aria-label={`Pilih ${f.name}`} onClick={() => setSelected(f)}>Pilih</Button></li>)}</ul>{!query.data!.data.content.length && <p>Tidak ada fasilitas yang cocok.</p>}<div className="flex gap-3"><Button type="button" variant="outline" disabled={!page || query.isFetching} onClick={() => setPage(p => p - 1)}>Fasilitas sebelumnya</Button><Button type="button" variant="outline" disabled={(page + 1) * 20 >= query.data!.data.totalElements || query.isFetching} onClick={() => setPage(p => p + 1)}>Fasilitas berikutnya</Button></div></>)}</>}
  </div>;
}
