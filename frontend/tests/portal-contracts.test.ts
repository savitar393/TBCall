import { expect, it } from "vitest";
import * as f from "./portal-fixtures";
const modules = import.meta.glob("../features/portal/schemas.ts");
it.each([
    ["selfPatientSchema", f.selfPatient], ["patientTreatmentSchema", f.treatment], ["supporterTreatmentSchema", f.supporterTreatment],
    ["safeDoseSchema", f.dose], ["safeFollowUpSchema", f.followUp], ["safeTptSchema", f.tpt], ["safeEventSchema", f.event],
    ["safeAlertSchema", f.alert], ["notificationSchema", f.notification],
])("strict safe %s accepts actual projection and rejects private extra fields", async (name, data) => {
    const loader = modules["../features/portal/schemas.ts"];
    expect(loader, "F3 strict safe schemas").toBeDefined();
    const schemas = await loader() as Record<string, {
        safeParse(value: unknown): {
            success: boolean;
        };
    }>;
    expect(schemas[name as string].safeParse(data).success).toBe(true);
    expect(schemas[name as string].safeParse({ ...data, notes: "private staff prose" }).success).toBe(false);
});
