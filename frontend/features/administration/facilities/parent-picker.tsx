"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { administrationQueries } from "../queries";
import { Pagination, QueryState } from "../display";
import { AppStatusBadge, AppTable } from "@/components/application-patterns";
export function FacilitySearch({ label, exclude, onSelect, disabled = false }: {
    label: string;
    exclude?: string;
    onSelect: (id: string, name: string) => void;
    disabled?: boolean;
}) {
    const { user } = useSession();
    const [input, setInput] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(0);
    const read = useQuery({ ...administrationQueries.facilities(user!, { page, query, active: true }), enabled: query.length >= 2 });
    const data = read.data?.data;
    return <div className="min-w-0 space-y-3 [&_table]:min-w-[30rem]">
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1">{label}<Input value={input} maxLength={255} disabled={disabled} onChange={e => setInput(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (!disabled && input.trim().length >= 2) {
                    setQuery(input.trim());
                    setPage(0);
                }
            }
        }}/>
    </label>
    <Button type="button" variant="outline" disabled={disabled || input.trim().length < 2} onClick={() => { setQuery(input.trim()); setPage(0); }}>Cari {label.toLowerCase()}</Button></div>{query && <QueryState pending={read.isPending} error={read.error}/>} {data && <>
        {data.content.filter(row => row.id !== exclude).length ? <AppTable caption={`Hasil pencarian ${label.toLowerCase()}`}><thead><tr><th scope="col">Fasyankes</th><th scope="col">Status</th><th scope="col">Tindakan</th></tr></thead><tbody>{data.content.filter(row => row.id !== exclude).map(row => <tr key={row.id}><th scope="row">{row.name}</th><td><AppStatusBadge tone="active">Aktif</AppStatusBadge></td><td><Button type="button" variant="outline" disabled={disabled} onClick={() => onSelect(row.id, row.name)}>Pilih {row.name}</Button></td></tr>)}</tbody></AppTable> : <p role="status">Tidak ada fasyankes yang dapat dipilih pada halaman ini.</p>}
        <Pagination page={data.page} size={data.size} total={data.totalElements} onPage={setPage}/></>}</div>;
}
