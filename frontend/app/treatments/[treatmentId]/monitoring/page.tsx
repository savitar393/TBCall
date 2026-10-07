import { MonitoringBoundary } from "@/features/monitoring/boundary";
import { TargetMonitoring } from "@/features/monitoring/monitoring/target";
export default async function Page({
  params
}: {
  params: Promise<{
    treatmentId: string;
  }>;
}) {
  const {
    treatmentId
  } = await params;
  return <MonitoringBoundary context={treatmentId} permission="MONITORING_READ" targetPermission="TREATMENT_READ">
  <TargetMonitoring id={treatmentId} type="TREATMENT" />
</MonitoringBoundary>;
}
