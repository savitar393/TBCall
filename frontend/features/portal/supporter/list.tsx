"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { card, PortalState } from "../display";
export function SupportingCases() { const { user } = useSession(); return <><h1 className="text-2xl font-semibold">Pendampingan</h1>{!user!.supporterCaseIds.length ? <p>Belum ada kasus pendampingan yang terhubung.</p> : <section className="grid gap-4 sm:grid-cols-2">{user!.supporterCaseIds.map((id, i) => <article key={id} className={card}><Link href={`/supporting-cases/${encodeURIComponent(id)}`} className="font-semibold">Buka pendampingan {i + 1}</Link>{user!.permissions.includes("TREATMENT_READ") && <CaseSummary caseId={id}/>}</article>)}</section>}</>; }
function CaseSummary({ caseId }: {
    caseId: string;
}) { const { user } = useSession(), query = useQuery(portalQueries.supporterTreatment(user!.id, caseId)); return query.isPending || query.error ? <PortalState query={query}/> : query.data?.data ? <div><p>{query.data.data.patientDisplayName}</p><p>{query.data.data.regimen?.name ?? "Regimen belum tercatat"}</p></div> : <p>Belum ada catatan pengobatan untuk pendampingan ini.</p>; }
