import { ContinuityBoundary } from "@/features/continuity/boundary";
import { ReferralCreate } from "@/features/continuity/referrals/create";
export default async function Page({params}:{params:Promise<{caseId:string}>}){const {caseId}=await params;return <ContinuityBoundary permission="REFERRAL_WRITE"><ReferralCreate key={caseId} id={caseId}/></ContinuityBoundary>;}
