import { z } from "@/lib/validation";

const id = z.uuid();
const version = z.number().int().nonnegative();
const date = z.iso.date();
const text = z.string().nullable();
const measurement = z.number().finite().nullable();
const masked = z.string().regex(/^\*+(?:.{4})?$/).nullable();
export const labelSchema = z.strictObject({ code: z.string().min(1), name: text });
const facility = z.strictObject({ id, name: z.string() });
const patientSummary = z.strictObject({ patientId: id, version, fullName: z.string(), sex: labelSchema.nullable(), birthDate: date.nullable(), birthDateUnknown: z.boolean() });
const registrationSummary = z.strictObject({ id, version, status: z.string(), registrationDate: date, facility });
const diagnosisSummary = z.strictObject({ id, version, diagnosisDate: date, anatomicalSite: labelSchema.nullable(), diagnosisType: labelSchema.nullable() });
const caseListSummary = z.strictObject({ id, version, status: z.string(), caseCategory: labelSchema.nullable(), currentFacility: facility });
const caseSummary = caseListSummary.extend({ diagnosis: diagnosisSummary.nullable() });
export const registrationSchema = z.strictObject({
  id, version, status: z.string(), patient: patientSummary, facility, registrationDate: date,
  facilityRegistrationNumber: text, medicalRecordNumber: text, specimenIdentityNumber: text, suspectTypeCode: text,
  previousTreatmentCategoryCode: text, referredByType: text, referredByReference: text, referralNotes: text,
  initialWeightKg: measurement, hivStatusCode: text, dmStatusCode: text,
});
export const diagnosisSchema = z.strictObject({
  id, version, registrationId: id, registrationVersion: version, diagnosisDate: date, anatomicalSite: labelSchema.nullable(),
  diagnosisType: labelSchema.nullable(), diagnosisResult: text, chestXrayResult: text, chestXrayDate: date.nullable(),
  chestXraySerial: text, chestXrayImpression: text, icd10Code: text, treatmentDisposition: text, referredToFacility: facility.nullable(), notes: text,
});
export const caseSchema = z.strictObject({
  id, version, status: z.string(), currentFacility: facility, patient: patientSummary, registration: registrationSummary,
  confirmingDiagnosis: diagnosisSummary.nullable(), caseCategoryCode: text, drugResistancePatternCode: text, healthWorker: z.boolean().nullable(),
  pregnancyStatusCode: text, heightCm: measurement, weightKg: measurement, bcgStatusCode: text,
  previousTreatmentCategoryCode: text, hivStatusCode: text, dmStatusCode: text, icd10Code: text, confirmedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const patientPageSchema = z.strictObject({
  content: z.array(patientSummary.extend({ nik: masked, bpjsNumber: masked, registrations: z.array(registrationSummary), cases: z.array(caseListSummary) })),
  page: z.number().int().nonnegative(), size: z.number().int().min(1).max(50), totalElements: z.number().int().nonnegative(),
});
export const patientDetailSchema = z.strictObject({
  patientId: id, version,
  demographics: z.strictObject({
    fullName: z.string(), citizenship: text, nik: text, otherIdentityNumber: text, bpjsNumber: text, birthPlace: text,
    birthDate: date.nullable(), birthDateUnknown: z.boolean(), sex: labelSchema.nullable(), phone: text, address: text,
    provinceCode: text, regencyCode: text, districtCode: text, villageCode: text,
  }),
  registrations: z.array(registrationSchema), cases: z.array(z.strictObject({ summary: caseSummary, hivStatusCode: text, dmStatusCode: text })),
});
export const identityConfirmationSchema = z.strictObject({
  patientId: id, fullName: z.string(), citizenship: text, nik: masked, otherIdentityNumber: masked, bpjsNumber: masked,
  birthDate: date.nullable(), birthDateUnknown: z.boolean(), sex: labelSchema.nullable(),
});
const labels = z.array(labelSchema);
export const referenceDataSchema = z.strictObject({
  sexCodes: labels, suspectTypes: labels, previousTreatmentCategories: labels, hivStatuses: labels, dmStatuses: labels,
  anatomicalSites: labels, diagnosisTypes: labels, caseCategories: labels, drugResistancePatterns: labels,
  pregnancyStatuses: labels, bcgStatuses: labels, citizenships: labels, treatmentDispositions: labels, registrationStatusFilters: labels, caseStatusFilters: labels,
});
export const facilityPageSchema = z.strictObject({
  content: z.array(z.strictObject({ id, name: z.string(), facilityTypeCode: text, provinceCode: text, regencyCode: text })),
  page: z.number().int().nonnegative(), size: z.number().int().min(1).max(50), totalElements: z.number().int().nonnegative(),
});
