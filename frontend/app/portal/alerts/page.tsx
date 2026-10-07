import { PortalBoundary } from "@/features/portal/boundary";
import { PatientAlerts } from "@/features/portal/patient/alerts";
export default function Page() { return <PortalBoundary mode="patient" context="portal/alerts" permission="ALERT_READ" requireLink><PatientAlerts /></PortalBoundary>; }
