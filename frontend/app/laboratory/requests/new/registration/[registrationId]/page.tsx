import { LaboratoryBoundary } from "@/features/laboratory/components/laboratory-boundary";
import { RequestCreate } from "@/features/laboratory/components/request-create";
export default async function CreatePage({ params }: { params: Promise<{ registrationId: string }> }) { const { registrationId } = await params; return <LaboratoryBoundary mode="source"><RequestCreate ownerType="REGISTRATION" id={registrationId} /></LaboratoryBoundary>; }
