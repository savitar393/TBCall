import { z } from "@/lib/validation";

// Mirrors CurrentActor.MeResponse; no opaque session or CSRF secret is included.
export const meSchema = z.object({
  id: z.string().min(1), email: z.string().nullable(), phone: z.string().nullable(), status: z.string(),
  roles: z.array(z.object({ code: z.string(), name: z.string() })),
  permissions: z.array(z.string()),
  activeFacilities: z.array(z.object({ id: z.string(), name: z.string() })),
  patientLink: z.object({ id: z.string(), patientId: z.string(), version: z.number().int().nonnegative() }).nullable(),
  supporterCaseIds: z.array(z.string()),
});
export type Me = z.infer<typeof meSchema>;
export type LoginInput = { identity: string; password: string };
