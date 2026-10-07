import { ContinuityBoundary } from "@/features/continuity/boundary";
import { CaseContacts } from "@/features/continuity/contacts/case-contacts";
export default async function Page({params}:{params:Promise<{caseId:string}>}){const {caseId}=await params;return <ContinuityBoundary permission="CONTACT_READ"><CaseContacts key={caseId} id={caseId}/></ContinuityBoundary>;}
