"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { integrationQueries } from "../queries";
import { IntegrationNotice, RunFields } from "../display";
import { Fields, Panel, Pagination, QueryState, Refresh } from "@/features/administration/display";
export function IntegrationRun({ code, runId }: {
    code: string;
    runId: string;
}) {
    const { user } = useSession(), [page, setPage] = useState(0), read = useQuery(integrationQueries.run(user!, code, runId, page)), data = read.data?.data;
    return <>
    <h1 className="text-2xl font-semibold">Detail proses sinkronisasi</h1>
    <IntegrationNotice />
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>
        <Panel title="Ringkasan proses">
        <RunFields run={data.run} code={code}/>
        </Panel>
        <Panel title="Item proses">{data.items.content.map((row, i) => <div key={i} className="border-b py-4">
            <Fields values={{ "Jenis entitas": row.entityType, "ID eksternal": row.externalId, "ID entitas terselesaikan": row.resolvedEntityId, "Operasi": row.operation, "Status": row.status, "Sumber diperbarui": row.sourceUpdatedAt, "Hash konten": row.contentHash, "Hash konten lokal": row.localContentHash, "ID konflik": row.conflictId, "Diproses": row.processedAt, "Ringkasan kesalahan aman": row.errorSummary }}/>
            </div>)}{!data.items.content.length && <p>Tidak ada item.</p>}<Pagination page={data.items.page} size={data.items.size} total={data.items.totalElements} onPage={setPage}/>
        </Panel>
        </>}</>;
}
