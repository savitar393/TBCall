import { LaboratoryBoundary } from "@/features/laboratory/components/laboratory-boundary";
import { RequestCreate } from "@/features/laboratory/components/request-create";
export default async function CreatePage({ params }: { params: Promise<{ caseId: string }> }) { const { caseId } = await params; return <LaboratoryBoundary mode="source"><RequestCreate ownerType="CASE" id={caseId} /></LaboratoryBoundary>; }
