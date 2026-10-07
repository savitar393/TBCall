import { MonitoringBoundary } from "@/features/monitoring/boundary";
import { Notifications } from "@/features/monitoring/notifications/list";
export default function Page() {
  return <MonitoringBoundary context="notifications" permission="NOTIFICATION_READ_SELF">
  <Notifications />
</MonitoringBoundary>;
}
