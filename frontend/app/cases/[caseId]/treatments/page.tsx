import { TreatmentBoundary } from "@/features/treatment/components/treatment-boundary";
import { CaseTreatments } from "@/features/treatment/components/case-treatments";
export default async function CaseTreatmentsPage({params}:{params:Promise<{caseId:string}>}){const {caseId}=await params;return <TreatmentBoundary><CaseTreatments id={caseId}/></TreatmentBoundary>;}
