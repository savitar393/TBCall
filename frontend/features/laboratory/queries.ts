import { queryOptions } from "@tanstack/react-query";
import { labApi } from "./api";
import type { RequestFilters } from "./types";
export const labKeys = (userId: string) => ["laboratory", userId] as const;
export const labQueries = {
  references: (userId: string) => queryOptions({ queryKey: [...labKeys(userId), "references"], queryFn: ({ signal }) => labApi.references(signal), staleTime: 5 * 60 * 1000 }),
  requests: (userId: string, filters: RequestFilters) => queryOptions({ queryKey: [...labKeys(userId), "requests", filters], queryFn: ({ signal }) => labApi.requests(filters, signal) }),
  request: (userId: string, id: string) => queryOptions({ queryKey: [...labKeys(userId), "request", id], queryFn: ({ signal }) => labApi.request(id, signal) }),
};
