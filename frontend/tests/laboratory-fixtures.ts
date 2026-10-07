import { ids, officer } from "./clinical-fixtures";
export const labIds = { request: "20000000-0000-4000-8000-000000000001", test: "20000000-0000-4000-8000-000000000002", specimen: "20000000-0000-4000-8000-000000000003", result: "20000000-0000-4000-8000-000000000004", usable: "20000000-0000-4000-8000-000000000005" };
export const labOfficer = { ...officer, permissions: [...new Set([...officer.permissions, "LAB_REQUEST_READ", "LAB_REQUEST_WRITE", "LAB_RESULT_READ"])] };
export const labStaff = { ...labOfficer, roles: [{ code: "LAB_STAFF", name: "Petugas laboratorium" }], activeFacilities: [{ id: ids.destination, name: "Laboratorium tujuan" }], permissions: ["LAB_REQUEST_READ", "LAB_RESULT_READ", "LAB_RESULT_WRITE"] };
const option = (code: string, name: string) => ({ code, name });
export const labReferences = {
  testTypes: [option("TCM", "Molekuler langsung"), option("KULTUR", "Kultur langsung")], requestReasons: [option("DIAGNOSIS", "Diagnosis langsung"), option("FOLLOW_UP", "Tindak lanjut langsung")],
  requestStatuses: [option("DRAFT", "Draf"), option("REQUESTED", "Diminta langsung"), option("SENT", "Dikirim"), option("RECEIVED", "Diterima"), option("PARTIAL", "Hasil sebagian"), option("COMPLETED", "Selesai"), option("CANCELLED", "Dibatalkan")],
  ownerTypes: [option("REGISTRATION", "Registrasi langsung"), option("CASE", "Kasus langsung")], referralTypes: [option("INTERNAL", "Internal"), option("EXTERNAL", "Eksternal langsung")],
  testStatuses: [option("REQUESTED", "Diminta"), option("RESULT_AVAILABLE", "Hasil tersedia"), option("CANCELLED", "Dibatalkan")], resultStatuses: [option("FINAL", "Final langsung"), option("CORRECTED", "Dikoreksi langsung")],
};
export const labSpecimen = { id: labIds.specimen, version: 8, requestId: labIds.request, requestVersion: 50, specimenCode: "S-1", specimenType: "Dahak", collectedAt: "2026-09-01T01:00:00Z", sentAt: "2026-09-01T02:00:00Z", receivedAt: null, conditionOnReceipt: null, examinationPossible: null, rejectionReason: null, notes: "Catatan spesimen pribadi" };
export const usableSpecimen = { ...labSpecimen, id: labIds.usable, receivedAt: "2026-09-01T03:00:00Z", examinationPossible: true, notes: null };
export const labResult = { id: labIds.result, version: 11, testId: labIds.test, specimenId: labIds.usable, sequenceNo: 2, status: "CORRECTED", testedAt: "2026-09-01T04:00:00Z", resultCode: "FREE", resultValue: "Nilai hasil pribadi", resultText: "Narasi hasil pribadi" };
export const labDetail = {
  id: labIds.request, version: 50, owner: { type: "REGISTRATION", id: ids.registration }, patient: { patientId: ids.patient, fullName: "Pasien laboratorium pribadi", sex: { code: "L", name: "Laki-laki" }, birthDate: "1990-01-01", birthDateUnknown: false },
  requestingFacility: { id: ids.facility, name: "Puskesmas Asal" }, testingFacility: { id: ids.destination, name: "Laboratorium tujuan" }, requestReason: labReferences.requestReasons[0], referralType: "EXTERNAL", requestedAt: "2026-09-01T00:00:00Z", status: "REQUESTED",
  sampleShippingMethod: "Kurir", courierName: "Kurir pribadi", notes: "Catatan permintaan pribadi", tests: [{ id: labIds.test, version: 7, testType: labReferences.testTypes[0], status: "REQUESTED", latestResults: [labResult] }], specimens: [labSpecimen, usableSpecimen],
  completeness: { totalTests: 1, completedTests: 0, totalSpecimens: 2, receivedSpecimens: 1, usableSpecimens: 1, needsNewSpecimen: false },
};
const { sampleShippingMethod: _shipping, courierName: _courier, notes: _notes, specimens: _specimens, ...summary } = labDetail;
void _shipping; void _courier; void _notes; void _specimens;
export const labSummary = { ...summary, tests: labDetail.tests.map(({ latestResults: _results, ...test }) => { void _results; return test; }) };
export const labPage = { content: [labSummary], page: 0, size: 20, totalElements: 1 };
export const resultResponse = { ...labResult, requestId: labIds.request, requestVersion: 51, testVersion: 8 };
