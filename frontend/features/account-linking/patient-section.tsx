"use client";
import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/problem";
import { canLink } from "./permissions";
import { linkingApi as api, sameReview, type PatientState, type PairState } from "./api";
import { linkingKeys, linkingQueries } from "./queries";
import { useLinkingCommand } from "./use-command";
import { ResolveForm } from "./resolve-form";
import { Confirm } from "./confirm";
import { LinkingFeedback } from "./feedback";
import type { Candidate } from "./schemas";
type Review = {
    action: "link";
    owner: PatientState;
    pair: PairState;
    candidate: Candidate;
} | {
    action: "revoke";
    owner: PatientState;
};
function changed(): never { throw new ApiError({ status: 409, code: "OPTIMISTIC_LOCK_CONFLICT", title: "Tautan berubah" }); }
export function PatientAccountLinkSection({ patientId }: {
    patientId: string;
}) {
    const { user } = useSession();
    if (!canLink(user, "PATIENT_LINK_VERIFY"))
        return null;
    return <PatientLinkWorkspace key={`${JSON.stringify(user)}:${patientId}`} patientId={patientId}/>;
}
function PatientLinkWorkspace({ patientId }: {
    patientId: string;
}) {
    const session = useSession(), actor = session.user!, context = useId(), client = useQueryClient();
    const options = linkingQueries.patient(actor.id, context, patientId), query = useQuery(options), command = useLinkingCommand();
    const [candidate, setCandidate] = useState<Candidate | null>(null), [ack, setAck] = useState(false), [review, setReview] = useState<Review | null>(null), [blocked, setBlocked] = useState(false), [message, setMessage] = useState("");
    useEffect(() => () => { const filter = { queryKey: linkingKeys(actor.id, context) }; void client.cancelQueries(filter); client.removeQueries(filter); }, [actor.id, client, context]);
    const clear = () => { setCandidate(null); setAck(false); setReview(null); setBlocked(false); };
    const available = !!query.data && !query.isError && !query.isFetching && !command.pending;
    async function owner(signal: AbortSignal, current: () => boolean) {
        const next = await api.patient(patientId, signal);
        if (current())
            client.setQueryData(options.queryKey, next);
        return next;
    }
    const failure = async (error: ApiError, current: () => boolean) => {
        setReview(null);
        setAck(false);
        if (error.problem.status === 409) {
            await query.refetch();
            if (!current())
                return;
        }
    };
    async function prepare(action: "link" | "revoke") {
        setMessage("");
        await command.run(async (signal, current) => {
            const state = await owner(signal, current);
            if (!current())
                return;
            if (action === "revoke") {
                if (!state.data.link)
                    changed();
                return { action, owner: state } as Review;
            }
            if (!candidate || !ack)
                return;
            if (state.data.link) {
                setMessage("Pemilik akun terverifikasi sudah ada. Periksa tautan secara manual; penggantian otomatis tidak tersedia.");
                return;
            }
            const pair = await api.pair(patientId, candidate.userId, signal);
            if (!current())
                return;
            if (pair.data.pair && !["PENDING", "REVOKED"].includes(pair.data.pair.verificationStatus)) {
                setBlocked(true);
                setAck(false);
                setMessage("Tautan pasangan ditolak atau sudah terverifikasi. Penautan tidak tersedia; periksa secara manual.");
                return;
            }
            return { action, owner: state, pair, candidate } as Review;
        }, result => {
            if (result)
                setReview(result);
        }, failure);
    }
    async function confirm() {
        if (!review || review.action === "link" && !ack)
            return;
        const approved = review;
        await command.run(async (signal, current) => {
            const state = await owner(signal, current);
            if (!current())
                return;
            if (!sameReview(approved.owner, state))
                changed();
            if (approved.action === "revoke") {
                if (!state.data.link)
                    changed();
                await api.revokePatient(patientId, state.data.link.id, state.etag!, signal);
            }
            else {
                const pair = await api.pair(patientId, approved.candidate.userId, signal);
                if (!current())
                    return;
                if (!sameReview(approved.pair, pair) || state.data.link)
                    changed();
                await api.linkPatient(patientId, approved.candidate.userId, pair.data.pair ? pair.etag : undefined, signal);
            }
            return approved;
        }, async (result, current) => {
            if (!result)
                return;
            clear();
            setMessage(result.action === "link" ? "Tautan akun pasien tersimpan." : "Tautan akun pasien dicabut.");
            await query.refetch();
            if (!current())
                return;
            const target = result.action === "link" ? result.candidate.userId : result.owner.data.link?.userId;
            if (target === actor.id)
                await session.refresh();
        }, failure);
    }
    const link = query.data?.data.link;
    return <section className="space-y-4 rounded-xl border bg-white p-5" aria-label="Akun pasien">
    <h2 className="font-semibold">Akun pasien</h2>
    <LinkingFeedback error={query.error ?? command.error} resolving={!query.error && command.errorPurpose === "resolve"}/>{message && <p role="status">{message}</p>}
    {query.isPending ? <p>Memuat tautan akun…</p> : link ? <>
        <p>Akun SELF terverifikasi: {link.maskedAccount.maskedEmail ?? link.maskedAccount.maskedPhone ?? "Kanal login tidak tersedia"}</p>
        <Button variant="outline" disabled={!available} onClick={() => void prepare("revoke")}>Cabut tautan pasien</Button>
        </> : query.data && <>
        <p>Belum ada akun SELF terverifikasi yang tertaut.</p>
        <ResolveForm pending={!available} candidate={candidate} acknowledged={ack} onAcknowledge={value => { setAck(value); setReview(null); }} onCancel={() => { clear(); setMessage(""); command.clearError(); }} resolve={async (identity) => { clear(); setMessage(""); await command.run(signal => api.resolvePatient(patientId, identity, signal), result => setCandidate(result.data), undefined, "resolve"); }}/>{candidate && <Button disabled={!available || !ack || blocked} onClick={() => void prepare("link")}>Periksa tautan pasien</Button>}</>}
    <Button variant="outline" disabled={command.pending || query.isFetching} onClick={() => { setReview(null); setAck(false); void query.refetch(); }}>Muat ulang tautan pasien</Button>
    {review && <Confirm title={review.action === "link" ? "Tautkan akun pasien" : "Cabut tautan pasien"} pending={command.pending} onConfirm={() => void confirm()} onCancel={() => { setReview(null); setAck(false); }}>
        <p>{review.action === "link" ? `Tautkan akun ${review.candidate.matchedLogin.maskedValue} ke pasien ini?` : `Cabut akses akun ${review.owner.data.link?.maskedAccount.maskedEmail ?? review.owner.data.link?.maskedAccount.maskedPhone ?? "tertaut"} ke pasien ini?`}</p>
        </Confirm>}
  </section>;
}
