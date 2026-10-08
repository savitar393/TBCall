"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { integrationQueries as queries } from "../queries";
import { IntegrationNotice, IntegrationFields, RunFields } from "../display";
import { Fields, Panel, Pagination, QueryState, Refresh } from "@/features/administration/display";
const sections = { identifiers: "Identitas eksternal", authorities: "Otoritas sumber", runs: "Proses sinkronisasi", conflicts: "Konflik" } as const;
type Section = keyof typeof sections;
export function IntegrationDetail({ code }: {
    code: string;
}) {
    const { user } = useSession(), [section, setSection] = useState<Section>("identifiers"), [pages, setPages] = useState<Record<Section, number>>({ identifiers: 0, authorities: 0, runs: 0, conflicts: 0 });
    const detail = useQuery(queries.detail(user!, code));
    return <>
    <h1 className="text-2xl font-semibold">Metadata integrasi</h1>
    <IntegrationNotice />
    <Refresh busy={detail.isFetching} onClick={() => void detail.refetch()}/>
    <QueryState pending={detail.isPending} error={detail.error}/>{detail.data && <>
        <IntegrationFields data={detail.data.data}/>
        <nav aria-label="Bagian metadata integrasi" className="flex flex-wrap gap-3">{Object.entries(sections).map(([key, label]) => <Button key={key} variant={section === key ? "default" : "outline"} aria-pressed={section === key} onClick={() => setSection(key as Section)}>{label}</Button>)}</nav>
        <MetadataSection key={section} code={code} section={section} page={pages[section]} onPage={page => setPages({ ...pages, [section]: page })}/>
        </>}</>;
}
function MetadataSection({ code, section, page, onPage }: {
    code: string;
    section: Section;
    page: number;
    onPage: (p: number) => void;
}) {
    // Each section keeps an independent page; only the selected section is fetched.
    return section === "identifiers" ? <Identifiers code={code} page={page} onPage={onPage}/> : section === "authorities" ? <Authorities code={code} page={page} onPage={onPage}/> : section === "runs" ? <Runs code={code} page={page} onPage={onPage}/> : <Conflicts code={code} page={page} onPage={onPage}/>;
}
type SectionProps = {
    code: string;
    page: number;
    onPage: (p: number) => void;
};
function Identifiers({ code, page, onPage }: SectionProps) {
    const { user } = useSession(), read = useQuery(queries.identifiers(user!, code, page)), data = read.data?.data;
    return <Panel title={sections.identifiers}>
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.map(row => <div key={row.id} className="border-b py-4">
            <Fields values={{ "ID metadata": row.id, "Jenis entitas": row.entityType, "ID entitas lokal": row.entityId, "ID eksternal": row.externalId, "Versi eksternal": row.externalVersion, "Pertama dilihat": row.firstSeenAt, "Terakhir dilihat": row.lastSeenAt }}/>
            </div>)}{!data.content.length && <p>Tidak ada data.</p>}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={onPage}/>
        </>}</Panel>;
}
function Authorities({ code, page, onPage }: SectionProps) {
    const { user } = useSession(), read = useQuery(queries.authorities(user!, code, page)), data = read.data?.data;
    return <Panel title={sections.authorities}>
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.map((row, i) => <div key={i} className="border-b py-4">
            <Fields values={{ "Jenis entitas": row.entityType, "ID entitas lokal": row.entityId, "Lingkup otoritas": row.authorityScope, "ID eksternal": row.externalId, "Versi sumber": row.sourceVersion, "Berlaku": row.effectiveAt, "Dilepas": row.releasedAt, "Otoritas aktif": row.releasedAt === null }}/>
            </div>)}{!data.content.length && <p>Tidak ada data.</p>}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={onPage}/>
        </>}</Panel>;
}
function Runs({ code, page, onPage }: SectionProps) {
    const { user } = useSession(), read = useQuery(queries.runs(user!, code, page)), data = read.data?.data;
    return <Panel title={sections.runs}>
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.map(row => <div key={row.id} className="border-b py-4">
            <RunFields run={row} code={code} link/>
            </div>)}{!data.content.length && <p>Tidak ada data.</p>}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={onPage}/>
        </>}</Panel>;
}
function Conflicts({ code, page, onPage }: SectionProps) {
    const { user } = useSession(), read = useQuery(queries.conflicts(user!, code, page)), data = read.data?.data;
    return <Panel title={sections.conflicts}>
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.map(row => <div key={row.id} className="border-b py-4">
            <Fields values={{ "ID konflik": row.id, "Jenis entitas": row.entityType, "ID entitas lokal": row.entityId, "ID eksternal": row.externalId, "Lingkup otoritas": row.authorityScope, "Versi sumber": row.sourceVersion, "Status": row.status, "Pertama dilihat": row.firstSeenAt, "Terakhir dilihat": row.lastSeenAt, "Diselesaikan": row.resolvedAt }}/>
            </div>)}{!data.content.length && <p>Tidak ada data.</p>}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={onPage}/>
        </>}</Panel>;
}
