import { PortalBoundary } from "@/features/portal/boundary";
import { PatientVot } from "@/features/vot/patient";
export default function Page() { return <PortalBoundary mode="patient" permission="VOT_SELF_READ" requireLink context="portal/vot"><PatientVot/></PortalBoundary>; }
