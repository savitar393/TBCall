"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, ME_QUERY_KEY } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { ApiFeedback } from "@/components/api-feedback";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { administrationApi } from "../api";
import { canFacilities, canRoles, canStatuses } from "../permissions";
import { useAdministrationReferences } from "../references";
import { useAdministrationCommand } from "../use-command";
import { Fields, Panel, QueryState } from "../display";
import { ConfirmAction } from "../confirm";
import { FacilitySearch } from "../facilities/parent-picker";
import type { UserLookup, ManagedRole } from "../types";
export function UserWorkspace() {
    const session = useSession(), client = useQueryClient(), actor = session.user!, snapshot = JSON.stringify(actor), refs = useAdministrationReferences(), command = useAdministrationCommand();
    const [input, setInput] = useState(""), [result, setResult] = useState<UserLookup | null>(null), [error, setError] = useState<ApiError | null>(null), [loading, setLoading] = useState(false), [notFound, setNotFound] = useState(false), [fresh, setFresh] = useState(false);
    const [selected, setSelected] = useState(""), [primary, setPrimary] = useState(false), [hasIdentity, setHasIdentity] = useState(false);
    const identity = useRef(""), generation = useRef(0), mounted = useRef(true), controller = useRef<AbortController | null>(null);
    useEffect(() => {
        mounted.current = true;
        const unsubscribe = client.getQueryCache().subscribe(() => {
            if (JSON.stringify(client.getQueryData(ME_QUERY_KEY)) !== snapshot) {
                controller.current?.abort();
                identity.current = "";
                generation.current++;
            }
        });
        return () => { mounted.current = false; controller.current?.abort(); identity.current = ""; unsubscribe(); };
    }, [client, snapshot]);
    function clear() { controller.current?.abort(); identity.current = ""; generation.current++; setHasIdentity(false); setInput(""); setResult(null); setError(null); setNotFound(false); setFresh(false); setLoading(false); setSelected(""); setPrimary(false); }
    async function lookup(value: string) {
        if (!mounted.current || JSON.stringify(client.getQueryData(ME_QUERY_KEY)) !== snapshot)
            return;
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        const id = ++generation.current;
        const current = () => mounted.current && !abort.signal.aborted && generation.current === id && JSON.stringify(client.getQueryData(ME_QUERY_KEY)) === snapshot;
        identity.current = value;
        setHasIdentity(true);
        setResult(null);
        setFresh(false);
        setSelected("");
        setPrimary(false);
        setError(null);
        setNotFound(false);
        setLoading(true);
        try {
            const next = await administrationApi.lookup(value, abort.signal);
            if (current()) {
                setResult(next.data);
                setFresh(true);
            }
        }
        catch (e) {
            if (current()) {
                const safe = e instanceof ApiError ? e : new ApiError({ status: 503, title: "Layanan belum tersedia" });
                if (safe.problem.status === 404)
                    setNotFound(true);
                else {
                    setError(safe);
                    if (["authentication", "forbidden", "csrf"].includes(safe.kind))
                        await session.handleFailure(safe, false);
                }
            }
        }
        finally {
            if (current())
                setLoading(false);
        }
    }
    function mutate(operation: (signal: AbortSignal) => Promise<unknown>) {
        if (!result || !fresh)
            return;
        const target = result.userId, id = generation.current, value = identity.current;
        setFresh(false);
        void command.run(operation, { selfTarget: target, onSuccess: async () => {
                if (mounted.current && generation.current === id && value && JSON.stringify(client.getQueryData(ME_QUERY_KEY)) === snapshot)
                    await lookup(value);
            } });
    }
    const sys = actor.roles.some(r => r.code === "SYSTEM_ADMIN"), candidates = sys ? result?.activeFacilities ?? [] : actor.activeFacilities;
    const pending = command.pending || loading, blocked = pending || !fresh;
    const actionable = result?.activeFacilities.filter(f => sys || actor.activeFacilities.some(own => own.id === f.id)) ?? [];
    return <>
    <h1 className="text-2xl font-semibold">Administrasi pengguna</h1>
    <p>Masukkan email atau nomor telepon tepat yang telah terverifikasi. Hasil menampilkan identitas tersamar.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => {
            e.preventDefault();
            const value = input.trim();
            if (!value || pending)
                return;
            setInput("");
            void lookup(value);
        }}>
    <label>Email atau nomor telepon tepat<Input value={input} maxLength={255} autoComplete="off" disabled={pending} onChange={e => setInput(e.target.value)}/>
    </label>
    <Button disabled={!input.trim() || pending}>Cari pengguna tepat</Button>
    <Button type="button" variant="outline" onClick={clear}>Bersihkan hasil</Button>
    </form>
    <QueryState pending={loading} error={error}/>
    <ApiFeedback error={command.error}/>{notFound && <p role="status">Pengguna dengan identitas terverifikasi tersebut tidak ditemukan.</p>}{hasIdentity && !fresh && !loading && <div role="status">
        <p>Periksa keadaan atau penugasan terbaru sebelum memilih tindakan lagi.</p>
        <Button variant="outline" disabled={pending} onClick={() => void lookup(identity.current)}>Cari ulang pengguna</Button>
        </div>}{result && <>
        <Panel title="Hasil pengguna tepat">
        <Fields values={{ "Email tersamar": result.email, "Telepon tersamar": result.phone, "Status akun": result.status, "Email terverifikasi": result.emailVerified, "Telepon terverifikasi": result.phoneVerified }}/>
        <p>Peran: {result.roles.map(r => r.name).join(" · ") || "—"}</p>{result.hasOtherFacilityAssignments && <p>Pengguna memiliki penugasan aktif lain di luar lingkup Anda.</p>}</Panel>
        <Panel title="Penugasan fasyankes">
        <p>Memilih penugasan utama dapat menggantikan penugasan utama lainnya.</p>
        <ul className="space-y-3">{actionable.map(f => <li key={f.id} className="flex flex-wrap items-center gap-3">
            <span>{f.name} · {f.primary ? "Utama" : "Bukan utama"}</span>
            <Button variant="outline" disabled={blocked} onClick={() => mutate(signal => administrationApi.membership(f.id, result.userId, !f.primary, signal))}>{f.primary ? "Jadikan bukan utama" : "Jadikan utama"} {f.name}</Button>
            <ConfirmAction label={`Hapus penugasan ${f.name}`} description="Penugasan aktif ini akan dihapus. Periksa lingkup dan pengguna sebelum melanjutkan." disabled={blocked} onConfirm={() => mutate(signal => administrationApi.membership(f.id, result.userId, null, signal))}/>
            </li>)}</ul>
        <label>Fasyankes penugasan<select className="block w-full rounded border p-2" value={selected} disabled={blocked} onChange={e => setSelected(e.target.value)}>
        <option value="">Pilih fasyankes</option>{candidates.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}{selected && !candidates.some(f => f.id === selected) && <option value={selected}>Fasyankes dipilih dari pencarian</option>}</select>
        </label>{canFacilities(actor) && <FacilitySearch label="Fasyankes aktif untuk penugasan" disabled={blocked} onSelect={id => setSelected(id)}/>}<label className="flex items-center gap-2">
        <input type="checkbox" checked={primary} disabled={blocked} onChange={e => setPrimary(e.target.checked)}/>Penugasan utama</label>
        <Button disabled={blocked || !selected} onClick={() => mutate(signal => administrationApi.membership(selected, result.userId, primary, signal))}>Simpan penugasan</Button>
        </Panel>{canRoles(actor) && <Panel title="Peran global">
            <QueryState pending={refs.isPending} error={refs.error}/>{result.status !== "ACTIVE" ? <p>Perubahan peran tersedia untuk akun ACTIVE yang terverifikasi.</p> : <>
                <p>Peran operasional TB_OFFICER, LAB_STAFF, dan FACILITY_ADMIN memerlukan penugasan aktif. Kelayakan diperiksa saat perubahan dikirim.</p>{result.activeFacilities.length === 0 && <p role="status">Pengguna belum memiliki penugasan fasyankes aktif.</p>}<ul className="space-y-3">{refs.data?.data.adminManagedRoles.map(role => {
                        const assigned = result.roles.some(r => r.code === role.code);
                        return <li key={role.code} className="flex flex-wrap items-center gap-3">
                        <span>{role.name} · {assigned ? "Diberikan" : "Belum diberikan"}</span>
                        <Button variant="outline" disabled={blocked} onClick={() => mutate(signal => administrationApi.role(result.userId, role.code as ManagedRole, !assigned, signal))}>{assigned ? "Hapus" : "Berikan"} {role.name}</Button>
                        </li>;
                    })}</ul>
                </>}</Panel>}{canStatuses(actor) && <Panel title="Status akun">
            <p>Perubahan menggunakan hasil pencarian tepat terbaru. Penangguhan atau penonaktifan dapat mengakhiri sesi pengguna.</p>{result.status === "ACTIVE" && <ConfirmAction label="Tangguhkan akun" description="Sesi pengguna dapat dicabut. Tangguhkan akun ini?" disabled={blocked} onConfirm={() => mutate(signal => administrationApi.status(result.userId, "suspend", result.version, signal))}/>} {result.status === "SUSPENDED" && <Button variant="outline" disabled={blocked} onClick={() => mutate(signal => administrationApi.status(result.userId, "reactivate", result.version, signal))}>Aktifkan kembali akun</Button>} {["ACTIVE", "SUSPENDED"].includes(result.status) ? <ConfirmAction label="Nonaktifkan akun" description="Akun akan dinonaktifkan dan sesinya dicabut. Tindakan ini tidak menyediakan pengaktifan kembali melalui antarmuka." disabled={blocked} onConfirm={() => mutate(signal => administrationApi.status(result.userId, "disable", result.version, signal))}/> : <p>Tidak ada tindakan status yang didukung untuk keadaan akun ini.</p>}</Panel>}</>}</>;
}
