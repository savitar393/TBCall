import { z } from "@/lib/validation";
const uuid = z.uuid(), version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// These masks match TBCall's F5B projections, not an SITB field specification.
const emailMask = z.string().regex(/^(?:\*\*\*|[^\s@]\*\*\*@[^\s@]+)$/);
const phoneMask = z.string().regex(/^\*\*\*(?:[^\r\n]{4})?$/);
export const matchedLoginSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("EMAIL"), maskedValue: emailMask }).strict(),
    z.object({ kind: z.literal("PHONE"), maskedValue: phoneMask }).strict(),
]);
export const candidateSchema = z.object({ userId: uuid, matchedLogin: matchedLoginSchema }).strict();
export const maskedAccountSchema = z.object({ maskedEmail: emailMask.nullable(), maskedPhone: phoneMask.nullable() }).strict();
const verification = z.enum(["PENDING", "VERIFIED", "REJECTED", "REVOKED"]);
export const patientLinkStateSchema = z.object({ id: uuid, patientId: uuid, userId: uuid, relationshipType: z.literal("SELF"), verificationStatus: z.literal("VERIFIED"), maskedAccount: maskedAccountSchema }).strict();
export const patientStateSchema = z.object({ link: patientLinkStateSchema.nullable() }).strict();
export const pairStateSchema = z.object({ patientId: uuid, userId: uuid, pair: z.object({ id: uuid, verificationStatus: verification }).strict().nullable() }).strict();
export const supporterTypeSchema = z.enum(["PMO", "COMPANION"]);
export const supporterSummarySchema = z.object({ id: uuid, supporterType: supporterTypeSchema, fullName: z.string().min(1).max(255), active: z.boolean(), maskedPhone: phoneMask.nullable(), linked: z.boolean() }).strict();
export const supporterPageSchema = z.object({ content: z.array(supporterSummarySchema), page: z.number().int().nonnegative(), size: z.number().int().positive().max(50), totalElements: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
export const supporterDetailSchema = supporterSummarySchema.omit({ linked: true }).extend({ caseId: uuid, linkedUser: maskedAccountSchema.extend({ userId: uuid }).strict().nullable(), version }).strict();
export const patientLinkResponseSchema = z.object({ id: uuid, patientId: uuid, userId: uuid, relationshipType: z.literal("SELF"), verificationStatus: verification, version }).strict();
export const supporterLinkResponseSchema = z.object({ id: uuid, caseId: uuid, linkedUserId: uuid.nullable(), version }).strict();
export const supporterInputSchema = z.object({ supporterType: supporterTypeSchema, fullName: z.string().trim().min(1, "Nama wajib diisi").max(255, "Nama maksimal 255 karakter"), phone: z.string().max(30, "Telepon maksimal 30 karakter") }).strict();
export type Candidate = z.infer<typeof candidateSchema>;
export type SupporterInput = z.infer<typeof supporterInputSchema>;
