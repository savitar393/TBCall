import { queryOptions } from "@tanstack/react-query";
import { clinicalApi } from "./api";
import type { PatientFilters, CaseHistoryFilters } from "./types";
export const clinicalKeys = (userId: string) => ["clinical", userId] as const;
export const clinicalQueries = {
  caseHistory: (userId: string, filters: CaseHistoryFilters) => queryOptions({ queryKey: [...clinicalKeys(userId), "case-history", filters], queryFn: ({ signal }) => clinicalApi.caseHistory(filters, signal) }),
  patients: (userId: string, filters: PatientFilters) => queryOptions({ queryKey: [...clinicalKeys(userId), "patients", filters], queryFn: ({ signal }) => clinicalApi.patients(filters, signal) }),
  patient: (userId: string, id: string) => queryOptions({ queryKey: [...clinicalKeys(userId), "patient", id], queryFn: ({ signal }) => clinicalApi.patient(id, signal) }),
  registration: (userId: string, id: string) => queryOptions({ queryKey: [...clinicalKeys(userId), "registration", id], queryFn: ({ signal }) => clinicalApi.registration(id, signal) }),
  diagnoses: (userId: string, id: string) => queryOptions({ queryKey: [...clinicalKeys(userId), "diagnoses", id], queryFn: ({ signal }) => clinicalApi.diagnoses(id, signal) }),
  diagnosis: (userId: string, id: string) => queryOptions({ queryKey: [...clinicalKeys(userId), "diagnosis", id], queryFn: ({ signal }) => clinicalApi.diagnosis(id, signal) }),
  tbCase: (userId: string, id: string) => queryOptions({ queryKey: [...clinicalKeys(userId), "case", id], queryFn: ({ signal }) => clinicalApi.tbCase(id, signal) }),
  references: (userId: string) => queryOptions({ queryKey: [...clinicalKeys(userId), "references"], queryFn: ({ signal }) => clinicalApi.references(signal), staleTime: 5 * 60 * 1000 }),
  facilities: (userId: string, query: string, page: number) => queryOptions({ queryKey: [...clinicalKeys(userId), "facilities", query, page], queryFn: ({ signal }) => clinicalApi.facilities(query, page, signal), enabled: query.trim().length >= 2 && query.trim().length <= 255 }),
};
