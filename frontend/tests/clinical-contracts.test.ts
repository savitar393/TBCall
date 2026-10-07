import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/problem";
import { ids, patientPage, patientDetail, registration, diagnosis, caseView, identityConfirmation, references, facilityPage, officer } from "./clinical-fixtures";
import * as schemas from "@/features/clinical-intake/schemas";
import * as mappers from "@/features/clinical-intake/forms/mappers";
import * as values from "@/features/clinical-intake/forms/values";
import * as api from "@/features/clinical-intake/api";
import * as permissions from "@/features/clinical-intake/permissions";
beforeEach(() => { document.cookie = "XSRF-TOKEN=fixture; Path=/"; });
it.each([
  ["patientPageSchema", patientPage], ["patientDetailSchema", patientDetail], ["registrationSchema", registration],
  ["diagnosisSchema", diagnosis], ["caseSchema", caseView], ["identityConfirmationSchema", identityConfirmation],
  ["referenceDataSchema", references], ["facilityPageSchema", facilityPage],
] as const)("validates complete %s and rejects missing or extra response data", (name, fixture) => {
  expect(schemas).not.toBeNull(); if (!schemas) return;
  const schema = schemas[name];
  expect(schema.safeParse(fixture).success).toBe(true);
  expect(schema.safeParse({ ...fixture, sourcePassword: "unexpected" }).success).toBe(false);
  const missing = { ...fixture } as Record<string, unknown>; delete missing[Object.keys(fixture)[0]];
  expect(schema.safeParse(missing).success).toBe(false);
});
it("rejects unmasked identity values at worklist and resolution boundaries", () => {
  expect(schemas).not.toBeNull(); if (!schemas) return;
  expect(schemas.patientPageSchema.safeParse({ ...patientPage, content: [{ ...patientPage.content[0], nik: "1234567890121234" }] }).success).toBe(false);
  expect(schemas.identityConfirmationSchema.safeParse({ ...identityConfirmation, bpjsNumber: "1234567894321" }).success).toBe(false);
});
it("validates real calendar dates and nested safe facility projection", () => {
  expect(schemas).not.toBeNull(); if (!schemas) return;
  expect(schemas.diagnosisSchema.safeParse({ ...diagnosis, diagnosisDate: "2026-02-30" }).success).toBe(false);
  expect(schemas.facilityPageSchema.safeParse({ ...facilityPage, content: [{ ...facilityPage.content[0], address: "private" }] }).success).toBe(false);
});
it("maps patient citizenship/date pairs without serializing response-only fields", () => {
  expect(mappers).not.toBeNull(); expect(values).not.toBeNull(); if (!mappers || !values) return;
  const form = { ...values.patientValues(patientDetail), citizenship: "WNA" as const, otherIdentityNumber: "PASSPORT1", birthDateUnknown: true };
  expect(mappers.patientPatch(form, { citizenship: true, otherIdentityNumber: true, birthDateUnknown: true })).toEqual({ citizenship: "WNA", otherIdentityNumber: "PASSPORT1", nik: null, birthDate: null, birthDateUnknown: true });
});
it("clears WNA identity for WNI and sends only dirty fields on unrelated edits", () => {
  expect(mappers).not.toBeNull(); expect(values).not.toBeNull(); if (!mappers || !values) return;
  const form = { ...values.patientValues(patientDetail), citizenship: "WNI" as const, phone: "", birthDate: "1991-02-03" };
  expect(mappers.patientPatch(form, { phone: true })).toEqual({ phone: null });
  expect(mappers.patientPatch(form, { citizenship: true })).toEqual({ citizenship: "WNI", otherIdentityNumber: null });
  expect(mappers.patientPatch(form, { birthDate: true })).toEqual({ birthDate: "1991-02-03", birthDateUnknown: false });
});
it("omits untouched historical codes and preserves decimal strings until validated payload conversion", () => {
  expect(mappers).not.toBeNull(); expect(values).not.toBeNull(); if (!mappers || !values) return;
  const form = { ...values.registrationValues(registration), initialWeightKg: "56.25", referralNotes: "" };
  expect(mappers.registrationPatch(form, { initialWeightKg: true, referralNotes: true })).toEqual({ initialWeightKg: 56.25, referralNotes: null });
  expect(mappers.registrationPatch(form, {})).toEqual({});
});
it.each(["0", "-1", "10000", "1.234", "NaN", "1e2", "Infinity"])("rejects invalid clinical decimal %s before converting to JSON", value => {
  expect(values).not.toBeNull(); if (!values) return;
  expect(values.registrationFormSchema.safeParse({ ...values.registrationValues(registration), initialWeightKg: value }).success).toBe(false);
});
it("diagnosis disposition change explicitly clears destination without inferring other clinical fields", () => {
  expect(mappers).not.toBeNull(); expect(values).not.toBeNull(); if (!mappers || !values) return;
  const form = { ...values.diagnosisValues(diagnosis), treatmentDisposition: "NOT_TREATED" as const };
  expect(mappers.diagnosisPatch(form, { treatmentDisposition: true })).toEqual({ treatmentDisposition: "NOT_TREATED", referredToFacilityId: null });
});
it("case patch supports nullable health-worker/measurements and never sends status/confirming diagnosis", () => {
  expect(mappers).not.toBeNull(); expect(values).not.toBeNull(); if (!mappers || !values) return;
  const form = { ...values.caseValues(caseView), healthWorker: "" as const, weightKg: "", heightCm: "170.25" };
  expect(mappers.casePatch(form, { healthWorker: true, weightKg: true, heightCm: true })).toEqual({ healthWorker: null, weightKg: null, heightCm: 170.25 });
});
it("existing patient confirmation retains exact submitted values and excludes masked response identities", () => {
  expect(mappers).not.toBeNull(); if (!mappers) return;
  const original = { citizenship: "WNI", nik: "1234567890121234", otherIdentityNumber: "", fullName: "Pasien Contoh", birthDate: "", bpjsNumber: "" };
  expect(mappers.existingPatient(original, ids.patient)).toEqual({ patientId: ids.patient, citizenship: "WNI", nik: "1234567890121234", fullName: "Pasien Contoh" });
});
it("a role alone grants no permission and a patient role never passes the officer actor gate", () => {
  expect(permissions).not.toBeNull(); if (!permissions) return;
  expect(permissions.canClinical({ ...officer, permissions: [] }, "PATIENT_READ")).toBe(false);
  expect(permissions.canClinical({ ...officer, roles: [{ code: "PATIENT", name: "Pasien" }] }, "PATIENT_READ")).toBe(false);
  expect(permissions.canClinical(officer, "PATIENT_READ")).toBe(true);
});
it("passes AbortSignal through native clinical GET and safely rejects malformed backend response", async () => {
  expect(api).not.toBeNull(); if (!api) return;
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...diagnosis, extra: true })); vi.stubGlobal("fetch", transport);
  const controller = new AbortController();
  await expect(api.clinicalApi.diagnosis(ids.diagnosis, controller.signal)).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
  expect(transport.mock.calls[0][1]?.signal).toBe(controller.signal);
});
it("sends exact server ETag and only mapped payload to patient PATCH, with no replay", async () => {
  expect(api).not.toBeNull(); if (!api) return;
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 409, title: "private", code: "OPTIMISTIC_LOCK_CONFLICT" }, { status: 409, headers: { "Content-Type": "application/problem+json" } })); vi.stubGlobal("fetch", transport);
  await expect(api.clinicalApi.patchPatient(ids.patient, { phone: null }, '"opaque-server-tag"')).rejects.toBeInstanceOf(ApiError);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(new Headers(transport.mock.calls[0][1]?.headers).get("If-Match")).toBe('"opaque-server-tag"');
  expect(transport.mock.calls[0][1]?.body).toBe('{"phone":null}');
});
