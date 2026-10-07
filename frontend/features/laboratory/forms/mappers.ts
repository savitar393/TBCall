import { isoToLocalDateTime, localDateTimeToIso } from "../time";
import type { OwnerType, CreateInput, SpecimenInput, ReceiveInput, ResultInput, CorrectionInput, Result } from "../types";
import type { RequestValues, SpecimenValues, ReceiveValues, ResultValues } from "./values";
const optional = (v: string) => v.trim() || null;
export function createInput(v: RequestValues, ownerType: OwnerType, id: string): CreateInput { return { ...(ownerType === "REGISTRATION" ? { registrationId: id } : { caseId: id }), testingFacilityId: v.testingFacilityId, requestReasonCode: ownerType === "REGISTRATION" ? "DIAGNOSIS" : "FOLLOW_UP", testTypeCodes: [...v.testTypeCodes], sampleShippingMethod: optional(v.sampleShippingMethod), courierName: optional(v.courierName), notes: optional(v.notes) }; }
export function specimenInput(v: SpecimenValues): SpecimenInput { return { specimenCode: optional(v.specimenCode), specimenType: v.specimenType.trim(), collectedAt: v.collectedAt ? localDateTimeToIso(v.collectedAt) : null, sentAt: v.sentAt ? localDateTimeToIso(v.sentAt) : null, notes: optional(v.notes) }; }
export function receiveInput(v: ReceiveValues): ReceiveInput { return { receivedAt: localDateTimeToIso(v.receivedAt), conditionOnReceipt: optional(v.conditionOnReceipt), examinationPossible: v.examinationPossible === "true", rejectionReason: v.examinationPossible === "false" ? optional(v.rejectionReason) : null, notes: optional(v.notes) }; }
export function correctionInput(v: ResultValues, original?: Result): CorrectionInput {
  const unchanged = original && v.testedAt === isoToLocalDateTime(original.testedAt);
  return { testedAt: unchanged ? original.testedAt : localDateTimeToIso(v.testedAt), resultCode: optional(v.resultCode), resultValue: optional(v.resultValue), resultText: optional(v.resultText) };
}
export function resultInput(v: ResultValues): ResultInput { return { specimenId: v.specimenId || null, ...correctionInput(v) }; }
