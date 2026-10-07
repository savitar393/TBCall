import { ContinuityBoundary } from "@/features/continuity/boundary";
import { InvestigationQueue } from "@/features/continuity/contacts/queue";
export default function Page(){return <ContinuityBoundary permission="CONTACT_READ"><InvestigationQueue/></ContinuityBoundary>;}
