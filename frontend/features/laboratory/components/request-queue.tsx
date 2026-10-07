"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Field } from "@/features/clinical-intake/forms/fields";
import { QueryState } from "@/features/clinical-intake/components/query-state";
import { labQueries } from "../queries";
import type { RequestFilters } from "../types";
import { CompletenessDisplay, Timestamp } from "./request-display";
const defaults = { status: "", ownerType: "", requestReasonCode: "", requestingFacilityId: "", testingFacilityId: "", size: "20" };
export function RequestQueue() {
  const { user } = useSession(); const [filters, setFilters] = useState<RequestFilters>({ page: 0, size: 20 }); const [invalid, setInvalid] = useState(false);
  const form = useForm({ defaultValues: defaults });
  const references = useQuery(labQueries.references(user!.id)); const query = useQuery(labQueries.requests(user!.id, filters));
  const ref = references.data?.data;
  const label = (group: "requestStatuses" | "ownerTypes" | "referralTypes" | "testStatuses", code: string) => ref?.[group].find(o => o.code === code)?.name ?? code;
  const facilities = user!.activeFacilities.map(f => ({ code: f.id, name: f.name }));
  if (!ref) return <QueryState query={references} />;
  return <><h1 className="text-2xl font-semibold">Antrean laboratorium</h1>{references.isError && <QueryState query={references} />}
    <FormProvider {...form}><form className="space-y-4 rounded-xl border bg-white p-5" noValidate autoComplete="off" onSubmit={form.handleSubmit(values => {
      const validOption = (value: string, options: { code: string }[]) => !value || options.some(o => o.code === value);
      const valid = /^[1-9]\d*$/.test(values.size) && Number(values.size) <= 50 && validOption(values.status, ref.requestStatuses) && validOption(values.ownerType, ref.ownerTypes) && validOption(values.requestReasonCode, ref.requestReasons) && validOption(values.requestingFacilityId, facilities) && validOption(values.testingFacilityId, facilities);
      setInvalid(!valid); if (!valid || references.isError) return;
      setFilters({ page: 0, size: Number(values.size), ...Object.fromEntries(Object.entries(values).filter(([key, value]) => key !== "size" && value !== "")) });
    })}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field name="status" label="Status permintaan" options={ref.requestStatuses} /><Field name="ownerType" label="Jenis pemilik" options={ref.ownerTypes} /><Field name="requestReasonCode" label="Alasan permintaan" options={ref.requestReasons} /><Field name="requestingFacilityId" label="Fasilitas peminta" options={facilities} /><Field name="testingFacilityId" label="Fasilitas pemeriksa" options={facilities} /><Field name="size" label="Ukuran halaman" type="number" /></div>
      {invalid && <p role="alert">Pilih filter aktif dan ukuran halaman 1–50.</p>}<div className="flex gap-3"><Button type="submit" disabled={references.isError}>Terapkan filter</Button><Button variant="outline" type="button" onClick={() => { form.reset(defaults); setInvalid(false); setFilters({ page: 0, size: 20 }); }}>Bersihkan filter</Button></div></form></FormProvider>
    {query.isPending || query.isError ? <QueryState query={query} /> : <><section className="space-y-4" aria-label="Daftar permintaan">{!query.data!.data.content.length && <p>Belum ada permintaan laboratorium.</p>}{query.data!.data.content.map(r => <article key={r.id} className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-semibold">{r.patient.fullName}</h2><p className="text-sm">{r.patient.sex?.name ?? "—"} · {r.patient.birthDateUnknown ? "Tanggal lahir tidak diketahui" : r.patient.birthDate ?? "—"}</p><p className="text-sm">{label("ownerTypes", r.owner.type)} · {r.requestReason.name} · {label("referralTypes", r.referralType)} · {label("requestStatuses", r.status)}</p><p className="text-sm">Peminta: {r.requestingFacility.name} · Pemeriksa: {r.testingFacility.name}</p><p className="text-sm">Diminta: <Timestamp value={r.requestedAt} /></p><ul className="text-sm">{r.tests.map(t => <li key={t.id}>{t.testType.name} · {label("testStatuses", t.status)}</li>)}</ul><CompletenessDisplay value={r.completeness} /><Link href={`/laboratory/requests/${r.id}`} className="inline-block text-primary underline">Buka permintaan</Link></article>)}</section><div className="flex items-center gap-3"><Button variant="outline" disabled={!filters.page || query.isFetching} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Halaman sebelumnya</Button><span className="text-sm">Halaman {filters.page + 1}</span><Button variant="outline" disabled={(filters.page + 1) * filters.size >= query.data!.data.totalElements || query.isFetching} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Halaman berikutnya</Button></div></>}
  </>;
}
