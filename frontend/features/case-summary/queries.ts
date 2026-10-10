import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import { summarySchema } from "./schemas";
export type SummaryPages = { diagnosisPage: number; labPage: number; treatmentPage: number };
export const summaryQuery = (userId: string, caseId: string, pages: SummaryPages) => queryOptions({
  queryKey: ["clinical", userId, "case-summary", caseId, pages], retry: false,
  queryFn: async ({ signal }) => {
    const response = await apiRequest<unknown>(`/v1/cases/${encodeURIComponent(caseId)}/summary?${new URLSearchParams(Object.entries(pages).map(([key, value]) => [key, String(value)]))}`, { signal });
    const data = summarySchema.safeParse(response.data);
    if (!data.success || data.data.caseId !== caseId) throw new ApiError({ status: 502, code: "INVALID_RESPONSE", title: "Respons layanan tidak valid" });
    return data.data;
  },
});
