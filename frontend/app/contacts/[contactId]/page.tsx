import { ContinuityBoundary } from "@/features/continuity/boundary";
import { ContactDetail } from "@/features/continuity/contacts/detail";
export default async function Page({params}:{params:Promise<{contactId:string}>}){const {contactId}=await params;return <ContinuityBoundary permission="CONTACT_READ"><ContactDetail key={contactId} id={contactId}/></ContinuityBoundary>;}
