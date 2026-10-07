import { z } from "@/lib/validation";
import type { Dirty, Event } from "../types";
import { localDateTimeToIso, isoToLocalDateTime, compareInstants } from "../time";
const text = z.string();
const date = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && z.iso.date().safeParse(v).success, "Tanggal wajib diisi dan valid.");
const optionalDate = z.union([z.literal(""), date]);
const local = text.refine(v => {
  try {
    localDateTimeToIso(v);
    return true;
  } catch {
    return false;
  }
}, "Waktu lokal wajib diisi dan tidak boleh ambigu.");
const optionalLocal = z.union([z.literal(""), local]);
export const emptyEvent = () => ({
  eventType: "",
  scheduledAt: "",
  dueAt: ""
});
export const emptyPlan = () => ({
  startDate: "",
  endDate: "",
  notes: "",
  events: [emptyEvent()]
});
export const eventInput = (v: ReturnType<typeof emptyEvent>) => ({
  eventType: v.eventType,
  scheduledAt: localDateTimeToIso(v.scheduledAt),
  ...(v.dueAt ? {
    dueAt: localDateTimeToIso(v.dueAt)
  } : {})
});
export const eventInputSchema = (types: {
  code: string;
}[]) => z.strictObject({
  eventType: text.refine(v => types.some(t => t.code === v), "Pilih jenis kegiatan yang tersedia."),
  scheduledAt: local,
  dueAt: optionalLocal
}).superRefine((v, c) => {
  if (v.dueAt && new Date(v.dueAt) < new Date(v.scheduledAt)) c.addIssue({
    code: "custom",
    path: ["dueAt"],
    message: "Batas waktu tidak boleh sebelum jadwal."
  });
});
export const createSchema = (types: {
  code: string;
}[], target: {
  startDate: string;
  plannedEndDate: string | null;
}) => z.strictObject({
  startDate: date,
  endDate: optionalDate,
  notes: text,
  events: z.array(eventInputSchema(types)).min(1, "Isi sedikitnya satu kegiatan.").max(100, "Maksimal 100 kegiatan.")
}).superRefine((v, c) => {
  if (v.startDate < target.startDate) c.addIssue({
    code: "custom",
    path: ["startDate"],
    message: "Mulai rencana tidak boleh sebelum mulai target."
  });
  if (v.endDate && v.endDate < v.startDate) c.addIssue({
    code: "custom",
    path: ["endDate"],
    message: "Akhir tidak boleh sebelum mulai."
  });
  if (v.endDate && target.plannedEndDate && v.endDate > target.plannedEndDate) c.addIssue({
    code: "custom",
    path: ["endDate"],
    message: "Akhir tidak boleh setelah akhir rencana target."
  });
});
export const planEditSchema = (startDate: string) => z.strictObject({
  endDate: optionalDate,
  notes: text
}).refine(v => !v.endDate || v.endDate >= startDate, {
  path: ["endDate"],
  message: "Akhir tidak boleh sebelum mulai."
});
export const planPatch = (v: {
  endDate: string;
  notes: string;
}, dirty: Dirty) => ({
  ...(dirty.endDate ? {
    endDate: v.endDate || null
  } : {}),
  ...(dirty.notes ? {
    notes: v.notes || null
  } : {})
});
export const rescheduleValues = (e: Event) => ({
  scheduledAt: isoToLocalDateTime(e.scheduledAt),
  dueAt: e.dueAt ? isoToLocalDateTime(e.dueAt) : ""
});
export const rescheduleSchema = (e: Event) => {
  const original = rescheduleValues(e);
  const unchangedOrLocal = (originalValue: string, optional = false) => text.refine(v => {
    if (v === originalValue) return true;
    if (optional && v === "") return true;
    try {
      localDateTimeToIso(v);
      return true;
    } catch {
      return false;
    }
  }, "Waktu lokal wajib diisi dan tidak boleh ambigu.");
  return z.strictObject({
    scheduledAt: unchangedOrLocal(original.scheduledAt),
    dueAt: unchangedOrLocal(original.dueAt, true)
  }).superRefine((v, c) => {
    try {
      const scheduled = v.scheduledAt === original.scheduledAt ? e.scheduledAt : localDateTimeToIso(v.scheduledAt);
      const due = v.dueAt === original.dueAt ? e.dueAt : v.dueAt ? localDateTimeToIso(v.dueAt) : null;
      if (due && compareInstants(due, scheduled) < 0) c.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "Batas waktu tidak boleh sebelum jadwal."
      });
    } catch {/* Field validators supply safe local-time feedback. */}
  });
};
export const eventPatch = (v: {
  scheduledAt: string;
  dueAt: string;
}, dirty: Dirty) => ({
  ...(dirty.scheduledAt ? {
    scheduledAt: localDateTimeToIso(v.scheduledAt)
  } : {}),
  ...(dirty.dueAt ? {
    dueAt: v.dueAt ? localDateTimeToIso(v.dueAt) : null
  } : {})
});
export const completionSchema = (e: Event) => z.strictObject({
  completedAt: optionalLocal
}).superRefine((v, c) => {
  if (!v.completedAt) return;
  try {
    const completedAt = localDateTimeToIso(v.completedAt);
    if (compareInstants(completedAt, e.scheduledAt) < 0 || compareInstants(completedAt, new Date().toISOString()) > 0) c.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "Waktu selesai harus sejak jadwal dan tidak setelah waktu browser saat ini."
    });
  } catch {/* The local field validator supplies safe feedback. */}
});
export const confirmationSchema = z.strictObject({
  confirmed: z.boolean().refine(v => v, "Konfirmasi diperlukan.")
});
