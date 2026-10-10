import type { Summary } from "@/features/case-summary/schemas";
import { ids, facility, registrationSummary, officer } from "./clinical-fixtures";
export const summaryActor = { ...officer, permissions: [...officer.permissions, "LAB_REQUEST_READ", "LAB_RESULT_READ", "TREATMENT_READ", "ADHERENCE_READ", "FOLLOW_UP_READ", "OUTCOME_READ"] };
export const summaryFixture: Summary = {
  caseId: ids.tbCase, fullName: "Fictional summary patient", status: "ACTIVE", currentFacility: facility, caseCategoryCode: "TB_SO", confirmedAt: "2026-01-01T00:00:00Z",
  registration: { state: "AVAILABLE", data: registrationSummary },
  diagnoses: { state: "AVAILABLE", data: { content: [{ id: ids.diagnosis, diagnosisDate: "2026-01-01", anatomicalSiteCode: "PARU", diagnosisTypeCode: "KLINIS", diagnosisResult: "Recorded fictional diagnosis", treatmentDisposition: "TREAT_HERE", confirming: true }], page: 0, size: 5, totalElements: 1 } },
  laboratory: { state: "AVAILABLE", data: { content: [{ id: "77777777-7777-4777-8777-777777777777", ownerType: "REGISTRATION", status: "COMPLETED", requestReasonCode: "DIAGNOSIS", requestedAt: "2026-01-01T00:00:00Z", requestingFacility: facility, testingFacility: facility,
    results: { hasMore: false, content: [
      { id: "88888888-8888-4888-8888-888888888888", testId: "99999999-9999-4999-8999-999999999999", specimenId: null, testTypeCode: "TCM", sequenceNo: 2, status: "CORRECTED", testedAt: "2026-01-02T00:00:00Z", resultCode: null, resultValue: "Fictional corrected value", resultText: null, latest: true },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", testId: "99999999-9999-4999-8999-999999999999", specimenId: null, testTypeCode: "TCM", sequenceNo: 1, status: "FINAL", testedAt: "2026-01-01T00:00:00Z", resultCode: null, resultValue: "Fictional original value", resultText: null, latest: false },
    ] } }], page: 0, size: 5, totalElements: 1 } },
  treatments: { state: "AVAILABLE", data: { content: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "COMPLETED", facility, regimenName: "Fictional recorded regimen", startDate: "2026-01-02", plannedEndDate: null, actualEndDate: "2026-01-03", drugs: { content: [{ drugName: "Fictional recorded drug", treatmentPhase: null, doseValue: null, doseUnit: null, frequencyPerWeek: null, startDate: "2026-01-02", endDate: null }], hasMore: false },
    doses: { state: "AVAILABLE", data: { content: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", scheduledDate: "2026-01-02", recordedAt: "2026-01-02T12:00:00Z", status: "TAKEN_SELF_REPORTED", administrationMode: "SELF_ADMINISTERED", source: "PATIENT" }], hasMore: false } },
    followUps: { state: "AVAILABLE", data: { content: [
      { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", followUpType: "Fictional scheduled follow-up", status: "SCHEDULED", scheduledAt: "2026-01-04T00:00:00Z", completedAt: null, facility, weightKg: null, symptomSummary: null, adherenceAssessment: null },
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", followUpType: "Fictional completed follow-up", status: "COMPLETED", scheduledAt: "2026-01-02T00:00:00Z", completedAt: "2026-01-03T00:00:00Z", facility, weightKg: 60, symptomSummary: "Recorded fictional observation", adherenceAssessment: "UNSPECIFIED" },
    ], hasMore: false } },
    outcome: { state: "AVAILABLE", data: { outcomeCode: "MENINGGAL", outcomeName: "Fictional explicit outcome", outcomeDate: "2026-01-03" } },
  }], page: 0, size: 5, totalElements: 1 } },
};
