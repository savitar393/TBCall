"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { usePortalReferences, label } from "../references";
import { card, Fields, PortalState, Refresh } from "../display";
import { DoseEvidence } from "./dose-evidence";
import type { PatientTreatment as PatientTreatmentData, SupporterTreatment } from "../types";
export function TreatmentFields({ treatment }: {
    treatment: PatientTreatmentData | SupporterTreatment;
}) {
    const refs = usePortalReferences();
    return <section className={card}><Fields items={{ Status: label(refs.data?.data.treatmentStatuses, treatment.status), Regimen: treatment.regimen?.name, "Tanggal mulai": treatment.startDate, "Rencana akhir": treatment.plannedEndDate, ...("actualEndDate" in treatment ? { "Tanggal akhir": treatment.actualEndDate } : {}) }}/>
    <h2 className="font-semibold">Obat sesuai catatan</h2>{!treatment.drugs.length && <p>Belum ada rincian obat.</p>}{treatment.drugs.map((d, i) => <Fields key={i} items={{ Obat: d.drugName, Fase: d.treatmentPhase, "Dosis tercatat": d.doseValue, Satuan: d.doseUnit, "Frekuensi tercatat per minggu": d.frequencyPerWeek, "Tanggal mulai": d.startDate, "Tanggal akhir": d.endDate }}/>)}
    {"outcome" in treatment && treatment.outcome && <><h2 className="font-semibold">Hasil sesuai catatan petugas</h2><Fields items={{ Hasil: treatment.outcome.outcomeName, Tanggal: treatment.outcome.outcomeDate }}/></>}
    {"adverseEvents" in treatment && treatment.adverseEvents.length > 0 && <><h2 className="font-semibold">Kejadian sesuai catatan</h2>{treatment.adverseEvents.map((a, i) => <Fields key={i} items={{ Jenis: a.eventType, Keparahan: a.severity, Serius: a.serious ? "Ya" : "Tidak", "Dilaporkan pada": a.reportedAt, Dimulai: a.startedAt, Berakhir: a.endedAt }}/>)}</>}
  </section>;
}
export function PatientTreatment() {
    const { user } = useSession(), query = useQuery(portalQueries.treatment(user!.id));
    const t = query.data?.data;
    return <><h1 className="text-2xl font-semibold">Pengobatan Saya</h1><Refresh onClick={() => query.refetch()}/>
    {query.isPending || query.error ? <PortalState query={query}/> : !t ? <p>Belum ada catatan pengobatan.</p> : <TreatmentFields treatment={t}/>}
    {t && (user!.permissions.includes("ADHERENCE_READ") || user!.permissions.includes("ADHERENCE_RECORD")) && <DoseEvidence target={{ kind: "patient" }} active={t.status === "ACTIVE"} startDate={t.startDate}/>}
    {user!.permissions.includes("FOLLOW_UP_READ") && <FollowUps />}
  </>;
}
function FollowUps() {
    const { user } = useSession(), query = useQuery(portalQueries.followUps(user!.id)), refs = usePortalReferences();
    return <section className={card}><h2 className="font-semibold">Tindak lanjut Saya</h2>{!query.data ? <PortalState query={query}/> : <>{!query.data.data.length && <p>Belum ada tindak lanjut.</p>}{query.data.data.map(f => <Fields key={f.id} items={{ Jenis: f.followUpType, Status: label(refs.data?.data.followUpStatuses, f.status), Jadwal: f.scheduledAt, Selesai: f.completedAt, Fasilitas: f.facility?.name }}/>)}</>}</section>;
}
