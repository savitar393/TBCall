"use client";
import { AppDisclosure, AppPageHeader, AppStatusBadge } from "@/components/application-patterns";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { integrationQueries as queries } from "../queries";
import { IntegrationNotice, IntegrationFields, RunFields, integrationLabel } from "../display";
import { Fields, Panel, Pagination, QueryState, Refresh } from "@/features/administration/display";
const sections = { identifiers: "Identitas eksternal", authorities: "Otoritas sumber", runs: "Proses sinkronisasi", conflicts: "Konflik" } as const;
type Section = keyof typeof sections;
export function IntegrationDetail({ code }: {
    code: string;
}) {
    const { user } = useSession(), [section, setSection] = useState<Section>("identifiers"), [pages, setPages] = useState<Record<Section, number>>({ identifiers: 0, authorities: 0, runs: 0, conflicts: 0 });
    const detail = useQuery(queries.detail(user!, code));
    return <div className="clinical-workspace">
    <AppPageHeader title="Metadata integrasi" eyebrow="Administrasi" actions={<Refresh busy={detail.isFetching} onClick={() => void detail.refetch()}/>} />
    <IntegrationNotice />
    <QueryState pending={detail.isPending} error={detail.error}/>{detail.data && <>
        <IntegrationFields data={detail.data.data}/>
        <nav aria-label="Bagian metadata integrasi" className="app-view-links">{Object.entries(sections).map(([key, label]) => <Button key={key} variant={section === key ? "default" : "outline"} aria-pressed={section === key} onClick={() => setSection(key as Section)}>{label}</Button>)}</nav>
        <MetadataSection key={section} code={code} section={section} page={pages[section]} onPage={page => setPages({ ...pages, [section]: page })}/>
        </>}</div>;
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
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.map(row => <div key={row.id} className="clinical-record-row">
            <Fields values={{ "Jenis entitas": row.entityType, "ID eksternal": row.externalId, "Versi eksternal": row.externalVersion, "Pertama dilihat": row.firstSeenAt, "Terakhir dilihat": row.lastSeenAt }} /><AppDisclosure title="Identitas metadata"><Fields values={{ "ID metadata": row.id, "ID entitas lokal": row.entityId }} /></AppDisclosure>
            </div>)}{!data.content.length && <p>Tidak ada data.</p>}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={onPage}/>
        </>}</Panel>;
}
function Authorities({ code, page, onPage }: SectionProps) {
    const { user } = useSession(), read = useQuery(queries.authorities(user!, code, page)), data = read.data?.data;
    return <Panel title={sections.authorities}>
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.map((row, i) => <div key={i} className="clinical-record-row">
            <AppStatusBadge>{row.releasedAt === null ? "Otoritas aktif" : "Otoritas dilepas"}</AppStatusBadge><Fields values={{ "Jenis entitas": row.entityType, "Lingkup otoritas": row.authorityScope, "Berlaku": row.effectiveAt, "Dilepas": row.releasedAt }} /><AppDisclosure title="Identitas sumber"><Fields values={{ "ID entitas lokal": row.entityId, "ID eksternal": row.externalId, "Versi sumber": row.sourceVersion }} /></AppDisclosure>
            </div>)}{!data.content.length && <p>Tidak ada data.</p>}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={onPage}/>
        </>}</Panel>;
}
function Runs({ code, page, onPage }: SectionProps) {
    const { user } = useSession(), read = useQuery(queries.runs(user!, code, page)), data = read.data?.data;
    return <Panel title={sections.runs}>
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.map(row => <div key={row.id} className="clinical-record-row">
            <RunFields run={row} code={code} link/>
            </div>)}{!data.content.length && <p>Tidak ada data.</p>}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={onPage}/>
        </>}</Panel>;
}
function Conflicts({ code, page, onPage }: SectionProps) {
    const { user } = useSession(), read = useQuery(queries.conflicts(user!, code, page)), data = read.data?.data;
    return <Panel title={sections.conflicts}>
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{data && <>{data.content.map(row => <div key={row.id} className="clinical-record-row">
            <AppStatusBadge>{integrationLabel(row.status)}</AppStatusBadge><Fields values={{ "Jenis entitas": row.entityType, "Lingkup otoritas": row.authorityScope, "Pertama dilihat": row.firstSeenAt, "Terakhir dilihat": row.lastSeenAt, "Diselesaikan": row.resolvedAt }} /><AppDisclosure title="Identitas konflik"><Fields values={{ "ID konflik": row.id, "ID entitas lokal": row.entityId, "ID eksternal": row.externalId, "Versi sumber": row.sourceVersion }} /></AppDisclosure>
            </div>)}{!data.content.length && <p>Tidak ada data.</p>}<Pagination page={data.page} size={data.size} total={data.totalElements} onPage={onPage}/>
        </>}</Panel>;
}
