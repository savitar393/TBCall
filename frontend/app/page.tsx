import { AppShell } from "@/components/app-shell";
import { IdentityDashboard } from "@/components/identity-dashboard";
import { SessionBoundary } from "@/components/session-boundary";

export default function HomePage() {
  return <SessionBoundary><AppShell><IdentityDashboard /></AppShell></SessionBoundary>;
}
