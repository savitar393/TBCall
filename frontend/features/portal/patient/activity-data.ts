"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { portalQueries } from "../queries";
import { usePortalReferences } from "../references";
export function usePatientActivity(dosePage = 0, monitoringPage = 0) {
  const { user } = useSession();
  const can = (permission: string) => !!user?.patientLink && user.permissions.includes(permission);
  const doses = useQuery({ ...portalQueries.doses(user!.id, { kind: "patient" }, dosePage), enabled: can("ADHERENCE_READ") });
  const followUps = useQuery({ ...portalQueries.followUps(user!.id), enabled: can("FOLLOW_UP_READ") });
  const monitoring = useQuery({ ...portalQueries.monitoring(user!.id, { kind: "patient" }, monitoringPage), enabled: can("MONITORING_READ") });
  const refs = usePortalReferences();
  return { user: user!, can, doses, followUps, monitoring, refs };
}
