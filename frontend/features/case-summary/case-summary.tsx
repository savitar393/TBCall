"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { canClinical } from "@/features/clinical-intake/permissions";
import { QueryState } from "@/features/clinical-intake/components/query-state";
import { DisplayFields } from "@/features/clinical-intake/components/record-display";
import { summaryQuery, type SummaryPages } from "./queries";

type State = "AVAILABLE" | "PERMISSION_DENIED" | "OUT_OF_SCOPE";
function Access({ state, permitted, children }: { state: State; permitted: boolean; children: ReactNode }) {
  if (!permitted || state === "PERMISSION_DENIED") return <p>Konten memerlukan izin baca tersendiri.</p>;
  if (state === "OUT_OF_SCOPE") return <p>Konten tidak tersedia dalam cakupan akses Anda.</p>;
  return <>{children}</>;
}
function More({ more }: { more: boolean }) { return more ? <p className="text-sm text-muted-foreground">Ringkasan dibatasi; masih ada rekaman yang tidak ditampilkan. Layar detail tetap mengikuti batas dan izin bacanya sendiri.</p> : null; }
function Paging({ page, total, label, fetching, change }: { page: number; total: number; label: string; fetching: boolean; change(value: number): void }) {
  return <div className="flex flex-wrap items-center gap-3"><span className="text-sm">Halaman {page + 1} · {total} rekaman dalam cakupan akses</span><Button variant="outline" aria-label={`Sebelumnya ${label}`} disabled={fetching || page === 0} onClick={() => change(page - 1)}>Sebelumnya</Button><Button variant="outline" aria-label={`Berikutnya ${label}`} disabled={fetching || (page + 1) * 5 >= total} onClick={() => change(page + 1)}>Berikutnya</Button></div>;
}
const sourceMeaning: Record<string, string> = { HEALTH_WORKER: "Dicatat tenaga kesehatan", PATIENT: "Laporan pasien", TREATMENT_SUPPORTER: "Laporan pendamping", SYSTEM: "Catatan sistem" };
export function CaseSummary({ id }: { id: string }) {
  const { user } = useSession();
  const [pages, setPages] = useState<SummaryPages>({ diagnosisPage: 0, labPage: 0, treatmentPage: 0 });
  const query = useQuery(summaryQuery(user!.id, id, pages));
  if (query.isError || !query.data) return <section aria-label="Status ringkasan"><QueryState query={query} /></section>;
  const s = query.data, can = (...permissions: string[]) => canClinical(user, ...permissions);
  const change = (key: keyof SummaryPages) => (page: number) => setPages(p => ({ ...p, [key]: page }));
  const treatments = can("TREATMENT_READ") && s.treatments.state === "AVAILABLE" ? s.treatments.data : null;
  return <div className="space-y-6">
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Ringkasan kasus</h1><p className="font-semibold">{s.fullName}</p><p>Status kasus: {s.status} · {s.caseCategoryCode ?? "—"} · {s.currentFacility.name}</p>{s.confirmedAt && <p>Dikonfirmasi: {new Date(s.confirmedAt).toLocaleString("id-ID")}</p>}<p className="text-sm text-muted-foreground">Data episode yang tersimpan. Ringkasan ini tidak menetapkan diagnosis, kepatuhan, atau kesembuhan dan tidak mengubah kewenangan sumber data.</p><Link href={`/cases/${id}`} className="text-primary underline">Buka detail kasus</Link>{s.status === "COMPLETED" && <Link href="/cases/history" className="ml-4 text-primary underline">Riwayat kasus selesai</Link>}</header>
    <section aria-label="Registrasi dan diagnosis" className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Registrasi dan diagnosis</h2>
      <Access state={s.registration.state} permitted={can("REGISTRATION_READ")}>{s.registration.state === "AVAILABLE" && <div><p>{s.registration.data.registrationDate} · {s.registration.data.status} · {s.registration.data.facility.name}</p><Link href={`/registrations/${s.registration.data.id}`} className="text-primary underline">Buka registrasi</Link></div>}</Access>
      <Access state={s.diagnoses.state} permitted={can("DIAGNOSIS_READ")}>{s.diagnoses.state === "AVAILABLE" && <>
        {!s.diagnoses.data.content.length && <p>Belum ada diagnosis tercatat dalam cakupan akses.</p>}
        {s.diagnoses.data.content.map(d => <article key={d.id} className="space-y-2 border-t pt-3"><h3 className="font-semibold">Diagnosis {d.diagnosisDate}{d.confirming ? " · Diagnosis konfirmasi kasus" : ""}</h3><DisplayFields values={[["Lokasi anatomis", d.anatomicalSiteCode], ["Jenis diagnosis", d.diagnosisTypeCode], ["Hasil yang dicatat", d.diagnosisResult], ["Disposisi pengobatan", d.treatmentDisposition]]} /><Link href={`/diagnoses/${d.id}`} className="text-primary underline">Buka diagnosis</Link></article>)}
        <Paging page={pages.diagnosisPage} total={s.diagnoses.data.totalElements} label="diagnosis" fetching={query.isFetching} change={change("diagnosisPage")} />
      </>}</Access>
    </section>
    <section aria-label="Pemeriksaan laboratorium" className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Pemeriksaan laboratorium</h2><p className="text-sm">Permintaan terkait registrasi atau kasus ini. Hasil tidak dihubungkan otomatis dengan diagnosis.</p>
      <Access state={s.laboratory.state} permitted={can("LAB_REQUEST_READ", "LAB_RESULT_READ")}>{s.laboratory.state === "AVAILABLE" && <>
        {!s.laboratory.data.content.length && <p>Belum ada permintaan yang dapat dibaca dalam cakupan akses.</p>}
        {s.laboratory.data.content.map(r => <article key={r.id} className="space-y-3 border-t pt-3"><h3 className="font-semibold">{r.requestReasonCode ?? "Alasan belum tercatat"} · {r.status} · {r.ownerType}</h3><p>{r.requestingFacility.name} → {r.testingFacility.name} · {r.requestedAt ? new Date(r.requestedAt).toLocaleString("id-ID") : "Waktu belum tercatat"}</p><Link href={`/laboratory/requests/${r.id}`} className="text-primary underline">Buka permintaan laboratorium</Link>
          {!r.results.content.length && <p>Belum ada hasil dilaporkan.</p>}{r.results.content.map(v => <div key={v.id} className="space-y-2 rounded-lg border p-3"><h4>{v.testTypeCode} · {v.status === "CORRECTED" ? "Hasil koreksi" : "Hasil asli (FINAL)"} · Urutan {v.sequenceNo}</h4><p>{v.latest ? "Versi terbaru pada silsilah pemeriksaan/spesimen" : "Versi historis, bukan versi terbaru"} · {v.status}</p><p>Diperiksa: {v.testedAt ? new Date(v.testedAt).toLocaleString("id-ID") : "Waktu belum tercatat"}</p><DisplayFields values={[["Kode", v.resultCode], ["Nilai", v.resultValue], ["Narasi tercatat", v.resultText]]} /></div>)}<More more={r.results.hasMore} />
        </article>)}<Paging page={pages.labPage} total={s.laboratory.data.totalElements} label="laboratorium" fetching={query.isFetching} change={change("labPage")} />
      </>}</Access>
    </section>
    <section aria-label="Pengobatan dan bukti obat" className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Pengobatan dan bukti obat</h2>
      <Access state={s.treatments.state} permitted={can("TREATMENT_READ")}>{treatments && <>
        {!treatments.content.length && <p>Belum ada episode pengobatan yang dapat dibaca.</p>}
        {treatments.content.map(t => <article key={t.id} className="space-y-3 border-t pt-3"><h3 className="font-semibold">Episode {t.startDate} · {t.status}</h3><p>{t.facility.name} · {t.regimenName ?? "Paduan belum tercatat"}</p><p>Akhir rencana: {t.plannedEndDate ?? "—"} · Akhir aktual: {t.actualEndDate ?? "—"}</p><Link href={`/treatments/${t.id}`} className="text-primary underline">Buka pengobatan</Link>
          <h4 className="font-semibold">Snapshot obat yang dicatat</h4>{!t.drugs.content.length && <p>Belum ada snapshot obat.</p>}{t.drugs.content.map((d, index) => <div key={index} className="rounded-lg border p-3"><p>{d.drugName ?? "Nama snapshot belum tercatat"} · {d.treatmentPhase ?? "—"}</p><p>Dosis tercatat: {d.doseValue ?? "—"} {d.doseUnit ?? ""} · Frekuensi/minggu: {d.frequencyPerWeek ?? "—"}</p><p>{d.startDate ?? "Tanggal mulai belum tercatat"} – {d.endDate ?? "—"}</p></div>)}<More more={t.drugs.hasMore} />
          <h4 className="font-semibold">Bukti dosis terbaru yang dicatat</h4><Access state={t.doses.state} permitted={can("ADHERENCE_READ")}>{t.doses.state === "AVAILABLE" && <>{!t.doses.data.content.length && <p>Belum ada bukti dosis tercatat.</p>}{t.doses.data.content.map(d => <p key={d.id}>{d.scheduledDate} · {d.status} · {d.administrationMode ?? "—"} · {sourceMeaning[d.source] ?? "Sumber tercatat"} ({d.source}) · Dicatat {d.recordedAt ? new Date(d.recordedAt).toLocaleString("id-ID") : "Waktu belum tercatat"}</p>)}<More more={t.doses.data.hasMore} /></>}</Access>
        </article>)}<Paging page={pages.treatmentPage} total={treatments.totalElements} label="pengobatan" fetching={query.isFetching} change={change("treatmentPage")} />
      </>}</Access>
    </section>
    <section aria-label="Tindak lanjut dan hasil akhir" className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Tindak lanjut dan hasil akhir</h2><p className="text-sm">Penutupan kasus bukan penetapan kesembuhan. Hasil akhir hanya ditampilkan bila telah dicatat secara eksplisit.</p>
      <Access state={s.treatments.state} permitted={can("TREATMENT_READ")}>{treatments && <>{!treatments.content.length && <p>Belum ada episode pengobatan yang dapat dibaca.</p>}{treatments.content.map(t => <article key={t.id} className="space-y-3 border-t pt-3"><h3 className="font-semibold">Episode {t.startDate} · {t.status}</h3>
        <h4 className="font-semibold">Tindak lanjut terbaru</h4><Access state={t.followUps.state} permitted={can("FOLLOW_UP_READ")}>{t.followUps.state === "AVAILABLE" && <>{!t.followUps.data.content.length && <p>Belum ada tindak lanjut tercatat.</p>}{t.followUps.data.content.map(f => <div key={f.id} className="space-y-2 rounded-lg border p-3"><p>{f.followUpType} · {f.status} · {f.facility?.name ?? "—"}</p><p>Jadwal: {new Date(f.scheduledAt).toLocaleString("id-ID")} · Selesai: {f.completedAt ? new Date(f.completedAt).toLocaleString("id-ID") : "Belum selesai"}</p><DisplayFields values={[["Berat tercatat (kg)", f.weightKg], ["Gejala tercatat", f.symptomSummary], ["Penilaian kepatuhan tercatat", f.adherenceAssessment]]} /></div>)}<More more={t.followUps.data.hasMore} /></>}</Access>
        <h4 className="font-semibold">Hasil akhir eksplisit</h4><Access state={t.outcome.state} permitted={can("OUTCOME_READ")}>{t.outcome.state === "AVAILABLE" && (t.outcome.data ? <p>{t.outcome.data.outcomeName} ({t.outcome.data.outcomeCode}) · {t.outcome.data.outcomeDate}</p> : <p>Belum ada hasil akhir tercatat.</p>)}</Access>
      </article>)}</>}</Access>
    </section>
  </div>;
}
