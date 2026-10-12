"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { clinicalQueries } from "../queries";
import { canClinical } from "../permissions";
import { filtersSchema } from "../forms/values";
import { Field } from "../forms/fields";
import type { CaseHistoryFilters } from "../types";
import { QueryState } from "./query-state";
import { AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { formatDateTime } from "@/lib/date-format";

const schema = filtersSchema.pick({ name: true, facilityId: true, size: true });
const defaults = { name: "", facilityId: "", size: "20" };
const initial: CaseHistoryFilters = { name: "", facilityId: "", size: 20, page: 0 };
export function CaseHistory() {
  const { user } = useSession();
  const [filters, setFilters] = useState(initial);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: defaults });
  const cases = useQuery(clinicalQueries.caseHistory(user!.id, filters));
  return <div className="clinical-workspace">
    <AppPageHeader title="Riwayat kasus selesai" eyebrow="Riwayat pelayanan" description="Kasus selesai pada fasilitas penanggung jawab saat ini." actions={canClinical(user, "PATIENT_READ") && <Link href="/patients" className="text-primary underline">Kembali ke daftar pasien</Link>}/>
    <AppSection title="Filter riwayat"><FormProvider {...form}><form noValidate autoComplete="off" className="space-y-4" onSubmit={form.handleSubmit(values => setFilters({ ...values, name: values.name.trim(), size: Number(values.size), page: 0 }))}>
      <div className="grid gap-4 sm:grid-cols-3"><Field name="name" label="Cari nama" /><Field name="facilityId" label="Fasilitas penanggung jawab" emptyOptionLabel="Semua fasilitas Anda" options={user!.activeFacilities.map(f => ({ code: f.id, name: f.name }))} /><Field name="size" label="Ukuran halaman" type="number" /></div>
      <div className="flex flex-wrap gap-3"><Button type="submit">Terapkan filter</Button><Button type="button" variant="outline" onClick={() => { form.reset(defaults); setFilters(initial); }}>Hapus filter</Button></div>
    </form></FormProvider></AppSection>
    {cases.isPending || cases.isError ? <section aria-label="Status riwayat kasus"><QueryState query={cases} /></section> : <AppSection title="Hasil riwayat kasus">
      <p role="status">{cases.data.data.totalElements} kasus selesai · Halaman {filters.page + 1}</p>
      {!cases.data.data.content.length && <p>Tidak ada kasus selesai yang sesuai.</p>}
      {cases.data.data.content.map(item => <article key={item.tbCase.id} className="clinical-record-row"><div className="clinical-context-heading"><h3 className="font-semibold">{item.fullName}</h3><AppStatusBadge tone="complete">Selesai</AppStatusBadge></div><p className="text-sm">{item.tbCase.caseCategory?.name ?? "Kasus TBC"} · {item.tbCase.currentFacility.name}</p>{item.confirmedAt && <p className="text-sm">Dikonfirmasi: {formatDateTime(item.confirmedAt)}</p>}<div className="flex flex-wrap gap-4"><Link href={`/cases/${item.tbCase.id}`} className="text-primary underline">Buka kasus selesai</Link><Link href={`/cases/${item.tbCase.id}/summary`} className="text-primary underline">Ringkasan kasus</Link></div></article>)}
      {(filters.page > 0 || cases.data.data.totalElements > filters.size) && <nav aria-label="Halaman riwayat kasus" className="flex flex-wrap gap-3"><Button variant="outline" aria-label="Halaman sebelumnya" disabled={filters.page === 0 || cases.isFetching} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Sebelumnya</Button><Button variant="outline" aria-label="Halaman berikutnya" disabled={(filters.page + 1) * filters.size >= cases.data.data.totalElements || cases.isFetching} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Berikutnya</Button></nav>}
    </AppSection>}
  </div>;
}
