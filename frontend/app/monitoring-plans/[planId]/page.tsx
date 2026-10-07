import { MonitoringBoundary } from "@/features/monitoring/boundary";
import { PlanDetail } from "@/features/monitoring/monitoring/detail";
export default async function Page({
  params
}: {
  params: Promise<{
    planId: string;
  }>;
}) {
  const {
    planId
  } = await params;
  return <MonitoringBoundary context={planId} permission="MONITORING_READ">
  <PlanDetail id={planId} />
</MonitoringBoundary>;
}
