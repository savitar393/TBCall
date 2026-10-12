"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { Field } from "@/features/clinical-intake/forms/fields";
import { DeduplicatedQueryState as QueryState } from "@/features/clinical-intake/components/query-state";
import { labQueries } from "../queries";
import type { RequestFilters } from "../types";
import { CompletenessDisplay, Timestamp } from "./request-display";
import { labStatusTone } from "./request-display";
import { formatDate } from "@/lib/date-format";
const defaults = { status: "", ownerType: "", requestReasonCode: "", requestingFacilityId: "", testingFacilityId: "", size: "20" };
export function RequestQueue() {
  const { user } = useSession(); const [filters, setFilters] = useState<RequestFilters>({ page: 0, size: 20 }); const [invalid, setInvalid] = useState(false);
  const form = useForm({ defaultValues: defaults });
  const references = useQuery(labQueries.references(user!.id)); const query = useQuery(labQueries.requests(user!.id, filters));
  const ref = references.data?.data;
  const label = (group: "requestStatuses" | "ownerTypes" | "referralTypes" | "testStatuses", code: string) => ref?.[group].find(o => o.code === code)?.name ?? code;
  const facilities = user!.activeFacilities.map(f => ({ code: f.id, name: f.name }));
  if (!ref) return <QueryState query={references} />;
  return <div className="clinical-workspace"><AppPageHeader title="Antrean laboratorium" eyebrow="Pemeriksaan" description="Pantau permintaan, penerimaan spesimen, dan ketersediaan hasil." />{references.isError && <QueryState query={references} />}
    <FormProvider {...form}><form aria-label="Filter antrean laboratorium" className="clinical-filter-panel space-y-4" noValidate autoComplete="off" onSubmit={form.handleSubmit(values => {
      const validOption = (value: string, options: { code: string }[]) => !value || options.some(o => o.code === value);
      const valid = /^[1-9]\d*$/.test(values.size) && Number(values.size) <= 50 && validOption(values.status, ref.requestStatuses) && validOption(values.ownerType, ref.ownerTypes) && validOption(values.requestReasonCode, ref.requestReasons) && validOption(values.requestingFacilityId, facilities) && validOption(values.testingFacilityId, facilities);
      setInvalid(!valid); if (!valid || references.isError) return;
      setFilters({ page: 0, size: Number(values.size), ...Object.fromEntries(Object.entries(values).filter(([key, value]) => key !== "size" && value !== "")) });
    })}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field name="status" label="Status permintaan" emptyOptionLabel="Semua status permintaan" options={ref.requestStatuses} /><Field name="ownerType" label="Jenis pemilik" emptyOptionLabel="Semua jenis pemilik" options={ref.ownerTypes} /><Field name="requestReasonCode" label="Alasan permintaan" emptyOptionLabel="Semua alasan permintaan" options={ref.requestReasons} /><Field name="requestingFacilityId" label="Fasilitas peminta" emptyOptionLabel="Semua fasilitas Anda" options={facilities} /><Field name="testingFacilityId" label="Fasilitas pemeriksa" emptyOptionLabel="Semua fasilitas Anda" options={facilities} /><Field name="size" label="Ukuran halaman" type="number" /></div>
      {invalid && <p role="alert">Pilih filter aktif dan ukuran halaman 1–50.</p>}<div className="flex gap-3"><Button type="submit" disabled={references.isError}>Terapkan filter</Button><Button variant="outline" type="button" onClick={() => { form.reset(defaults); setInvalid(false); setFilters({ page: 0, size: 20 }); }}>Bersihkan filter</Button></div></form></FormProvider>
    {query.isPending || query.isError ? <QueryState query={query} /> : <><AppSection title="Daftar permintaan" description={`${query.data!.data.totalElements} permintaan sesuai filter dan akses fasilitas Anda.`}><div className="clinical-record-list">{!query.data!.data.content.length && <p className="clinical-empty">Belum ada permintaan laboratorium.</p>}{query.data!.data.content.map(r => <article key={r.id} className="clinical-record-row"><div className="clinical-context-heading"><h3 className="font-semibold">{r.patient.fullName}</h3><AppStatusBadge tone={labStatusTone(r.status)}>{label("requestStatuses", r.status)}</AppStatusBadge></div><p className="text-sm text-muted-foreground">{r.patient.sex?.name ?? "—"} · {r.patient.birthDateUnknown ? "Tanggal lahir tidak diketahui" : r.patient.birthDate ? formatDate(r.patient.birthDate) : "—"}</p><p className="text-sm">{label("ownerTypes", r.owner.type)} · {r.requestReason.name} · {label("referralTypes", r.referralType)}</p><div className="clinical-data-grid text-sm"><p><span className="text-muted-foreground">Peminta</span><br />{r.requestingFacility.name}</p><p><span className="text-muted-foreground">Pemeriksa</span><br />{r.testingFacility.name}</p><p><span className="text-muted-foreground">Diminta</span><br /><Timestamp value={r.requestedAt} /></p></div><ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{r.tests.map(t => <li key={t.id}>{t.testType.name} · {label("testStatuses", t.status)}</li>)}</ul><CompletenessDisplay value={r.completeness} /><div className="clinical-record-actions"><Link href={`/laboratory/requests/${r.id}`} className="text-primary underline">Buka permintaan</Link></div></article>)}</div></AppSection>{(filters.page > 0 || query.data!.data.totalElements > filters.size) && <nav aria-label="Halaman antrean laboratorium" className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!filters.page || query.isFetching} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Halaman sebelumnya</Button><span className="text-sm">Halaman {filters.page + 1}</span><Button variant="outline" disabled={(filters.page + 1) * filters.size >= query.data!.data.totalElements || query.isFetching} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Halaman berikutnya</Button></nav>}</>}
  </div>;
}
