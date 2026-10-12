"use client";
import { useState } from "react";
import {
  CATALOG, errText, fmtDateTime, qs, RequireSession, useLive, useLiveMutation, usePermissions,
  type UserLookupResponse, type FacilityResponse, type IntegrationSummary, type Page,
} from "./api";
import { apiRequest } from "@/lib/api/client";
import { Card, CardTitle, Chip, DemoBanner, Field, FooterBar, GhostButton, PrimaryButton, SubTabs, TopNav, inputClass } from "../ui";

/* ============================================================
   Ruang Admin Faskes/Sistem — LIVE (administrasi + integrasi)
   Modul tanpa endpoint (Command Center analitik, Logistik OAT)
   tetap ditandai demo.
   ============================================================ */

const MODULES = [
  { key: "users", label: "Pengguna & Peran" },
  { key: "faskes", label: "Faskes & Akun" },
  { key: "integrasi", label: "Integrasi & Audit" },
  { key: "lainnya", label: "Command Center & Logistik" },
] as const;

export function RuangAdminLive() {
  return (
    <RequireSession anyPermission={["USER_MANAGE_FACILITY", "FACILITY_MANAGE", "ROLE_MANAGE", "INTEGRATION_MANAGE", "NOTIFICATION_READ_SELF"]}>
      {() => <AdminInner />}
    </RequireSession>
  );
}

function AdminInner() {
  const [active, setActive] = useState("users");
  const { facilities } = usePermissions();
  const name = facilities[0]?.name ?? "Administrasi TBCall";
  return (
    <div className="min-h-dvh bg-[#F3F4FB]">
      <TopNav modules={MODULES} active={active} onSelect={setActive} userName="Ruang Administrasi" userRole={name} notif />
      <main id="main-content" className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        {active === "users" && <KelolaPengguna />}
        {active === "faskes" && <KelolaFaskes />}
        {active === "integrasi" && <KelolaIntegrasi />}
        {active === "lainnya" && <ModulTanpaEndpoint />}
      </main>
      <FooterBar left="TB Call Center · Ruang administrasi (live)" right="Aksi melalui kontrak backend · RBAC + If-Match" />
    </div>
  );
}

/* ---------- Pengguna ---------- */

