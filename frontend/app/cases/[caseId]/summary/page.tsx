import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { CaseSummary } from "@/features/case-summary/case-summary";
export default async function SummaryPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <ClinicalBoundary permissions={["CASE_READ"]}><CaseSummary key={caseId} id={caseId} /></ClinicalBoundary>;
}
