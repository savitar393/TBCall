"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Candidate } from "./schemas";
export const acknowledgement = "Saya telah memeriksa identitas akun tujuan dan kewenangan orang tersebut untuk mengakses informasi pasien yang terkait.";
export function ResolveForm({ pending, resolve, candidate, acknowledged, onAcknowledge, onCancel }: {
    pending: boolean;
    resolve: (identity: string) => Promise<void>;
    candidate: Candidate | null;
    acknowledged: boolean;
    onAcknowledge: (value: boolean) => void;
    onCancel: () => void;
}) {
    const [identity, setIdentity] = useState("");
    return <div className="space-y-3">
    <form onSubmit={event => {
            event.preventDefault();
            const submitted = identity.trim();
            setIdentity("");
            if (submitted && !pending)
                void resolve(submitted);
        }} className="space-y-2">
    <label className="block">Email atau telepon login terverifikasi (persis)<Input value={identity} onChange={e => setIdentity(e.target.value)} autoComplete="off" maxLength={255} disabled={pending}/>
    </label>
    <Button type="submit" disabled={pending || !identity.trim()}>Cari akun terverifikasi</Button>
    <Button type="button" variant="outline" disabled={pending} onClick={() => { setIdentity(""); onCancel(); }}>Batalkan pencarian</Button>
  </form>{candidate && <div className="space-y-2">
        <p>Akun tujuan: {candidate.matchedLogin.kind === "EMAIL" ? "Email" : "Telepon"} {candidate.matchedLogin.maskedValue}</p>
        <label className="flex gap-2">
        <input type="checkbox" checked={acknowledged} disabled={pending} onChange={e => onAcknowledge(e.target.checked)}/>{acknowledgement}</label>
        <p className="text-xs text-muted-foreground">Pemeriksaan petugas ini bukan dokumen atau bukti persetujuan yang disimpan.</p>
        </div>}</div>;
}
