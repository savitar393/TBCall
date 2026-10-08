"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { administrationQueries } from "./queries";
export function useAdministrationReferences() {
    const { user } = useSession();
    return useQuery(administrationQueries.references(user!));
}
