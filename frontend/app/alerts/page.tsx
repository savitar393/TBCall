import { MonitoringBoundary } from "@/features/monitoring/boundary";
import { AlertQueue } from "@/features/monitoring/alerts/queue";
export default function Page() {
  return <MonitoringBoundary context="alerts" permission="ALERT_READ">
  <AlertQueue />
</MonitoringBoundary>;
}
