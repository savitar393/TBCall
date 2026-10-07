import { MonitoringBoundary } from "@/features/monitoring/boundary";
import { AlertDetail } from "@/features/monitoring/alerts/detail";
export default async function Page({
  params
}: {
  params: Promise<{
    alertId: string;
  }>;
}) {
  const {
    alertId
  } = await params;
  return <MonitoringBoundary context={alertId} permission="ALERT_READ">
  <AlertDetail id={alertId} />
</MonitoringBoundary>;
}
