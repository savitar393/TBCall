"use client";

import type { ReactNode } from "react";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth/session";
import { canMonitoring } from "./permissions";
export function MonitoringBoundary({
  children,
  permission,
  targetPermission,
  context
}: {
  children: ReactNode;
  permission: string;
  targetPermission?: string;
  context: string;
}) {
  return <SessionBoundary>
  <Guard permission={permission} targetPermission={targetPermission} context={context}>{children}</Guard>
</SessionBoundary>;
}
function Guard({
  children,
  permission,
  targetPermission,
  context
}: {
  children: ReactNode;
  permission: string;
  targetPermission?: string;
  context: string;
}) {
  const {
    user
  } = useSession();
  return <AppShell>{canMonitoring(user, permission, ...(targetPermission ? [targetPermission] : [])) ? <div key={JSON.stringify(user) + context} className="space-y-6">{children}</div> : <section>
    <h1 className="text-2xl font-semibold">Akses tidak diizinkan</h1>
    <p>Halaman ini memerlukan peran petugas TBC dan izin baca yang sesuai.</p>
  </section>}</AppShell>;
}
