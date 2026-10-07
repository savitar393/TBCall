import { MonitoringBoundary } from "@/features/monitoring/boundary";
import { TargetMonitoring } from "@/features/monitoring/monitoring/target";
export default async function Page({
  params
}: {
  params: Promise<{
    tptId: string;
  }>;
}) {
  const {
    tptId
  } = await params;
  return <MonitoringBoundary context={tptId} permission="MONITORING_READ" targetPermission="TPT_READ">
  <TargetMonitoring id={tptId} type="TPT" />
</MonitoringBoundary>;
}
