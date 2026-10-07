import { LaboratoryBoundary } from "@/features/laboratory/components/laboratory-boundary";
import { RequestDetail } from "@/features/laboratory/components/request-detail";
export default async function RequestPage({ params }: { params: Promise<{ requestId: string }> }) { const { requestId } = await params; return <LaboratoryBoundary mode="read"><RequestDetail id={requestId} /></LaboratoryBoundary>; }
