import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import { dashboardSchema } from "./contracts";
export type DashboardPages = { upcomingPage: number; overduePage: number; labPage: number };
export const dashboardQuery = (userId: string, pages: DashboardPages) => queryOptions({
  queryKey: ["clinical", userId, "operational-dashboard", pages], retry: false,
  queryFn: async ({ signal }) => {
    const response = await apiRequest<unknown>(`/v1/operational-dashboard?${new URLSearchParams(Object.entries(pages).map(([key, value]) => [key, String(value)]))}`, { signal });
    const parsed = dashboardSchema.safeParse(response.data);
    if (!parsed.success) throw new ApiError({ status: 502, code: "INVALID_RESPONSE", title: "Respons layanan tidak valid" });
    return parsed.data;
  },
});
