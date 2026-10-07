import type { References, TargetType } from "./types";
export function eventTypes(ref: References, type: TargetType) {
  return type === "TPT" ? ref.tptEventTypes.filter(o => !["BACTERIOLOGY_FOLLOW_UP", "SAFETY_MONITORING"].includes(o.code)) : ref.treatmentEventTypes;
}
export function channels(ref: References) {
  return ref.notificationChannels.filter(o => o.code === "IN_APP");
}
export { label } from "@/features/continuity/display";
