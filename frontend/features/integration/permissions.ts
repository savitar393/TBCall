import type { Me } from "@/lib/auth/types";
import type { NavigationItem } from "@/lib/navigation";
export const canIntegration = (user: Me | null) => !!user && user.roles.some(r => r.code === "SYSTEM_ADMIN") && user.permissions.includes("INTEGRATION_MANAGE");
export const integrationNavigation = (user: Me): NavigationItem[] => canIntegration(user) ? [{ label: "Integrasi", href: "/integrations" }] : [];
