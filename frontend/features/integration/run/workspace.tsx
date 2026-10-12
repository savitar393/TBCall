"use client";
import { AppDisclosure, AppPageHeader, AppStatusBadge } from "@/components/application-patterns";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { integrationQueries } from "../queries";
import { IntegrationNotice, RunFields, integrationLabel } from "../display";
import { formatDateTime } from "@/lib/date-format";
import { Fields, Panel, Pagination, QueryState, Refresh } from "@/features/administration/display";
export function IntegrationRun({ code, runId }: {
    code: string;
    runId: string;
}) {
    const { user } = useSession(), [page, setPage] = useState(0), read = useQuery(integrationQueries.run(user!, code, runId, page)), data = read.data?.data;
    return <div className="clinical-workspace">
    <AppPageHeader title="Detail proses sinkronisasi" eyebrow="Metadata lokal" actions={<Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>} />
    <IntegrationNotice />
    <QueryState pending={read.isPending} error={read.error}/>{data && <>
        <Panel title="Ringkasan proses">
        <RunFields run={data.run} code={code}/>
        </Panel>
        <Panel title="Item proses">{data.items.content.map((row, i) => <div key={i} className="clinical-record-row">
            <div className="mb-3 flex flex-wrap items-center gap-2"><AppStatusBadge>{integrationLabel(row.status)}</AppStatusBadge><span className="text-sm">{integrationLabel(row.operation)}</span></div><Fields values={{ "Jenis entitas": row.entityType, "ID eksternal": row.externalId, "Sumber diperbarui": formatDateTime(row.sourceUpdatedAt), "Diproses": formatDateTime(row.processedAt), "Ringkasan kesalahan aman": row.errorSummary }} /><AppDisclosure title="Identitas dan hash item"><Fields values={{ "ID entitas terselesaikan": row.resolvedEntityId, "Hash konten": row.contentHash, "Hash konten lokal": row.localContentHash, "ID konflik": row.conflictId }} /></AppDisclosure>
            </div>)}{!data.items.content.length && <p>Tidak ada item.</p>}<Pagination page={data.items.page} size={data.items.size} total={data.items.totalElements} onPage={setPage}/>
        </Panel>
        </>}</div>;
}
