import { PortalBoundary } from "@/features/portal/boundary";
import { PatientTpt } from "@/features/portal/patient/tpt";
export default function Page() { return <PortalBoundary mode="patient" context="portal/tpt" permission="TPT_READ" requireLink><PatientTpt /></PortalBoundary>; }
