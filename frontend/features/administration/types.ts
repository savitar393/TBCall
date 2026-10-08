import type { z } from "@/lib/validation";
import type * as s from "./schemas";
export type Facility = z.infer<typeof s.facilitySchema>;
export type FacilitySummary = z.infer<typeof s.facilitySummarySchema>;
export type FacilityFilters = {
    page: number;
    query?: string;
    active?: boolean;
};
export type UserLookup = z.infer<typeof s.userLookupSchema>;
export type References = z.infer<typeof s.referencesSchema>;
export type FacilityInput = {
    name?: string;
    facilityTypeCode?: string | null;
    parentFacilityId?: string | null;
    address?: string | null;
    provinceCode?: string | null;
    regencyCode?: string | null;
    districtCode?: string | null;
    villageCode?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
};
export type ManagedRole = z.infer<typeof s.managedRoleCode>;
