import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { PatientWorklist } from "@/features/clinical-intake/components/patient-worklist";
export default function PatientsPage() { return <ClinicalBoundary permissions={["PATIENT_READ"]}><PatientWorklist /></ClinicalBoundary>; }
