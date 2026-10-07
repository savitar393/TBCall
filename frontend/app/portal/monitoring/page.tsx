import { PortalBoundary } from "@/features/portal/boundary";
import { PatientMonitoring } from "@/features/portal/patient/monitoring";
export default function Page() { return <PortalBoundary mode="patient" context="portal/monitoring" permission="MONITORING_READ" requireLink><PatientMonitoring /></PortalBoundary>; }
