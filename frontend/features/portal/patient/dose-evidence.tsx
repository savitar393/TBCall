"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portalApi } from "../api";
import { portalQueries } from "../queries";
import { usePortalReferences, doseOptions, label } from "../references";
import { usePortalCommand } from "../use-command";
import { localToday } from "../local-date";
import { card, doseGuidance, Fields, Pagination, PortalState } from "../display";
import type { PortalTarget } from "../types";
export function DoseEvidence({ target, active, startDate }: {
    target: PortalTarget;
    active: boolean;
    startDate?: string;
}) {
    const { user } = useSession(), [page, setPage] = useState(0);
    const read = user!.permissions.includes("ADHERENCE_READ"), record = user!.permissions.includes("ADHERENCE_RECORD");
    const query = useQuery({ ...portalQueries.doses(user!.id, target, page), enabled: read });
    const refs = usePortalReferences();
    return <section className={card}><h2 className="text-lg font-semibold">Laporan bukti dosis</h2><p className="text-sm text-muted-foreground">{doseGuidance}</p>
    {read && (!query.data ? <PortalState query={query} empty="Belum ada laporan bukti dosis."/> : <><ul className="space-y-4">{query.data.data.content.map(d => <li key={d.id}><Fields items={{ Tanggal: d.scheduledDate, Status: label(target.kind === "patient" ? refs.data?.data.patientDoseStatuses : refs.data?.data.supporterDoseStatuses, d.status), "Dicatat pada": d.recordedAt, "Cara pemberian": label(refs.data?.data.administrationModes, d.administrationMode), Sumber: d.source }}/></li>)}</ul>{!query.data.data.content.length && <p>Belum ada laporan bukti dosis.</p>}<Pagination page={page} total={query.data.data.totalElements} onPage={setPage}/></>)}
    {record && active ? <DoseForm target={target} startDate={startDate}/> : record ? <p>Laporan dosis tersedia hanya untuk pengobatan aktif yang dapat ditampilkan.</p> : null}
  </section>;
}
function DoseForm({ target, startDate }: {
    target: PortalTarget;
    startDate?: string;
}) {
    const refs = usePortalReferences(), command = usePortalCommand();
    const [scheduledDate, setDate] = useState(""), [status, setStatus] = useState(""), [mode, setMode] = useState(""), [notes, setNotes] = useState("");
    const [dateError, setDateError] = useState(false);
    if (!refs.data)
        return <PortalState query={refs}/>;
    const options = doseOptions(refs.data.data, target.kind);
    const modes = refs.data.data.administrationModes;
    const validStatus = options.some(o => o.code === status);
    const validMode = !mode || modes.some(o => o.code === mode);
    return <form className="space-y-4" onSubmit={e => {
            e.preventDefault();
            if (scheduledDate > localToday()) {
                setDateError(true);
                return;
            }
            setDateError(false);
            if (!scheduledDate || !validStatus || !validMode)
                return;
            void command.run(signal => portalApi.recordDose(target, { scheduledDate, status, ...(mode ? { administrationMode: mode } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) }, signal), () => { setDate(""); setStatus(""); setMode(""); setNotes(""); });
        }}>
    <h3 className="font-semibold">Catat laporan dosis</h3>
    <label className="block">Tanggal dosis<Input aria-label="Tanggal dosis" type="date" required min={startDate} max={localToday()} value={scheduledDate} onChange={e => { setDate(e.target.value); setDateError(false); }} disabled={command.pending}/></label>
    {dateError && <p role="alert">Tanggal dosis tidak boleh setelah hari ini.</p>}
    <label className="block">Status laporan<select className="mt-1 min-h-11 w-full rounded border p-2" aria-label="Status laporan" required value={status} onChange={e => setStatus(e.target.value)} disabled={command.pending}><option value="">Pilih status laporan</option>{options.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}</select></label>
    <label className="block">Cara pemberian (opsional)<select className="mt-1 min-h-11 w-full rounded border p-2" aria-label="Cara pemberian" value={mode} onChange={e => setMode(e.target.value)} disabled={command.pending}><option value="">Tidak diisi</option>{modes.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}</select></label>
    <label className="block">Catatan (opsional)<textarea className="mt-1 w-full rounded border p-2" aria-label="Catatan dosis" value={notes} onChange={e => setNotes(e.target.value)} disabled={command.pending}/></label>
    <ApiFeedback error={command.error}/>{command.error?.problem.status === 409 && <p role="alert">Catatan atau keadaan pengobatan telah berubah. Periksa ulang sebelum mengirim secara manual.</p>}
    {command.success && <p role="status">Laporan dosis tersimpan.</p>}
    {((status && !validStatus) || !validMode) && <p role="alert">Pilihan referensi berubah. Pilih ulang status atau cara pemberian.</p>}
    <Button type="submit" disabled={command.pending || !scheduledDate || !validStatus || !validMode}>{command.pending ? "Menyimpan…" : "Simpan laporan dosis"}</Button>
  </form>;
}
