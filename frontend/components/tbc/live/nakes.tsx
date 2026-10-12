"use client";
import { useState } from "react";
import {
  CATALOG, errText, fmtDate, fmtDateTime, qs, RequireSession, today, useLive, useLiveMutation, usePermissions,
  type PatientDetail, type PatientPage, type RegistrationView, type DiagnosisView, type CaseView,
  type IdentityConfirmation, type RequestDetailT, type RequestSummaryT, type Page, type TreatmentDetail,
  type ReferralDetail, type ContactDetail, type InvestigationDetail, type TptDetail, type PlanDetail, type AlertDetail,
  type NotificationDetail, type SpecimenView, type ResultViewT,
} from "./api";
import { apiRequest } from "@/lib/api/client";
import { Card, CardTitle, Chip, DemoBanner, Field, FooterBar, GhostButton, OutlineButton, PrimaryButton, SubTabs, TopNav, inputClass } from "../ui";

/* ============================================================
   Ruang Nakes/Dokter — LIVE (Phase 2/3A/3B/4A/4B/4C)
   ============================================================ */

const MODULES = [
  { key: "pasien", label: "Pasien & Registrasi" },
  { key: "lab", label: "Laboratorium" },
  { key: "pengobatan", label: "Pengobatan" },
  { key: "tindak", label: "Tindak Lanjut" },
  { key: "kontinuitas", label: "Kontinuitas" },
  { key: "pemantauan", label: "Pemantauan" },
] as const;

export function RuangNakesLive() {
  return (
    <RequireSession anyPermission={["PATIENT_READ", "LAB_REQUEST_READ", "TREATMENT_READ", "ALERT_READ", "REFERRAL_READ", "CONTACT_READ", "MONITORING_READ"]}>
      {() => <NakesInner />}
    </RequireSession>
  );
}

function NakesInner() {
  const [active, setActive] = useState("pasien");
  const { facilities } = usePermissions();
  const facilityName = facilities[0]?.name ?? "Fasilitas penugasan Anda";
  return (
    <div className="min-h-dvh bg-[#F3F4FB]">
      <TopNav modules={MODULES} active={active} onSelect={setActive} userName="Ruang Nakes/Dokter" userRole={facilityName} notif />
      <main id="main-content" className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e4e8f4] bg-white px-5 py-4">
          <p className="text-sm"><strong className="font-bold text-[#123524]">{facilityName}</strong><span className="block text-xs text-[#5b6478]">Sesi terverifikasi · seluruh aksi melalui kontrak backend (RBAC + If-Match + CSRF)</span></p>
          <Chip tone="green">Live · TB_OFFICER/LAB_STAFF</Chip>
        </div>
        {active === "pasien" && <ModulPasien />}
        {active === "lab" && <ModulLab />}
        {active === "pengobatan" && <ModulPengobatan />}
        {active === "tindak" && <ModulTindak />}
        {active === "kontinuitas" && <ModulKontinuitas />}
        {active === "pemantauan" && <ModulPemantauan />}
      </main>
      <FooterBar left="TB Call Center · Ruang Nakes/Dokter (live)" right="Sesi backend · Tidak menyimpan data klinis di peramban" />
    </div>
  );
}

/* =================== MODUL PASIEN & REGISTRASI =================== */

function ModulPasien() {
  const [sub, setSub] = useState("daftar");
  return (
    <>
      <SubTabs tabs={[{ key: "daftar", label: "Daftar Pasien" }, { key: "registrasi", label: "Registrasi Baru" }, { key: "diagnosis", label: "Diagnosis & Kasus" }]} active={sub} onChange={setSub} />
      {sub === "daftar" && <DaftarPasien />}
      {sub === "registrasi" && <RegistrasiBaru />}
      {sub === "diagnosis" && <DiagnosisKasus />}
    </>
  );
}

