import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { CaseDetail } from "@/features/clinical-intake/components/case-detail";
export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) { const { caseId } = await params; return <ClinicalBoundary permissions={["CASE_READ"]}><CaseDetail id={caseId} /></ClinicalBoundary>; }
