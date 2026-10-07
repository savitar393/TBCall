import { PortalBoundary } from "@/features/portal/boundary";
import { PortalNotifications } from "@/features/portal/notifications/list";
export default function Page() { return <PortalBoundary mode="either" context="portal/notifications" permission="NOTIFICATION_READ_SELF"><PortalNotifications /></PortalBoundary>; }
