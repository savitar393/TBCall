import { z } from "@/lib/validation";
import { isoToLocalDateTime, localDateTimeToIso } from "../time";
import type { Result } from "../types";
const text = (max: number) => z.string().max(max);
const localTime = z.string().refine(v => { try { localDateTimeToIso(v); return true; } catch { return false; } }, "Isi waktu lokal yang valid dan tidak berulang saat pergantian zona waktu.");
const optionalTime = z.union([z.literal(""), localTime]);
export const requestFormSchema = z.object({ testingFacilityId: z.uuid("Pilih fasilitas pemeriksa."), testTypeCodes: z.array(z.string().min(1)).min(1, "Pilih pemeriksaan.").max(10).refine(v => new Set(v).size === v.length, "Pemeriksaan harus berbeda."), sampleShippingMethod: text(100), courierName: text(150), notes: z.string() });
export const requestValues = () => ({ testingFacilityId: "", testTypeCodes: [] as string[], sampleShippingMethod: "", courierName: "", notes: "" });
export const specimenFormSchema = z.object({ specimenCode: text(100), specimenType: text(100).refine(v => !!v.trim(), "Jenis spesimen wajib diisi."), collectedAt: optionalTime, sentAt: optionalTime, notes: z.string() }).refine(v => {
  if (!v.collectedAt || !v.sentAt) return true;
  try { return new Date(localDateTimeToIso(v.sentAt)) >= new Date(localDateTimeToIso(v.collectedAt)); }
  catch { return false; }
}, { path: ["sentAt"], message: "Pengiriman tidak boleh mendahului pengumpulan." });
export const specimenValues = () => ({ specimenCode: "", specimenType: "", collectedAt: "", sentAt: "", notes: "" });
export const receiveFormSchema = z.object({ receivedAt: localTime, conditionOnReceipt: text(100), examinationPossible: z.string().refine((v): boolean => v === "true" || v === "false", "Pilih kelayakan pemeriksaan."), rejectionReason: z.string(), notes: z.string() }).refine(v => v.examinationPossible !== "false" || !!v.rejectionReason.trim(), { path: ["rejectionReason"], message: "Alasan penolakan wajib diisi." });
export const receiveValues = () => ({ receivedAt: "", conditionOnReceipt: "", examinationPossible: "", rejectionReason: "", notes: "" });
export const resultFormSchema = z.object({ specimenId: z.union([z.literal(""), z.uuid()]), testedAt: localTime, resultCode: text(100), resultValue: text(255), resultText: z.string() }).refine(v => !!(v.resultCode.trim() || v.resultValue.trim() || v.resultText.trim()), { path: ["resultCode"], message: "Isi sekurangnya satu kode, nilai atau narasi hasil." });
export const correctionFormSchema = (original: Result) => resultFormSchema.safeExtend({ testedAt: z.union([z.literal(isoToLocalDateTime(original.testedAt)), localTime]) });
export const resultValues = (result?: Result) => ({ specimenId: result?.specimenId ?? "", testedAt: result ? isoToLocalDateTime(result.testedAt) : "", resultCode: result?.resultCode ?? "", resultValue: result?.resultValue ?? "", resultText: result?.resultText ?? "" });
export type RequestValues = z.infer<typeof requestFormSchema>;
export type SpecimenValues = z.infer<typeof specimenFormSchema>;
export type ReceiveValues = z.infer<typeof receiveFormSchema>;
export type ResultValues = z.infer<typeof resultFormSchema>;
