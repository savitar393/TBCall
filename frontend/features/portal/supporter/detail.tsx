"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { card, Fields, PortalState } from "../display";
import { TreatmentFields } from "../patient/treatment";
import { DoseEvidence } from "../patient/dose-evidence";
import { SafeMonitoring } from "../patient/monitoring";
import { SafeAlerts } from "../patient/alerts";
export function SupportingCase({ caseId }: {
    caseId: string;
}) {
    const { user } = useSession(), permissions = user!.permissions, query = useQuery({ ...portalQueries.supporterTreatment(user!.id, caseId), enabled: permissions.includes("TREATMENT_READ") }), t = query.data?.data, target = { kind: "supporter" as const, caseId };
    return <><h1 className="text-2xl font-semibold">Pendampingan kasus</h1>
    {permissions.includes("TREATMENT_READ") && (query.isPending || query.error ? <PortalState query={query}/> : !t ? <p>Belum ada catatan pengobatan untuk pendampingan ini.</p> : <><section className={card}><h2 className="font-semibold">{t.patientDisplayName}</h2></section><TreatmentFields treatment={t}/>{permissions.includes("ADHERENCE_READ") && t.adherenceSummary && <section className={card}><h2>Jumlah laporan bukti dosis</h2><p>Jumlah laporan bukti dosis, bukan skor kepatuhan.</p><Fields items={{ "Total laporan": t.adherenceSummary.totalReports, ...t.adherenceSummary.reportsByStatus }}/></section>}</>)}
    {(permissions.includes("ADHERENCE_READ") || permissions.includes("ADHERENCE_RECORD")) && <DoseEvidence target={target} active={t?.status === "ACTIVE"} startDate={t?.startDate}/>}
    {permissions.includes("MONITORING_READ") && <SafeMonitoring target={target}/>}
    {permissions.includes("ALERT_READ") && <SafeAlerts target={target}/>}
  </>;
}
