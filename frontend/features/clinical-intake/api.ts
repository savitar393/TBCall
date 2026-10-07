import type { z } from "@/lib/validation";
import { z as validation } from "@/lib/validation";
import { apiRequest, type ApiOptions, type Versioned } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import * as schemas from "./schemas";
import type { ClinicalInput, PatientFilters } from "./types";

async function request<S extends z.ZodType>(path: string, schema: S, options: ApiOptions = {}): Promise<Versioned<z.infer<S>>> {
  const result = await apiRequest<unknown>(path, options);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new ApiError({ status: 502, title: "Respons layanan tidak valid", code: "INVALID_RESPONSE" });
  return { data: parsed.data, etag: result.etag };
}
const segment = (id: string) => encodeURIComponent(id);
export const clinicalApi = {
  patients: (filters: PatientFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams({ page: String(filters.page), size: String(filters.size) });
    for (const key of ["name", "nik", "bpjs", "registrationStatus", "caseStatus", "facilityId"] as const) if (filters[key]) params.set(key, filters[key]);
    return request(`/v1/patients?${params}`, schemas.patientPageSchema, { signal });
  },
  patient: (id: string, signal?: AbortSignal) => request(`/v1/patients/${segment(id)}`, schemas.patientDetailSchema, { signal }),
  registration: (id: string, signal?: AbortSignal) => request(`/v1/registrations/${segment(id)}`, schemas.registrationSchema, { signal }),
  diagnoses: (id: string, signal?: AbortSignal) => request(`/v1/registrations/${segment(id)}/diagnoses`, validation.array(schemas.diagnosisSchema), { signal }),
  diagnosis: (id: string, signal?: AbortSignal) => request(`/v1/diagnoses/${segment(id)}`, schemas.diagnosisSchema, { signal }),
  tbCase: (id: string, signal?: AbortSignal) => request(`/v1/cases/${segment(id)}`, schemas.caseSchema, { signal }),
  references: (signal?: AbortSignal) => request("/v1/clinical-reference-data", schemas.referenceDataSchema, { signal }),
  facilities: (query: string, page: number, signal?: AbortSignal) => request(`/v1/clinical-facilities?${new URLSearchParams({ query, page: String(page), size: "20" })}`, schemas.facilityPageSchema, { signal }),
  resolve: (body: ClinicalInput, signal?: AbortSignal) => request("/v1/patients/resolve", schemas.identityConfirmationSchema, { method: "POST", body, signal }),
  createRegistration: (body: { facilityId: string; newPatient?: ClinicalInput; existingPatient?: ClinicalInput } & ClinicalInputExtras, signal?: AbortSignal) => request("/v1/registrations", schemas.registrationSchema, { method: "POST", body, signal }),
  createDiagnosis: (id: string, body: ClinicalInput, etag: string, signal?: AbortSignal) => request(`/v1/registrations/${segment(id)}/diagnoses`, schemas.diagnosisSchema, { method: "POST", body, etag, signal }),
  confirmCase: (id: string, body: ClinicalInput, etag: string, signal?: AbortSignal) => request(`/v1/registrations/${segment(id)}/cases`, schemas.caseSchema, { method: "POST", body, etag, signal }),
  patchPatient: (id: string, body: ClinicalInput, etag: string, signal?: AbortSignal) => request(`/v1/patients/${segment(id)}`, schemas.patientDetailSchema, { method: "PATCH", body, etag, signal }),
  patchRegistration: (id: string, body: ClinicalInput, etag: string, signal?: AbortSignal) => request(`/v1/registrations/${segment(id)}`, schemas.registrationSchema, { method: "PATCH", body, etag, signal }),
  patchDiagnosis: (id: string, body: ClinicalInput, etag: string, signal?: AbortSignal) => request(`/v1/diagnoses/${segment(id)}`, schemas.diagnosisSchema, { method: "PATCH", body, etag, signal }),
  patchCase: (id: string, body: ClinicalInput, etag: string, signal?: AbortSignal) => request(`/v1/cases/${segment(id)}`, schemas.caseSchema, { method: "PATCH", body, etag, signal }),
};
type ClinicalInputExtras = { [key: string]: string | number | boolean | null | ClinicalInput | undefined };
