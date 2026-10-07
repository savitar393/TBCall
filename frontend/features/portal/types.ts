import type { z } from "@/lib/validation";
import type * as s from "./schemas";
export type PortalReferenceData = z.infer<typeof s.referencesSchema>;
export type PatientTreatment = z.infer<typeof s.patientTreatmentSchema>;
export type SupporterTreatment = z.infer<typeof s.supporterTreatmentSchema>;
export type SafeDose = z.infer<typeof s.safeDoseSchema>;
export type SafeAlert = z.infer<typeof s.safeAlertSchema>;
export type PortalTarget = {
    kind: "patient";
} | {
    kind: "supporter";
    caseId: string;
};
export type DoseInput = {
    scheduledDate: string;
    status: string;
    administrationMode?: string;
    notes?: string;
};
