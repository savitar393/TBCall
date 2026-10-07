import type { ClinicalInput, IdentityInput } from "../types";
import type { PatientValues, RegistrationValues, DiagnosisValues, CaseValues } from "./values";
type Dirty = Partial<Record<string, boolean>>;
const text = (v: string) => v.trim() || null;
const number = (v: string) => v === "" ? null : Number(v);
function dirty(input: ClinicalInput, supplied?: Dirty): ClinicalInput {
  return supplied ? Object.fromEntries(Object.entries(input).filter(([key]) => supplied[key])) : input;
}
export function patientInput(v: PatientValues): ClinicalInput {
  return { fullName: v.fullName.trim(), citizenship: v.citizenship, nik: v.citizenship === "WNI" ? v.nik : null, otherIdentityNumber: v.citizenship === "WNA" ? text(v.otherIdentityNumber) : null, bpjsNumber: text(v.bpjsNumber), birthPlace: text(v.birthPlace), birthDate: v.birthDateUnknown ? null : v.birthDate, birthDateUnknown: v.birthDateUnknown, sexCode: v.sexCode, phone: text(v.phone), address: text(v.address) };
}
export function patientPatch(v: PatientValues, fields: Dirty): ClinicalInput {
  const result = dirty(patientInput(v), fields);
  if (fields.citizenship) result[v.citizenship === "WNI" ? "otherIdentityNumber" : "nik"] = null;
  if (fields.birthDate || fields.birthDateUnknown) { result.birthDate = v.birthDateUnknown ? null : v.birthDate; result.birthDateUnknown = v.birthDateUnknown; }
  return result;
}
export function registrationInput(v: RegistrationValues): ClinicalInput {
  return { registrationDate: v.registrationDate, facilityRegistrationNumber: text(v.facilityRegistrationNumber), medicalRecordNumber: text(v.medicalRecordNumber), specimenIdentityNumber: text(v.specimenIdentityNumber), suspectTypeCode: v.suspectTypeCode, previousTreatmentCategoryCode: v.previousTreatmentCategoryCode, referredByType: text(v.referredByType), referredByReference: text(v.referredByReference), referralNotes: text(v.referralNotes), initialWeightKg: number(v.initialWeightKg), hivStatusCode: text(v.hivStatusCode), dmStatusCode: text(v.dmStatusCode) };
}
export const registrationPatch = (v: RegistrationValues, fields: Dirty) => dirty(registrationInput(v), fields);
export function diagnosisInput(v: DiagnosisValues): ClinicalInput {
  return { diagnosisDate: v.diagnosisDate, anatomicalSiteCode: v.anatomicalSiteCode, diagnosisTypeCode: v.diagnosisTypeCode, diagnosisResult: v.diagnosisResult.trim(), chestXrayResult: text(v.chestXrayResult), chestXrayDate: v.chestXrayDate || null, chestXraySerial: text(v.chestXraySerial), chestXrayImpression: text(v.chestXrayImpression), icd10Code: text(v.icd10Code), treatmentDisposition: v.treatmentDisposition, referredToFacilityId: v.treatmentDisposition === "REFERRED" ? v.referredToFacilityId : null, notes: text(v.notes) };
}
export function diagnosisPatch(v: DiagnosisValues, fields: Dirty): ClinicalInput {
  const result = dirty(diagnosisInput(v), fields);
  if (fields.treatmentDisposition && v.treatmentDisposition !== "REFERRED") result.referredToFacilityId = null;
  return result;
}
export function caseInput(v: CaseValues): ClinicalInput {
  return { caseCategoryCode: v.caseCategoryCode, drugResistancePatternCode: text(v.drugResistancePatternCode), healthWorker: v.healthWorker === "" ? null : v.healthWorker === "true", pregnancyStatusCode: text(v.pregnancyStatusCode), heightCm: number(v.heightCm), weightKg: number(v.weightKg), bcgStatusCode: text(v.bcgStatusCode), previousTreatmentCategoryCode: v.previousTreatmentCategoryCode, hivStatusCode: text(v.hivStatusCode), dmStatusCode: text(v.dmStatusCode), icd10Code: text(v.icd10Code) };
}
export const casePatch = (v: CaseValues, fields: Dirty) => dirty(caseInput(v), fields);
export function identityInput(v: IdentityInput): ClinicalInput {
  // Preserve the exact submitted confirmation; the backend owns normalization/matching.
  return { citizenship: v.citizenship, ...(v.citizenship === "WNI" ? { nik: v.nik } : { otherIdentityNumber: v.otherIdentityNumber }), ...(v.fullName.trim() ? { fullName: v.fullName } : {}), ...(v.birthDate ? { birthDate: v.birthDate } : {}), ...(v.bpjsNumber.trim() ? { bpjsNumber: v.bpjsNumber } : {}) };
}
export const existingPatient = (v: IdentityInput, patientId: string): ClinicalInput => ({ patientId, ...identityInput(v) });
