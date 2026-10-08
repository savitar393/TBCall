import type { z } from "@/lib/validation";
import type * as s from "./schemas";
export type IntegrationSummary = z.infer<typeof s.integrationSchema>;
export type RunSummary = z.infer<typeof s.runSummarySchema>;
export type ItemSummary = z.infer<typeof s.itemSchema>;
export type Section = "external-identifiers" | "authorities" | "sync-runs" | "conflicts";
