import { ContinuityBoundary } from "@/features/continuity/boundary";
import { InvestigationDetail } from "@/features/continuity/contacts/investigation";
export default async function Page({params}:{params:Promise<{investigationId:string}>}){const {investigationId}=await params;return <ContinuityBoundary permission="CONTACT_READ"><InvestigationDetail key={investigationId} id={investigationId}/></ContinuityBoundary>;}
