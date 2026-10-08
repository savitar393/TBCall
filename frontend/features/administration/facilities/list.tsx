"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { administrationQueries } from "../queries";
import { Panel, Fields, Pagination, QueryState, Refresh } from "../display";
import type { FacilityFilters } from "../types";
export function FacilityList() {
    const { user } = useSession();
    const [query, setQuery] = useState(""), [active, setActive] = useState("all"), [filters, setFilters] = useState<FacilityFilters>({ page: 0 });
    const read = useQuery(administrationQueries.facilities(user!, filters));
    const page = read.data?.data;
    return <>
    <h1 className="text-2xl font-semibold">Fasyankes</h1>
    <Link href="/admin/facilities/new" className="text-primary underline">Tambah fasyankes</Link>
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
    <Refresh busy={read.isFetching} onClick={() => void read.refetch()}/>
    <QueryState pending={read.isPending} error={read.error}/>{page && <>{page.content.length === 0 && <p>Tidak ada fasyankes.</p>}{page.content.map(row => <Panel key={row.id} title={row.name}>
            <Fields values={{ "Kode jenis": row.facilityTypeCode, "Induk": row.parentFacilityId, "Provinsi": row.provinceCode, "Kabupaten/kota": row.regencyCode, "Aktif": row.active }}/>
            <Link href={`/admin/facilities/${row.id}`} className="text-primary underline">Buka detail {row.name}</Link>
            </Panel>)}<Pagination page={page.page} size={page.size} total={page.totalElements} onPage={p => setFilters({ ...filters, page: p })}/>
        </>}</>;
}
