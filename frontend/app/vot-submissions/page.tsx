"use client";
import { SessionBoundary } from "@/components/session-boundary";
import { AppShell } from "@/components/app-shell";
import { AppPageHeader } from "@/components/application-patterns";
import { StaffVot } from "@/features/vot/staff";
export default function Page() { return <SessionBoundary><AppShell><div className="clinical-workspace"><AppPageHeader title="Peninjauan VOT"/><StaffVot/></div></AppShell></SessionBoundary>; }
