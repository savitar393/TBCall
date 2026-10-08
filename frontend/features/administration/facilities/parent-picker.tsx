"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { administrationQueries } from "../queries";
import { Pagination, QueryState } from "../display";
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
    return <div className="space-y-3">
    <label>{label}<Input value={input} maxLength={255} disabled={disabled} onChange={e => setInput(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (!disabled && input.trim().length >= 2) {
                    setQuery(input.trim());
                    setPage(0);
                }
            }
        }}/>
    </label>
    <Button type="button" variant="outline" disabled={disabled || input.trim().length < 2} onClick={() => { setQuery(input.trim()); setPage(0); }}>Cari {label.toLowerCase()}</Button>{query && <QueryState pending={read.isPending} error={read.error}/>}<ul className="space-y-2">{data?.content.filter(row => row.id !== exclude).map(row => <li key={row.id}>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onSelect(row.id, row.name)}>Pilih {row.name}</Button>
        </li>)}</ul>{data && <Pagination page={data.page} size={data.size} total={data.totalElements} onPage={setPage}/>}</div>;
}
