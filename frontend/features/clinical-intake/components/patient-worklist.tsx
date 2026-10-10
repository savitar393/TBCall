"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { clinicalQueries } from "../queries";
import { canClinical } from "../permissions";
import type { PatientFilters } from "../types";
import { filtersSchema } from "../forms/values";
import { Field } from "../forms/fields";
import { QueryState } from "./query-state";
const defaults = { name: "", nik: "", bpjs: "", registrationStatus: "", caseStatus: "", facilityId: "", size: "20" };
const initial: PatientFilters = { ...defaults, size: 20, page: 0 };
export function PatientWorklist() {
  const { user } = useSession();
  const [filters, setFilters] = useState(initial);
  const form = useForm<z.infer<typeof filtersSchema>>({ resolver: zodResolver(filtersSchema), defaultValues: defaults });
  const references = useQuery(clinicalQueries.references(user!.id));
  const patients = useQuery(clinicalQueries.patients(user!.id, filters));
  return <>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Daftar pasien</h1><p className="mt-2 text-sm text-muted-foreground">Registrasi terbuka dan kasus aktif atau dirujuk dalam cakupan fasilitas Anda.</p></div><div className="flex flex-wrap gap-3">{canClinical(user, "CASE_READ") && <Button asChild variant="outline"><Link href="/cases/history">Riwayat kasus selesai</Link></Button>}{canClinical(user, "PATIENT_CREATE", "REGISTRATION_WRITE") && <Button asChild><Link href="/intake/new">Registrasi baru</Link></Button>}</div></header>
    {references.isPending || references.isError ? <QueryState query={references} /> : <FormProvider {...form}><form noValidate autoComplete="off" className="space-y-4 rounded-xl border bg-white p-5" onSubmit={form.handleSubmit(values => setFilters({ ...values, name: values.name.trim(), bpjs: values.bpjs.trim(), page: 0, size: Number(values.size) }))}>
      <h2 className="font-semibold">Filter pasien</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field name="name" label="Cari nama" /><Field name="nik" label="Cari NIK" /><Field name="bpjs" label="Cari BPJS" />
        <Field name="registrationStatus" label="Status registrasi" options={references.data!.data.registrationStatusFilters} />
        <Field name="caseStatus" label="Status kasus" options={references.data!.data.caseStatusFilters} />
        <Field name="facilityId" label="Fasilitas terdaftar" options={user!.activeFacilities.map(f => ({ code: f.id, name: f.name }))} />
        <Field name="size" label="Ukuran halaman" type="number" />
      </div><div className="flex flex-wrap gap-3"><Button type="submit">Terapkan filter</Button><Button variant="outline" type="button" onClick={() => { form.reset(defaults); setFilters(initial); }}>Hapus filter</Button></div>
    </form></FormProvider>}
    {patients.isPending || patients.isError ? <QueryState query={patients} /> : <section aria-label="Hasil daftar pasien" className="space-y-4">
      <p role="status" className="text-sm">{patients.data!.data.totalElements} pasien · Halaman {filters.page + 1}</p>
      {patients.data!.data.content.length === 0 && <p>Tidak ada pasien yang sesuai.</p>}
      <div className="grid gap-4 md:grid-cols-2">{patients.data!.data.content.map(patient => <Card key={patient.patientId}><CardContent className="space-y-4 pt-5">
        <h2 className="font-semibold">{patient.fullName}</h2><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Jenis kelamin</dt><dd>{patient.sex?.name ?? "Belum diisi"}</dd><dt>Tanggal lahir</dt><dd>{patient.birthDateUnknown ? "Tidak diketahui" : patient.birthDate ?? "Belum diisi"}</dd><dt>NIK (tersamarkan)</dt><dd className="break-all">{patient.nik ?? "—"}</dd><dt>BPJS (tersamarkan)</dt><dd className="break-all">{patient.bpjsNumber ?? "—"}</dd></dl>
        <Link className="inline-block text-primary underline" aria-label={`Buka pasien ${patient.fullName}`} href={`/patients/${patient.patientId}`}>Buka pasien</Link>
        <ul className="space-y-2 text-sm">{patient.registrations.map(r => <li key={r.id}>{r.registrationDate} · {r.facility.name} · {references.data?.data.registrationStatusFilters.find(o => o.code === r.status)?.name ?? r.status} {canClinical(user, "REGISTRATION_READ") && <Link className="text-primary underline" href={`/registrations/${r.id}`}>Buka registrasi</Link>}</li>)}{patient.cases.map(c => <li key={c.id}>{c.caseCategory?.name ?? "Kasus TBC"} · {c.currentFacility.name} · {references.data?.data.caseStatusFilters.find(o => o.code === c.status)?.name ?? c.status} {canClinical(user, "CASE_READ") && <Link className="text-primary underline" href={`/cases/${c.id}`}>Buka kasus</Link>}</li>)}</ul>
      </CardContent></Card>)}</div>
      <div className="flex gap-3"><Button variant="outline" aria-label="Halaman sebelumnya" disabled={filters.page === 0 || patients.isFetching} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Sebelumnya</Button><Button variant="outline" aria-label="Halaman berikutnya" disabled={(filters.page + 1) * filters.size >= patients.data!.data.totalElements || patients.isFetching} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Berikutnya</Button></div>
    </section>}
  </>;
}
