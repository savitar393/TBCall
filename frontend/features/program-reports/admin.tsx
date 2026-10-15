"use client";
import { useState } from "react";
import { z } from "@/lib/validation";
import { useSession } from "@/lib/auth/session";
import { administrationApi } from "@/features/administration/api";
import { useAdministrationCommand } from "@/features/administration/use-command";
import { AppConfirmation } from "@/components/application-confirmation";
import { AppDisclosure, AppPageHeader, AppSection, AppState, AppStatusBadge, AppTable } from "@/components/application-patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportApi, requiredEtag, type Candidate, type Geography, type Grant } from "./api";
import { canLookup, canManageScopes, canPublish } from "./permissions";
type Target = { id: string; identity: string; eligible: boolean };
const scopeLabels = { NATIONAL: "Nasional", PROVINCE: "Provinsi", REGENCY: "Kabupaten/kota" };
export function ReportingAdmin() {
  const { user } = useSession(), command = useAdministrationCommand();
  const [tab, setTab] = useState<"scopes" | "publication">(canManageScopes(user) ? "scopes" : "publication");
  const [identity, setIdentity] = useState(""), [target, setTarget] = useState<Target | null>(null), [grants, setGrants] = useState<Grant[] | null>(null);
  const [scope, setScope] = useState<Geography["scope"]>("PROVINCE"), [code, setCode] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null), [candidateId, setCandidateId] = useState("");
  const manage = canManageScopes(user), publish = canPublish(user), lookup = canLookup(user);
  if (!manage && !publish) return <AppState kind="restricted" title="Akses administrasi pelaporan tidak tersedia" />;
  const onError = () => { setCandidate(null); setGrants(null); setTarget(null); };
  const run = <T,>(operation: (signal: AbortSignal) => Promise<T>, onSuccess: (value: T) => void) => command.run(operation, { onSuccess, onError });
  const failure = command.error;
  const message = failure?.problem.code === "REPORT_PUBLICATION_WITHHELD" ? "Publikasi ditahan oleh pemeriksaan privasi atau kebaruan data." : failure?.problem.status === 404 ? "Pengguna atau snapshot tidak ditemukan." : failure?.problem.status === 409 || failure?.problem.status === 428 ? "Versi telah berubah. Buka kembali data sebelum mengonfirmasi." : failure?.problem.status === 403 ? "Izin tindakan tidak tersedia. Tidak ada perubahan yang diulang." : "Permintaan belum dapat diproses. Periksa isian atau coba kembali secara manual.";
  return <div className="space-y-6">
    <AppPageHeader title="Administrasi pelaporan" eyebrow="Tata kelola" description="Penugasan wilayah dan persetujuan snapshot TBCall." />
    <nav aria-label="Bagian administrasi pelaporan" className="app-view-links">{manage && <Button variant={tab === "scopes" ? "default" : "ghost"} aria-current={tab === "scopes" ? "page" : undefined} onClick={() => setTab("scopes")}>Penugasan wilayah</Button>}{publish && <Button variant={tab === "publication" ? "default" : "ghost"} aria-current={tab === "publication" ? "page" : undefined} onClick={() => setTab("publication")}>Publikasi snapshot</Button>}</nav>
    {failure && <AppState kind="error" title={message} />}
    {command.pending && <AppState kind="loading" title="Memproses permintaan…" />}
    {command.success && <p role="status" className="text-sm text-primary">Permintaan selesai.</p>}
    {tab === "scopes" && manage && <>
      {!lookup ? <AppState kind="restricted" title="Pencarian memerlukan izin pengelolaan pengguna">Izin penugasan wilayah tidak memberikan akses pencarian akun.</AppState> : <AppSection title="Pengguna pemantau">
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (!identity.trim() || command.pending) return; const input = identity.trim(); setIdentity(""); setTarget(null); setGrants(null); void run(async signal => { const response = await administrationApi.lookup(input, signal); const assignments = await reportApi.grants(response.data.userId, signal); return { person: response.data, grants: assignments.data }; }, result => { setTarget({ id: result.person.userId, identity: result.person.email ?? result.person.phone ?? "Pengguna terverifikasi", eligible: result.person.status === "ACTIVE" && result.person.roles.some(r => r.code === "PROGRAM_MONITOR") }); setGrants(result.grants); }); }}>
          <label className="grid min-w-0 flex-1 gap-2 text-sm font-medium">Email atau telepon terverifikasi<Input value={identity} onChange={e => setIdentity(e.target.value)} autoComplete="off" maxLength={254} required disabled={command.pending} /></label><Button disabled={command.pending || !identity.trim()}>Cari pengguna</Button>
        </form>
        {target && <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4"><span className="text-sm font-medium">{target.identity}</span><AppStatusBadge tone={target.eligible ? "active" : "warning"}>{target.eligible ? "Pemantau aktif" : "Tidak memenuhi syarat penugasan"}</AppStatusBadge><Button variant="ghost" disabled={command.pending} onClick={() => { setTarget(null); setGrants(null); }}>Tutup pengguna</Button></div>}
      </AppSection>}
      {target && grants && <AppSection title="Penugasan aktif" description="Penugasan pelaporan terpisah dari keanggotaan fasilitas klinis.">
        {grants.length ? <AppTable caption="Penugasan pelaporan aktif"><thead><tr><th>Lingkup</th><th>Kode Kemendagri</th><th>Tanggal penugasan</th><th>Tindakan</th></tr></thead><tbody>{grants.map(g => <tr key={g.id}><td>{scopeLabels[g.scope]}</td><td>{g.regionCode ?? "Seluruh Indonesia"}</td><td>{new Date(g.assignedAt).toLocaleDateString("id-ID")}</td><td><AppConfirmation label={`Cabut ${scopeLabels[g.scope]} ${g.regionCode ?? "nasional"}`} description={`Cabut akses ${target.identity} untuk ${scopeLabels[g.scope]} ${g.regionCode ?? "Indonesia"}? Akses server berakhir setelah pencabutan tersimpan.`} disabled={command.pending} onConfirm={() => { const user = target.id; void run(async signal => { const fresh = await reportApi.grant(user, g.id, signal); await reportApi.revoke(user, g.id, requiredEtag(fresh.etag), signal); return (await reportApi.grants(user, signal)).data; }, setGrants); }} /></td></tr>)}</tbody></AppTable> : <AppState kind="empty" title="Belum ada penugasan aktif" />}
        {target.eligible && <div className="grid gap-4 border-t pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-2 text-sm font-medium">Lingkup<select className="app-input" value={scope} disabled={command.pending} onChange={e => { setScope(e.target.value as Geography["scope"]); setCode(""); }}>{Object.entries(scopeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>{scope !== "NATIONAL" ? <label className="grid gap-2 text-sm font-medium">Kode Kemendagri<Input value={code} maxLength={20} disabled={command.pending} onChange={e => setCode(e.target.value)} placeholder={scope === "PROVINCE" ? "Contoh: 33" : "Contoh: 33.01"} /></label> : <p className="text-sm text-muted-foreground">Seluruh wilayah katalog terverifikasi</p>}<AppConfirmation label="Tetapkan wilayah" description={`Berikan ${target.identity} akses ${scopeLabels[scope]} ${scope === "NATIONAL" ? "Indonesia" : code}? Kode akan diperiksa terhadap katalog server.`} disabled={command.pending || (scope !== "NATIONAL" && !code)} onConfirm={() => { const user = target.id; void run(async signal => { await reportApi.assign(user, scope, code, signal); return (await reportApi.grants(user, signal)).data; }, setGrants); }} /></div>}
      </AppSection>}
    </>}
    {tab === "publication" && publish && <>
      <AppSection title="Snapshot pelaporan" description="Penangkapan menyimpan kandidat. Publikasi memerlukan persetujuan terpisah." actions={<Button disabled={command.pending} onClick={() => { setCandidate(null); void run(async signal => (await reportApi.capture(signal)).data, setCandidate); }}>Tangkap snapshot</Button>}>
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (command.pending || !z.uuid().safeParse(candidateId).success) return; const id = candidateId; setCandidate(null); void run(async signal => (await reportApi.candidate(id, signal)).data, setCandidate); }}><label className="grid min-w-0 flex-1 gap-2 text-sm font-medium">ID kandidat yang telah disimpan<Input value={candidateId} onChange={e => setCandidateId(e.target.value)} maxLength={36} disabled={command.pending} /></label><Button variant="outline" disabled={command.pending || !z.uuid().safeParse(candidateId).success}>Buka metadata</Button></form>
        {candidate ? <div className="space-y-4 border-t pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Metadata kandidat</h2><AppStatusBadge tone={candidate.state === "PUBLISHED" ? "complete" : "warning"}>{candidate.state === "PUBLISHED" ? "Diterbitkan" : "Belum diterbitkan"}</AppStatusBadge></div><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">ID snapshot</dt><dd className="mt-1 break-all font-mono text-xs">{candidate.id}</dd></div><div><dt className="text-muted-foreground">Posisi data</dt><dd className="mt-1">{new Date(candidate.dataAsOf).toLocaleString("id-ID")}</dd></div><div><dt className="text-muted-foreground">Katalog</dt><dd className="mt-1 break-words">{candidate.catalogueVersion}</dd></div><div><dt className="text-muted-foreground">Versi</dt><dd className="mt-1">{candidate.version}</dd></div></dl>{candidate.state === "DRAFT" && <AppConfirmation label="Terbitkan snapshot" description={`Setujui publikasi snapshot ${candidate.id}? Pemeriksaan privasi dan kebaruan server tetap berlaku. Snapshot terbit tidak dapat diubah.`} disabled={command.pending} onConfirm={() => { const id = candidate.id; void run(async signal => { const fresh = await reportApi.candidate(id, signal); return (await reportApi.publish(id, requiredEtag(fresh.etag), signal)).data; }, setCandidate); }} />}</div> : <AppState kind="empty" title="Belum ada kandidat yang dibuka" />}
      </AppSection>
      <AppDisclosure title="Batasan publikasi"><p className="text-sm">Metadata kandidat tidak menampilkan agregat klinis atau kontribusi pasien. Tidak ada publikasi otomatis. Jika pemeriksaan menahan publikasi, periksa proses tata kelola sebelum membuat kandidat baru.</p></AppDisclosure>
    </>}
  </div>;
}
