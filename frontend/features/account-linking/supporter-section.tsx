"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canLink, canAddSupporter } from "./permissions";
import { linkingApi as api, sameReview, type SupporterDetail } from "./api";
import { linkingKeys, linkingQueries } from "./queries";
import { useLinkingCommand } from "./use-command";
import { LinkingFeedback } from "./feedback";
import { ResolveForm } from "./resolve-form";
import { Confirm } from "./confirm";
import { supporterInputSchema, type SupporterInput, type Candidate } from "./schemas";
import { AppStatusBadge } from "@/components/application-patterns";
export function CaseSupporterSection({ caseId, caseStatus }: {
    caseId: string;
    caseStatus: string;
}) {
    const { user } = useSession();
    if (!canLink(user, "SUPPORTER_LINK_MANAGE"))
        return null;
    return <SupporterWorkspace key={`${JSON.stringify(user)}:${caseId}:${caseStatus}`} caseId={caseId} caseStatus={caseStatus}/>;
}
function SupporterWorkspace({ caseId, caseStatus }: {
    caseId: string;
    caseStatus: string;
}) {
    const actor = useSession().user!, context = useId(), client = useQueryClient(), [page, setPage] = useState(0), [selected, setSelected] = useState<string | null>(null), [creating, setCreating] = useState(false), [sourceLocked, setSourceLocked] = useState(false), [uncertain, setUncertain] = useState(false);
    const query = useQuery(linkingQueries.supporters(actor.id, context, caseId, page)), command = useLinkingCommand(), prospective = canAddSupporter(caseStatus);
    const form = useForm<SupporterInput>({ resolver: zodResolver(supporterInputSchema), defaultValues: { supporterType: "PMO", fullName: "", phone: "" } });
    const createRegion = useRef<HTMLDivElement>(null), createTrigger = useRef<HTMLButtonElement>(null), rosterReload = useRef<HTMLButtonElement>(null), restoreCreateFocus = useRef(false);
    useEffect(() => {
        if (!creating) return;
        restoreCreateFocus.current = true;
        createRegion.current?.focus();
    }, [creating]);
    useEffect(() => {
        if (creating || command.pending || !restoreCreateFocus.current) return;
        const trigger = createTrigger.current?.disabled ? rosterReload.current : createTrigger.current;
        if (trigger?.isConnected && !trigger.disabled) {
            restoreCreateFocus.current = false;
            trigger.focus();
        }
    }, [creating, command.pending]);
    useEffect(() => () => { const filter = { queryKey: linkingKeys(actor.id, context) }; void client.cancelQueries(filter); client.removeQueries(filter); }, [actor.id, client, context]);
    async function refreshRoster() {
        const result = await query.refetch();
        if (!result.isError)
            setUncertain(false);
    }
    async function create(input: SupporterInput) {
        if (sourceLocked || uncertain || !prospective)
            return;
        await command.run(signal => api.createSupporter(caseId, input, signal), async (result, current) => {
            setCreating(false);
            form.reset();
            await query.refetch();
            if (current())
                setSelected(result.data.id);
        }, error => {
            if (error.kind === "source-authority")
                setSourceLocked(true);
            else if (error.problem.status === 0 || error.problem.status >= 500)
                setUncertain(true);
        });
    }
    return <section className="space-y-4 rounded-xl border bg-white p-5" aria-label="Pendamping kasus">
    <h2 className="font-semibold">Pendamping kasus</h2>
    {!prospective && <p>Kasus terminal: daftar dapat dibaca dan tautan akun dapat dilepas sesuai kewenangan. Penambahan atau penggantian akun tidak tersedia.</p>}
    <LinkingFeedback error={query.error ?? command.error} resolving={!query.error && command.errorPurpose === "resolve"}/>{uncertain && <p role="alert">Hasil pembuatan belum dapat dipastikan. Muat ulang dan periksa daftar pendamping sebelum membuat ulang; duplikasi dapat terjadi.</p>}
    {query.isPending ? <p>Memuat pendamping…</p> : query.data && <>
        <ul className="clinical-record-list">{query.data.data.content.map(row => <li key={row.id} className="clinical-record-row">
            <div className="clinical-context-heading"><h3 className="font-semibold">{row.fullName}</h3><AppStatusBadge tone={row.active ? "active" : "neutral"}>{row.active ? "Aktif" : "Tidak aktif"}</AppStatusBadge></div>
            <p className="text-sm">{row.supporterType === "COMPANION" ? "Pendamping" : row.supporterType} · {row.maskedPhone ?? "Tanpa telepon"} · {row.linked ? "Akun tertaut" : "Belum tertaut"}</p>
            <div className="clinical-record-actions"><Button variant="outline" disabled={command.pending} onClick={() => setSelected(row.id)}>Buka pendamping {row.fullName}</Button></div>
            </li>)}</ul>{!query.data.data.content.length && <p>Belum ada pendamping dalam halaman ini.</p>}{(page > 0 || query.data.data.totalElements > 20) && <nav aria-label="Halaman pendamping" className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={page === 0 || query.isFetching || command.pending} onClick={() => { setSelected(null); setPage(page - 1); }}>Halaman sebelumnya</Button>
        <span>Halaman {page + 1}</span>
        <Button variant="outline" disabled={(page + 1) * 20 >= query.data.data.totalElements || query.isFetching || command.pending} onClick={() => { setSelected(null); setPage(page + 1); }}>Halaman berikutnya</Button>
        </nav>}
        </>}
    <Button ref={rosterReload} variant="outline" disabled={query.isFetching || command.pending} onClick={() => void refreshRoster()}>Muat ulang daftar pendamping</Button>
    {prospective && <Button ref={createTrigger} aria-expanded={creating} aria-controls={`${context}-create`} disabled={sourceLocked || command.pending || uncertain} onClick={() => { form.reset(); setCreating(true); command.clearError(); }}>Tambah pendamping</Button>}
    {creating && prospective && <div ref={createRegion} id={`${context}-create`} tabIndex={-1} role="region" aria-label="Buat pendamping" className="clinical-editor space-y-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <h3 className="font-semibold">Buat pendamping</h3>
        <form onSubmit={form.handleSubmit(create)} className="space-y-3">
        <label className="block">Jenis pendamping<select className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 text-sm" {...form.register("supporterType")} disabled={command.pending}>
        <option value="PMO">PMO</option>
        <option value="COMPANION">Pendamping</option>
        </select>
        </label>
        <label className="block">Nama pendamping<Input {...form.register("fullName")} maxLength={255} disabled={command.pending}/>
        </label>
        <label className="block">Telepon kontak (opsional)<Input {...form.register("phone")} maxLength={30} disabled={command.pending}/>
        </label>
        <p className="text-sm">Telepon kontak ini bukan klaim login terverifikasi.</p>{Object.values(form.formState.errors).map((e, i) => <p role="alert" key={i}>{e.message}</p>)}<Button type="submit" disabled={sourceLocked || uncertain || command.pending}>Simpan pendamping</Button>
        <Button type="button" variant="outline" disabled={command.pending} onClick={() => { setCreating(false); form.reset(); }}>Batal buat pendamping</Button>
        </form>
        </div>}
    {selected && <SupporterAccount key={selected} caseId={caseId} supporterId={selected} prospective={prospective} rosterChanged={async () => { await query.refetch(); }}/>}
  </section>;
}
type Review = {
    action: "link" | "unlink";
    detail: SupporterDetail;
    candidate: Candidate | null;
};
function SupporterAccount({ caseId, supporterId, prospective, rosterChanged }: {
    caseId: string;
    supporterId: string;
    prospective: boolean;
    rosterChanged: () => Promise<void>;
}) {
    const session = useSession(), actor = session.user!, context = useId(), client = useQueryClient(), options = linkingQueries.supporter(actor.id, context, caseId, supporterId), query = useQuery(options), command = useLinkingCommand();
    const [candidate, setCandidate] = useState<Candidate | null>(null), [ack, setAck] = useState(false), [replacement, setReplacement] = useState(false), [review, setReview] = useState<Review | null>(null), [message, setMessage] = useState("");
    useEffect(() => () => { const filter = { queryKey: linkingKeys(actor.id, context) }; void client.cancelQueries(filter); client.removeQueries(filter); }, [actor.id, client, context]);
    const clear = () => { setCandidate(null); setAck(false); setReplacement(false); setReview(null); };
    async function read(signal: AbortSignal, current: () => boolean) {
        const next = await api.supporter(caseId, supporterId, signal);
        if (current())
            client.setQueryData(options.queryKey, next);
        return next;
    }
    const failure = async (error: ApiError, current: () => boolean) => {
        setReview(null);
        setAck(false);
        setReplacement(false);
        if (error.problem.status === 409) {
            await query.refetch();
            if (!current())
                return;
        }
    };
    async function prepare(action: "link" | "unlink") {
        setMessage("");
        setReplacement(false);
        await command.run(async (signal, current) => {
            const detail = await read(signal, current);
            if (!current())
                return;
            if (!detail.data.active || action === "link" && (!prospective || !candidate || !ack) || action === "unlink" && !detail.data.linkedUser)
                throw new ApiError({ status: 409, code: "IDENTITY_LINK_CONFLICT", title: "Status tautan berubah" });
            return { action, detail, candidate };
        }, result => {
            if (result)
                setReview(result);
        }, failure);
    }
    async function confirm() {
        if (!review || review.action === "link" && (!ack || review.detail.data.linkedUser && !replacement))
            return;
        const approved = review;
        await command.run(async (signal, current) => {
            const detail = await read(signal, current);
            if (!current())
                return;
            if (!sameReview(approved.detail, detail) || !detail.data.active)
                throw new ApiError({ status: 409, code: "OPTIMISTIC_LOCK_CONFLICT", title: "Tautan berubah" });
            if (approved.action === "unlink")
                await api.unlinkSupporter(caseId, supporterId, detail.etag!, signal);
            else {
                if (!prospective || !approved.candidate)
                    return;
                await api.linkSupporter(caseId, supporterId, approved.candidate.userId, detail.etag!, signal);
            }
            return approved;
        }, async (result, current) => {
            if (!result)
                return;
            clear();
            setMessage(result.action === "link" ? "Tautan akun pendamping tersimpan." : "Tautan akun pendamping dilepas.");
            await query.refetch();
            if (!current())
                return;
            await rosterChanged();
            if (!current())
                return;
            if (result.candidate?.userId === actor.id || result.detail.data.linkedUser?.userId === actor.id)
                await session.refresh();
        }, failure);
    }
    const data = query.data?.data, available = !!data && !query.isError && !query.isFetching && !command.pending;
    return <div className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">Detail pendamping</h3>
    <LinkingFeedback error={query.error ?? command.error} resolving={!query.error && command.errorPurpose === "resolve"}/>{message && <p role="status">{message}</p>}{query.isPending ? <p>Memuat detail pendamping…</p> : data && <>
        <p>{data.fullName} · {data.supporterType}</p>
        <p>{data.linkedUser ? `Akun tertaut: ${data.linkedUser.maskedEmail ?? data.linkedUser.maskedPhone ?? "Kanal login tidak tersedia"}` : "Belum ada akun tertaut."}</p>{!data.active ? <p>Pendamping tidak aktif; perubahan tautan tidak tersedia.</p> : <>{prospective && <>
                <ResolveForm pending={!available} candidate={candidate} acknowledged={ack} onAcknowledge={value => { setAck(value); setReview(null); }} onCancel={() => { clear(); setMessage(""); command.clearError(); }} resolve={async (identity) => { clear(); setMessage(""); await command.run(signal => api.resolveSupporter(caseId, supporterId, identity, signal), result => setCandidate(result.data), undefined, "resolve"); }}/>{candidate && <Button disabled={!available || !ack} onClick={() => void prepare("link")}>Periksa tautan pendamping</Button>}</>}{data.linkedUser && <Button variant="outline" disabled={!available} onClick={() => void prepare("unlink")}>Lepas akun pendamping</Button>}</>}</>}
    <Button variant="outline" disabled={command.pending || query.isFetching} onClick={() => { setReview(null); setAck(false); setReplacement(false); void query.refetch(); }}>Muat ulang detail pendamping</Button>
    {review && <Confirm title={review.action === "unlink" ? "Lepas akun pendamping" : review.detail.data.linkedUser ? "Ganti akun pendamping" : "Tautkan akun pendamping"} pending={command.pending} blocked={review.action === "link" && !!review.detail.data.linkedUser && !replacement} onConfirm={() => void confirm()} onCancel={() => { setReview(null); setAck(false); setReplacement(false); }}>
        <p>{review.action === "unlink" ? `Lepas akses akun ${review.detail.data.linkedUser?.maskedEmail ?? review.detail.data.linkedUser?.maskedPhone ?? "tertaut"}?` : `Tautkan akun ${review.candidate?.matchedLogin.maskedValue}?`}</p>{review.action === "link" && review.detail.data.linkedUser && <>
            <p>Akun sebelumnya dapat kehilangan akses pendamping bila tidak memiliki tautan aktif lain.</p>
            <label className="flex gap-2">
            <input type="checkbox" checked={replacement} disabled={command.pending} onChange={e => setReplacement(e.target.checked)}/>Saya menyetujui penggantian akun pendamping ini.</label>
            </>}</Confirm>}
  </div>;
}
