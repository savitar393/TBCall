"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { z } from "@/lib/validation";
import { ApiError } from "@/lib/api/problem";
import { Button } from "@/components/ui/button";
import { canClinical } from "@/features/clinical-intake/permissions";
import { CheckField } from "@/features/clinical-intake/forms/fields";
import { QueryState } from "@/features/clinical-intake/components/query-state";
import { labQueries } from "../queries";
import { labApi } from "../api";
import { canLabSource, canLabTesting } from "../permissions";
import { labEtagFromVersion } from "../etag";
import type { RequestDetail as RequestDto, Result } from "../types";
import { specimenFormSchema, specimenValues, receiveFormSchema, receiveValues, resultFormSchema, correctionFormSchema, resultValues } from "../forms/values";
import { specimenInput, receiveInput, resultInput, correctionInput } from "../forms/mappers";
import { SpecimenFields } from "../forms/specimen-fields";
import { ReceiveFields } from "../forms/receive-fields";
import { ResultFields, type LineageChoice } from "../forms/result-fields";
import { LabForm } from "./lab-form";
import { CompletenessDisplay, Timestamp, QueueLink } from "./request-display";
type Editor = { kind: "specimen" } | { kind: "cancel" } | { kind: "receive"; id: string } | { kind: "result"; id: string } | { kind: "correct"; id: string; initial: Result; lineage: string };
const receiveStates = ["REQUESTED", "SENT", "RECEIVED"];
const cancelSchema = z.object({ confirmed: z.boolean().refine(Boolean, "Konfirmasi pembatalan diperlukan.") });
function specimenName(request: RequestDto, id: string | null) {
  if (id === null) return "Tanpa spesimen tercatat";
  const index = request.specimens.findIndex(s => s.id === id);
  if (index < 0) return "Spesimen pada hasil tercatat";
  const s = request.specimens[index]; return `${s.specimenCode ?? s.specimenType} (spesimen ${index + 1})`;
}
function choices(request: RequestDto, testId: string): LineageChoice[] {
  const used = request.tests.find(t => t.id === testId)?.latestResults.map(r => r.specimenId) ?? [];
  return [ ...(!used.includes(null) ? [{ id: null, name: "Tanpa spesimen tercatat" }] : []), ...request.specimens.filter(s => s.examinationPossible === true && !used.includes(s.id)).map(s => ({ id: s.id, name: specimenName(request, s.id) })) ];
}
function requireAvailable(value: boolean) { if (!value) throw new ApiError({ status: 409, code: "LAB_RESULT_STATE_CONFLICT", title: "Data telah berubah" }); }
function ActionEditor({ editor, request, etag, readable, fetching, onSuccess, onClose }: { editor: Editor; request: RequestDto; etag?: string; readable: boolean; fetching: boolean; onSuccess(): void; onClose(): void }) {
  const { user } = useSession();
  const source = canLabSource(user, request.requestingFacility.id); const testing = canLabTesting(user, request.testingFacility.id);
  const initialSpecimen = useMemo(() => specimenValues(), []); const initialReceive = useMemo(() => receiveValues(), []); const initialCancel = useMemo(() => ({ confirmed: false }), []);
  const initialResult = useMemo(() => { const value = resultValues(editor.kind === "correct" ? editor.initial : undefined); if (editor.kind === "result" && !choices(request, editor.id).some(c => c.id === null)) value.specimenId = "UNSELECTED"; return value; }, [editor, request]);
  const active = readable && !fetching;
  if (editor.kind === "specimen") return <LabForm initial={initialSpecimen} schema={specimenFormSchema} available={active && source && !!etag && ["REQUESTED", "SENT"].includes(request.status)} fetching={fetching} submitLabel="Simpan spesimen" save={(v, signal) => labApi.specimen(request.id, specimenInput(v), etag!, signal)} onSuccess={onSuccess} onClose={onClose}><SpecimenFields /></LabForm>;
  if (editor.kind === "cancel") return <LabForm initial={initialCancel} schema={cancelSchema} confirmationField="confirmed" available={active && source && !!etag && receiveStates.includes(request.status)} fetching={fetching} submitLabel="Konfirmasi pembatalan" save={(_, signal) => labApi.cancel(request.id, etag!, signal)} onSuccess={onSuccess} onClose={onClose}><h2 className="font-semibold">Konfirmasi pembatalan permintaan</h2><p>Backend akan memeriksa status dan hasil sebelum membatalkan permintaan.</p><CheckField name="confirmed" label="Saya mengonfirmasi pembatalan permintaan ini" /></LabForm>;
  if (editor.kind === "receive") {
    const specimen = request.specimens.find(s => s.id === editor.id);
    return <LabForm initial={initialReceive} schema={receiveFormSchema} available={active && testing && !!specimen && specimen.receivedAt === null && receiveStates.includes(request.status)} fetching={fetching} submitLabel="Simpan penerimaan" save={(v, signal) => labApi.receive(editor.id, receiveInput(v), labEtagFromVersion(specimen!.version), signal)} onSuccess={onSuccess} onClose={onClose}><ReceiveFields /></LabForm>;
  }
  const test = editor.kind === "result" ? request.tests.find(t => t.id === editor.id) : request.tests.find(t => t.latestResults.some(r => r.id === editor.id));
  const projectedResult = editor.kind === "correct" ? test?.latestResults.find(r => r.id === editor.id) : undefined;
  const availableChoices = test ? choices(request, test.id) : [];
  const permitted = active && testing && !!test && request.status !== "CANCELLED" && test.status !== "CANCELLED" && (editor.kind === "result" ? availableChoices.length > 0 : !!projectedResult && user!.permissions.includes("LAB_RESULT_READ"));
  return <LabForm initial={initialResult} schema={editor.kind === "correct" ? correctionFormSchema(editor.initial) : resultFormSchema} available={permitted} fetching={fetching} submitLabel={editor.kind === "correct" ? "Simpan koreksi" : "Simpan hasil"} save={(v, signal) => {
    if (editor.kind === "correct") return labApi.correct(editor.id, correctionInput(v, editor.initial), labEtagFromVersion(projectedResult!.version), signal);
    requireAvailable(availableChoices.some(c => c.id === (v.specimenId || null)));
    return labApi.result(editor.id, resultInput(v), labEtagFromVersion(test!.version), signal);
  }} onSuccess={onSuccess} onClose={onClose}><ResultFields choices={availableChoices} correction={editor.kind === "correct"} lineage={editor.kind === "correct" ? editor.lineage : undefined} /></LabForm>;
}
export function RequestDetail({ id }: { id: string }) {
  const { user } = useSession(); const query = useQuery(labQueries.request(user!.id, id)); const references = useQuery(labQueries.references(user!.id));
  const [editor, setEditor] = useState<Editor | null>(null); const [saved, setSaved] = useState(false);
  const request = query.data?.data; const ref = references.data?.data;
  if (!request) return <QueryState query={query} />;
  const label = (group: "requestStatuses" | "ownerTypes" | "referralTypes" | "testStatuses" | "resultStatuses", code: string) => ref?.[group].find(o => o.code === code)?.name ?? code;
  const source = canLabSource(user, request.requestingFacility.id); const testing = canLabTesting(user, request.testingFacility.id); const showResults = user!.permissions.includes("LAB_RESULT_READ");
  const select = (next: Editor) => { setSaved(false); setEditor(next); };
  const allow = !query.isFetching && !query.isError;
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">Permintaan laboratorium</h1><QueueLink /><Button type="button" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Muat ulang permintaan</Button>
    {query.isError && <QueryState query={query} />}{references.isError && <QueryState query={references} />}
    <section className="space-y-3 rounded-xl border bg-white p-5" aria-label="Ringkasan permintaan"><h2 className="font-semibold">{request.patient.fullName}</h2><p>{request.patient.sex?.name ?? "—"} · {request.patient.birthDateUnknown ? "Tanggal lahir tidak diketahui" : request.patient.birthDate ?? "—"}</p><p>{label("ownerTypes", request.owner.type)} · {request.requestReason.name} · {label("referralTypes", request.referralType)} · {label("requestStatuses", request.status)}</p><p>Peminta: {request.requestingFacility.name} · Pemeriksa: {request.testingFacility.name}</p><p>Diminta: <Timestamp value={request.requestedAt} /></p><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt>Cara pengiriman</dt><dd>{request.sampleShippingMethod ?? "—"}</dd></div><div><dt>Nama kurir</dt><dd>{request.courierName ?? "—"}</dd></div><div><dt>Catatan permintaan</dt><dd className="whitespace-pre-wrap break-words">{request.notes ?? "—"}</dd></div></dl><CompletenessDisplay value={request.completeness} />
      {canClinical(user, request.owner.type === "REGISTRATION" ? "REGISTRATION_READ" : "CASE_READ") && <Link className="text-primary underline" href={`/${request.owner.type === "REGISTRATION" ? "registrations" : "cases"}/${request.owner.id}`}>{request.owner.type === "REGISTRATION" ? "Buka registrasi" : "Buka kasus"}</Link>}
    </section>
    {source && <section className="space-y-3" aria-label="Tindakan fasilitas peminta"><h2 className="font-semibold">Fasilitas peminta</h2><div className="flex flex-wrap gap-3">{["REQUESTED", "SENT"].includes(request.status) && <Button disabled={!allow || !!editor || !query.data?.etag} onClick={() => select({ kind: "specimen" })}>Catat spesimen</Button>}{receiveStates.includes(request.status) && <Button variant="outline" disabled={!allow || !!editor || !query.data?.etag} onClick={() => select({ kind: "cancel" })}>Batalkan permintaan</Button>}</div></section>}
    <section className="space-y-3" aria-label="Spesimen"><h2 className="font-semibold">Spesimen</h2>{!request.specimens.length && <p>Belum ada spesimen tercatat.</p>}{request.specimens.map((s, index) => <article key={s.id} className="space-y-2 rounded-xl border bg-white p-5"><h3 className="font-semibold">{specimenName(request, s.id)}</h3><p>Jenis: {s.specimenType}</p><p>Dikumpulkan: <Timestamp value={s.collectedAt} /> · Dikirim: <Timestamp value={s.sentAt} /></p><p>Diterima: <Timestamp value={s.receivedAt} /></p><p>Kondisi: {s.conditionOnReceipt ?? "—"} · Dapat diperiksa: {s.examinationPossible === null ? "Belum ditentukan" : s.examinationPossible ? "Ya" : "Tidak"}</p>{s.rejectionReason && <p className="whitespace-pre-wrap break-words">Alasan penolakan: {s.rejectionReason}</p>}{s.notes && <p className="whitespace-pre-wrap break-words">{s.notes}</p>}{testing && s.receivedAt === null && receiveStates.includes(request.status) && <Button disabled={!allow || !!editor} onClick={() => select({ kind: "receive", id: s.id })}>Terima spesimen {s.specimenCode ?? `nomor ${index + 1}`}</Button>}</article>)}</section>
    <section className="space-y-3" aria-label="Pemeriksaan dan hasil"><h2 className="font-semibold">Pemeriksaan dan hasil</h2>{!showResults && <p>Konten hasil memerlukan izin membaca hasil laboratorium.</p>}{request.tests.map(t => <article key={t.id} className="space-y-3 rounded-xl border bg-white p-5"><h3 className="font-semibold">{t.testType.name}</h3><p>{label("testStatuses", t.status)}</p>{showResults && t.latestResults.map(r => <div key={r.id} className="space-y-2 border-t pt-3"><h4>{specimenName(request, r.specimenId)}</h4><p>{label("resultStatuses", r.status)}</p><p>Urutan {r.sequenceNo} · <Timestamp value={r.testedAt} /></p><dl className="space-y-2 text-sm"><div><dt>Kode</dt><dd>{r.resultCode ?? "—"}</dd></div><div><dt>Nilai</dt><dd className="whitespace-pre-wrap break-words">{r.resultValue ?? "—"}</dd></div><div><dt>Narasi</dt><dd className="whitespace-pre-wrap break-words">{r.resultText ?? "—"}</dd></div></dl>{testing && request.status !== "CANCELLED" && t.status !== "CANCELLED" && <Button variant="outline" disabled={!allow || !!editor} aria-label={`Koreksi hasil ${t.testType.name} ${specimenName(request, r.specimenId)}`} onClick={() => select({ kind: "correct", id: r.id, initial: r, lineage: specimenName(request, r.specimenId) })}>Koreksi hasil</Button>}</div>)}{testing && request.status !== "CANCELLED" && t.status !== "CANCELLED" && choices(request, t.id).length > 0 && <Button disabled={!allow || !!editor} aria-label={`Catat hasil ${t.testType.name}`} onClick={() => select({ kind: "result", id: t.id })}>Catat hasil</Button>}</article>)}</section>
    {saved && <p role="status">Perubahan tersimpan. Data permintaan dimuat ulang.</p>}
    {editor && <section aria-label="Formulir tindakan" className="space-y-3"><ActionEditor key={editor.kind + ("id" in editor ? editor.id : "")} editor={editor} request={request} etag={query.data?.etag} readable={!query.isError} fetching={query.isFetching} onSuccess={() => { setSaved(true); setEditor(null); }} onClose={() => setEditor(null)} /></section>}
  </div>;
}
