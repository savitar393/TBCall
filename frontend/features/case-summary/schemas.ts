import { z } from "@/lib/validation";
const id = z.uuid(), text = z.string().nullable(), date = z.iso.date(), time = z.iso.datetime({ offset: true });
const facility = z.strictObject({ id, name: z.string() });
const page = <T extends z.ZodType>(item: T) => z.strictObject({ content: z.array(item).max(5), page: z.number().int().nonnegative(), size: z.literal(5), totalElements: z.number().int().nonnegative() });
const slice = <T extends z.ZodType>(item: T, limit: number) => z.strictObject({ content: z.array(item).max(limit), hasMore: z.boolean() });
const section = <T extends z.ZodType>(data: T) => z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("AVAILABLE"), data }),
  z.strictObject({ state: z.literal("PERMISSION_DENIED"), data: z.null() }),
  z.strictObject({ state: z.literal("OUT_OF_SCOPE"), data: z.null() }),
]);
const registration = z.strictObject({ id, version: z.number().int().nonnegative(), status: z.string(), registrationDate: date, facility });
const diagnosis = z.strictObject({ id, diagnosisDate: date, anatomicalSiteCode: text, diagnosisTypeCode: text, diagnosisResult: text, treatmentDisposition: text, confirming: z.boolean() });
const result = z.strictObject({ id, testId: id, specimenId: id.nullable(), testTypeCode: z.string(), sequenceNo: z.number().int().positive(), status: z.enum(["FINAL", "CORRECTED"]), testedAt: time.nullable(), resultCode: text, resultValue: text, resultText: text, latest: z.boolean() });
const lab = z.strictObject({ id, ownerType: z.enum(["REGISTRATION", "CASE"]), status: z.string(), requestReasonCode: text, requestedAt: time.nullable(), requestingFacility: facility, testingFacility: facility, results: slice(result, 20) });
const drug = z.strictObject({ drugName: text, treatmentPhase: text, doseValue: z.number().nullable(), doseUnit: text, frequencyPerWeek: z.number().int().nullable(), startDate: date.nullable(), endDate: date.nullable() });
const dose = z.strictObject({ id, scheduledDate: date, recordedAt: time.nullable(), status: z.string(), administrationMode: text, source: z.string() });
const follow = z.strictObject({ id, followUpType: z.string(), status: z.string(), scheduledAt: time, completedAt: time.nullable(), facility: facility.nullable(), weightKg: z.number().nullable(), symptomSummary: text, adherenceAssessment: text });
const outcome = z.strictObject({ outcomeCode: z.string(), outcomeName: z.string(), outcomeDate: date });
const treatment = z.strictObject({ id, status: z.string(), facility, regimenName: text, startDate: date, plannedEndDate: date.nullable(), actualEndDate: date.nullable(), drugs: slice(drug, 20), doses: section(slice(dose, 10)), followUps: section(slice(follow, 10)), outcome: section(outcome.nullable()) });
export const summarySchema = z.strictObject({ caseId: id, fullName: z.string(), status: z.string(), currentFacility: facility, caseCategoryCode: text, confirmedAt: time.nullable(), registration: section(registration), diagnoses: section(page(diagnosis)), laboratory: section(page(lab)), treatments: section(page(treatment)) });
export type Summary = z.infer<typeof summarySchema>;
