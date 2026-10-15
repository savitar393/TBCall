"use client";
import type { ReactNode } from "react";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { AppState } from "@/components/application-patterns";
import { useSession } from "@/lib/auth/session";
import { canMonitor, canManageScopes, canPublish } from "./permissions";
export function ReportingBoundary({ admin = false, children }: { admin?: boolean; children: ReactNode }) {
  return <SessionBoundary><Guard admin={admin}>{children}</Guard></SessionBoundary>;
}
function Guard({ admin, children }: { admin: boolean; children: ReactNode }) {
  const { user } = useSession();
  const allowed = admin ? canManageScopes(user) || canPublish(user) : canMonitor(user);
  return <AppShell>{allowed ? <div key={JSON.stringify(user)}>{children}</div> : <AppState kind="restricted" title="Akses tidak diizinkan" />}</AppShell>;
}
