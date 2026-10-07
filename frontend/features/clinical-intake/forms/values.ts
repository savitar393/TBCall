import { z } from "@/lib/validation";
import type { PatientDetail, Registration, Diagnosis, TBCase } from "../types";

const required = (max = 255) => z.string().trim().min(1, "Isian wajib diisi.").max(max, "Isian terlalu panjang.");
const optional = (max = 255) => z.string().max(max, "Isian terlalu panjang.");
const date = z.iso.date("Gunakan tanggal yang valid.");
const optionalDate = z.union([z.literal(""), date]);
export const decimal = z.string().refine(value => value === "" || (/^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) < 10000), "Isi angka positif kurang dari 10000, maksimal dua desimal.");
export const patientFormSchema = z.object({
  fullName: required(), citizenship: z.enum(["WNI", "WNA"], "Pilih kewarganegaraan."), nik: optional(16), otherIdentityNumber: optional(100),
  bpjsNumber: optional(50), birthPlace: optional(), birthDate: optionalDate, birthDateUnknown: z.boolean(), sexCode: required(30), phone: optional(30), address: z.string(),
}).superRefine((value, context) => {
  if (value.citizenship === "WNI" && !/^\d{16}$/.test(value.nik)) context.addIssue({ code: "custom", path: ["nik"], message: "NIK harus terdiri dari 16 digit." });
  if (value.citizenship === "WNA" && !value.otherIdentityNumber.trim()) context.addIssue({ code: "custom", path: ["otherIdentityNumber"], message: "Nomor identitas wajib diisi." });
  if (!value.birthDateUnknown && !value.birthDate) context.addIssue({ code: "custom", path: ["birthDate"], message: "Isi tanggal lahir atau tandai tidak diketahui." });
});
export const identityFormSchema = z.object({ citizenship: z.enum(["WNI", "WNA"]), nik: optional(16), otherIdentityNumber: optional(100), fullName: optional(), birthDate: optionalDate, bpjsNumber: optional(50) }).superRefine((v, c) => {
  if (v.citizenship === "WNI" && !/^\d{16}$/.test(v.nik)) c.addIssue({ code: "custom", path: ["nik"], message: "NIK harus terdiri dari 16 digit." });
  if (v.citizenship === "WNA" && !v.otherIdentityNumber.trim()) c.addIssue({ code: "custom", path: ["otherIdentityNumber"], message: "Nomor identitas wajib diisi." });
  if (!v.fullName.trim() && !v.birthDate) c.addIssue({ code: "custom", path: ["fullName"], message: "Konfirmasi nama atau tanggal lahir wajib diisi." });
});
export const registrationFormSchema = z.object({ registrationDate: date, facilityRegistrationNumber: optional(100), medicalRecordNumber: optional(100), specimenIdentityNumber: optional(100), suspectTypeCode: required(30), previousTreatmentCategoryCode: required(80), referredByType: optional(50), referredByReference: optional(), referralNotes: z.string(), initialWeightKg: decimal, hivStatusCode: optional(30), dmStatusCode: optional(30) });
export const diagnosisFormSchema = z.object({ diagnosisDate: date, anatomicalSiteCode: required(30), diagnosisTypeCode: required(50), diagnosisResult: required(), chestXrayResult: optional(50), chestXrayDate: optionalDate, chestXraySerial: optional(100), chestXrayImpression: z.string(), icd10Code: optional(20), treatmentDisposition: z.enum(["TREAT_HERE", "REFERRED", "NOT_TREATED", "UNKNOWN"], "Pilih disposisi."), referredToFacilityId: z.union([z.literal(""), z.uuid()]), notes: z.string() }).superRefine((v, c) => {
  if (v.treatmentDisposition === "REFERRED" && !v.referredToFacilityId) c.addIssue({ code: "custom", path: ["referredToFacilityId"], message: "Pilih fasyankes tujuan rujukan." });
});
export const caseFormSchema = z.object({ caseCategoryCode: required(30), drugResistancePatternCode: optional(30), healthWorker: z.enum(["", "true", "false"]), pregnancyStatusCode: optional(30), heightCm: decimal, weightKg: decimal, bcgStatusCode: optional(30), previousTreatmentCategoryCode: required(80), hivStatusCode: optional(30), dmStatusCode: optional(30), icd10Code: optional(20) });
export const filtersSchema = z.object({ name: optional().refine(v => !v.trim() || v.trim().length >= 3, "Nama pencarian minimal 3 karakter."), nik: z.string().refine(v => !v || /^\d{16}$/.test(v), "NIK harus terdiri dari 16 digit."), bpjs: optional(50), registrationStatus: z.string(), caseStatus: z.string(), facilityId: z.string(), size: z.string().refine(v => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 50, "Ukuran halaman harus 1–50.") });
export type PatientValues = z.infer<typeof patientFormSchema>;
export type IdentityValues = z.infer<typeof identityFormSchema>;
export type RegistrationValues = z.infer<typeof registrationFormSchema>;
export type DiagnosisValues = z.infer<typeof diagnosisFormSchema>;
export type CaseValues = z.infer<typeof caseFormSchema>;
const str = (v: string | number | null | undefined) => v == null ? "" : String(v);
export function patientValues(detail?: PatientDetail): PatientValues {
  const d = detail?.demographics;
  return { fullName: str(d?.fullName), citizenship: d?.citizenship === "WNA" ? "WNA" : "WNI", nik: str(d?.nik), otherIdentityNumber: str(d?.otherIdentityNumber), bpjsNumber: str(d?.bpjsNumber), birthPlace: str(d?.birthPlace), birthDate: str(d?.birthDate), birthDateUnknown: d?.birthDateUnknown ?? false, sexCode: str(d?.sex?.code), phone: str(d?.phone), address: str(d?.address) };
}
export function registrationValues(r?: Registration): RegistrationValues {
  return { registrationDate: str(r?.registrationDate), facilityRegistrationNumber: str(r?.facilityRegistrationNumber), medicalRecordNumber: str(r?.medicalRecordNumber), specimenIdentityNumber: str(r?.specimenIdentityNumber), suspectTypeCode: str(r?.suspectTypeCode), previousTreatmentCategoryCode: str(r?.previousTreatmentCategoryCode), referredByType: str(r?.referredByType), referredByReference: str(r?.referredByReference), referralNotes: str(r?.referralNotes), initialWeightKg: str(r?.initialWeightKg), hivStatusCode: str(r?.hivStatusCode), dmStatusCode: str(r?.dmStatusCode) };
}
export function diagnosisValues(d?: Diagnosis): DiagnosisValues {
  return { diagnosisDate: str(d?.diagnosisDate), anatomicalSiteCode: str(d?.anatomicalSite?.code), diagnosisTypeCode: str(d?.diagnosisType?.code), diagnosisResult: str(d?.diagnosisResult), chestXrayResult: str(d?.chestXrayResult), chestXrayDate: str(d?.chestXrayDate), chestXraySerial: str(d?.chestXraySerial), chestXrayImpression: str(d?.chestXrayImpression), icd10Code: str(d?.icd10Code), treatmentDisposition: (d?.treatmentDisposition ?? "") as DiagnosisValues["treatmentDisposition"], referredToFacilityId: str(d?.referredToFacility?.id), notes: str(d?.notes) };
}
export function caseValues(c?: TBCase): CaseValues {
  return { caseCategoryCode: str(c?.caseCategoryCode), drugResistancePatternCode: str(c?.drugResistancePatternCode), healthWorker: c?.healthWorker == null ? "" : c.healthWorker ? "true" : "false", pregnancyStatusCode: str(c?.pregnancyStatusCode), heightCm: str(c?.heightCm), weightKg: str(c?.weightKg), bcgStatusCode: str(c?.bcgStatusCode), previousTreatmentCategoryCode: str(c?.previousTreatmentCategoryCode), hivStatusCode: str(c?.hivStatusCode), dmStatusCode: str(c?.dmStatusCode), icd10Code: str(c?.icd10Code) };
}
