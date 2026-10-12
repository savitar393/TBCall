"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { PortalState } from "../display";
import { label, usePortalReferences } from "../references";

export function SupportingCases() {
  const { user } = useSession();
  return <div className="clinical-workspace">
    <AppPageHeader title="Pendampingan"/>
    <AppSection title="Kasus terhubung">
      {!user!.supporterCaseIds.length ? <p>Belum ada kasus pendampingan yang terhubung.</p> : <ul className="clinical-record-list">
        {user!.supporterCaseIds.map((id, i) => <li key={id} className="clinical-record-row">
          {user!.permissions.includes("TREATMENT_READ") && <CaseSummary caseId={id}/>}
          <div className="clinical-record-actions"><Link href={`/supporting-cases/${encodeURIComponent(id)}`} className="font-semibold text-primary underline">Buka pendampingan {i + 1}</Link></div>
        </li>)}
      </ul>}
    </AppSection>
  </div>;
}
function CaseSummary({ caseId }: { caseId: string }) {
  const { user } = useSession(), query = useQuery(portalQueries.supporterTreatment(user!.id, caseId)), refs = usePortalReferences();
  const treatment = query.data?.data;
  return query.isPending || query.error ? <PortalState query={query}/> : treatment ? <div className="clinical-record-main">
    <div className="clinical-context-heading"><h2 className="font-semibold">{treatment.patientDisplayName}</h2><AppStatusBadge>{label(refs.data?.data.treatmentStatuses, treatment.status)}</AppStatusBadge></div>
    <p>{treatment.regimen?.name ?? "Regimen belum tercatat"}</p>
  </div> : <p>Belum ada catatan pengobatan untuk pendampingan ini.</p>;
}
