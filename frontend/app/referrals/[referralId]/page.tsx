import { ContinuityBoundary } from "@/features/continuity/boundary";
import { ReferralDetail } from "@/features/continuity/referrals/detail";
export default async function Page({params}:{params:Promise<{referralId:string}>}){const {referralId}=await params;return <ContinuityBoundary permission="REFERRAL_READ"><ReferralDetail key={referralId} id={referralId}/></ContinuityBoundary>;}
