import type { Me } from "@/lib/auth/types";
export function canMonitoring(user: Me | null, ...permissions: string[]) {
  return !!user && user.roles.some(r => r.code === "TB_OFFICER") && permissions.every(p => user.permissions.includes(p));
}
export function monitoringNavigation(user: Me | null) {
  return [{
    label: "Peringatan",
    href: "/alerts",
    permission: "ALERT_READ"
  }, {
    label: "Notifikasi",
    href: "/notifications",
    permission: "NOTIFICATION_READ_SELF"
  }].filter(item => canMonitoring(user, item.permission));
}
