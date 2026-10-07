"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { ApiFeedback } from "@/components/api-feedback";
import { clinicalApi } from "../api";
import { clinicalQueries } from "../queries";
import { canClinical } from "../permissions";
import { useClinicalCommand } from "../use-command";
import type { IdentityConfirmation, ReferenceData } from "../types";
import { patientFormSchema, patientValues, identityFormSchema, registrationFormSchema, registrationValues, type PatientValues, type IdentityValues, type RegistrationValues } from "../forms/values";
import { patientInput, registrationInput, identityInput, existingPatient } from "../forms/mappers";
import { PatientFields, IdentityFields } from "../forms/patient-fields";
import { RegistrationFields } from "../forms/registration-fields";
import { QueryState } from "./query-state";
type Confirmed = { display: IdentityConfirmation; original: IdentityValues };
export function RegistrationWizard() {
  const { user } = useSession(); const router = useRouter();
  const [step, setStep] = useState(1); const [facilityId, setFacilityId] = useState(user!.activeFacilities.length === 1 ? user!.activeFacilities[0].id : "");
  const [path, setPath] = useState<"new" | "existing">("new");
  const [newPatient, setNewPatient] = useState<PatientValues | null>(null); const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationValues | null>(null);
  const references = useQuery({ ...clinicalQueries.references(user!.id), enabled: canClinical(user, "PATIENT_READ") });
  function switchPath(next: "new" | "existing") { if (next === path) return; setPath(next); setNewPatient(null); setConfirmed(null); setRegistrationDraft(null); }
  if (!canClinical(user, "PATIENT_READ")) return <p role="alert">Izin membaca referensi klinis diperlukan untuk mengisi registrasi.</p>;
  if (!references.data) return <QueryState query={references} />;
  const ref = references.data!.data;
  return <>{references.isError && <QueryState query={references} />}<header><h1 className="text-2xl font-semibold">Registrasi baru</h1><p className="mt-2 text-sm text-muted-foreground" role="status">Langkah {step} dari 3 · {step === 1 ? "Fasilitas" : step === 2 ? "Pasien" : "Registrasi"}</p></header>
    {step === 1 && <section className="space-y-5 rounded-xl border bg-white p-5"><h2 className="font-semibold">Pilih fasilitas tugas</h2><label htmlFor="registration-facility" className="block text-sm font-medium">Fasilitas registrasi</label><select id="registration-facility" className="min-h-11 w-full rounded-lg border px-3" value={facilityId} onChange={e => setFacilityId(e.target.value)}><option value="">Pilih fasilitas…</option>{user!.activeFacilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>{!user!.activeFacilities.length && <p role="alert">Belum ada fasilitas tugas aktif.</p>}<Button disabled={!user!.activeFacilities.some(f => f.id === facilityId)} onClick={() => setStep(2)}>Lanjut ke pasien</Button></section>}
    {step === 2 && <section className="space-y-5"><h2 className="font-semibold">Pilih jalur pasien</h2><div className="flex flex-wrap gap-3"><Button variant={path === "new" ? "default" : "outline"} aria-pressed={path === "new"} onClick={() => switchPath("new")}>Pasien baru</Button>{canClinical(user, "PATIENT_IDENTITY_RESOLVE") && <Button variant={path === "existing" ? "default" : "outline"} aria-pressed={path === "existing"} onClick={() => switchPath("existing")}>Pasien sudah terdaftar</Button>}</div>
      {path === "new" ? <NewPatientForm key="new" unavailable={references.isError} references={ref} initial={newPatient ?? undefined} onContinue={v => { setNewPatient(v); setStep(3); }} /> : confirmed ? <div className="space-y-4 rounded-xl border bg-white p-5"><h3 className="font-semibold">Identitas terkonfirmasi</h3><p>{confirmed.display.fullName}</p><p>{confirmed.display.nik ?? confirmed.display.otherIdentityNumber}</p><p>{confirmed.display.bpjsNumber ?? "BPJS belum diisi"}</p><p>{confirmed.display.birthDateUnknown ? "Tanggal lahir tidak diketahui" : confirmed.display.birthDate}</p><Button onClick={() => setStep(3)}>Lanjut ke registrasi</Button><Button variant="outline" onClick={() => { setConfirmed(null); setRegistrationDraft(null); }}>Konfirmasi ulang</Button></div> : <ResolveForm key="existing" unavailable={references.isError} references={ref} onConfirm={setConfirmed} />}
      <Button variant="outline" onClick={() => { setConfirmed(null); setNewPatient(null); setRegistrationDraft(null); setStep(1); }}>Kembali ke fasilitas</Button></section>}
    {step === 3 && <CreateRegistrationForm initial={registrationDraft ?? undefined} unavailable={references.isError} references={ref} facilityId={facilityId} newPatient={path === "new" ? newPatient : null} confirmed={path === "existing" ? confirmed : null} onBack={values => { setRegistrationDraft(values); setStep(2); }} onSuccess={id => { setNewPatient(null); setConfirmed(null); setRegistrationDraft(null); router.push(`/registrations/${id}`); }} />}
  </>;
}
function NewPatientForm({ references, initial, onContinue, unavailable }: { references: ReferenceData; unavailable: boolean; initial?: PatientValues; onContinue(v: PatientValues): void }) {
  const form = useForm<PatientValues>({ resolver: zodResolver(patientFormSchema), defaultValues: initial ?? patientValues() });
  return <FormProvider {...form}><form noValidate autoComplete="off" className="space-y-5" onSubmit={form.handleSubmit(values => { if (!unavailable) onContinue(values); })}><PatientFields references={references} /><Button type="submit" disabled={unavailable}>Lanjut ke registrasi</Button></form></FormProvider>;
}
function ResolveForm({ references, onConfirm, unavailable }: { references: ReferenceData; unavailable: boolean; onConfirm(value: Confirmed): void }) {
  const command = useClinicalCommand();
  const form = useForm<IdentityValues>({ resolver: zodResolver(identityFormSchema), defaultValues: { citizenship: "WNI", nik: "", otherIdentityNumber: "", fullName: "", birthDate: "", bpjsNumber: "" } });
  return <FormProvider {...form}><form noValidate autoComplete="off" className="space-y-5" onSubmit={form.handleSubmit(async original => {
    if (unavailable) return;
    await command.run(signal => clinicalApi.resolve(identityInput(original), signal), { invalidate: false, onSuccess: result => { form.reset(); onConfirm({ display: result.data, original: { ...original } }); } });
  })}><p className="text-sm">Isi identitas utama tepat dan konfirmasi nama atau tanggal lahir. Hasil ditampilkan tersamarkan.</p><fieldset disabled={command.pending}><IdentityFields references={references} /></fieldset><ApiFeedback error={command.error} /><Button type="submit" disabled={command.pending || command.locked || unavailable}>{command.pending ? "Memeriksa…" : "Konfirmasi identitas"}</Button></form></FormProvider>;
}
function CreateRegistrationForm({ references, facilityId, newPatient, confirmed, onBack, onSuccess, initial, unavailable }: { references: ReferenceData; initial?: RegistrationValues; unavailable: boolean; facilityId: string; newPatient: PatientValues | null; confirmed: Confirmed | null; onBack(values: RegistrationValues): void; onSuccess(id: string): void }) {
  const { user } = useSession(); const command = useClinicalCommand();
  const form = useForm<RegistrationValues>({ resolver: zodResolver(registrationFormSchema), defaultValues: initial ?? registrationValues() });
  return <FormProvider {...form}><form noValidate autoComplete="off" className="space-y-5" onSubmit={form.handleSubmit(async values => {
    if (unavailable || !user!.activeFacilities.some(f => f.id === facilityId) || (!newPatient && !confirmed)) return;
    await command.run(signal => clinicalApi.createRegistration({ facilityId, ...registrationInput(values), ...(newPatient ? { newPatient: patientInput(newPatient) } : { existingPatient: existingPatient(confirmed!.original, confirmed!.display.patientId) }) }, signal), { onSuccess: result => { form.reset(); onSuccess(result.data.id); } });
  })}><p className="text-sm">Fasilitas: {user!.activeFacilities.find(f => f.id === facilityId)?.name}</p><fieldset disabled={command.pending || command.locked}><RegistrationFields references={references} /></fieldset><ApiFeedback error={command.error} /><div className="flex flex-wrap gap-3"><Button type="submit" disabled={command.pending || command.locked || command.reviewRequired || unavailable}>Simpan registrasi</Button><Button type="button" variant="outline" onClick={() => onBack(form.getValues())} disabled={command.pending}>Kembali ke pasien</Button></div></form></FormProvider>;
}
