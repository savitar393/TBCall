"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppDisclosure, AppPageHeader, AppSection } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { Fields, PortalState } from "../display";
import { label, usePortalReferences } from "../references";
import { TreatmentFields } from "../patient/treatment";
import { DoseEvidence } from "../patient/dose-evidence";
import { SafeMonitoring } from "../patient/monitoring";
import { MedicationAgenda, useMedicationCalendar } from "../patient/medication-agenda";
import { EventCard } from "../patient/calendar-view";
import { SafeAlerts } from "../patient/alerts";
export function SupportingCase({ caseId }: { caseId: string }) {
  const { user } = useSession(), permissions = user!.permissions, query = useQuery({ ...portalQueries.supporterTreatment(user!.id, caseId), enabled: permissions.includes("TREATMENT_READ") }), t = query.data?.data, target = { kind: "supporter" as const, caseId };
  const calendar = useMedicationCalendar(user!.id, permissions.includes("TREATMENT_READ"), null, "week", caseId);
  return <div className="clinical-workspace"><AppPageHeader title="Pendampingan kasus" actions={<Link href="/supporting-cases" className="text-primary underline">Daftar pendampingan</Link>}/>
    {permissions.includes("TREATMENT_READ") && (query.isPending || query.error ? <PortalState query={query}/> : !t ? <p>Belum ada catatan pengobatan untuk pendampingan ini.</p> : <>
      <section className="clinical-context" aria-label="Pasien pendampingan"><h2>{t.patientDisplayName}</h2></section>
      <TreatmentFields treatment={t}/>
      {permissions.includes("ADHERENCE_READ") && t.adherenceSummary && <RecordedReports summary={t.adherenceSummary}/>}
    </>)}
    {permissions.includes("TREATMENT_READ") && <><MedicationAgenda calendar={calendar} enabled/><div className="grid gap-3 sm:grid-cols-2">{calendar.events.map(event => <EventCard key={event.key} event={event} link={false}/>)}</div></>}
    {(permissions.includes("ADHERENCE_READ") || permissions.includes("ADHERENCE_RECORD")) && <DoseEvidence target={target} active={t?.status === "ACTIVE"} startDate={t?.startDate}/>}
    {permissions.includes("MONITORING_READ") && <SafeMonitoring target={target}/>}
    {permissions.includes("ALERT_READ") && <SafeAlerts target={target}/>}
  </div>;
}
function RecordedReports({ summary }: { summary: { totalReports: number; reportsByStatus: Record<string, number> } }) {
  const refs = usePortalReferences(), statuses = [...(refs.data?.data.supporterDoseStatuses ?? []), ...(refs.data?.data.patientDoseStatuses ?? [])];
  return <AppSection title="Jumlah laporan bukti dosis">
    <p className="text-sm text-muted-foreground">Hitungan laporan tercatat</p><p className="text-2xl font-semibold">{summary.totalReports}</p>
    <AppDisclosure title="Jumlah per status laporan"><Fields items={Object.fromEntries(Object.entries(summary.reportsByStatus).map(([status, count]) => [label(statuses, status), count]))}/></AppDisclosure>
  </AppSection>;
}
