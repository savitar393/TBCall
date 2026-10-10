import { z } from "@/lib/validation";
import type { Me } from "@/lib/auth/types";
import { canClinical } from "@/features/clinical-intake/permissions";

export function dashboardPermissions(user: Me | null) {
  const officer = canClinical(user) && !!user?.activeFacilities.length;
  const has = (permission: string) => officer && !!user?.permissions.includes(permission);
  return { cases: has("CASE_READ"), followUps: has("TREATMENT_READ") && has("FOLLOW_UP_READ"), laboratory: has("LAB_REQUEST_READ") };
}
export function canOperationalDashboard(user: Me | null) { return Object.values(dashboardPermissions(user)).some(Boolean); }
const time = z.iso.datetime({ offset: true }), id = z.uuid();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const facility = z.strictObject({ id, name: z.string() });
const page = <T extends z.ZodType>(item: T) => z.strictObject({ content: z.array(item).max(10), page: count, size: z.literal(10), totalElements: count });
const section = <T extends z.ZodType>(data: T) => z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("AVAILABLE"), data }),
  z.strictObject({ state: z.literal("PERMISSION_DENIED"), data: z.null() }),
]);
const followUp = z.strictObject({ id, treatmentId: id, patientName: z.string(), followUpType: z.string(), scheduledAt: time, facility: facility.nullable() });
const laboratory = z.strictObject({ id, patientName: z.string(), status: z.enum(["REQUESTED", "SENT", "RECEIVED", "PARTIAL"]), requestedAt: time.nullable(), requestingFacility: facility, testingFacility: facility });
export const dashboardSchema = z.strictObject({ asOf: time, upcomingUntil: time,
  cases: section(z.strictObject({ active: count, completed: count })),
  followUps: section(z.strictObject({ upcoming: page(followUp), overdue: page(followUp) })), laboratory: section(page(laboratory)),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardPage<T> = { content: T[]; page: number; size: number; totalElements: number };
