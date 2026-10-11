"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "@/lib/validation";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { AppPageHeader, AppSection, AppState, AppStatusBadge } from "@/components/application-patterns";
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
  return <article className="clinical-workspace">
    <AppPageHeader title="Daftar pasien" eyebrow="Ruang kerja klinis" description="Registrasi terbuka dan kasus aktif atau dirujuk dalam cakupan fasilitas Anda." actions={<>{canClinical(user, "CASE_READ") && <Button asChild variant="outline"><Link href="/cases/history">Riwayat kasus selesai</Link></Button>}{canClinical(user, "PATIENT_CREATE", "REGISTRATION_WRITE") && <Button asChild><Link href="/intake/new">Registrasi baru</Link></Button>}</>} />
    {references.isPending || references.isError ? <QueryState query={references} /> : <AppSection title="Filter pasien" className="clinical-filter-panel" description="Cari pasien, lalu batasi hasil berdasarkan status dan fasilitas."><FormProvider {...form}><form noValidate autoComplete="off" className="space-y-4" onSubmit={form.handleSubmit(values => setFilters({ ...values, name: values.name.trim(), bpjs: values.bpjs.trim(), page: 0, size: Number(values.size) }))}>
      <div className="clinical-filter-grid">
        <div className="sm:col-span-2"><Field name="name" label="Cari nama" /></div><Field name="nik" label="Cari NIK" /><Field name="bpjs" label="Cari BPJS" />
        <Field name="registrationStatus" label="Status registrasi" options={references.data!.data.registrationStatusFilters} />
        <Field name="caseStatus" label="Status kasus" options={references.data!.data.caseStatusFilters} />
        <Field name="facilityId" label="Fasilitas terdaftar" options={user!.activeFacilities.map(f => ({ code: f.id, name: f.name }))} />
        <Field name="size" label="Ukuran halaman" type="number" />
      </div><div className="flex flex-wrap gap-3"><Button type="submit">Terapkan filter</Button><Button variant="outline" type="button" onClick={() => { form.reset(defaults); setFilters(initial); }}>Hapus filter</Button></div>
    </form></FormProvider></AppSection>}
    {patients.isPending ? <AppState kind="loading" title="Memuat daftar pasien…" /> : patients.isError ? <QueryState query={patients} /> : <AppSection title="Hasil daftar pasien" className="clinical-section">
      <p role="status" className="text-sm">{patients.data!.data.totalElements} pasien · Halaman {filters.page + 1}</p>
      {patients.data!.data.content.length === 0 && <AppState kind="empty" title="Tidak ada pasien yang sesuai.">Periksa nama atau hapus filter untuk melihat kembali daftar pasien.</AppState>}
      <ul className="clinical-record-list">{patients.data!.data.content.map(patient => <li key={patient.patientId} className="clinical-record-row">
        <div className="clinical-record-main">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold">{patient.fullName}</h3><p className="mt-1 text-sm text-muted-foreground">{patient.sex?.name ?? "Jenis kelamin belum diisi"} · {patient.birthDateUnknown ? "Tanggal lahir tidak diketahui" : patient.birthDate ?? "Tanggal lahir belum diisi"}</p></div><Button asChild variant="outline"><Link aria-label={`Buka pasien ${patient.fullName}`} href={`/patients/${patient.patientId}`}>Buka pasien</Link></Button></div>
          <dl className="clinical-context-meta text-xs"><div><dt>NIK (tersamarkan)</dt><dd className="clinical-identifier">{patient.nik ?? "—"}</dd></div><div><dt>BPJS (tersamarkan)</dt><dd className="clinical-identifier">{patient.bpjsNumber ?? "—"}</dd></div></dl>
          <ul className="mt-4 space-y-3 text-sm">{patient.registrations.map(r => <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className="font-medium">Registrasi · {r.registrationDate}</span><span className="text-muted-foreground">{r.facility.name}</span><AppStatusBadge tone={r.status === "OPEN" ? "active" : "neutral"}>{references.data?.data.registrationStatusFilters.find(o => o.code === r.status)?.name ?? r.status}</AppStatusBadge>{canClinical(user, "REGISTRATION_READ") && <Link className="text-primary underline" href={`/registrations/${r.id}`}>Buka registrasi</Link>}</li>)}{patient.cases.map(c => <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className="font-medium">{c.caseCategory?.name ?? "Kasus TBC"}</span><span className="text-muted-foreground">{c.currentFacility.name}</span><AppStatusBadge tone={c.status === "ACTIVE" ? "active" : c.status === "REFERRED" ? "warning" : "neutral"}>{references.data?.data.caseStatusFilters.find(o => o.code === c.status)?.name ?? c.status}</AppStatusBadge>{canClinical(user, "CASE_READ") && <Link className="text-primary underline" href={`/cases/${c.id}`}>Buka kasus</Link>}</li>)}</ul>
        </div>
      </li>)}</ul>
      {(filters.page>0||patients.data!.data.totalElements>filters.size)&&<div className="flex flex-wrap gap-3"><Button variant="outline" aria-label="Halaman sebelumnya" disabled={filters.page === 0 || patients.isFetching} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Sebelumnya</Button><Button variant="outline" aria-label="Halaman berikutnya" disabled={(filters.page + 1) * filters.size >= patients.data!.data.totalElements || patients.isFetching} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Berikutnya</Button></div>}
    </AppSection>}
  </article>;
}