function KelolaPengguna() {
  const { can, facilities } = usePermissions();
  const [identity, setIdentity] = useState("");
  const [cari, setCari] = useState("");
  const user = useLive<UserLookupResponse>(["lookup", cari], cari ? `/v1/admin/users/lookup${qs({ identity: cari })}` : null);
  const [roleCode, setRoleCode] = useState("TB_OFFICER");
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");

  const assignRole = useLiveMutation<{ id: string; role: string }, { roleCode: string; assigned: boolean }>(({ id, role }) =>
    apiRequest(`/v1/admin/users/${id}/roles/${role}`, { method: "POST" }).then((r) => ({ data: r.data as { roleCode: string; assigned: boolean } })), [["lookup", cari]]);
  const removeRole = useLiveMutation<{ id: string; role: string }, unknown>(({ id, role }) =>
    apiRequest(`/v1/admin/users/${id}/roles/${role}`, { method: "DELETE" }).then(() => ({ data: undefined })), [["lookup", cari]]);
  const assignFacility = useLiveMutation<void, unknown>(() =>
    apiRequest(`/v1/admin/facilities/${facilityId}/users/${user.data!.userId}`, { method: "POST", body: { primary: false } }).then(() => ({ data: undefined })), [["lookup", cari]]);
  const removeFacility = useLiveMutation<void, unknown>(() =>
    apiRequest(`/v1/admin/facilities/${facilityId}/users/${user.data!.userId}`, { method: "DELETE" }).then(() => ({ data: undefined })), [["lookup", cari]]);
  const setStatus = useLiveMutation<{ action: "suspend" | "reactivate" | "disable"; version: number }, unknown>(({ action, version }) =>
    apiRequest(`/v1/admin/users/${user.data!.userId}/${action}`, { method: "POST", body: {}, etag: `"${version}"` }).then(() => ({ data: undefined })), [["lookup", cari]]);

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle sub="GET /admin/users/lookup?identity=email-atau-telepon — memerlukan USER_MANAGE_FACILITY.">Cari pengguna</CardTitle>
        <div className="flex flex-wrap gap-3">
          <input aria-label="Identitas pengguna" className={`${inputClass} max-w-xl flex-1`} value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="email atau nomor telepon" />
          <PrimaryButton disabled={!identity || cari === identity} onClick={() => setCari(identity)}>Cari</PrimaryButton>
        </div>
        {user.error && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(user.error).detail}</p>}
      </Card>
      {user.data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle right={<Chip tone={user.data.status === "ACTIVE" ? "green" : "amber"}>{user.data.status}</Chip>}>Profil pengguna</CardTitle>
            <dl className="space-y-2 text-sm">
              {[["ID", user.data.userId], ["Email", user.data.email ?? "—"], ["Telepon", user.data.phone ?? "—"], ["Email terverifikasi", user.data.emailVerified ? "Ya" : "Belum"], ["Telepon terverifikasi", user.data.phoneVerified ? "Ya" : "Belum"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b pb-2"><span className="text-[#5b6478]">{k}</span><strong className="break-all text-[#123524]">{v}</strong></div>
              ))}
            </dl>
            <h3 className="mt-4 font-bold text-[#123524]">Peran saat ini</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {user.data.roles.length ? user.data.roles.map((r) => <Chip key={r.code} tone="green">{r.name}</Chip>) : <p className="text-sm text-[#5b6478]">Belum ada peran.</p>}
            </div>
            <h3 className="mt-4 font-bold text-[#123524]">Fasilitas aktif</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {user.data.activeFacilities.length ? user.data.activeFacilities.map((f) => <li key={f.id} className="rounded-lg bg-[#F3F4FB] px-3 py-2">{f.name}{f.primary ? " · utama" : ""}<span className="block font-mono text-[10px] text-[#8a90a5]">{f.id}</span></li>) : <li className="text-[#5b6478]">Belum ditugaskan.</li>}
            </ul>
          </Card>
          <Card>
            <CardTitle sub="Perubahan diterapkan langsung ke backend dengan pemeriksaan hak (ROLE_MANAGE / USER_MANAGE_FACILITY).">Kelola pengguna</CardTitle>
            {can("ROLE_MANAGE") && (
              <div className="border-b pb-4">
                <p className="font-bold text-[#123524]">Peran</p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <Field label="Kode peran">
                    <select className={inputClass} value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>{CATALOG.roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>
                  </Field>
                  <PrimaryButton className="!min-h-11 !px-4 text-xs" disabled={assignRole.isPending} onClick={() => assignRole.mutate({ id: user.data!.userId, role: roleCode })}>+ Tugaskan</PrimaryButton>
                  <GhostButton className="!min-h-11 !px-4 text-xs" disabled={removeRole.isPending} onClick={() => removeRole.mutate({ id: user.data!.userId, role: roleCode })}>− Cabut</GhostButton>
                </div>
                {assignRole.localError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{errText(assignRole.localError).detail}</p>}
                {assignRole.isSuccess && <p role="status" className="mt-2 text-xs font-semibold text-[#0B5A2A]">✓ Peran diperbarui.</p>}
              </div>
            )}
            {can("USER_MANAGE_FACILITY") && (
              <div className="border-b py-4">
                <p className="font-bold text-[#123524]">Penugasan fasilitas</p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <Field label="UUID fasilitas">
                    <input className={`${inputClass} font-mono text-xs`} value={facilityId} onChange={(e) => setFacilityId(e.target.value.trim())} />
                  </Field>
                  <PrimaryButton className="!min-h-11 !px-4 text-xs" disabled={!facilityId || assignFacility.isPending} onClick={() => assignFacility.mutate(undefined as never)}>Tugaskan</PrimaryButton>
                  <GhostButton className="!min-h-11 !px-4 text-xs" disabled={!facilityId || removeFacility.isPending} onClick={() => removeFacility.mutate(undefined as never)}>Cabut</GhostButton>
                </div>
                {assignFacility.localError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{errText(assignFacility.localError).detail}</p>}
              </div>
            )}
            <div className="pt-4">
              <p className="font-bold text-[#123524]">Status akun</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <GhostButton className="!min-h-11 !px-4 text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ action: "suspend", version: user.data!.version })}>Suspend</GhostButton>
                <GhostButton className="!min-h-11 !px-4 text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ action: "reactivate", version: user.data!.version })}>Reaktivasi</GhostButton>
                <GhostButton className="!min-h-11 !px-4 text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ action: "disable", version: user.data!.version })}>Disable</GhostButton>
              </div>
              {setStatus.localError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{errText(setStatus.localError).detail}</p>}
              {setStatus.isSuccess && <p role="status" className="mt-2 text-xs font-semibold text-[#0B5A2A]">✓ Status diperbarui — muat ulang pencarian untuk melihat status terbaru.</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ---------- Faskes ---------- */

function KelolaFaskes() {
  const { can, facilities } = usePermissions();
  const [nama, setNama] = useState("");
  const [jenis, setJenis] = useState("PUSKESMAS");
  const [alamat, setAlamat] = useState("");
  const create = useLiveMutation<void, FacilityResponse>(async () =>
    apiRequest<FacilityResponse>("/v1/admin/facilities", { method: "POST", body: { name: nama, facilityTypeCode: jenis, address: alamat || undefined } }).then((r) => ({ data: r.data })), []);

  const [editId, setEditId] = useState(facilities[0]?.id ?? "");
  const [editVersion, setEditVersion] = useState<number>(1);
  const [editNama, setEditNama] = useState(facilities[0]?.name ?? "");
  const [editJenis, setEditJenis] = useState("PUSKESMAS");
  const [editAlamat, setEditAlamat] = useState("");

  const update = useLiveMutation<void, FacilityResponse>(async () =>
    apiRequest<FacilityResponse>(`/v1/admin/facilities/${editId}`, {
      method: "PATCH",
      body: { name: editNama || undefined, facilityTypeCode: editJenis || undefined, address: editAlamat || undefined },
      etag: `"${editVersion}"`,
    }).then((r) => {
      setEditVersion(r.data.version);
      return { data: r.data };
    }), []);

  const deactivate = useLiveMutation<void, FacilityResponse>(async () =>
    apiRequest<FacilityResponse>(`/v1/admin/facilities/${editId}/deactivate`, {
      method: "POST",
      body: {},
      etag: `"${editVersion}"`,
    }).then((r) => {
      setEditVersion(r.data.version);
      return { data: r.data };
    }), []);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle sub="POST /admin/facilities — memerlukan FACILITY_MANAGE (SYSTEM_ADMIN).">Buat fasilitas baru</CardTitle>
          <div className="space-y-4">
            <Field label="Nama fasilitas *" required><input className={inputClass} value={nama} onChange={(e) => setNama(e.target.value)} /></Field>
            <Field label="Kode jenis fasilitas"><input className={inputClass} value={jenis} onChange={(e) => setJenis(e.target.value)} placeholder="PUSKESMAS / RS / LABORATORIUM" /></Field>
            <Field label="Alamat"><textarea className={`${inputClass} min-h-16`} value={alamat} onChange={(e) => setAlamat(e.target.value)} /></Field>
          </div>
          {create.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(create.localError).detail}</p>}
          {create.isSuccess && (
            <p role="status" className="mt-3 rounded-xl bg-[#E7F7EA] px-4 py-3 text-sm font-semibold text-[#0B5A2A]">
              ✓ Fasilitas dibuat: {create.data?.data.name} (UUID: {create.data?.data.id}, v{create.data?.data.version})
            </p>
          )}
          <PrimaryButton className="mt-4" disabled={!nama || create.isPending} onClick={() => create.mutate(undefined as never)}>{create.isPending ? "Membuat…" : "Buat fasilitas"}</PrimaryButton>
        </Card>
        <Card>
          <CardTitle>Fasilitas penugasan Anda</CardTitle>
          <ul className="space-y-2 text-sm">
            {facilities.length ? facilities.map((f) => (
              <li
                key={f.id}
                onClick={() => { setEditId(f.id); setEditNama(f.name); }}
                className={`cursor-pointer rounded-xl px-4 py-3 transition ${editId === f.id ? "bg-[#E7F7EA] ring-2 ring-[#0B5A2A]" : "bg-[#F3F4FB] hover:bg-[#EEF0FA]"}`}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-[#0B5A2A]">{f.name}</strong>
                </div>
                <span className="block font-mono text-[10px] text-[#5b6478]">{f.id}</span>
                <span className="text-[11px] text-[#8a90a5]">Klik untuk memilih faskes ini untuk diperbarui/dinonaktifkan</span>
              </li>
            )) : <li className="text-[#5b6478]">Tidak ada fasilitas aktif pada akun ini.</li>}
          </ul>
          {!can("FACILITY_MANAGE") && <p className="mt-4 text-xs text-[#8a90a5]">Pembuatan/ubah fasilitas memerlukan izin FACILITY_MANAGE.</p>}
        </Card>
      </div>

      {can("FACILITY_MANAGE") && (
        <Card>
          <CardTitle sub="PATCH /admin/facilities/{id} dan POST /admin/facilities/{id}/deactivate (memerlukan header If-Match).">
            Perbarui atau Nonaktifkan Fasilitas
          </CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="UUID fasilitas *" required>
              <input className={`${inputClass} font-mono text-xs`} value={editId} onChange={(e) => setEditId(e.target.value.trim())} placeholder="UUID fasilitas" />
            </Field>
            <Field label="Versi saat ini (If-Match) *" required>
              <input type="number" min={1} className={inputClass} value={editVersion} onChange={(e) => setEditVersion(Number(e.target.value))} />
            </Field>
            <Field label="Nama fasilitas baru">
              <input className={inputClass} value={editNama} onChange={(e) => setEditNama(e.target.value)} />
            </Field>
            <Field label="Kode jenis fasilitas">
              <input className={inputClass} value={editJenis} onChange={(e) => setEditJenis(e.target.value)} placeholder="PUSKESMAS / RS / LABORATORIUM" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Alamat">
                <textarea className={`${inputClass} min-h-16`} value={editAlamat} onChange={(e) => setEditAlamat(e.target.value)} />
              </Field>
            </div>
          </div>
          {(update.localError ?? deactivate.localError) && (
            <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(update.localError ?? deactivate.localError).detail}</p>
          )}
          {update.isSuccess && (
            <p role="status" className="mt-3 rounded-xl bg-[#E7F7EA] px-4 py-2 text-sm font-semibold text-[#0B5A2A]">
              ✓ Fasilitas berhasil diperbarui (versi terbaru: {update.data?.data.version}).
            </p>
          )}
          {deactivate.isSuccess && (
            <p role="status" className="mt-3 rounded-xl bg-[#FDEBD3] px-4 py-2 text-sm font-semibold text-[#8a5a12]">
              ✓ Fasilitas berhasil dinonaktifkan (aktif = {deactivate.data?.data.active ? "Ya" : "Tidak"}).
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <PrimaryButton disabled={!editId || update.isPending} onClick={() => update.mutate(undefined as never)}>
              {update.isPending ? "Memperbarui…" : "Simpan Perubahan Fasilitas"}
            </PrimaryButton>
            <GhostButton className="!text-[#b42318]" disabled={!editId || deactivate.isPending} onClick={() => {
              if (window.confirm(`Yakin ingin menonaktifkan fasilitas ${editId}? Pastikan tidak ada penugasan nakes aktif.`)) {
                deactivate.mutate(undefined as never);
              }
            }}>
              {deactivate.isPending ? "Memproses…" : "Nonaktifkan Fasilitas"}
            </GhostButton>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------- Integrasi ---------- */

function KelolaIntegrasi() {
  const { can } = usePermissions();
  const list = useLive<Page<IntegrationSummary>>(["integrations"], can("INTEGRATION_MANAGE") ? "/v1/integrations?page=0&size=20" : null);
  const [code, setCode] = useState("");
  const [tab, setTab] = useState<"identifiers" | "authorities" | "runs" | "conflicts">("identifiers");
  const detail = useLive<Page<Record<string, unknown>>>(["integration", code, tab], code && can("INTEGRATION_MANAGE") ? `/v1/integrations/${code}/${{ identifiers: "external-identifiers", authorities: "authorities", runs: "sync-runs", conflicts: "conflicts" }[tab]}?page=0&size=20` : null);
  return (
    <div className="space-y-5">
      <DemoBanner title="Kontrak Phase 5A · Sumber lokal prototype">Belum ada sinkronisasi SITB nyata. Data di bawah adalah metadata integrasi lokal dari backend.</DemoBanner>
      <Card>
        <CardTitle right={<Chip tone="gray">{list.data ? `${list.data.totalElements} integrasi` : "…"}</Chip>}>Status integrasi</CardTitle>
        {list.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
          : list.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(list.error).detail}</p>
          : list.data?.content.length ? (
            <ul className="space-y-3 text-sm">
              {list.data.content.map((i) => (
                <li key={i.code} onClick={() => { setCode(i.code); }} className={`cursor-pointer rounded-xl px-4 py-3 transition ${code === i.code ? "bg-[#E7F7EA]" : "bg-[#F3F4FB] hover:bg-[#EEF0FA]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[#123524]">{i.name}</strong><Chip tone={i.active ? "green" : "gray"}>{i.configurationStatus}</Chip></div>
                  <p className="mt-1 text-xs text-[#8a90a5]">{i.identifierCount} identifier · {i.activeAuthorityCount} otoritas aktif{i.latestSyncRun ? ` · sync terakhir ${fmtDateTime(i.latestSyncRun.startedAt)} (${i.latestSyncRun.status})` : ""}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#5b6478]">Belum ada metadata integrasi.</p>}
      </Card>
      {code && (
        <Card>
          <CardTitle right={<Chip>{code}</Chip>}>Detail integrasi</CardTitle>
          <SubTabs tabs={[{ key: "identifiers", label: "Identifier" }, { key: "authorities", label: "Otoritas" }, { key: "runs", label: "Sync Runs" }, { key: "conflicts", label: "Konflik" }]} active={tab} onChange={(k) => setTab(k as typeof tab)} />
          <div className="mt-4 overflow-x-auto">
            {detail.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
              : detail.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(detail.error).detail}</p>
              : detail.data?.content.length ? (
                <table className="w-full text-sm"><tbody className="divide-y">
                  {detail.data.content.map((row, i) => (
                    <tr key={i}>{Object.entries(row).slice(0, 6).map(([k, v]) => (
                      <td key={k} className="px-4 py-3 text-[#3f4660]"><span className="block text-[10px] font-semibold uppercase text-[#8a90a5]">{k}</span>{typeof v === "string" && v.includes("T") && v.includes("Z") ? fmtDateTime(v) : String(v ?? "—")}</td>
                    ))}</tr>
                  ))}
                </tbody></table>
              ) : <p className="text-sm text-[#5b6478]">Tidak ada data pada kategori ini.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function ModulTanpaEndpoint() {
  return (
    <div className="space-y-5">
      <DemoBanner title="Endpoint belum tersedia di backend">Command Center analitik (tren kasus, kohort) dan Logistik OAT tidak memiliki kontrak API yang disetujui. Tampilan rancangan lengkap tersedia di halaman demo.</DemoBanner>
      <Card>
        <CardTitle>Rencana</CardTitle>
        <ul className="list-disc space-y-2 pl-5 text-sm text-[#5b6478]">
          <li><strong className="text-[#123524]">Command Center</strong> — menunggu layanan agregat yang disetujui (bukan surveilans fiktif).</li>
          <li><strong className="text-[#123524]">Logistik OAT</strong> — menunggu modul farmasi/stok; saat ini seluruh angka stok bersifat usulan manual.</li>
        </ul>
      </Card>
    </div>
  );
}
