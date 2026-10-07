import { TreatmentBoundary } from "@/features/treatment/components/treatment-boundary";
import { TreatmentDetail } from "@/features/treatment/components/treatment-detail";
export default async function TreatmentPage({params}:{params:Promise<{treatmentId:string}>}){const {treatmentId}=await params;return <TreatmentBoundary><TreatmentDetail id={treatmentId}/></TreatmentBoundary>;}
