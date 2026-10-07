import { PortalBoundary } from "@/features/portal/boundary";
import { SupportingCases } from "@/features/portal/supporter/list";
export default function Page() { return <PortalBoundary mode="supporter" context="supporting-cases"><SupportingCases /></PortalBoundary>; }
