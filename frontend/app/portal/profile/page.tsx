import { PortalBoundary } from "@/features/portal/boundary";
import { PatientProfile } from "@/features/portal/patient/profile";
export default function Page() { return <PortalBoundary mode="patient" context="profile"><PatientProfile/></PortalBoundary>; }
