import { PortalBoundary } from "@/features/portal/boundary";
import { PatientCalendar } from "@/features/portal/patient/calendar";
export default function Page() { return <PortalBoundary mode="patient" context="calendar"><PatientCalendar/></PortalBoundary>; }
