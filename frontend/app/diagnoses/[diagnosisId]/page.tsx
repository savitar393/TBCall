import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { DiagnosisDetail } from "@/features/clinical-intake/components/diagnosis-detail";
export default async function DiagnosisPage({ params }: { params: Promise<{ diagnosisId: string }> }) { const { diagnosisId } = await params; return <ClinicalBoundary permissions={["DIAGNOSIS_READ"]}><DiagnosisDetail id={diagnosisId} /></ClinicalBoundary>; }
