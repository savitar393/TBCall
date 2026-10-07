import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { PatientDetail } from "@/features/clinical-intake/components/patient-detail";
export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) { const { patientId } = await params; return <ClinicalBoundary permissions={["PATIENT_READ"]}><PatientDetail id={patientId} /></ClinicalBoundary>; }
