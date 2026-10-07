import { ContinuityBoundary } from "@/features/continuity/boundary";
import { TptDetail } from "@/features/continuity/tpt/detail";
export default async function Page({params}:{params:Promise<{tptId:string}>}){const {tptId}=await params;return <ContinuityBoundary permission="TPT_READ"><TptDetail key={tptId} id={tptId}/></ContinuityBoundary>;}
