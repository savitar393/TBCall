import type { z } from "@/lib/validation";
import type * as s from "./schemas";
export type References=z.infer<typeof s.referenceDataSchema>;
export type TreatmentDetail=z.infer<typeof s.treatmentDetailSchema>;
export type AdverseView=z.infer<typeof s.adverseSchema>;
export type FollowUpView=z.infer<typeof s.followUpSchema>;
export type CommandInput=Record<string,string|number|boolean|null>;
