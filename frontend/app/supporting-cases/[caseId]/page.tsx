import { PortalBoundary } from "@/features/portal/boundary";
import { SupportingCase } from "@/features/portal/supporter/detail";
export default async function Page({ params }: {
    params: Promise<{
        caseId: string;
    }>;
}) { const { caseId } = await params; return <PortalBoundary mode="supporter" context="supporting-case" caseId={caseId}><SupportingCase caseId={caseId}/></PortalBoundary>; }
