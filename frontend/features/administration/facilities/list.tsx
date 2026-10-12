"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { administrationQueries } from "../queries";
import { Pagination, QueryState, Refresh } from "../display";
import { AppPageHeader, AppSection, AppStatusBadge, AppTable } from "@/components/application-patterns";
import type { FacilityFilters } from "../types";
export function FacilityList() {
    const { user } = useSession();
    const [query, setQuery] = useState(""), [active, setActive] = useState("all"), [filters, setFilters] = useState<FacilityFilters>({ page: 0 });
    const read = useQuery(administrationQueries.facilities(user!, filters));
    const page = read.data?.data;
    return <div className="clinical-workspace [&>section]:min-w-0 [&_table]:min-w-[36rem]">
    <AppPageHeader title="Fasyankes" eyebrow="Administrasi" actions={<Link href="/admin/facilities/new" className="text-primary underline">Tambah fasyankes</Link>} />
    <AppSection title="Daftar fasyankes" actions={<Refresh busy={read.isFetching} onClick={() => void read.refetch()}/> }>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => {
            e.preventDefault();
            const q = query.trim();
            if (q && q.length < 2)
                return;
            setFilters({ page: 0, ...(q ? { query: q } : {}), ...(active === "all" ? {} : { active: active === "true" }) });
        }}>
    <label>Cari nama fasyankes<Input value={query} maxLength={255} onChange={e => setQuery(e.target.value)}/>
    </label>
    <label>Status fasyankes<select className="block rounded border p-2" value={active} onChange={e => setActive(e.target.value)}>
    <option value="all">Semua</option>
    <option value="true">Aktif</option>
    <option value="false">Tidak aktif</option>
    </select>
    </label>
    <Button disabled={!!query.trim() && query.trim().length < 2}>Cari fasyankes</Button>
    </form>
    <QueryState pending={read.isPending} error={read.error}/>{page && <>{page.content.length === 0 ? <p role="status">Tidak ada fasyankes.</p> : <AppTable caption="Daftar fasyankes"><thead><tr><th scope="col">Fasyankes</th><th scope="col">Jenis</th><th scope="col">Wilayah</th><th scope="col">Status</th><th scope="col">Tindakan</th></tr></thead><tbody>{page.content.map(row => <tr key={row.id}>
        <th scope="row">{row.name}</th><td>{row.facilityTypeCode || "—"}</td><td>{[row.provinceCode, row.regencyCode].filter(Boolean).join(" · ") || "—"}</td><td><AppStatusBadge tone={row.active ? "active" : "neutral"}>{row.active ? "Aktif" : "Tidak aktif"}</AppStatusBadge></td><td><Link href={`/admin/facilities/${row.id}`} className="text-primary underline">Buka detail {row.name}</Link></td>
        </tr>)}</tbody></AppTable>}<Pagination page={page.page} size={page.size} total={page.totalElements} onPage={p => setFilters({ ...filters, page: p })}/>
        </>}</AppSection></div>;
}
