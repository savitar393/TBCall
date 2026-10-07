import { ContinuityBoundary } from "@/features/continuity/boundary";
import { ReferralQueue } from "@/features/continuity/referrals/queue";
export default function Page(){return <ContinuityBoundary permission="REFERRAL_READ"><ReferralQueue/></ContinuityBoundary>;}
