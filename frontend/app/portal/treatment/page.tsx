import { PortalBoundary } from "@/features/portal/boundary";
import { PatientTreatment } from "@/features/portal/patient/treatment";
export default function Page() { return <PortalBoundary mode="patient" context="portal/treatment" permission="TREATMENT_READ" requireLink><PatientTreatment /></PortalBoundary>; }
