"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { integrationQueries } from "../queries";
import { IntegrationNotice, IntegrationFields } from "../display";
import { Pagination, QueryState, Refresh } from "@/features/administration/display";
export function IntegrationList() {
    const { user } = useSession(), [page, setPage] = useState(0), read = useQuery(integrationQueries.list(user!, page)), data = read.data?.data;
    return <>
    <h1 className="text-2xl font-semibold">Integrasi</h1>
    <IntegrationNotice />
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.length === 0 && <p>Tidak ada metadata integrasi.</p>}{data.content.map(row => <div key={row.code} className="space-y-3">
            <IntegrationFields data={row}/>
            <Link className="text-primary underline" href={`/integrations/${encodeURIComponent(row.code)}`}>Buka metadata {row.name}</Link>
            </div>)}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={setPage}/>
        </>}</>;
}