function DaftarPasien() {
  const { can } = usePermissions();
  const [nama, setNama] = useState("");
  const [nik, setNik] = useState("");
  const [regStatus, setRegStatus] = useState("");
  const [caseStatus, setCaseStatus] = useState("");
  const [page, setPage] = useState(0);
  const [terpilih, setTerpilih] = useState<string | null>(null);
  const applied = { name: nama, nik, registrationStatus: regStatus, caseStatus: caseStatus, page, size: 10 };
  const list = useLive<PatientPage>(["patients", applied], can("PATIENT_READ") ? `/v1/patients${qs(applied)}` : null);
  const detail = useLive<PatientDetail>(["patient", terpilih], terpilih ? `/v1/patients/${terpilih}` : null);
  const [linkUserId, setLinkUserId] = useState("");
  const linkAccount = useLiveMutation<void, unknown>(async () =>
    apiRequest(`/v1/patients/${terpilih}/account-link`, { method: "POST", body: { userId: linkUserId }, etag: `"${detail.data!.version}"` }).then(() => ({ data: undefined })), [["patient", terpilih], ["patients"]]);
  const unlinkAccount = useLiveMutation<void, unknown>(async () =>
    apiRequest(`/v1/patients/${terpilih}/account-link`, { method: "DELETE", etag: `"${detail.data!.version}"` }).then(() => ({ data: undefined })), [["patient", terpilih], ["patients"]]);

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle sub="Pencarian pasien sesuai kontrak Phase 2 — nama minimal 3 karakter, NIK cocok persis.">Pencarian &amp; filter</CardTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nama pasien"><input className={inputClass} value={nama} onChange={(e) => { setNama(e.target.value); setPage(0); }} placeholder="Min. 3 karakter" /></Field>
          <Field label="NIK 16 digit (persis)"><input className={inputClass} inputMode="numeric" maxLength={16} value={nik} onChange={(e) => { setNik(e.target.value); setPage(0); }} placeholder="Cocok persis" /></Field>
          <Field label="Status registrasi">
            <select className={inputClass} value={regStatus} onChange={(e) => { setRegStatus(e.target.value); setPage(0); }}>
              <option value="">Semua</option><option value="OPEN">OPEN</option><option value="DIAGNOSED">DIAGNOSED</option>
            </select>
          </Field>
          <Field label="Status kasus">
            <select className={inputClass} value={caseStatus} onChange={(e) => { setCaseStatus(e.target.value); setPage(0); }}>
              <option value="">Semua</option><option value="ACTIVE">ACTIVE</option><option value="REFERRED">REFERRED</option>
            </select>
          </Field>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardTitle right={<Chip tone="gray">{list.data ? `${list.data.totalElements} pasien` : "…"}</Chip>}>Pasien dalam cakupan Anda</CardTitle>
          {list.isLoading ? <p role="status" className="text-sm text-[#5b6478]">Memuat…</p>
            : list.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(list.error).detail}</p>
            : !list.data?.content.length ? <p className="text-sm text-[#5b6478]">Tidak ada pasien pada filter ini.</p> : (
            <>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Nama</th><th className="px-4 py-3 font-semibold text-[#3f4660]">NIK / BPJS</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Registrasi</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Kasus</th></tr></thead>
                <tbody className="divide-y">
                  {list.data.content.map((p) => (
                    <tr key={p.patientId} onClick={() => setTerpilih(p.patientId)} className={`cursor-pointer transition ${terpilih === p.patientId ? "bg-[#E7F7EA]" : "hover:bg-[#F3F4FB]"}`}>
                      <td className="px-4 py-3 font-semibold text-[#123524]">{p.fullName}<br /><span className="text-xs font-normal text-[#8a90a5]">{p.sex?.name ?? "—"} · {p.birthDateUnknown ? "tgl. lahir tidak diketahui" : fmtDate(p.birthDate)}</span></td>
                      <td className="px-4 py-3 text-[#5b6478]">{p.nik ?? "—"}<br /><span className="text-xs">{p.bpjsNumber ?? "—"}</span></td>
                      <td className="px-4 py-3 text-[#5b6478]">{p.registrations.map((r) => <span key={r.id} className="mr-1 inline-block"><Chip tone={r.status === "OPEN" ? "amber" : "blue"}>{r.status}</Chip></span>)}</td>
                      <td className="px-4 py-3 text-[#5b6478]">{p.cases.map((c) => <span key={c.id} className="mr-1 inline-block"><Chip tone={c.status === "ACTIVE" ? "green" : "blue"}>{c.status}</Chip></span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-[#5b6478]">Halaman {(list.data.page ?? 0) + 1} · total {list.data.totalElements}</span>
                <div className="flex gap-2">
                  <GhostButton disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</GhostButton>
                  <GhostButton disabled={(page + 1) * 10 >= list.data.totalElements} onClick={() => setPage(page + 1)}>Berikutnya</GhostButton>
                </div>
              </div>
            </>
          )}
        </Card>
        <Card>
          <CardTitle right={<Chip>Detail berizin</Chip>}>Pasien terpilih</CardTitle>
          {detail.isLoading ? <p className="text-sm text-[#5b6478]">Memuat detail…</p>
            : !terpilih ? <p className="text-sm text-[#5b6478]">Klik baris pasien untuk membuka detail.</p>
            : detail.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(detail.error).detail}</p>
            : detail.data && (
              <>
                <p className="text-lg font-bold text-[#123524]">{detail.data.demographics.fullName}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  {[["NIK", detail.data.demographics.nik ?? "—"], ["BPJS", detail.data.demographics.bpjsNumber ?? "—"], ["Telepon", detail.data.demographics.phone ?? "—"], ["Alamat", detail.data.demographics.address ?? "—"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b pb-2"><span className="text-[#5b6478]">{k}</span><strong className="text-[#123524]">{v}</strong></div>
                  ))}
                </dl>
                <h3 className="mt-4 font-bold text-[#123524]">Registrasi</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.data.registrations.map((r) => (
                    <li key={r.id} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><strong className="text-[#123524]">{r.status}</strong> · {fmtDate(r.registrationDate)} · {r.facility.name}<span className="block font-mono text-xs text-[#8a90a5]">{r.id}</span></li>
                  ))}
                </ul>
                <h3 className="mt-4 font-bold text-[#123524]">Kasus</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.data.cases.length ? detail.data.cases.map(({ summary }) => (
                    <li key={summary.id} className="rounded-xl bg-[#E7F7EA] px-4 py-3"><strong className="text-[#0B5A2A]">{summary.status}</strong> · {summary.caseCategory?.name ?? "—"}<span className="block font-mono text-xs text-[#8a90a5]">{summary.id}</span></li>
                  )) : <li className="text-[#5b6478]">Belum ada kasus.</li>}
                </ul>
                {can("PATIENT_LINK_VERIFY") && (
                  <div className="mt-5 border-t pt-4">
                    <h3 className="font-bold text-[#123524]">Pengaitan Akun (Portal Pasien)</h3>
                    <p className="mt-1 text-xs text-[#5b6478]">Tautkan UUID akun pengguna untuk membuka akses /portal pasien.</p>
                    <div className="mt-3 space-y-2">
                      <input className={`${inputClass} font-mono text-xs`} placeholder="UUID akun pengguna (userId)" value={linkUserId} onChange={(e) => setLinkUserId(e.target.value.trim())} />
                      <div className="flex gap-2">
                        <GhostButton className="!min-h-10 !px-4 text-xs font-bold" disabled={!linkUserId || linkAccount.isPending} onClick={() => linkAccount.mutate(undefined as never)}>Tautkan Akun</GhostButton>
                        <GhostButton className="!min-h-10 !px-4 text-xs text-[#b42318]" disabled={unlinkAccount.isPending} onClick={() => unlinkAccount.mutate(undefined as never)}>Putuskan</GhostButton>
                      </div>
                      {linkAccount.localError && <p role="alert" className="text-xs text-[#b42318]">{errText(linkAccount.localError).detail}</p>}
                      {unlinkAccount.localError && <p role="alert" className="text-xs text-[#b42318]">{errText(unlinkAccount.localError).detail}</p>}
                      {linkAccount.isSuccess && <p role="status" className="text-xs font-semibold text-[#0B5A2A]">✓ Akun berhasil ditautkan ke pasien.</p>}
                      {unlinkAccount.isSuccess && <p role="status" className="text-xs font-semibold text-[#0B5A2A]">✓ Tautan akun pasien dicabut.</p>}
                    </div>
                  </div>
                )}
              </>
            )}
        </Card>
      </div>
    </div>
  );
}

function RegistrasiBaru() {
  const { facilities } = usePermissions();
  const facilityId = facilities[0]?.id ?? "";
  const [step] = useState<"resolve" | "form">("resolve");
  const [nik, setNik] = useState("");
  const [nama, setNama] = useState("");
  const [tglLahir, setTglLahir] = useState("");
  const [ditemukan] = useState<IdentityConfirmation | null>(null);
  const [registrationDate, setRegistrationDate] = useState(today());
  const [suspectTypeCode, setSuspectTypeCode] = useState("TB_SO");
  const [prevTreatment, setPrevTreatment] = useState("BARU");
  const [sexCode, setSexCode] = useState("LAKI_LAKI");
  const [bpjs, setBpjs] = useState("");
  const [result] = useState<RegistrationView | null>(null);

  const resolve = useLiveMutation<void, IdentityConfirmation>(async () => {
    const body: Record<string, unknown> = { citizenship: "WNI", nik };
    if (nama) body.fullName = nama;
    if (tglLahir) body.birthDate = tglLahir;
    return apiRequest("/v1/patients/resolve", { method: "POST", body }).then(() => ({ data: undefined as never }));
  }, []);
  const create = useLiveMutation<void, RegistrationView>(async () => {
    const body = ditemukan
      ? { facilityId, registrationDate, suspectTypeCode, previousTreatmentCategoryCode: prevTreatment, existingPatient: { patientId: ditemukan.patientId, citizenship: "WNI", nik } }
      : { facilityId, registrationDate, suspectTypeCode, previousTreatmentCategoryCode: prevTreatment, newPatient: { fullName: nama, citizenship: "WNI", nik, sexCode, birthDate: tglLahir || undefined, birthDateUnknown: !tglLahir, bpjsNumber: bpjs || undefined } };
    return apiRequest<RegistrationView>("/v1/registrations", { method: "POST", body }).then((r) => ({ data: r.data }));
  }, [["patients"], ["patient"]]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardTitle sub="Pencocokan identitas persis (exact NIK + konfirmasi sekunder) sesuai kontrak Phase 2.">Langkah 1 · Cocokkan identitas</CardTitle>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="NIK *" required><input className={inputClass} inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value)} placeholder="16 digit" /></Field>
          <Field label="Nama (konfirmasi)"><input className={inputClass} value={nama} onChange={(e) => setNama(e.target.value)} /></Field>
          <Field label="Tanggal lahir (konfirmasi)"><input type="date" className={inputClass} value={tglLahir} onChange={(e) => setTglLahir(e.target.value)} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <PrimaryButton disabled={nik.length !== 16 || (!nama && !tglLahir) || resolve.isPending} onClick={() => resolve.mutate(undefined as never)}>
            {resolve.isPending ? "Memeriksa…" : "Cocokkan identitas"}
          </PrimaryButton>
        </div>
        {resolve.localError && (
          <div className="mt-4 space-y-3">
            <p role="alert" className="rounded-xl bg-[#FDE3E1] px-4 py-3 text-sm text-[#b42318]">{errText(resolve.localError).detail}</p>
            {resolve.localError.problem.status === 404 && (
              <div className="rounded-xl bg-[#FDEBD3] px-4 py-3 text-sm text-[#8a5a12]"><strong>404 · Pasien belum terdaftar.</strong> Lanjutkan sebagai pasien baru di bawah.</div>
            )}
          </div>
        )}
        {step === "form" && (
          <div className="mt-8 border-t pt-6">
            <CardTitle sub={ditemukan ? `Pasien ada: ${ditemukan.fullName} — registrasi pasien lama.` : "Pasien baru — identitas akan dibuat atomik dengan registrasi."}>Langkah 2 · Data registrasi</CardTitle>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Tanggal registrasi *" required><input type="date" max={today()} className={inputClass} value={registrationDate} onChange={(e) => setRegistrationDate(e.target.value)} /></Field>
              <Field label="Jenis terduga *" required>
                <select className={inputClass} value={suspectTypeCode} onChange={(e) => setSuspectTypeCode(e.target.value)}>
                  {CATALOG.suspect.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Kategori pengobatan sebelumnya *">
                <select className={inputClass} value={prevTreatment} onChange={(e) => setPrevTreatment(e.target.value)}>
                  {CATALOG.prevTreatment.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              </Field>
              {!ditemukan && (
                <>
                  <Field label="Jenis kelamin *" required>
                    <select className={inputClass} value={sexCode} onChange={(e) => setSexCode(e.target.value)}>
                      {CATALOG.sex.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Nomor BPJS (opsional)"><input className={inputClass} value={bpjs} onChange={(e) => setBpjs(e.target.value)} /></Field>
                </>
              )}
            </div>
            {create.localError && <p role="alert" className="mt-4 rounded-xl bg-[#FDE3E1] px-4 py-3 text-sm text-[#b42318]">{errText(create.localError).detail}</p>}
            <div className="mt-5 flex gap-3">
              <PrimaryButton disabled={create.isPending} onClick={() => create.mutate(undefined as never)}>{create.isPending ? "Menyimpan…" : "Simpan registrasi"}</PrimaryButton>
            </div>
          </div>
        )}
        {result && (
          <div className="mt-6 rounded-2xl bg-[#E7F7EA] p-6" role="status">
            <p className="font-bold text-[#0B5A2A]">✓ Registrasi tersimpan: {result.status}</p>
            <p className="mt-1 text-sm text-[#1f7a3f]">{result.patient.fullName} · {fmtDate(result.registrationDate)} · {result.facility.name}</p>
            <p className="mt-1 font-mono text-xs text-[#1f7a3f]">{result.id}</p>
          </div>
        )}
      </Card>
      <Card>
        <CardTitle>Alur backend</CardTitle>
        <ol className="space-y-3 text-sm text-[#5b6478]">
          <li>1. <strong className="text-[#123524]">POST /patients/resolve</strong> — 404 berarti pasien baru; cocok → pasien lama.</li>
          <li>2. <strong className="text-[#123524]">POST /registrations</strong> — atomik (pasien baru + registrasi OPEN).</li>
          <li>3. Diagnosis &amp; konfirmasi kasus di tab &quot;Diagnosis &amp; Kasus&quot;.</li>
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-[#8a90a5]">Fasilitas diambil dari penugasan aktif akun Anda: <span className="font-mono">{facilityId || "(tidak ada penugasan aktif)"}</span></p>
      </Card>
    </div>
  );
}

function DiagnosisKasus() {
  const { facilities } = usePermissions();
  const [regId, setRegId] = useState("");
  const reg = useLive<RegistrationView>(["registration", regId], regId.length === 36 ? `/v1/registrations/${regId}` : null);
  const [tipeAnatomi, setTipeAnatomi] = useState("PARU");
  const [tipeDiagnosis, setTipeDiagnosis] = useState("BAKTERIOLOGIS");
  const [hasil, setHasil] = useState("");
  const [disposisi, setDisposisi] = useState("TREAT_HERE");
  const [tanggalDiagnosis, setTanggalDiagnosis] = useState(today());
  const [diagnosis, setDiagnosis] = useState<DiagnosisView | null>(null);
  const [kategori, setKategori] = useState("TB_SO");
  const [resistensi, setResistensi] = useState("");
  const [kasus, setKasus] = useState<CaseView | null>(null);

  const buatDiagnosis = useLiveMutation<void, DiagnosisView>(async () => {
    const body: Record<string, unknown> = { diagnosisDate: tanggalDiagnosis, anatomicalSiteCode: tipeAnatomi, diagnosisTypeCode: tipeDiagnosis, diagnosisResult: hasil, treatmentDisposition: disposisi };
    if (disposisi === "REFERRED" && facilities[0]) body.referredToFacilityId = facilities[0].id;
    return apiRequest<DiagnosisView>(`/v1/registrations/${regId}/diagnoses`, { method: "POST", body, etag: `"${reg.data!.version}"` }).then((r) => ({ data: r.data }));
  }, [["registration"]]);
  const konfirmasi = useLiveMutation<void, CaseView>(async () => {
    const body: Record<string, unknown> = { diagnosisId: diagnosis!.id, caseCategoryCode: kategori };
    if (kategori === "TB_RO" && resistensi) body.drugResistancePatternCode = resistensi;
    return apiRequest<CaseView>(`/v1/registrations/${regId}/cases`, { method: "POST", body, etag: `"${reg.data!.version}"` }).then((r) => ({ data: r.data }));
  }, [["registration"], ["patients"]]);

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle sub="Tempel UUID registrasi dari tab Daftar Pasien (atau hasil Registrasi Baru).">Buka registrasi</CardTitle>
        <div className="flex flex-wrap gap-3">
          <input aria-label="UUID registrasi" className={`${inputClass} max-w-xl flex-1 font-mono text-xs`} value={regId} onChange={(e) => { setRegId(e.target.value.trim()); setDiagnosis(null); setKasus(null); }} placeholder="UUID registrasi" />
        </div>
        {reg.data && (
          <p className="mt-3 text-sm text-[#5b6478]">{reg.data.patient.fullName} · <Chip tone={reg.data.status === "OPEN" ? "amber" : reg.data.status === "DIAGNOSED" ? "blue" : "green"}>{reg.data.status}</Chip> · {fmtDate(reg.data.registrationDate)} · versi {reg.data.version}</p>
        )}
        {reg.error && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(reg.error).detail}</p>}
      </Card>
      {reg.data && reg.data.status !== "CONVERTED_TO_CASE" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle sub="POST /registrations/{id}/diagnoses · menggunakan If-Match versi registrasi.">Buat diagnosis</CardTitle>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Tanggal diagnosis *" required><input type="date" max={today()} className={inputClass} value={tanggalDiagnosis} onChange={(e) => setTanggalDiagnosis(e.target.value)} /></Field>
              <Field label="Anatomi *" required>
                <select className={inputClass} value={tipeAnatomi} onChange={(e) => setTipeAnatomi(e.target.value)}>{CATALOG.anatomy.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select>
              </Field>
              <Field label="Jenis diagnosis *" required>
                <select className={inputClass} value={tipeDiagnosis} onChange={(e) => setTipeDiagnosis(e.target.value)}>{CATALOG.diagnosisType.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select>
              </Field>
              <Field label="Disposition *" required>
                <select className={inputClass} value={disposisi} onChange={(e) => setDisposisi(e.target.value)}>{CATALOG.disposition.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select>
              </Field>
              <div className="sm:col-span-2"><Field label="Hasil diagnosis (narasi) *" required><textarea className={`${inputClass} min-h-20`} value={hasil} onChange={(e) => setHasil(e.target.value)} placeholder="Contoh: BTA+ / TCM MTB detected…" /></Field></div>
            </div>
            {buatDiagnosis.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(buatDiagnosis.localError).detail}</p>}
            <PrimaryButton className="mt-4" disabled={!hasil || buatDiagnosis.isPending} onClick={() => buatDiagnosis.mutate(undefined as never)}>{buatDiagnosis.isPending ? "Menyimpan…" : "Simpan diagnosis"}</PrimaryButton>
            {diagnosis && (
              <div className="mt-4 rounded-xl bg-[#E7F7EA] px-4 py-3 text-sm text-[#1f7a3f]"><strong>✓ Diagnosis tersimpan.</strong> Lanjut konfirmasi kasus di panel sebelah (diagnosis ID: <span className="font-mono text-xs">{diagnosis.id}</span>).</div>
            )}
          </Card>
          <Card>
            <CardTitle sub="POST /registrations/{id}/cases · mengunci registrasi lalu memilih diagnosis.">Konfirmasi kasus</CardTitle>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Kategori kasus *" required>
                <select className={inputClass} value={kategori} onChange={(e) => { setKategori(e.target.value); setResistensi(""); }}>{CATALOG.caseCategory.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
              </Field>
              {kategori === "TB_RO" && (
                <Field label="Pola resistensi">
                  <select className={inputClass} value={resistensi} onChange={(e) => setResistensi(e.target.value)}><option value="">Tidak ditentukan</option>{CATALOG.resistance.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
                </Field>
              )}
            </div>
            {konfirmasi.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(konfirmasi.localError).detail}</p>}
            <PrimaryButton className="mt-4" disabled={!diagnosis || konfirmasi.isPending} onClick={() => konfirmasi.mutate(undefined as never)}>{konfirmasi.isPending ? "Mengonfirmasi…" : "Konfirmasi kasus"}</PrimaryButton>
            <p className="mt-3 text-xs leading-relaxed text-[#8a90a5]">TREAT_HERE → kasus ACTIVE. REFERRED → kasus REFERRED. NOT_TREATED/UNKNOWN → ditolak server (409).</p>
            {kasus && <div className="mt-4 rounded-xl bg-[#E7F7EA] px-4 py-3 text-sm text-[#1f7a3f]"><strong>✓ Kasus {kasus.status}</strong> · <span className="font-mono text-xs">{kasus.id}</span></div>}
          </Card>
        </div>
      )}
      {reg.data?.status === "CONVERTED_TO_CASE" && <DemoBanner title="Registrasi sudah dikonfirmasi">Registrasi ini telah menjadi kasus. Gunakan modul Pengobatan untuk memulai episode (kasus harus ACTIVE).</DemoBanner>}
    </div>
  );
}

/* =================== MODUL LABORATORIUM =================== */

function ModulLab() {
  const { can, is } = usePermissions();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [terpilih, setTerpilih] = useState<string | null>(null);
  const [buat, setBuat] = useState(false);
  const list = useLive<Page<RequestSummaryT>>(["lab", page, status], can("LAB_REQUEST_READ") ? `/v1/lab-requests${qs({ page, size: 10, status: status || undefined })}` : null);
  const detail = useLive<RequestDetailT>(["lab", terpilih], terpilih ? `/v1/lab-requests/${terpilih}` : null);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubTabs tabs={[{ key: "list", label: "Daftar Permintaan" }]} active="list" onChange={() => {}} />
        <PrimaryButton onClick={() => setBuat(!buat)}>{buat ? "Tutup form" : "+ Permintaan baru"}</PrimaryButton>
      </div>
      {buat && <BuatPermintaanLab onDone={() => setBuat(false)} />}
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1.3fr]">
        <Card>
          <CardTitle right={<Chip tone="gray">{list.data ? `${list.data.totalElements} permintaan` : "…"}</Chip>}>Permintaan laboratorium</CardTitle>
          <div className="mb-4"><Field label="Filter status">
            <select className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              <option value="">Semua</option>{["REQUESTED", "SENT", "RECEIVED", "PARTIAL", "COMPLETED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field></div>
          {list.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
            : list.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(list.error).detail}</p>
            : !list.data?.content.length ? <p className="text-sm text-[#5b6478]">Tidak ada permintaan.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-4 py-3 font-semibold text-[#3f4660]">Pasien</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Alasan</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Uji</th><th className="px-4 py-3 font-semibold text-[#3f4660]">Status</th></tr></thead>
              <tbody className="divide-y">
                {list.data.content.map((r) => (
                  <tr key={r.id} onClick={() => setTerpilih(r.id)} className={`cursor-pointer ${terpilih === r.id ? "bg-[#E7F7EA]" : "hover:bg-[#F3F4FB]"}`}>
                    <td className="px-4 py-3 font-semibold text-[#123524]">{r.patient.fullName}</td>
                    <td className="px-4 py-3 text-[#5b6478]">{r.requestReason.name}</td>
                    <td className="px-4 py-3 text-[#5b6478]">{r.tests.map((t) => t.testType.code).join(", ")}</td>
                    <td className="px-4 py-3"><Chip tone={r.status === "COMPLETED" ? "green" : r.status === "CANCELLED" ? "gray" : "amber"}>{r.status}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <div className="mt-3 flex gap-2">
            <GhostButton disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</GhostButton>
            <GhostButton disabled={list.data ? (page + 1) * 10 >= list.data.totalElements : true} onClick={() => setPage(page + 1)}>Berikutnya</GhostButton>
          </div>
        </Card>
        <LabDetail detail={detail} isLabStaff={is("LAB_STAFF")} canWrite={can("LAB_REQUEST_WRITE")} canResult={can("LAB_RESULT_WRITE")} />
      </div>
    </div>
  );
}

function BuatPermintaanLab({ onDone }: { onDone: () => void }) {
  const { facilities } = usePermissions();
  const [ownerType, setOwnerType] = useState("REGISTRATION");
  const [ownerId, setOwnerId] = useState("");
  const [reason, setReason] = useState("DIAGNOSIS");
  const [tests, setTests] = useState<string[]>(["TCM"]);
  const [catatan, setCatatan] = useState("");
  const create = useLiveMutation<void, RequestDetailT>(async () => {
    const body: Record<string, unknown> = { testingFacilityId: facilities[0]?.id, requestReasonCode: reason, testTypeCodes: tests, notes: catatan || undefined };
    if (ownerType === "REGISTRATION") body.registrationId = ownerId; else body.caseId = ownerId;
    return apiRequest<RequestDetailT>("/v1/lab-requests", { method: "POST", body }).then((r) => ({ data: r.data }));
  }, [["lab"]]);
  return (
    <Card>
      <CardTitle sub="Owner DIAGNOSIS = registrasi OPEN/DIAGNOSED; FOLLOW_UP = kasus ACTIVE. Fasilitas penguji default: fasilitas Anda.">Buat permintaan lab</CardTitle>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Tipe owner *" required>
          <select className={inputClass} value={ownerType} onChange={(e) => setOwnerType(e.target.value)}><option value="REGISTRATION">Registrasi (DIAGNOSIS)</option><option value="CASE">Kasus (FOLLOW_UP)</option></select>
        </Field>
        <div className="sm:col-span-2"><Field label={`UUID ${ownerType === "REGISTRATION" ? "registrasi" : "kasus"} *`} required><input className={`${inputClass} font-mono text-xs`} value={ownerId} onChange={(e) => setOwnerId(e.target.value.trim())} /></Field></div>
        <Field label="Alasan *" required>
          <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>{CATALOG.labReasons.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>
        </Field>
        <div className="sm:col-span-2">
          <span className="text-sm font-semibold text-[#123524]">Jenis pemeriksaan *</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATALOG.labTests.map((t) => (
              <label key={t.code} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm ${tests.includes(t.code) ? "bg-[#0B5A2A] text-white" : "bg-[#F3F4FB] text-[#3f4660]"}`}>
                <input type="checkbox" className="sr-only" checked={tests.includes(t.code)} onChange={() => setTests((s) => s.includes(t.code) ? s.filter((x) => x !== t.code) : [...s, t.code])} />{t.name}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-3"><Field label="Catatan operasional"><textarea className={`${inputClass} min-h-16`} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></Field></div>
      </div>
      {create.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(create.localError).detail}</p>}
      {create.isSuccess && <p role="status" className="mt-3 rounded-xl bg-[#E7F7EA] px-4 py-3 text-sm font-semibold text-[#0B5A2A]">✓ Permintaan dibuat (REQUESTED).</p>}
      <div className="mt-4 flex gap-3"><PrimaryButton disabled={!ownerId || !tests.length || create.isPending} onClick={() => create.mutate(undefined as never)}>{create.isPending ? "Membuat…" : "Buat permintaan"}</PrimaryButton><GhostButton onClick={onDone}>Tutup</GhostButton></div>
    </Card>
  );
}

function LabDetail({ detail, isLabStaff, canWrite, canResult }: { detail: ReturnType<typeof useLive<RequestDetailT>>; isLabStaff: boolean; canWrite: boolean; canResult: boolean }) {
  const [jenisSpesimen, setJenisSpesimen] = useState("DAHAK");
  const [kondisi] = useState("Baik");
  const [layak] = useState(true);
  const [hasilKode, setHasilKode] = useState("MTB_DETECTED_RR_NOT");
  const [hasilTeks, setHasilTeks] = useState("");
  const d = detail.data;

  const specimen = useLiveMutation<void, SpecimenView>(async () =>
    apiRequest<SpecimenView>(`/v1/lab-requests/${d!.id}/specimens`, { method: "POST", body: { specimenType: jenisSpesimen, collectedAt: new Date().toISOString() }, etag: `"${d!.version}"` }).then((r) => ({ data: r.data })), [["lab", d?.id ?? ""]]);
  const receive = useLiveMutation<string, SpecimenView>(async (specimenId: string) =>
    apiRequest<SpecimenView>(`/v1/lab-specimens/${specimenId}/receive`, { method: "POST", body: { receivedAt: new Date().toISOString(), examinationPossible: layak, conditionOnReceipt: kondisi || undefined, rejectionReason: layak ? undefined : "Spesimen tidak memadai" }, etag: `"${d!.version}"` }).then((r) => ({ data: r.data })), [["lab", d?.id ?? ""]]);
  const result = useLiveMutation<string, ResultViewT>(async (testId: string) =>
    apiRequest<ResultViewT>(`/v1/lab-request-tests/${testId}/results`, { method: "POST", body: { testedAt: new Date().toISOString(), resultCode: hasilKode, resultText: hasilTeks || undefined }, etag: `"${d!.version}"` }).then((r) => ({ data: r.data })), [["lab", d?.id ?? ""]]);
  const cancelLab = useLiveMutation<void, RequestDetailT>(async () =>
    apiRequest<RequestDetailT>(`/v1/lab-requests/${d!.id}/cancel`, { method: "POST", etag: `"${d!.version}"` }).then((r) => ({ data: r.data })), [["lab"]]);

  return (
    <Card>
      <CardTitle>Detail permintaan</CardTitle>
      {!d ? <p className="text-sm text-[#5b6478]">Pilih permintaan untuk melihat spesimen, uji, dan hasil.</p> : (
        <div className="space-y-5 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            {[["Pasien", d.patient.fullName], ["Status", d.status], ["Pengirim", d.requestingFacility.name], ["Penguji", d.testingFacility.name], ["Diminta", fmtDateTime(d.requestedAt)], ["Kelengkapan", `${d.completeness.completedTests}/${d.completeness.totalTests} uji · ${d.completeness.receivedSpecimens}/${d.completeness.totalSpecimens} spesimen`]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><dt className="text-xs font-semibold text-[#5b6478]">{k}</dt><dd className="mt-1 font-bold text-[#123524]">{v}</dd></div>
            ))}
          </dl>
          <div>
            <h3 className="font-bold text-[#123524]">Uji &amp; hasil terakhir</h3>
            <ul className="mt-2 space-y-2">
              {d.tests.map((t) => (
                <li key={t.id} className="rounded-xl bg-[#F3F4FB] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong>{t.testType.name}</strong><Chip tone={t.status === "COMPLETED" || t.status === "RESULT_AVAILABLE" ? "green" : "amber"}>{t.status}</Chip></div>
                  {t.latestResults.map((r) => <p key={r.id} className="mt-1 text-xs text-[#5b6478]">#{r.sequenceNo} {r.status} · {r.resultCode ?? "—"} · {fmtDateTime(r.testedAt)}</p>)}
                  {canResult && t.status !== "CANCELLED" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input aria-label={`Kode hasil ${t.testType.code}`} className="min-h-10 flex-1 rounded-lg border border-[#d8dcea] px-3 text-xs" placeholder="resultCode, mis. MTB_DETECTED_RR_NOT" value={hasilKode} onChange={(e) => setHasilKode(e.target.value)} />
                      <input aria-label={`Teks hasil ${t.testType.code}`} className="min-h-10 flex-1 rounded-lg border border-[#d8dcea] px-3 text-xs" placeholder="resultText (opsional)" value={hasilTeks} onChange={(e) => setHasilTeks(e.target.value)} />
                      <GhostButton className="!min-h-10 !px-4 text-xs" disabled={result.isPending} onClick={() => result.mutate(t.id)}>Input hasil</GhostButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {result.localError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{errText(result.localError).detail}</p>}
          </div>
          <div>
            <h3 className="font-bold text-[#123524]">Spesimen</h3>
            <ul className="mt-2 space-y-2">
              {d.specimens.length ? d.specimens.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F3F4FB] px-4 py-3">
                  <span><strong>{s.specimenType}</strong>{s.specimenCode ? ` · ${s.specimenCode}` : ""}<span className="block text-xs text-[#8a90a5]">diambil {fmtDateTime(s.collectedAt)} · diterima {fmtDateTime(s.receivedAt)}</span></span>
                  {s.receivedAt ? <Chip tone={s.examinationPossible ? "green" : "red"}>{s.examinationPossible ? "Layak uji" : "Ditolak"}</Chip>
                    : isLabStaff && canResult ? <GhostButton className="!min-h-10 !px-4 text-xs" disabled={receive.isPending} onClick={() => receive.mutate(s.id)}>Terima spesimen</GhostButton> : <Chip tone="amber">Belum diterima</Chip>}
                </li>
              )) : <li className="text-[#5b6478]">Belum ada spesimen.</li>}
            </ul>
            {receive.localError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{errText(receive.localError).detail}</p>}
            {isLabStaff && canResult && d.specimens.length === 0 && <p className="mt-2 text-xs text-[#8a90a5]">Spesimen dicatat oleh TB officer fasilitas pengirim.</p>}
          </div>
          {canWrite && !isLabStaff && (
            <div className="flex flex-wrap items-end gap-3 border-t pt-4">
              <Field label="Jenis spesimen"><input className={inputClass} value={jenisSpesimen} onChange={(e) => setJenisSpesimen(e.target.value)} /></Field>
              <PrimaryButton disabled={specimen.isPending || ["CANCELLED", "COMPLETED"].includes(d.status)} onClick={() => specimen.mutate(undefined as never)}>Catat spesimen</PrimaryButton>
              {specimen.localError && <p role="alert" className="text-xs text-[#b42318]">{errText(specimen.localError).detail}</p>}
            </div>
          )}
          {canWrite && ["REQUESTED", "SENT"].includes(d.status) && (
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-xs text-[#8a90a5]">Aksi operasional lab</span>
              <GhostButton className="!text-[#b42318] text-xs" disabled={cancelLab.isPending} onClick={() => cancelLab.mutate(undefined as never)}>
                {cancelLab.isPending ? "Membatalkan…" : "Batalkan Permintaan Lab"}
              </GhostButton>
            </div>
          )}
          {cancelLab.localError && <p role="alert" className="text-xs text-[#b42318]">{errText(cancelLab.localError).detail}</p>}
        </div>
      )}
    </Card>
  );
}

/* =================== MODUL PENGOBATAN =================== */

function ModulPengobatan() {
  const { can } = usePermissions();
  const [caseId, setCaseId] = useState("");
  const treatments = useLive<TreatmentDetail[]>(["treatments", caseId], caseId.length === 36 && can("TREATMENT_READ") ? `/v1/cases/${caseId}/treatments` : null);
  const [mulai, setMulai] = useState(false);
  return (
    <div className="space-y-5">
      <Card>
        <CardTitle sub="Tempel UUID kasus ACTIVE dari tab Daftar Pasien.">Buka pengobatan kasus</CardTitle>
        <input aria-label="UUID kasus" className={`${inputClass} max-w-xl font-mono text-xs`} value={caseId} onChange={(e) => { setCaseId(e.target.value.trim()); setMulai(false); }} placeholder="UUID kasus" />
        {treatments.data && <p className="mt-3 text-sm text-[#5b6478]">{treatments.data.length} episode pada kasus ini.</p>}
        {treatments.error && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(treatments.error).detail}</p>}
      </Card>
      {caseId.length === 36 && <div className="flex justify-end"><PrimaryButton onClick={() => setMulai(!mulai)}>{mulai ? "Tutup form" : "+ Mulai episode"}</PrimaryButton></div>}
      {mulai && caseId.length === 36 && <MulaiEpisode caseId={caseId} onDone={() => setMulai(false)} />}
      {treatments.data?.map((t) => <TreatmentCard key={t.id} t={t} />)}
    </div>
  );
}

function MulaiEpisode({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const [regimen, setRegimen] = useState("SO_6M_2HRZE_4HR");
  const [startDate, setStartDate] = useState(today());
  const [rows, setRows] = useState([{ drugCode: "H", doseValue: "", doseUnit: "mg", frequencyPerWeek: "7", treatmentPhase: "INTENSIF" }]);
  const create = useLiveMutation<void, TreatmentDetail>(async () => {
    const drugs = rows.map((r) => ({
      drugCode: r.drugCode, startDate, treatmentPhase: r.treatmentPhase || undefined,
      doseValue: r.doseValue ? Number(r.doseValue) : undefined, doseUnit: r.doseUnit || undefined,
      frequencyPerWeek: r.frequencyPerWeek ? Number(r.frequencyPerWeek) : undefined,
    }));
    return apiRequest<TreatmentDetail>(`/v1/cases/${caseId}/treatments`, { method: "POST", body: { regimenCode: regimen, startDate, drugs } }).then((r) => ({ data: r.data }));
  }, [["treatments", caseId]]);
  return (
    <Card>
      <CardTitle sub="Klinisi memilih regimen & menambahkan baris obat manual (1–20). Tidak ada kalkulasi resep.">Mulai episode pengobatan</CardTitle>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Regimen *" required>
          <select className={inputClass} value={regimen} onChange={(e) => setRegimen(e.target.value)}>
            {CATALOG.regimens.filter((r) => r.category === "TB_SO" || r.category === "TB_RO").map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Tanggal mulai *" required><input type="date" max={today()} className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
      </div>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="bg-[#EEF0FA] text-left"><th className="px-3 py-2 font-semibold text-[#3f4660]">Obat</th><th className="px-3 py-2 font-semibold text-[#3f4660]">Dosis</th><th className="px-3 py-2 font-semibold text-[#3f4660]">Satuan</th><th className="px-3 py-2 font-semibold text-[#3f4660]">×/pekan</th><th className="px-3 py-2 font-semibold text-[#3f4660]">Fase</th></tr></thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-2 py-2"><select aria-label={`Obat baris ${i + 1}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-2 text-sm" value={r.drugCode} onChange={(e) => setRows((s) => s.map((x, j) => j === i ? { ...x, drugCode: e.target.value } : x))}>{CATALOG.drugs.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}</select></td>
              <td className="px-2 py-2"><input aria-label={`Dosis baris ${i + 1}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-2 text-sm" value={r.doseValue} onChange={(e) => setRows((s) => s.map((x, j) => j === i ? { ...x, doseValue: e.target.value } : x))} placeholder="mis. 450" /></td>
              <td className="px-2 py-2"><input aria-label={`Satuan baris ${i + 1}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-2 text-sm" value={r.doseUnit} onChange={(e) => setRows((s) => s.map((x, j) => j === i ? { ...x, doseUnit: e.target.value } : x))} /></td>
              <td className="px-2 py-2"><input aria-label={`Frekuensi baris ${i + 1}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-2 text-sm" value={r.frequencyPerWeek} onChange={(e) => setRows((s) => s.map((x, j) => j === i ? { ...x, frequencyPerWeek: e.target.value } : x))} /></td>
              <td className="px-2 py-2"><select aria-label={`Fase baris ${i + 1}`} className="min-h-11 w-full rounded-lg border border-[#d8dcea] px-2 text-sm" value={r.treatmentPhase} onChange={(e) => setRows((s) => s.map((x, j) => j === i ? { ...x, treatmentPhase: e.target.value } : x))}><option value="INTENSIF">Intensif</option><option value="LANJUTAN">Lanjutan</option></select></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="mt-3 flex gap-2">
        <GhostButton onClick={() => setRows((s) => [...s, { drugCode: "R", doseValue: "", doseUnit: "mg", frequencyPerWeek: "7", treatmentPhase: "INTENSIF" }])}>+ Baris obat</GhostButton>
        {rows.length > 1 && <GhostButton onClick={() => setRows((s) => s.slice(0, -1))}>− Hapus baris terakhir</GhostButton>}
      </div>
      {create.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(create.localError).detail}</p>}
      {create.isSuccess && <p role="status" className="mt-3 rounded-xl bg-[#E7F7EA] px-4 py-3 text-sm font-semibold text-[#0B5A2A]">✓ Episode pengobatan ACTIVE.</p>}
      <div className="mt-4 flex gap-3"><PrimaryButton disabled={create.isPending} onClick={() => create.mutate(undefined as never)}>{create.isPending ? "Menyimpan…" : "Tinjau & mulai episode"}</PrimaryButton><GhostButton onClick={onDone}>Tutup</GhostButton></div>
    </Card>
  );
}

function TreatmentCard({ t }: { t: TreatmentDetail }) {
  const { can } = usePermissions();
  const [tanggalDosis, setTanggalDosis] = useState(today());
  const [statusDosis, setStatusDosis] = useState("TAKEN");
  const [tipeTl, setTipeTl] = useState("KONTROL_BULANAN");
  const [waktuTl, setWaktuTl] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  const [tipeEfek, setTipeEfek] = useState("");
  const [beratAkhir, setBeratAkhir] = useState("");
  const [kodeHasil, setKodeHasil] = useState("SEMBUH");

  const dosis = useLiveMutation<void, unknown>(async () =>
    apiRequest(`/v1/treatments/${t.id}/dose-events`, { method: "POST", body: { scheduledDate: tanggalDosis, status: statusDosis } }).then(() => ({ data: undefined })), [["treatments", t.caseId]]);
  const jadwalTl = useLiveMutation<void, unknown>(async () =>
    apiRequest(`/v1/treatments/${t.id}/follow-ups`, { method: "POST", body: { followUpType: tipeTl, scheduledAt: new Date(waktuTl).toISOString() } }).then(() => ({ data: undefined })), [["treatments", t.caseId]]);
  const efek = useLiveMutation<void, unknown>(async () =>
    apiRequest(`/v1/treatments/${t.id}/adverse-events`, { method: "POST", body: { eventType: tipeEfek } }).then(() => ({ data: undefined })), [["treatments", t.caseId]]);
  const hasil = useLiveMutation<void, unknown>(async () =>
    apiRequest(`/v1/treatments/${t.id}/outcome`, { method: "POST", body: { outcomeCode: kodeHasil, outcomeDate: today() }, etag: `"${t.version}"` }).then(() => ({ data: undefined })), [["treatments", t.caseId]]);

  const selesaikanTl = useLiveMutation<{ id: string; version: number }, unknown>(async ({ id, version }) =>
    apiRequest(`/v1/follow-ups/${id}/complete`, { method: "POST", body: { completedAt: new Date().toISOString(), adherenceAssessment: "PATUH", symptomSummary: "Terkontrol" }, etag: `"${version}"` }).then(() => ({ data: undefined })), [["treatments", t.caseId]]);

  return (
    <Card>
      <CardTitle right={<Chip tone={t.status === "ACTIVE" ? "green" : t.outcome ? "gray" : "amber"}>{t.outcome ? `Selesai · ${t.outcome.outcomeName}` : t.status}</Chip>}
        sub={`Regimen ${t.regimen?.name ?? "—"} · mulai ${fmtDate(t.startDate)}${t.plannedEndDate ? ` · rencana akhir ${fmtDate(t.plannedEndDate)}` : ""}`}>
        Episode pengobatan
      </CardTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Obat", `${t.drugs.length} baris`], ["Laporan kepatuhan", `${t.adherenceSummary?.totalReports ?? 0} (TAKEN: ${t.adherenceSummary?.reportsByStatus?.TAKEN ?? 0})`], ["Efek samping", `${t.adverseEvents.length} catatan`]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><p className="text-xs font-semibold text-[#5b6478]">{k}</p><p className="mt-1 font-bold text-[#123524]">{v}</p></div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {can("ADHERENCE_RECORD") && t.status === "ACTIVE" && (
          <div className="rounded-xl border p-4">
            <p className="font-bold text-[#123524]">Catat dosis</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <input type="date" max={today()} aria-label="Tanggal dosis" className="min-h-11 rounded-xl border border-[#d8dcea] px-3 text-sm" value={tanggalDosis} onChange={(e) => setTanggalDosis(e.target.value)} />
              <select aria-label="Status dosis" className="min-h-11 rounded-xl border border-[#d8dcea] px-3 text-sm" value={statusDosis} onChange={(e) => setStatusDosis(e.target.value)}>{CATALOG.doseStatus.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
            </div>
            <GhostButton className="mt-2 !min-h-10 !px-4 text-xs" disabled={dosis.isPending} onClick={() => dosis.mutate(undefined as never)}>Simpan dosis</GhostButton>
            {dosis.localError && <p role="alert" className="mt-1 text-xs text-[#b42318]">{errText(dosis.localError).detail}</p>}
          </div>
        )}
        {can("FOLLOW_UP_WRITE") && t.status === "ACTIVE" && (
          <div className="rounded-xl border p-4">
            <p className="font-bold text-[#123524]">Jadwalkan tindak lanjut</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <input aria-label="Jenis tindak lanjut" className="min-h-11 rounded-xl border border-[#d8dcea] px-3 text-sm" value={tipeTl} onChange={(e) => setTipeTl(e.target.value)} />
              <input type="datetime-local" aria-label="Waktu tindak lanjut" className="min-h-11 rounded-xl border border-[#d8dcea] px-3 text-sm" value={waktuTl} onChange={(e) => setWaktuTl(e.target.value)} />
            </div>
            <GhostButton className="mt-2 !min-h-10 !px-4 text-xs" disabled={jadwalTl.isPending} onClick={() => jadwalTl.mutate(undefined as never)}>Simpan jadwal</GhostButton>
            {jadwalTl.localError && <p role="alert" className="mt-1 text-xs text-[#b42318]">{errText(jadwalTl.localError).detail}</p>}
          </div>
        )}
        {can("ADVERSE_EVENT_WRITE") && t.status === "ACTIVE" && (
          <div className="rounded-xl border p-4">
            <p className="font-bold text-[#123524]">Catat efek samping</p>
            <input aria-label="Jenis efek samping" className="mt-2 min-h-11 w-full rounded-xl border border-[#d8dcea] px-3 text-sm" value={tipeEfek} onChange={(e) => setTipeEfek(e.target.value)} placeholder="mis. MUAL, ARTRALGIA" />
            <GhostButton className="mt-2 !min-h-10 !px-4 text-xs" disabled={!tipeEfek || efek.isPending} onClick={() => efek.mutate(undefined as never)}>Simpan efek samping</GhostButton>
            {efek.localError && <p role="alert" className="mt-1 text-xs text-[#b42318]">{errText(efek.localError).detail}</p>}
          </div>
        )}
        {can("OUTCOME_WRITE") && t.status === "ACTIVE" && (
          <div className="rounded-xl border p-4">
            <p className="font-bold text-[#123524]">Catat hasil akhir</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <select aria-label="Kode hasil akhir" className="min-h-11 rounded-xl border border-[#d8dcea] px-3 text-sm" value={kodeHasil} onChange={(e) => setKodeHasil(e.target.value)}>{CATALOG.outcomes.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select>
              <input type="number" step="0.1" aria-label="Berat akhir (kg)" className="min-h-11 rounded-xl border border-[#d8dcea] px-3 text-sm" value={beratAkhir} onChange={(e) => setBeratAkhir(e.target.value)} placeholder="Berat (kg)" />
            </div>
            <GhostButton className="mt-2 !min-h-10 !px-4 text-xs" disabled={hasil.isPending} onClick={() => hasil.mutate(undefined as never)}>Tutup episode dengan hasil akhir</GhostButton>
            {hasil.localError && <p role="alert" className="mt-1 text-xs text-[#b42318]">{errText(hasil.localError).detail}</p>}
          </div>
        )}
      </div>
      {t.followUps.length > 0 && (
        <div className="mt-5"><h3 className="font-bold text-[#123524]">Tindak lanjut terjadwal</h3>
          <ul className="mt-2 space-y-2 text-sm">{t.followUps.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F3F4FB] px-4 py-2">
              <span>{f.followUpType} · {fmtDateTime(f.scheduledAt)}</span>
              <div className="flex items-center gap-2">
                <Chip tone={f.completedAt ? "green" : "blue"}>{f.completedAt ? "Selesai" : f.status}</Chip>
                {!f.completedAt && can("FOLLOW_UP_WRITE") && (
                  <GhostButton className="!min-h-8 !px-3 text-xs" disabled={selesaikanTl.isPending} onClick={() => selesaikanTl.mutate({ id: f.id, version: f.version })}>Tandai Selesai</GhostButton>
                )}
              </div>
            </li>
          ))}</ul>
          {selesaikanTl.localError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{errText(selesaikanTl.localError).detail}</p>}
        </div>
      )}
    </Card>
  );
}

/* =================== MODUL TINDAK LANJUT =================== */

function ModulTindak() {
  return (
    <div className="space-y-5">
      <DemoBanner title="Dikelola dari detail episode">Tindak lanjut (jadwal kunjungan, efek samping, hasil akhir) terintegrasi pada kartu episode di modul Pengobatan — buka UUID kasus di sana untuk menjadwalkan dan menuntaskan.</DemoBanner>
      <Card><CardTitle>Ringkasan</CardTitle>
        <ul className="list-disc space-y-2 pl-5 text-sm text-[#5b6478]">
          <li><strong className="text-[#123524]">Jadwal &amp; kunjungan</strong> → POST /treatments/&#123;id&#125;/follow-ups (FOLLOW_UP_WRITE).</li>
          <li><strong className="text-[#123524]">Efek samping</strong> → POST /treatments/&#123;id&#125;/adverse-events + PATCH /adverse-events/&#123;id&#125; (ADVERSE_EVENT_WRITE).</li>
          <li><strong className="text-[#123524]">Hasil akhir</strong> → POST /treatments/&#123;id&#125;/outcome (OUTCOME_WRITE, If-Match).</li>
        </ul>
      </Card>
    </div>
  );
}

/* =================== MODUL KONTINUITAS =================== */

function ModulKontinuitas() {
  const [sub, setSub] = useState("rujukan");
  return (
    <>
      <SubTabs tabs={[{ key: "rujukan", label: "Rujukan & Transfer" }, { key: "kontak", label: "Kontak & Investigasi" }, { key: "tpt", label: "TPT" }]} active={sub} onChange={setSub} />
      {sub === "rujukan" && <Rujukan />}
      {sub === "kontak" && <KontakInvestigasi />}
      {sub === "tpt" && <ModulTpt />}
    </>
  );
}

function Rujukan() {
  const { can } = usePermissions();
  const [arah, setArah] = useState<"incoming" | "outgoing">("outgoing");
  const list = useLive<Page<ReferralDetail>>(["referrals", arah], can("REFERRAL_READ") ? `/v1/referrals/${arah}?page=0&size=20` : null);
  const [caseId, setCaseId] = useState("");
  const [tipe, setTipe] = useState("TREATMENT_TRANSFER");
  const [tujuan, setTujuan] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const send = useLiveMutation<void, ReferralDetail>(async () => {
    const body: Record<string, unknown> = { referralType: tipe, destinationFacilityId: tujuan };
    if (tipe === "TREATMENT_TRANSFER") body.treatmentId = treatmentId;
    return apiRequest<ReferralDetail>(`/v1/cases/${caseId}/referrals`, { method: "POST", body }).then((r) => ({ data: r.data }));
  }, [["referrals"]]);

  const receiveRef = useLiveMutation<{ id: string; version: number }, ReferralDetail>(async ({ id, version }) =>
    apiRequest<ReferralDetail>(`/v1/referrals/${id}/receive`, { method: "POST", body: { receivedAt: new Date().toISOString() }, etag: `"${version}"` }).then((r) => ({ data: r.data })), [["referrals"]]);
  const reportRef = useLiveMutation<{ id: string; version: number }, ReferralDetail>(async ({ id, version }) =>
    apiRequest<ReferralDetail>(`/v1/referrals/${id}/report`, { method: "POST", body: { patientReportedAt: new Date().toISOString() }, etag: `"${version}"` }).then((r) => ({ data: r.data })), [["referrals"]]);
  const returnRef = useLiveMutation<{ id: string; version: number }, ReferralDetail>(async ({ id, version }) =>
    apiRequest<ReferralDetail>(`/v1/referrals/${id}/return`, { method: "POST", body: { returnReason: "Faskes tidak dapat melayani" }, etag: `"${version}"` }).then((r) => ({ data: r.data })), [["referrals"]]);
  const cancelRef = useLiveMutation<{ id: string; version: number }, ReferralDetail>(async ({ id, version }) =>
    apiRequest<ReferralDetail>(`/v1/referrals/${id}/cancel`, { method: "POST", body: { cancelReason: "Dibatalkan oleh pengirim" }, etag: `"${version}"` }).then((r) => ({ data: r.data })), [["referrals"]]);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <OutlineButton className={arah === "outgoing" ? "!bg-[#0B5A2A] !text-white" : ""} onClick={() => setArah("outgoing")}>Keluar (outgoing)</OutlineButton>
        <OutlineButton className={arah === "incoming" ? "!bg-[#0B5A2A] !text-white" : ""} onClick={() => setArah("incoming")}>Masuk (incoming)</OutlineButton>
      </div>
      <Card>
        <CardTitle sub={arah === "outgoing" ? "Rujukan yang dikirim fasilitas Anda." : "Rujukan yang ditujukan ke fasilitas Anda."}>Daftar rujukan</CardTitle>
        {list.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
          : list.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(list.error).detail}</p>
          : list.data?.content.length ? (
            <ul className="space-y-3 text-sm">
              {list.data.content.map((r) => (
                <li key={r.id} className="rounded-xl bg-[#F3F4FB] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[#123524]">{r.referralType === "TREATMENT_TRANSFER" ? "Transfer pengobatan" : "Rujukan pra-pengobatan"}</strong>
                    <Chip tone={r.status === "ACCEPTED" ? "green" : r.status === "CANCELLED" ? "gray" : "amber"}>{r.status}</Chip>
                  </div>
                  <p className="mt-1 text-[#5b6478]">{r.patient.fullName} · {r.sourceFacility.name} → {r.destinationFacility.name}</p>
                  <p className="text-xs text-[#8a90a5]">Dikirim {fmtDateTime(r.sentAt)}{r.receivedAt ? ` · diterima ${fmtDateTime(r.receivedAt)}` : ""}{r.patientReportedAt ? ` · pasien lapor ${fmtDateTime(r.patientReportedAt)}` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {arah === "incoming" && r.status === "SENT" && can("REFERRAL_WRITE") && (
                      <GhostButton className="!min-h-9 !px-3 text-xs" disabled={receiveRef.isPending} onClick={() => receiveRef.mutate({ id: r.id, version: r.version })}>Terima Rujukan</GhostButton>
                    )}
                    {arah === "incoming" && r.status === "RECEIVED" && can("REFERRAL_WRITE") && (
                      <>
                        <GhostButton className="!min-h-9 !px-3 text-xs font-semibold text-[#0B5A2A]" disabled={reportRef.isPending} onClick={() => reportRef.mutate({ id: r.id, version: r.version })}>Konfirmasi Pasien Datang</GhostButton>
                        <GhostButton className="!min-h-9 !px-3 text-xs text-[#b42318]" disabled={returnRef.isPending} onClick={() => returnRef.mutate({ id: r.id, version: r.version })}>Kembalikan</GhostButton>
                      </>
                    )}
                    {arah === "outgoing" && r.status === "SENT" && can("REFERRAL_WRITE") && (
                      <GhostButton className="!min-h-9 !px-3 text-xs text-[#b42318]" disabled={cancelRef.isPending} onClick={() => cancelRef.mutate({ id: r.id, version: r.version })}>Batalkan</GhostButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#5b6478]">Tidak ada rujukan.</p>}
        {(receiveRef.localError || reportRef.localError || returnRef.localError || cancelRef.localError) && (
          <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(receiveRef.localError ?? reportRef.localError ?? returnRef.localError ?? cancelRef.localError).detail}</p>
        )}
      </Card>
      {can("REFERRAL_WRITE") && (
        <Card>
          <CardTitle sub="PRE_TREATMENT_REFERRAL untuk kasus REFERRED dengan diagnosis REFERRED; TREATMENT_TRANSFER untuk kasus ACTIVE dengan treatmentId.">Kirim rujukan</CardTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="UUID kasus *" required><input className={`${inputClass} font-mono text-xs`} value={caseId} onChange={(e) => setCaseId(e.target.value.trim())} /></Field>
            <Field label="Jenis *" required>
              <select className={inputClass} value={tipe} onChange={(e) => setTipe(e.target.value)}>{CATALOG.referralType.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>
            </Field>
            <Field label="UUID fasilitas tujuan *" required><input className={`${inputClass} font-mono text-xs`} value={tujuan} onChange={(e) => setTujuan(e.target.value.trim())} /></Field>
            {tipe === "TREATMENT_TRANSFER" && <Field label="UUID treatment *"><input className={`${inputClass} font-mono text-xs`} value={treatmentId} onChange={(e) => setTreatmentId(e.target.value.trim())} /></Field>}
          </div>
          {send.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(send.localError).detail}</p>}
          <PrimaryButton className="mt-4" disabled={!caseId || !tujuan || send.isPending} onClick={() => send.mutate(undefined as never)}>{send.isPending ? "Mengirim…" : "Kirim rujukan"}</PrimaryButton>
        </Card>
      )}
    </div>
  );
}

function KontakInvestigasi() {
  const { can } = usePermissions();
  const [caseId, setCaseId] = useState("");
  const contacts = useLive<Page<ContactDetail>>(["contacts", caseId], caseId.length === 36 && can("CONTACT_READ") ? `/v1/cases/${caseId}/contacts?page=0&size=20` : null);
  const [nama, setNama] = useState("");
  const [hubungan, setHubungan] = useState("Anak · serumah");
  const [workflow, setWorkflow] = useState("INTERNAL");
  const create = useLiveMutation<void, ContactDetail>(async () => {
    const body: Record<string, unknown> = { fullName: nama, relationshipToIndexCase: hubungan, householdContact: true, workflowType: workflow };
    return apiRequest<ContactDetail>(`/v1/cases/${caseId}/contacts`, { method: "POST", body }).then((r) => ({ data: r.data }));
  }, [["contacts", caseId]]);

  const [arah, setArah] = useState<"incoming" | "outgoing">("incoming");
  const inv = useLive<Page<InvestigationDetail>>(["investigations", arah], can("CONTACT_READ") ? `/v1/contact-investigations/${arah}?page=0&size=20` : null);

  const receiveInv = useLiveMutation<{ id: string; version: number }, InvestigationDetail>(
    ({ id, version }) => apiRequest(`/v1/contact-investigations/${id}/receive`, { method: "POST", body: {}, etag: `"${version}"` }).then((r) => ({ data: r.data as InvestigationDetail })),
    [["investigations", arah]]
  );
  const startInv = useLiveMutation<{ id: string; version: number }, InvestigationDetail>(
    ({ id, version }) => apiRequest(`/v1/contact-investigations/${id}/start`, { method: "POST", body: {}, etag: `"${version}"` }).then((r) => ({ data: r.data as InvestigationDetail })),
    [["investigations", arah]]
  );
  const returnInv = useLiveMutation<{ id: string; version: number; reason: string }, InvestigationDetail>(
    ({ id, version, reason }) => apiRequest(`/v1/contact-investigations/${id}/return`, { method: "POST", body: { returnReason: reason }, etag: `"${version}"` }).then((r) => ({ data: r.data as InvestigationDetail })),
    [["investigations", arah]]
  );
  const cancelInv = useLiveMutation<{ id: string; version: number }, InvestigationDetail>(
    ({ id, version }) => apiRequest(`/v1/contact-investigations/${id}/cancel`, { method: "POST", body: {}, etag: `"${version}"` }).then((r) => ({ data: r.data as InvestigationDetail })),
    [["investigations", arah]]
  );
  const completeInv = useLiveMutation<{ id: string; version: number; activeTbExcluded: boolean; tptEligible: boolean; notes?: string }, InvestigationDetail>(
    ({ id, version, activeTbExcluded, tptEligible, notes }) => apiRequest(`/v1/contact-investigations/${id}/complete`, {
      method: "POST",
      body: { activeTbExcluded, tptEligible, notes: notes || undefined },
      etag: `"${version}"`,
    }).then((r) => ({ data: r.data as InvestigationDetail })),
    [["investigations", arah]]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card>
          <CardTitle sub="Tempel UUID kasus ACTIVE.">Kontak kasus</CardTitle>
          <input aria-label="UUID kasus" className={`${inputClass} font-mono text-xs`} value={caseId} onChange={(e) => setCaseId(e.target.value.trim())} placeholder="UUID kasus" />
          {contacts.data?.content.length ? (
            <ul className="mt-4 space-y-2 text-sm">
              {contacts.data.content.map((c) => (
                <li key={c.id} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><strong className="text-[#123524]">{c.fullName}</strong> · {c.relationshipToIndexCase ?? "—"}<span className="block text-xs text-[#8a90a5]">{c.investigations.length} investigasi · {c.tpt.length} TPT {c.linkedPatient ? "· tertaut pasien" : ""}</span></li>
              ))}
            </ul>
          ) : contacts.data ? <p className="mt-3 text-sm text-[#5b6478]">Belum ada kontak pada kasus ini.</p> : null}
          {contacts.error && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(contacts.error).detail}</p>}
        </Card>
        <Card>
          <CardTitle
            sub={arah === "incoming" ? "Investigasi yang dikirim ke fasilitas Anda (Phase 4B)." : "Investigasi yang dirujuk keluar oleh fasilitas Anda."}
            right={
              <div className="flex gap-1">
                <GhostButton className={`!min-h-8 !px-3 text-xs ${arah === "incoming" ? "!bg-[#0B5A2A] !text-white" : ""}`} onClick={() => setArah("incoming")}>Masuk</GhostButton>
                <GhostButton className={`!min-h-8 !px-3 text-xs ${arah === "outgoing" ? "!bg-[#0B5A2A] !text-white" : ""}`} onClick={() => setArah("outgoing")}>Keluar</GhostButton>
              </div>
            }
          >
            Investigasi kontak ({arah === "incoming" ? "Masuk" : "Keluar"})
          </CardTitle>
          {inv.data?.content.length ? (
            <ul className="space-y-3 text-sm">
              {inv.data.content.map((i) => (
                <li key={i.id} className="rounded-xl bg-[#F3F4FB] p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-[#123524]">{i.contact.fullName}</strong>
                      <span className="ml-2 text-xs text-[#5b6478]">· alur {i.workflowType}</span>
                    </div>
                    <Chip tone={i.status === "COMPLETED" ? "green" : i.status === "CANCELLED" || i.status === "RETURNED" ? "gray" : "amber"}>{i.status}</Chip>
                  </div>
                  {i.returnReason && <p className="mt-1 text-xs text-[#b42318]">Alasan kembali: {i.returnReason}</p>}
                  {i.notes && <p className="mt-1 text-xs text-[#5b6478]">Catatan: {i.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {arah === "incoming" && i.status === "SENT" && can("CONTACT_WRITE") && (
                      <PrimaryButton className="!min-h-9 !px-3 text-xs" disabled={receiveInv.isPending} onClick={() => receiveInv.mutate({ id: i.id, version: i.version })}>Terima</PrimaryButton>
                    )}
                    {arah === "incoming" && i.status === "RECEIVED" && can("CONTACT_WRITE") && (
                      <>
                        <PrimaryButton className="!min-h-9 !px-3 text-xs" disabled={startInv.isPending} onClick={() => startInv.mutate({ id: i.id, version: i.version })}>Mulai Investigasi</PrimaryButton>
                        <GhostButton className="!min-h-9 !px-3 text-xs text-[#b42318]" disabled={returnInv.isPending} onClick={() => {
                          const r = window.prompt("Alasan pengembalian investigasi kontak:");
                          if (r) returnInv.mutate({ id: i.id, version: i.version, reason: r });
                        }}>Kembalikan</GhostButton>
                      </>
                    )}
                    {arah === "incoming" && i.status === "IN_PROGRESS" && can("CONTACT_WRITE") && (
                      <>
                        <PrimaryButton className="!min-h-9 !px-3 text-xs" disabled={completeInv.isPending} onClick={() => completeInv.mutate({ id: i.id, version: i.version, activeTbExcluded: true, tptEligible: true, notes: "TB aktif disingkirkan, kontak dinilai layak TPT." })}>Selesai (Layak TPT)</PrimaryButton>
                        <GhostButton className="!min-h-9 !px-3 text-xs text-[#b42318]" disabled={completeInv.isPending} onClick={() => completeInv.mutate({ id: i.id, version: i.version, activeTbExcluded: false, tptEligible: false, notes: "TB aktif dicurigai / tidak layak TPT." })}>Selesai (Tak Layak)</GhostButton>
                        <GhostButton className="!min-h-9 !px-3 text-xs" disabled={returnInv.isPending} onClick={() => {
                          const r = window.prompt("Alasan pengembalian investigasi kontak:");
                          if (r) returnInv.mutate({ id: i.id, version: i.version, reason: r });
                        }}>Kembalikan</GhostButton>
                      </>
                    )}
                    {arah === "outgoing" && i.status === "SENT" && can("CONTACT_WRITE") && (
                      <GhostButton className="!min-h-9 !px-3 text-xs text-[#b42318]" disabled={cancelInv.isPending} onClick={() => cancelInv.mutate({ id: i.id, version: i.version })}>Batalkan Rujukan</GhostButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#5b6478]">Tidak ada investigasi {arah === "incoming" ? "masuk" : "keluar"}.</p>}
          {(receiveInv.localError ?? startInv.localError ?? returnInv.localError ?? cancelInv.localError ?? completeInv.localError) && (
            <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(receiveInv.localError ?? startInv.localError ?? returnInv.localError ?? cancelInv.localError ?? completeInv.localError).detail}</p>
          )}
        </Card>
      </div>
      {can("CONTACT_WRITE") && caseId.length === 36 && (
        <Card>
          <CardTitle sub="INTERNAL = investigasi di fasilitas sama; OUTGOING_REFERRAL dikirim ke fasilitas lain.">Tambah kontak</CardTitle>
          <div className="space-y-4">
            <Field label="Nama kontak *" required><input className={inputClass} value={nama} onChange={(e) => setNama(e.target.value)} /></Field>
            <Field label="Hubungan dengan kasus indeks"><input className={inputClass} value={hubungan} onChange={(e) => setHubungan(e.target.value)} /></Field>
            <Field label="Jenis alur investigasi *" required>
              <select className={inputClass} value={workflow} onChange={(e) => setWorkflow(e.target.value)}>{CATALOG.investigationWorkflow.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}</select>
            </Field>
          </div>
          {create.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(create.localError).detail}</p>}
          <PrimaryButton className="mt-4" disabled={!nama || create.isPending} onClick={() => create.mutate(undefined as never)}>{create.isPending ? "Menyimpan…" : "Simpan kontak + investigasi"}</PrimaryButton>
        </Card>
      )}
    </div>
  );
}

function ModulTpt() {
  const { can } = usePermissions();
  const [contactId, setContactId] = useState("");
  const [regimen, setRegimen] = useState("TPT_SO_3HP");
  const [mulai, setMulai] = useState(today());
  const list = useLive<Page<TptDetail>>(["tpt", contactId], contactId.length === 36 && can("TPT_READ") ? `/v1/contacts/${contactId}/tpt?page=0&size=20` : null);
  const start = useLiveMutation<void, TptDetail>(async () =>
    apiRequest<TptDetail>(`/v1/contact-investigations/${contactId}/tpt`, { method: "POST", body: { regimenCode: regimen, startDate: mulai } }).then((r) => ({ data: r.data })), [["tpt", contactId]]);

  const completeTpt = useLiveMutation<{ id: string; version: number }, TptDetail>(
    ({ id, version }) => apiRequest(`/v1/preventive-treatments/${id}/complete`, { method: "POST", body: { actualEndDate: today(), closureReason: "Regimen pencegahan selesai tuntas." }, etag: `"${version}"` }).then((r) => ({ data: r.data as TptDetail })),
    [["tpt", contactId]]
  );
  const stopTpt = useLiveMutation<{ id: string; version: number; reason: string }, TptDetail>(
    ({ id, version, reason }) => apiRequest(`/v1/preventive-treatments/${id}/stop`, { method: "POST", body: { actualEndDate: today(), closureReason: reason }, etag: `"${version}"` }).then((r) => ({ data: r.data as TptDetail })),
    [["tpt", contactId]]
  );
  const lostTpt = useLiveMutation<{ id: string; version: number }, TptDetail>(
    ({ id, version }) => apiRequest(`/v1/preventive-treatments/${id}/lost-to-follow-up`, { method: "POST", body: { actualEndDate: today(), closureReason: "Putus berobat / lost to follow-up" }, etag: `"${version}"` }).then((r) => ({ data: r.data as TptDetail })),
    [["tpt", contactId]]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <CardTitle sub="Investigasi harus COMPLETE dengan tptEligible=true.">Riwayat TPT kontak</CardTitle>
        <input aria-label="UUID kontak" className={`${inputClass} font-mono text-xs`} value={contactId} onChange={(e) => setContactId(e.target.value.trim())} placeholder="UUID kontak" />
        {list.data?.content.length ? (
          <ul className="mt-4 space-y-3 text-sm">
            {list.data.content.map((t) => (
              <li key={t.id} className="rounded-xl bg-[#F3F4FB] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-[#123524]">{t.regimenName ?? t.regimenCode}</strong>
                    <span className="ml-2 text-xs text-[#5b6478]">· mulai {fmtDate(t.startDate)}{t.actualEndDate ? ` s.d. ${fmtDate(t.actualEndDate)}` : ""}</span>
                  </div>
                  <Chip tone={t.status === "COMPLETED" ? "green" : t.status === "ACTIVE" ? "blue" : "amber"}>{t.status}</Chip>
                </div>
                {t.closureReason && <p className="mt-1 text-xs text-[#5b6478]">Alasan penutupan: {t.closureReason}</p>}
                {t.status === "ACTIVE" && can("TPT_WRITE") && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PrimaryButton className="!min-h-9 !px-3 text-xs" disabled={completeTpt.isPending} onClick={() => completeTpt.mutate({ id: t.id, version: t.version })}>Selesaikan</PrimaryButton>
                    <GhostButton className="!min-h-9 !px-3 text-xs text-[#b42318]" disabled={stopTpt.isPending} onClick={() => {
                      const r = window.prompt("Alasan penghentian TPT:");
                      if (r) stopTpt.mutate({ id: t.id, version: t.version, reason: r });
                    }}>Hentikan</GhostButton>
                    <GhostButton className="!min-h-9 !px-3 text-xs text-[#b42318]" disabled={lostTpt.isPending} onClick={() => lostTpt.mutate({ id: t.id, version: t.version })}>Putus Berobat</GhostButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : list.data ? <p className="mt-3 text-sm text-[#5b6478]">Belum ada TPT pada kontak ini.</p> : null}
        {(list.error ?? completeTpt.localError ?? stopTpt.localError ?? lostTpt.localError) && (
          <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(list.error ?? completeTpt.localError ?? stopTpt.localError ?? lostTpt.localError).detail}</p>
        )}
      </Card>
      {can("TPT_WRITE") && (
        <Card>
          <CardTitle>Mulai TPT</CardTitle>
          <div className="space-y-4">
            <Field label="UUID investigasi (selesai & layak TPT) *" required><input className={`${inputClass} font-mono text-xs`} value={contactId} onChange={(e) => setContactId(e.target.value.trim())} /></Field>
            <Field label="Regimen TPT *" required>
              <select className={inputClass} value={regimen} onChange={(e) => setRegimen(e.target.value)}>
                {["TPT_SO_6H", "TPT_SO_3HP", "TPT_SO_3HR", "TPT_SO_4R", "TPT_SO_1HP", "TPT_RO_6LFX"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Tanggal mulai *" required><input type="date" max={today()} className={inputClass} value={mulai} onChange={(e) => setMulai(e.target.value)} /></Field>
          </div>
          {start.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(start.localError).detail}</p>}
          <PrimaryButton className="mt-4" disabled={start.isPending} onClick={() => start.mutate(undefined as never)}>{start.isPending ? "Menyimpan…" : "Mulai TPT"}</PrimaryButton>
        </Card>
      )}
    </div>
  );
}

/* =================== MODUL PEMANTAUAN =================== */

function ModulPemantauan() {
  const { can } = usePermissions();
  const [status, setStatus] = useState("OPEN");
  const alerts = useLive<Page<AlertDetail>>(["alerts", status], can("ALERT_READ") ? `/v1/alerts${qs({ status: status || undefined, page: 0, size: 20 })}` : null);
  const notifs = useLive<Page<NotificationDetail>>(["me", "notifs"], "/v1/me/notifications?page=0&size=10");
  const [treatmentId, setTreatmentId] = useState("");
  const plans = useLive<Page<PlanDetail>>(["plans", treatmentId], treatmentId.length === 36 && can("MONITORING_READ") ? `/v1/treatments/${treatmentId}/monitoring-plans?page=0&size=20` : null);

  const ack = useLiveMutation<string, AlertDetail>((id) => apiRequest(`/v1/alerts/${id}/acknowledge`, { method: "POST", body: {} }).then((r) => ({ data: r.data as AlertDetail })), [["alerts", status]]);
  const resolve = useLiveMutation<{ id: string; version: number }, AlertDetail>(({ id, version }) =>
    apiRequest(`/v1/alerts/${id}/resolve`, { method: "POST", body: {}, etag: `"${version}"` }).then((r) => ({ data: r.data as AlertDetail })), [["alerts", status]]);
  const [planStart, setPlanStart] = useState(today());
  const [eventType, setEventType] = useState("ADHERENCE_REVIEW");
  const [eventAt, setEventAt] = useState(() => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16));
  const createPlan = useLiveMutation<void, PlanDetail>(async () =>
    apiRequest<PlanDetail>(`/v1/treatments/${treatmentId}/monitoring-plans`, { method: "POST", body: { startDate: planStart, events: [{ eventType, scheduledAt: new Date(eventAt).toISOString() }] } }).then((r) => ({ data: r.data })), [["plans", treatmentId]]);

  const markRead = useLiveMutation<{ id: string; version: number }, NotificationDetail>(
    ({ id, version }) => apiRequest(`/v1/me/notifications/${id}/read`, { method: "POST", body: {}, etag: `"${version}"` }).then((r) => ({ data: r.data as NotificationDetail })),
    [["me", "notifs"]]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card>
          <CardTitle right={<Field label="Status"><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>{["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"].map((s) => <option key={s}>{s}</option>)}</select></Field>}>
            Peringatan overdue (Phase 4C)
          </CardTitle>
          {alerts.isLoading ? <p className="text-sm text-[#5b6478]">Memuat…</p>
            : alerts.error ? <p role="alert" className="text-sm text-[#b42318]">{errText(alerts.error).detail}</p>
            : alerts.data?.content.length ? (
              <ul className="space-y-3 text-sm">
                {alerts.data.content.map((a) => (
                  <li key={a.id} className="rounded-xl bg-[#FDEBD3] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[#8a5a12]">{a.alertType}</strong><Chip tone={a.severity === "HIGH" ? "red" : "amber"}>{a.severity}</Chip></div>
                    <p className="mt-1 text-[#8a5a12]/90">{a.message}</p>
                    <p className="mt-1 text-xs text-[#8a90a5]">{fmtDateTime(a.triggeredAt)} · target {a.targetType ?? "—"}</p>
                    <div className="mt-2 flex gap-2">
                      {can("ALERT_ACKNOWLEDGE") && a.status === "OPEN" && <GhostButton className="!min-h-10 !px-4 text-xs" disabled={ack.isPending} onClick={() => ack.mutate(a.id)}>Acknowledge</GhostButton>}
                      {can("ALERT_RESOLVE") && a.status !== "RESOLVED" && <GhostButton className="!min-h-10 !px-4 text-xs" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: a.id, version: a.version })}>Resolve</GhostButton>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[#5b6478]">Tidak ada peringatan pada status ini.</p>}
          {ack.localError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{errText(ack.localError).detail}</p>}
          {resolve.localError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{errText(resolve.localError).detail}</p>}
        </Card>
        <Card>
          <CardTitle right={<Field label="UUID treatment"><input className={`${inputClass} font-mono text-xs`} value={treatmentId} onChange={(e) => setTreatmentId(e.target.value.trim())} /></Field>}>
            Rencana pemantauan (MANUAL_V1)
          </CardTitle>
          {plans.data?.content.length ? (
            <ul className="space-y-2 text-sm">
              {plans.data.content.map((p) => (
                <li key={p.id} className="rounded-xl bg-[#F3F4FB] px-4 py-3"><strong className="text-[#123524]">{p.status}</strong> · mulai {fmtDate(p.startDate)}<span className="block text-xs text-[#8a90a5]">{Object.entries(p.eventCounts).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span></li>
              ))}
            </ul>
          ) : treatmentId.length === 36 ? <p className="mt-3 text-sm text-[#5b6478]">Belum ada rencana pada treatment ini.</p> : <p className="mt-3 text-sm text-[#5b6478]">Tempel UUID treatment untuk melihat rencana.</p>}
        </Card>
      </div>
      <div className="space-y-5">
        {can("MONITORING_MANAGE") && treatmentId.length === 36 && (
          <Card>
            <CardTitle sub="Rencana manual dengan event terjadwal (kode event sesuai katalog).">Buat rencana pemantauan</CardTitle>
            <div className="space-y-4">
              <Field label="Tanggal mulai *" required><input type="date" className={inputClass} value={planStart} onChange={(e) => setPlanStart(e.target.value)} /></Field>
              <Field label="Jenis event *" required>
                <select className={inputClass} value={eventType} onChange={(e) => setEventType(e.target.value)}>{CATALOG.monitoringEvents.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}</select>
              </Field>
              <Field label="Waktu event *" required><input type="datetime-local" className={inputClass} value={eventAt} onChange={(e) => setEventAt(e.target.value)} /></Field>
            </div>
            {createPlan.localError && <p role="alert" className="mt-3 text-sm text-[#b42318]">{errText(createPlan.localError).detail}</p>}
            <PrimaryButton className="mt-4" disabled={createPlan.isPending} onClick={() => createPlan.mutate(undefined as never)}>{createPlan.isPending ? "Menyimpan…" : "Buat rencana"}</PrimaryButton>
          </Card>
        )}
        <Card>
          <CardTitle sub="Notifikasi IN_APP milik akun Anda.">Notifikasi saya</CardTitle>
          {notifs.data?.content.length ? (
            <ul className="space-y-2 text-sm">
              {notifs.data.content.map((n) => (
                <li key={n.id} className="flex items-center justify-between rounded-xl bg-[#F3F4FB] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span>{n.alertType ?? "Notifikasi"}</span>
                    <Chip tone={n.readAt ? "gray" : "blue"}>{n.readAt ? "dibaca" : "baru"}</Chip>
                  </div>
                  {!n.readAt && (
                    <GhostButton className="!min-h-7 !px-2 text-xs" disabled={markRead.isPending} onClick={() => markRead.mutate({ id: n.id, version: n.version })}>
                      Tandai dibaca
                    </GhostButton>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#5b6478]">Tidak ada notifikasi.</p>}
        </Card>
      </div>
    </div>
  );
}
