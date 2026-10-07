import { fixtureUser } from "./fixtures";

export const ids = {
  patient: "11111111-1111-4111-8111-111111111111",
  registration: "22222222-2222-4222-8222-222222222222",
  diagnosis: "33333333-3333-4333-8333-333333333333",
  tbCase: "44444444-4444-4444-8444-444444444444",
  facility: "55555555-5555-4555-8555-555555555555",
  destination: "66666666-6666-4666-8666-666666666666",
};
export const officer = { ...fixtureUser, activeFacilities: [{ id: ids.facility, name: "Puskesmas Asal" }], permissions: [
  "PATIENT_READ", "PATIENT_CREATE", "PATIENT_UPDATE", "PATIENT_IDENTITY_RESOLVE", "REGISTRATION_READ", "REGISTRATION_WRITE",
  "DIAGNOSIS_READ", "DIAGNOSIS_WRITE", "CASE_READ", "CASE_WRITE",
] };
export const facility = { id: ids.facility, name: "Puskesmas Asal" };
export const label = { code: "L", name: "Laki-laki" };
export const patientSummary = { patientId: ids.patient, version: 2, fullName: "Pasien Contoh", sex: label, birthDate: "1990-01-02", birthDateUnknown: false };
export const registration = {
  id: ids.registration, version: 3, status: "DIAGNOSED", patient: patientSummary, facility, registrationDate: "2026-09-01",
  facilityRegistrationNumber: null, medicalRecordNumber: "RM1", specimenIdentityNumber: null, suspectTypeCode: "TERDUGA",
  previousTreatmentCategoryCode: "BARU", referredByType: null, referredByReference: null, referralNotes: null, initialWeightKg: 55.5,
  hivStatusCode: null, dmStatusCode: null,
};
export const diagnosis = {
  id: ids.diagnosis, version: 4, registrationId: ids.registration, registrationVersion: 3, diagnosisDate: "2026-09-02",
  anatomicalSite: { code: "PARU", name: "Paru" }, diagnosisType: { code: "KLINIS", name: "Terdiagnosis klinis" },
  diagnosisResult: "Hasil dicatat petugas", chestXrayResult: null, chestXrayDate: null, chestXraySerial: null,
  chestXrayImpression: null, icd10Code: null, treatmentDisposition: "TREAT_HERE", referredToFacility: null, notes: "Catatan lama",
};
export const diagnosisSummary = { id: ids.diagnosis, version: 4, diagnosisDate: diagnosis.diagnosisDate, anatomicalSite: diagnosis.anatomicalSite, diagnosisType: diagnosis.diagnosisType };
export const registrationSummary = { id: ids.registration, version: 3, status: registration.status, registrationDate: registration.registrationDate, facility };
export const caseView = {
  id: ids.tbCase, version: 5, status: "ACTIVE", currentFacility: facility, patient: patientSummary, registration: registrationSummary,
  confirmingDiagnosis: diagnosisSummary, caseCategoryCode: "TB_SO", drugResistancePatternCode: null, healthWorker: null,
  pregnancyStatusCode: null, heightCm: 165, weightKg: 55.5, bcgStatusCode: null, previousTreatmentCategoryCode: "BARU",
  hivStatusCode: null, dmStatusCode: null, icd10Code: null, confirmedAt: "2026-09-03T10:00:00+07:00",
};
export const maskedPatient = { ...patientSummary, nik: "************1234", bpjsNumber: "*********4321", registrations: [registrationSummary], cases: [{ id: ids.tbCase, version: 5, status: "ACTIVE", caseCategory: { code: "TB_SO", name: "TB sensitif obat" }, currentFacility: facility }] };
export const patientPage = { content: [maskedPatient], page: 0, size: 20, totalElements: 1 };
export const demographics = { fullName: "Pasien Contoh", citizenship: "WNI", nik: "1234567890121234", otherIdentityNumber: null, bpjsNumber: "1234567894321", birthPlace: "Bandung", birthDate: "1990-01-02", birthDateUnknown: false, sex: label, phone: "081234567890", address: "Alamat pribadi", provinceCode: null, regencyCode: null, districtCode: null, villageCode: null };
export const patientDetail = { patientId: ids.patient, version: 2, demographics, registrations: [registration], cases: [{ summary: { id: ids.tbCase, version: 5, status: "ACTIVE", caseCategory: { code: "TB_SO", name: "TB sensitif obat" }, currentFacility: facility, diagnosis: diagnosisSummary }, hivStatusCode: null, dmStatusCode: null }] };
export const identityConfirmation = { patientId: ids.patient, fullName: "Pasien Contoh", citizenship: "WNI", nik: maskedPatient.nik, otherIdentityNumber: null, bpjsNumber: maskedPatient.bpjsNumber, birthDate: "1990-01-02", birthDateUnknown: false, sex: label };
export const references = {
  sexCodes: [label, { code: "P", name: "Perempuan" }], suspectTypes: [{ code: "TERDUGA", name: "Terduga TBC" }],
  previousTreatmentCategories: [{ code: "BARU", name: "Baru" }], hivStatuses: [{ code: "NEG", name: "Negatif" }],
  dmStatuses: [{ code: "NO", name: "Tidak" }], anatomicalSites: [diagnosis.anatomicalSite], diagnosisTypes: [diagnosis.diagnosisType],
  caseCategories: [{ code: "TB_SO", name: "TB sensitif obat" }, { code: "TB_RO", name: "TB resistan obat" }],
  drugResistancePatterns: [{ code: "TB_MDR", name: "MDR" }], pregnancyStatuses: [{ code: "NO", name: "Tidak hamil" }], bcgStatuses: [{ code: "YES", name: "Ya" }],
  citizenships: [{ code: "WNI", name: "Warga Negara Indonesia" }, { code: "WNA", name: "Warga Negara Asing" }],
  treatmentDispositions: [{ code: "TREAT_HERE", name: "Diobati di fasyankes ini" }, { code: "REFERRED", name: "Dirujuk ke fasyankes lain" }, { code: "NOT_TREATED", name: "Tidak diobati" }, { code: "UNKNOWN", name: "Belum ditentukan" }],
  registrationStatusFilters: [{ code: "OPEN", name: "Terbuka" }, { code: "DIAGNOSED", name: "Sudah didiagnosis" }],
  caseStatusFilters: [{ code: "ACTIVE", name: "Aktif" }, { code: "REFERRED", name: "Dirujuk" }],
};
export const facilityPage = { content: [
  { ...facility, facilityTypeCode: "PKM", provinceCode: "32", regencyCode: "3201" },
  { id: ids.destination, name: "Rumah Sakit Tujuan", facilityTypeCode: "RS", provinceCode: "32", regencyCode: "3202" },
], page: 0, size: 20, totalElements: 2 };
