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
import { AccountStatus, Fields, Panel, QueryState } from "../display";
import { AppDisclosure, AppFormSection, AppPageHeader, AppStatusBadge, AppTable } from "@/components/application-patterns";
import { ConfirmAction } from "../confirm";
import { FacilitySearch } from "../facilities/parent-picker";
import type { UserLookup, ManagedRole } from "../types";
export function UserWorkspace() {
    const session = useSession(), client = useQueryClient(), actor = session.user!, snapshot = JSON.stringify(actor), refs = useAdministrationReferences(), command = useAdministrationCommand();
    const [input, setInput] = useState(""), [result, setResult] = useState<UserLookup | null>(null), [error, setError] = useState<ApiError | null>(null), [loading, setLoading] = useState(false), [notFound, setNotFound] = useState(false), [fresh, setFresh] = useState(false);
    const [selected, setSelected] = useState(""), [primary, setPrimary] = useState(false), [hasIdentity, setHasIdentity] = useState(false);
    const [selectedFacilityName, setSelectedFacilityName] = useState("");
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
    function clear() { controller.current?.abort(); identity.current = ""; generation.current++; setHasIdentity(false); setInput(""); setResult(null); setError(null); setNotFound(false); setFresh(false); setLoading(false); setSelected(""); setSelectedFacilityName(""); setPrimary(false); }
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
        setSelectedFacilityName("");
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
    return <div className="clinical-workspace [&>section]:min-w-0 [&_table]:min-w-[36rem]">
    <AppPageHeader title="Administrasi pengguna" eyebrow="Administrasi" description="Pencarian tepat menggunakan email atau nomor telepon terverifikasi." />
    <Panel title="Cari pengguna">
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => {
            e.preventDefault();
            const value = input.trim();
            if (!value || pending)
                return;
            setInput("");
            void lookup(value);
        }}>
        <label>Email atau nomor telepon tepat<Input value={input} maxLength={255} autoComplete="off" disabled={pending} onChange={e => setInput(e.target.value)}/></label>
        <Button disabled={!input.trim() || pending}>Cari pengguna tepat</Button>
        <Button type="button" variant="outline" onClick={clear}>Bersihkan hasil</Button>
    </form>
    <QueryState pending={loading} error={error}/>
    {notFound && <p role="status">Pengguna dengan identitas terverifikasi tersebut tidak ditemukan.</p>}
    </Panel>
    <ApiFeedback error={command.error}/>
    {hasIdentity && !fresh && !loading && <div role="status" className="clinical-context">
        <p>Periksa keadaan atau penugasan terbaru sebelum memilih tindakan lagi.</p>
        <Button variant="outline" disabled={pending} onClick={() => void lookup(identity.current)}>Cari ulang pengguna</Button>
    </div>}
    {result && <>
        <section className="clinical-context" aria-label="Hasil pengguna tepat">
            <div className="clinical-context-heading"><h2>Hasil pengguna tepat</h2><AccountStatus status={result.status}/></div>
            <Fields values={{ "Email tersamar": result.email, "Telepon tersamar": result.phone }}/>
            <div className="flex flex-wrap gap-2" aria-label="Peran pengguna">{result.roles.length ? result.roles.map(role => <AppStatusBadge key={role.code}>{role.name}</AppStatusBadge>) : <span className="text-sm">Belum ada peran</span>}</div>
            {result.hasOtherFacilityAssignments && <p className="text-sm">Pengguna memiliki penugasan aktif lain di luar lingkup Anda.</p>}
            <AppDisclosure title="Verifikasi dan metadata pengguna"><Fields values={{ "Status akun": result.status, "Email terverifikasi": result.emailVerified, "Telepon terverifikasi": result.phoneVerified, "ID pengguna": result.userId, Versi: result.version }}/></AppDisclosure>
        </section>
        <Panel title="Penugasan fasyankes">
            {actionable.length ? <AppTable caption="Penugasan pengguna"><thead><tr><th scope="col">Fasyankes</th><th scope="col">Penugasan</th><th scope="col">Tindakan</th></tr></thead><tbody>{actionable.map(f => <tr key={f.id}>
                <th scope="row">{f.name}</th><td><AppStatusBadge tone={f.primary ? "active" : "neutral"}>{f.primary ? "Utama" : "Bukan utama"}</AppStatusBadge></td>
                <td><div className="app-actions"><ConfirmAction label={`${f.primary ? "Jadikan bukan utama" : "Jadikan utama"} ${f.name}`} description={`Ubah penugasan ${result.email || result.phone || "pengguna ini"} pada ${f.name} menjadi ${f.primary ? "bukan utama" : "utama"}? Penugasan utama lainnya dapat digantikan.`} disabled={blocked} onConfirm={() => mutate(signal => administrationApi.membership(f.id, result.userId, !f.primary, signal))}/>
                <ConfirmAction label={`Hapus penugasan ${f.name}`} description={`Hapus penugasan aktif ${result.email || result.phone || "pengguna ini"} pada ${f.name}? Akses pengguna pada fasyankes ini dapat berubah.`} disabled={blocked} onConfirm={() => mutate(signal => administrationApi.membership(f.id, result.userId, null, signal))}/></div></td>
            </tr>)}</tbody></AppTable> : <p role="status">Belum ada penugasan aktif dalam lingkup Anda.</p>}
            <AppFormSection title="Tambah atau ubah penugasan">
                <div className="grid gap-4 sm:grid-cols-2"><label>Fasyankes penugasan<select className="block w-full rounded border p-2" value={selected} disabled={blocked} onChange={e => { setSelected(e.target.value); setSelectedFacilityName(candidates.find(f => f.id === e.target.value)?.name ?? ""); }}>
                <option value="">Pilih fasyankes</option>{candidates.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}{selected && !candidates.some(f => f.id === selected) && <option value={selected}>{selectedFacilityName || "Fasyankes dipilih dari pencarian"}</option>}</select></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={primary} disabled={blocked} onChange={e => setPrimary(e.target.checked)}/>Penugasan utama</label></div>
                {canFacilities(actor) && <FacilitySearch label="Fasyankes aktif untuk penugasan" disabled={blocked} onSelect={(id, name) => { setSelected(id); setSelectedFacilityName(name); }}/>}
                <ConfirmAction label="Simpan penugasan" description={`Simpan penugasan ${primary ? "utama" : "bukan utama"} untuk ${result.email || result.phone || "pengguna ini"} pada ${selectedFacilityName || "fasyankes yang dipilih"}? ${primary ? "Penugasan utama lainnya dapat digantikan." : "Akses pengguna akan mengikuti penugasan ini."}`} disabled={blocked || !selected} onConfirm={() => mutate(signal => administrationApi.membership(selected, result.userId, primary, signal))}/>
            </AppFormSection>
        </Panel>
        {canRoles(actor) && <Panel title="Peran global">
            <QueryState pending={refs.isPending} error={refs.error}/>
            {result.status !== "ACTIVE" ? <p>Perubahan peran tersedia untuk akun ACTIVE yang terverifikasi.</p> : <>
                {result.activeFacilities.length === 0 && <p role="status">Pengguna belum memiliki penugasan fasyankes aktif.</p>}
                {refs.data && <AppTable caption="Peran global pengguna"><thead><tr><th scope="col">Peran</th><th scope="col">Status</th><th scope="col">Tindakan</th></tr></thead><tbody>{refs.data.data.adminManagedRoles.map(role => {
                    const assigned = result.roles.some(r => r.code === role.code);
                    return <tr key={role.code}><th scope="row">{role.name}</th><td><AppStatusBadge tone={assigned ? "active" : "neutral"}>{assigned ? "Diberikan" : "Belum diberikan"}</AppStatusBadge></td><td>
                        <ConfirmAction label={`${assigned ? "Hapus" : "Berikan"} ${role.name}`} description={`${assigned ? "Hapus" : "Berikan"} peran ${role.name} untuk ${result.email || result.phone || "pengguna ini"}? Hak akses dan sesi pengguna dapat berubah.`} disabled={blocked} onConfirm={() => mutate(signal => administrationApi.role(result.userId, role.code as ManagedRole, !assigned, signal))}/>
                    </td></tr>;
                })}</tbody></AppTable>}
                <AppDisclosure title="Kelayakan peran operasional"><p className="text-sm">Peran operasional TB_OFFICER, LAB_STAFF, dan FACILITY_ADMIN memerlukan penugasan aktif. Kelayakan diperiksa saat perubahan dikirim.</p></AppDisclosure>
            </>}
        </Panel>}
        {canStatuses(actor) && <Panel title="Status akun">
            <div className="app-actions"><AccountStatus status={result.status}/>
                {result.status === "ACTIVE" && <ConfirmAction label="Tangguhkan akun" description={`Tangguhkan akun ${result.email || result.phone || "pengguna ini"}? Sesi pengguna dapat dicabut.`} disabled={blocked} onConfirm={() => mutate(signal => administrationApi.status(result.userId, "suspend", result.version, signal))}/>}
                {result.status === "SUSPENDED" && <ConfirmAction label="Aktifkan kembali akun" description={`Aktifkan kembali akun ${result.email || result.phone || "pengguna ini"}? Pengguna dapat masuk kembali dengan hak akses yang berlaku.`} disabled={blocked} onConfirm={() => mutate(signal => administrationApi.status(result.userId, "reactivate", result.version, signal))}/>}
                {["ACTIVE", "SUSPENDED"].includes(result.status) ? <ConfirmAction label="Nonaktifkan akun" description={`Nonaktifkan akun ${result.email || result.phone || "pengguna ini"}? Sesi pengguna akan dicabut. Tindakan ini tidak menyediakan pengaktifan kembali melalui antarmuka.`} disabled={blocked} onConfirm={() => mutate(signal => administrationApi.status(result.userId, "disable", result.version, signal))}/> : <p>Tidak ada tindakan status yang didukung untuk keadaan akun ini.</p>}
            </div>
        </Panel>}
    </>}
    </div>;
}
