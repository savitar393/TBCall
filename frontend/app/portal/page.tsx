import { PortalBoundary } from "@/features/portal/boundary";
import { PatientHome } from "@/features/portal/patient/home";
export default function Page() { return <PortalBoundary mode="patient" context="portal"><PatientHome /></PortalBoundary>; }
