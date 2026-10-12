"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Field, TBC_ROUTES, TbcLogo, inputClass } from "@/components/tbc/ui";
import { useSession } from "@/lib/auth/session";
import { apiRequest } from "@/lib/api/client";
import { errText } from "@/components/tbc/live/api";

/* ============================================================
   Layout autentikasi bersama (header mini + footer catatan dev)
   ============================================================ */

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#F3F4FB]">
      <header className="bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <TbcLogo />
          <div className="flex items-center gap-2 sm:gap-5">
            <Link href={TBC_ROUTES.landing} className="text-sm font-medium text-[#3f4660] hover:text-[#0B5A2A]">Kembali ke beranda</Link>
            <span className="hidden items-center gap-1.5 text-sm font-medium text-[#3f4660] sm:inline-flex">
              <svg viewBox="0 0 24 24" className="size-4 text-[#1B7A3E]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.7.3-.9.8-.9 1.7m0 3h.01" strokeLinecap="round" /></svg>
              Bantuan
            </span>
            <Link href={TBC_ROUTES.masuk} className="inline-flex min-h-11 items-center rounded-full border border-[#d8dcea] bg-white px-5 text-sm font-semibold text-[#123524] hover:bg-[#f4f5fb]">Masuk</Link>
          </div>
        </div>
      </header>
      <div className="bg-[#E3EDFB] px-4 py-2.5 text-center text-xs text-[#4c5470] sm:px-6">
        <strong className="font-semibold">ℹ Rancangan autentikasi baru • Memerlukan penyesuaian backend</strong> · Mockup statis, bukan layanan aktif
      </div>
      <main id="main-content">{children}</main>
      <footer className="bg-[#E9EBF7] py-8">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <p className="text-sm font-bold text-[#123524]">Catatan pengembangan — kontrak baru perlu disetujui</p>
          <p className="mt-2 max-w-5xl text-xs leading-relaxed text-[#5b6478]">
            Pemeriksaan NIK + BPJS, registrasi biodata, privasi/persetujuan, serta pemetaan identitas akun–pasien secara atomik
            memerlukan perubahan backend yang disetujui. Verifikasi email/SMS bergantung pada adapter pengiriman yang dikonfigurasi.
          </p>
        </div>
      </footer>
      <div className="border-t border-[#e4e8f4] bg-white py-5">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 text-xs text-[#5b6478] sm:px-6">
          <p>TB Call Center · Akses portal pasien</p>
          <p><a className="font-semibold text-[#1B7A3E] hover:underline" href="#privacy">Kebijakan Privasi</a> · <a className="font-semibold text-[#1B7A3E] hover:underline" href="#terms">Syarat Penggunaan</a></p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Halaman Masuk (mockup: TB Call — Masuk.png)
   ============================================================ */

export function MasukForm() {
  const session = useSession();
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [gagal, setGagal] = useState<string | null>(null);
  const [proses, setProses] = useState(false);

  // Alur Lupa Kata Sandi
  const [mode, setMode] = useState<"login" | "reset-request" | "reset-confirm">("login");
  const [resetId, setResetId] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetPesan, setResetPesan] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetProses, setResetProses] = useState(false);

  return (
    <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
      <section aria-label="Penjelasan portal">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#DCF2DF] px-4 py-2 text-xs font-bold text-[#0B5A2A]">PORTAL PASIEN TB CALL</span>
        <h1 className="mt-6 max-w-md text-4xl font-extrabold leading-tight tracking-tight text-[#123524] xl:text-5xl">Satu akun untuk terhubung dengan layanan Anda<span className="text-[#1B7A3E]"> .</span></h1>
        <p className="mt-5 max-w-md leading-relaxed text-[#5b6478]">Masuk menggunakan email atau nomor telepon terverifikasi dan kata sandi akun Anda.</p>
        <div className="mt-8 max-w-md rounded-2xl bg-[#DCF2DF] p-7">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-bold text-[#0B5A2A]">Akses dimulai dari identitas Anda</h2>
            <svg viewBox="0 0 24 24" className="size-7 text-[#1B7A3E]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 21V9m0 0C12 6 10 4 6 4c0 4 2 6 6 5Zm0 3c0-3 2-5 6-5 0 4-2 6-6 5Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <ul className="mt-5 space-y-4">
            {[
              { t: "Akun terverifikasi", d: "Email/telepon diverifikasi saat pendaftaran.", i: <g /> },
              { t: "Verifikasi kontak", d: "Gunakan email atau nomor telepon pribadi.", i: <g /> },
              { t: "Pengaitan oleh petugas", d: "Data pengobatan dibuka setelah pemeriksaan petugas.", i: <g /> },
            ].map((item) => (
              <li key={item.t} className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#1B7A3E]">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span><strong className="block text-sm font-bold text-[#0B5A2A]">{item.t}</strong><span className="text-sm text-[#3f6b4f]">{item.d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 max-w-md text-xs leading-relaxed text-[#5b6478]">Sesi dilindungi cookie HttpOnly + CSRF. Data pasien dikaitkan petugas — bukan lewat halaman masuk.</p>
      </section>

      <section aria-label="Formulir akun" className="rounded-3xl border border-[#e4e8f4] bg-white p-8 shadow-sm sm:p-10">
        {mode === "login" ? (
          <>
            <h2 className="text-2xl font-extrabold text-[#123524]">Selamat datang kembali</h2>
            <p className="mt-2 text-sm text-[#5b6478]">Masuk ke ruang kerja TBCall.<br />Tanda * menunjukkan kolom wajib.</p>
            <form className="mt-8 space-y-6" onSubmit={async (e) => {
              e.preventDefault();
              setGagal(null); setProses(true);
              try {
                await session.login({ identity, password: sandi });
                const user = (await session.refresh()) ?? null;
                const roles = new Set(user?.roles.map((r) => r.code) ?? []);
                if (roles.has("PATIENT")) router.replace("/portal");
                else if (roles.has("TB_OFFICER") || roles.has("LAB_STAFF")) router.replace("/nakes");
                else if (roles.has("FACILITY_ADMIN") || roles.has("SYSTEM_ADMIN")) router.replace("/admin");
                else router.replace("/");
              } catch (err) {
                setGagal(errText(err).detail);
              } finally { setProses(false); }
            }}>
              <Field label="Email atau nomor telepon" required hint="Identitas yang didaftarkan pada akun Anda.">
                <input className={inputClass} autoComplete="username" placeholder="nama@contoh.id / +62…" value={identity} onChange={(e) => { setIdentity(e.target.value); setGagal(null); }} />
              </Field>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#123524]">Kata sandi *</span>
                  <button type="button" onClick={() => { setMode("reset-request"); setResetId(identity); setResetPesan(null); }} className="text-sm font-bold text-[#1B7A3E] hover:underline">Lupa kata sandi?</button>
                </div>
                <span className="relative mt-0 block">
                  <input type={lihat ? "text" : "password"} autoComplete="current-password" className={inputClass} placeholder="Masukkan kata sandi" value={sandi} onChange={(e) => { setSandi(e.target.value); setGagal(null); }} />
                  <button type="button" aria-label={lihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"} onClick={() => setLihat(!lihat)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5b6478]">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                  </button>
                </span>
              </div>
              {gagal && (
                <div role="alert" className="rounded-xl bg-[#FDE3E1] px-4 py-3 text-sm">
                  <p className="font-bold text-[#b42318]">Masuk tidak berhasil</p>
                  <p className="mt-1 text-[#b42318]">{gagal}</p>
                </div>
              )}
              <button type="submit" disabled={proses || !identity || !sandi} className="min-h-12 w-full rounded-full bg-[#0B5A2A] text-sm font-bold text-white transition hover:bg-[#0e6b35] disabled:opacity-60">{proses ? "Memeriksa…" : "Masuk"}</button>
            </form>
            <p className="mt-8 border-t pt-6 text-center text-sm text-[#3f4660]">
              Belum punya akun? <Link href={TBC_ROUTES.daftar} className="font-bold text-[#1B7A3E] hover:underline">Daftar sekarang</Link>
            </p>
          </>
        ) : mode === "reset-request" ? (
          <>
            <h2 className="text-2xl font-extrabold text-[#123524]">Atur Ulang Kata Sandi</h2>
            <p className="mt-2 text-sm text-[#5b6478]">Langkah 1: Masukkan email atau telepon akun terdaftar untuk menerima token pemulihan.</p>
            <form className="mt-6 space-y-5" onSubmit={async (e) => {
              e.preventDefault();
              setResetPesan(null); setResetProses(true);
              try {
                const res = await apiRequest<{ message: string }>("/v1/auth/password-reset/request", { method: "POST", body: { identity: resetId } });
                setResetPesan({ ok: true, text: res.data?.message ?? "Permintaan diterima. Token telah dikirimkan." });
                setMode("reset-confirm");
              } catch (err) {
                setResetPesan({ ok: false, text: errText(err).detail });
              } finally { setResetProses(false); }
            }}>
              <Field label="Email atau nomor telepon terdaftar" required>
                <input className={inputClass} placeholder="nama@contoh.id / +62…" value={resetId} onChange={(e) => setResetId(e.target.value)} />
              </Field>
              {resetPesan && (
                <p role={resetPesan.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${resetPesan.ok ? "bg-[#E7F7EA] text-[#0B5A2A]" : "bg-[#FDE3E1] text-[#b42318]"}`}>{resetPesan.text}</p>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={resetProses || !resetId} className="min-h-12 flex-1 rounded-full bg-[#0B5A2A] text-sm font-bold text-white transition hover:bg-[#0e6b35] disabled:opacity-60">{resetProses ? "Mengirim…" : "Kirim Token Pemulihan"}</button>
                <button type="button" onClick={() => { setMode("login"); setResetPesan(null); }} className="min-h-12 rounded-full border border-[#d8dcea] px-5 text-sm font-semibold text-[#123524] hover:bg-[#f4f5fb]">Batal</button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-extrabold text-[#123524]">Konfirmasi Kata Sandi Baru</h2>
            <p className="mt-2 text-sm text-[#5b6478]">Langkah 2: Masukkan token yang diterima dan kata sandi baru (12–128 karakter).</p>
            <form className="mt-6 space-y-5" onSubmit={async (e) => {
              e.preventDefault();
              setResetPesan(null); setResetProses(true);
              try {
                await apiRequest("/v1/auth/password-reset/confirm", { method: "POST", body: { token: resetToken, newPassword } });
                setResetPesan({ ok: true, text: "Kata sandi berhasil diperbarui! Silakan masuk dengan kata sandi baru." });
                setSandi("");
                setTimeout(() => setMode("login"), 1500);
              } catch (err) {
                setResetPesan({ ok: false, text: errText(err).detail });
              } finally { setResetProses(false); }
            }}>
              <Field label="Token pemulihan *" required>
                <input className={`${inputClass} font-mono text-xs`} placeholder="Tempel token pemulihan di sini" value={resetToken} onChange={(e) => setResetToken(e.target.value.trim())} />
              </Field>
              <Field label="Kata sandi baru *" required hint="Minimal 12 karakter.">
                <input type="password" className={inputClass} placeholder="Kata sandi baru" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </Field>
              {resetPesan && (
                <p role={resetPesan.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${resetPesan.ok ? "bg-[#E7F7EA] text-[#0B5A2A]" : "bg-[#FDE3E1] text-[#b42318]"}`}>{resetPesan.text}</p>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={resetProses || !resetToken || newPassword.length < 12} className="min-h-12 flex-1 rounded-full bg-[#0B5A2A] text-sm font-bold text-white transition hover:bg-[#0e6b35] disabled:opacity-60">{resetProses ? "Menyimpan…" : "Simpan Kata Sandi Baru"}</button>
                <button type="button" onClick={() => { setMode("login"); setResetPesan(null); }} className="min-h-12 rounded-full border border-[#d8dcea] px-5 text-sm font-semibold text-[#123524] hover:bg-[#f4f5fb]">Kembali ke Masuk</button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
/* ============================================================
   Daftar — wizard 4 langkah (mockup: Daftar · Biodata /
   Alamat & Kontak / Akun & Persetujuan / Tinjau Data)
   ============================================================ */

const STEPS = [
  { key: "biodata", label: "Biodata" },
  { key: "alamat", label: "Alamat & Kontak" },
  { key: "akun", label: "Akun & Persetujuan" },
  { key: "tinjau", label: "Tinjau Data" },
] as const;

export function DaftarWizard() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [akun, setAkun] = useState<{ id: string; status: string; token: string | null } | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [regProses, setRegProses] = useState(false);
  const [form, setForm] = useState({
    nama: "", nik: "", bpjs: "", tempatLahir: "", tanggalLahir: "", jenisKelamin: "", status: "", pekerjaan: "", pendidikan: "",
    alamat: "", provinsi: "Jawa Tengah", kabupaten: "", kecamatan: "", email: "", telepon: "",
    kataSandi: "", ulangiSandi: "", setuju: false, beriNama: false,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const next = () => (step < 3 ? setStep(step + 1) : setDone(true));

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#DCF2DF] text-[#0B5A2A]"><svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <h1 className="mt-6 text-3xl font-extrabold text-[#123524]">Pendaftaran selesai</h1>
        <p className="mt-3 text-[#5b6478]">Akun berhasil dibuat di backend TBCall (status: {akun?.status ?? "—"}). Lanjutkan ke verifikasi kontak, lalu tunggu pengaitan oleh petugas faskes.</p>
        {akun?.token && (
          <div className="mt-6 rounded-2xl bg-[#FDEBD3] p-6 text-left">
            <p className="text-sm font-bold text-[#8a5a12]">Mode pengembangan — token verifikasi tersedia</p>
            <p className="mt-1 text-xs text-[#8a5a12]/90">Adapter email/SMS belum dikonfigurasi, sehingga backend mengembalikan token langsung. Token sudah disimpan otomatis untuk halaman verifikasi.</p>
            <p className="mt-3 break-all rounded-lg bg-white/70 p-3 font-mono text-[10px] text-[#8a5a12]">{akun.token}</p>
          </div>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={TBC_ROUTES.verifikasi} className="inline-flex min-h-12 items-center rounded-full bg-[#0B5A2A] px-6 text-sm font-bold text-white hover:bg-[#0e6b35]">Verifikasi kontak</Link>
          <Link href={TBC_ROUTES.masuk} className="inline-flex min-h-12 items-center rounded-full bg-[#EEF0FA] px-6 text-sm font-semibold text-[#3f4660] hover:bg-[#e2e5f4]">Kembali ke masuk</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
      <p className="text-xs font-bold tracking-wide text-[#1B7A3E]">DAFTAR AKUN · LANGKAH {step + 1} DARI 4</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#123524]">
          {["Mari mulai dari biodata Anda", "Lengkapi alamat & kontak", "Amankan akun Anda", "Tinjau data Anda"][step]}
        </h1>
        <p className="text-sm text-[#3f4660]">Sudah punya akun? <Link href={TBC_ROUTES.masuk} className="font-bold text-[#1B7A3E] hover:underline">Masuk</Link></p>
      </div>
      <p className="mt-2 text-sm text-[#5b6478]">Gunakan data sesuai identitas. Kolom bertanda * wajib diisi; kolom opsional boleh dilewati.</p>

      {/* stepper */}
      <ol className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e4e8f4] bg-white p-4 sm:gap-0">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center gap-3">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i < step ? "bg-[#DCF2DF] text-[#0B5A2A]" : i === step ? "bg-[#0B5A2A] text-white" : "bg-[#EEF0FA] text-[#5b6478]"}`}>{i < step ? "✓" : i + 1}</span>
            <span><span className={`block text-sm font-bold ${i <= step ? "text-[#123524]" : "text-[#5b6478]"}`}>{s.label}</span><span className="block text-xs text-[#8a90a5]">{i === step ? "Sedang diisi" : i < step ? "Selesai" : "Berikutnya"}</span></span>
            {i < 3 && <span aria-hidden="true" className="mx-2 hidden h-px flex-1 bg-[#e4e8f4] md:block" />}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* sidebar bantuan */}
        <aside className="space-y-6">
          <div className="rounded-2xl bg-[#DCF2DF] p-6">
            <span className="flex size-12 items-center justify-center rounded-xl bg-white text-[#1B7A3E]"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="9" r="2.4" /><path d="M8 16c.8-1.8 2.3-2.6 4-2.6s3.2.8 4 2.6" strokeLinecap="round" /></svg></span>
            <h2 className="mt-4 text-lg font-bold text-[#0B5A2A]">Siapkan KTP dan kartu BPJS</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#3f6b4f]">NIK dan nomor BPJS diperlukan bersama untuk pencocokan identitas akun Anda. Periksa penulisan nama dan tanggal lahir sebelum melanjutkan.</p>
          </div>
          <div>
            <h3 className="font-bold text-[#123524]">Perlu bantuan mendaftar?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5b6478]">Hubungi petugas melalui kontak resmi faskes Anda. Jangan membagikan kata sandi atau kode verifikasi.</p>
            <a href="#bantuan" className="mt-2 inline-block text-sm font-bold text-[#1B7A3E] hover:underline">Lihat panduan bantuan →</a>
          </div>
        </aside>

        {/* kartu formulir */}
        <section className="space-y-6">
          {step === 0 && (
            <>
              <div className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
                <h2 className="text-xl font-bold text-[#123524]">Identitas utama</h2>
                <p className="mt-1 text-sm text-[#5b6478]">Data ini digunakan untuk pencocokan identitas, bukan pemeriksaan klinis.</p>
                <div className="mt-6 space-y-5">
                  <Field label="Nama lengkap sesuai identitas" required><input className={inputClass} placeholder="Masukkan nama sesuai KTP" value={form.nama} onChange={set("nama")} /></Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="NIK" required hint="16 digit angka sesuai KTP."><input className={inputClass} inputMode="numeric" maxLength={16} placeholder="Masukkan 16 digit NIK" value={form.nik} onChange={set("nik")} /></Field>
                    <Field label="Nomor BPJS" required hint="Nomor yang tertera pada kartu BPJS Anda."><input className={inputClass} inputMode="numeric" placeholder="Masukkan nomor kartu BPJS" value={form.bpjs} onChange={set("bpjs")} /></Field>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl bg-[#E7F7EA] px-4 py-3.5">
                    <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-[#0B5A2A]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z" /><path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <p className="text-sm"><strong className="font-bold text-[#0B5A2A]">Alur pendaftaran untuk WNI</strong><br /><span className="text-[#3f6b4f]">NIK wajib pada rancangan ini. Untuk kebutuhan pendaftaran WNA, hubungi petugas melalui kanal resmi faskes.</span></p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
                <h2 className="text-xl font-bold text-[#123524]">Informasi pribadi</h2>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Field label="Tempat lahir" required><input className={inputClass} placeholder="Kota atau kabupaten kelahiran" value={form.tempatLahir} onChange={set("tempatLahir")} /></Field>
                  <Field label="Tanggal lahir" required><input type="date" className={inputClass} value={form.tanggalLahir} onChange={set("tanggalLahir")} /></Field>
                  <Field label="Jenis kelamin" required>
                    <select className={inputClass} value={form.jenisKelamin} onChange={set("jenisKelamin")}><option value="">Pilih sesuai identitas</option><option>Laki-laki</option><option>Perempuan</option></select>
                  </Field>
                  <div>
                    <Field label="Kewarganegaraan" required hint="Warga Negara Indonesia · alur berbasis NIK">
                      <span className="mt-2 flex min-h-12 items-center justify-between rounded-xl border border-[#d8dcea] bg-[#E7F7EA] px-4 text-sm font-medium text-[#123524]">WNI
                        <svg viewBox="0 0 24 24" className="size-4 text-[#5b6478]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                      </span>
                    </Field>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
                <h2 className="text-xl font-bold text-[#123524]">Informasi tambahan</h2>
                <p className="mt-1 text-sm text-[#5b6478]">Seluruh isian di bagian ini opsional dan tidak menghalangi pendaftaran.</p>
                <div className="mt-6 grid gap-5 sm:grid-cols-3">
                  {([
                    ["Status perkawinan", "status", ["Pilih status", "Belum kawin", "Kawin", "Cerai hidup", "Cerai mati"]],
                    ["Pekerjaan", "pekerjaan", ["Pilih pekerjaan", "Karyawan", "Wiraswasta", "Petani", "Buruh pabrik", "Tidak bekerja"]],
                    ["Pendidikan", "pendidikan", ["Pilih pendidikan", "SD", "SMP", "SMA", "Diploma", "Sarjana"]],
                  ] as [string, "status" | "pekerjaan" | "pendidikan", string[]][]).map(([label, key, opts]) => (
                      <Field key={key} label={label}><span className="block text-xs font-normal text-[#8a90a5]">Opsional</span>
                        <select className={inputClass} value={form[key as "status"]} onChange={set(key as "status")}>{(opts as readonly string[]).map((o) => <option key={o}>{o}</option>)}</select>
                      </Field>
                    ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
                <h2 className="text-xl font-bold text-[#123524]">Alamat domisili</h2>
                <div className="mt-6 space-y-5">
                  <Field label="Alamat lengkap" required><textarea className={`${inputClass} min-h-24`} placeholder="Nama jalan, nomor rumah, RT/RW" value={form.alamat} onChange={set("alamat")} /></Field>
                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="Provinsi" required><input className={inputClass} value={form.provinsi} readOnly aria-label="Provinsi" /></Field>
                    <Field label="Kabupaten/Kota" required><input className={inputClass} placeholder="Contoh: Kota Semarang" value={form.kabupaten} onChange={set("kabupaten")} /></Field>
                    <Field label="Kecamatan" required><input className={inputClass} placeholder="Contoh: Candi" value={form.kecamatan} onChange={set("kecamatan")} /></Field>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
                <h2 className="text-xl font-bold text-[#123524]">Kontak pribadi</h2>
                <p className="mt-1 text-sm text-[#5b6478]">Salah satu kanal akan digunakan untuk verifikasi kontak.</p>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Field label="Email" hint="Kanal verifikasi utama pada rancangan ini."><input type="email" className={inputClass} placeholder="nama@contoh.id" value={form.email} onChange={set("email")} /></Field>
                  <Field label="Nomor telepon/WhatsApp" hint="Memerlukan adapter SMS bila dipilih."><input type="tel" className={inputClass} placeholder="+62 8xx xxxx xxxx" value={form.telepon} onChange={set("telepon")} /></Field>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
                <h2 className="text-xl font-bold text-[#123524]">Kata sandi akun</h2>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Field label="Kata sandi" required hint="Minimal 12 karakter."><input type="password" className={inputClass} value={form.kataSandi} onChange={set("kataSandi")} /></Field>
                  <Field label="Ulangi kata sandi" required><input type="password" className={inputClass} value={form.ulangiSandi} onChange={set("ulangiSandi")} /></Field>
                </div>
              </div>
              <div className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
                <h2 className="text-xl font-bold text-[#123524]">Privasi &amp; persetujuan</h2>
                <div className="mt-5 space-y-4">
                  <label className="flex items-start gap-3 rounded-xl bg-[#EEF0FA] p-4 text-sm">
                    <input type="checkbox" checked={form.setuju} onChange={set("setuju")} className="mt-1 size-4" />
                    <span className="text-[#3f4660]">Saya menyetujui <a href="#privacy" className="font-bold text-[#1B7A3E] hover:underline">Kebijakan Privasi</a> dan <a href="#terms" className="font-bold text-[#1B7A3E] hover:underline">Syarat Penggunaan</a> TB Call Center, termasuk pengolahan data kesehatan sesuai hak akses.</span>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl bg-[#EEF0FA] p-4 text-sm">
                    <input type="checkbox" checked={form.beriNama} onChange={set("beriNama")} className="mt-1 size-4" />
                    <span className="text-[#3f4660]">Saya mengizinkan nama saya ditampilkan pada detail portal bagi petugas fasilitas yang berizin (opsional).</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
              <h2 className="text-xl font-bold text-[#123524]">Tinjau data Anda</h2>
              <p className="mt-1 text-sm text-[#5b6478]">Pastikan seluruh data sesuai sebelum membuat akun.</p>
              <dl className="mt-6 divide-y">
                {[["Nama lengkap", form.nama], ["NIK", form.nik], ["Nomor BPJS", form.bpjs], ["Tempat & tanggal lahir", `${form.tempatLahir} · ${form.tanggalLahir || "-"}`], ["Jenis kelamin", form.jenisKelamin || "-"], ["Alamat", `${form.alamat || "-"}, ${form.kecamatan}, ${form.kabupaten}, ${form.provinsi}`], ["Email", form.email || "-"], ["Telepon", form.telepon || "-"]].map(([k, v]) => (
                  <div key={k} className="grid gap-1 py-3 sm:grid-cols-[220px_1fr]"><dt className="text-sm font-semibold text-[#123524]">{k}</dt><dd className="text-sm text-[#5b6478]">{v}</dd></div>
                ))}
              </dl>
            </div>
          )}

          {regError && <p role="alert" className="rounded-xl bg-[#FDE3E1] px-4 py-3 text-sm text-[#b42318]">{regError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => (step === 0 ? undefined : setStep(step - 1))}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#d8dcea] bg-white px-6 text-sm font-semibold text-[#123524] hover:bg-[#f4f5fb]">
              ← {step === 0 ? "Kembali ke masuk" : STEPS[step - 1]!.label}
            </button>
            <button type="button" onClick={async () => {
              if (step < 3) { next(); return; }
              setRegError(null); setRegProses(true);
              try {
                const body: Record<string, unknown> = { password: form.kataSandi };
                if (form.email) body.email = form.email;
                if (form.telepon) body.phone = form.telepon;
                const r = await apiRequest<{ id: string; status: string; verificationTokens?: { purpose: string; token: string }[] }>("/v1/auth/register", { method: "POST", body });
                const token = r.data.verificationTokens?.[0]?.token ?? null;
                if (token && typeof window !== "undefined") window.sessionStorage.setItem("tbcall-dev-token", token);
                setAkun({ id: r.data.id, status: r.data.status, token });
                setDone(true);
              } catch (err) { setRegError(errText(err).detail); }
              finally { setRegProses(false); }
            }} disabled={regProses || (step === 2 && !form.setuju)}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0B5A2A] px-7 text-sm font-bold text-white transition hover:bg-[#0e6b35] disabled:opacity-50">
              {regProses ? "Mendaftarkan…" : step === 3 ? "Buat akun" : `${STEPS[step + 1]?.label} →`}
            </button>
          </div>
          <p className="text-center text-xs text-[#8a90a5]">Biodata &amp; alamat belum tersimpan backend — data pasien dikaitkan petugas setelah akun dibuat. Langkah Akun membuat akun nyata via POST /auth/register.</p>
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   Verifikasi kontak & aktivasi (mockup: Verifikasi Kontak & Aktivasi)
   ============================================================ */

export function VerifikasiKontak() {
  const [kanal, setKanal] = useState<"email" | "sms">("email");
  const [token, setToken] = useState("");
  const [hasil, setHasil] = useState<{ ok: boolean; pesan: string } | null>(null);
  const [proses, setProses] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  if (typeof window !== "undefined" && devToken === null) setDevToken(window.sessionStorage.getItem("tbcall-dev-token"));

  const [resendOpen, setResendOpen] = useState(false);
  const [resendId, setResendId] = useState("");
  const [resendPesan, setResendPesan] = useState<{ ok: boolean; text: string } | null>(null);
  const [resendProses, setResendProses] = useState(false);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6">
      <div className="flex items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#DCF2DF] text-[#0B5A2A]"><svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span>
        <div>
          <p className="text-xs font-bold tracking-wide text-[#1B7A3E]">AKTIVASI AKUN</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#123524]">Verifikasi kontak, lalu tunggu pengaitan</h1>
          <p className="mt-2 text-[#5b6478]">Masukkan token verifikasi dari email/SMS untuk mengaktifkan kontak akun Anda.</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
            <h2 className="text-xl font-bold text-[#123524]">Verifikasi kontak Anda</h2>
            <p className="mt-1 text-sm text-[#5b6478]">Pilih kanal tempat token dikirim. Dalam alur ini, email menjadi pilihan utama.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Pilih kanal verifikasi">
              {([["email", "Email"], ["sms", "SMS"]] as const).map(([k, t]) => (
                <button key={k} type="button" role="radio" aria-checked={kanal === k} onClick={() => setKanal(k)}
                  className={`rounded-2xl border p-5 text-left transition ${kanal === k ? "border-[#1B7A3E] bg-[#E7F7EA] ring-1 ring-[#1B7A3E]" : "border-[#d8dcea] bg-white hover:bg-[#f4f5fb]"}`}>
                  <span className="flex items-center justify-between font-bold text-[#123524]">{t}<span className={`size-4 rounded-full border-2 ${kanal === k ? "border-[#1B7A3E] bg-[#1B7A3E] ring-2 ring-white ring-inset" : "border-[#c3c8db]"}`} /></span>
                  <span className="mt-2 block text-xs text-[#8a90a5]">Memerlukan adapter pengiriman di backend</span>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <Field label="Token verifikasi *" required hint="Salin token lengkap dari pesan verifikasi (atau dari respons registrasi pada mode pengembangan).">
                <textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={token} onChange={(e) => { setToken(e.target.value.trim()); setHasil(null); }} placeholder="Tempel token verifikasi di sini…" />
              </Field>
            </div>
            {devToken && hasil?.ok !== true && (
              <div className="mt-3 rounded-xl bg-[#FDEBD3] px-4 py-3 text-sm text-[#8a5a12]">
                <strong>Mode pengembangan:</strong> token dari registrasi tersimpan di peramban ini.
                <button type="button" className="ml-2 font-bold underline" onClick={() => setToken(devToken)}>Gunakan token tersimpan</button>
              </div>
            )}
            {hasil && (
              <p role={hasil.ok ? "status" : "alert"} className={`mt-4 rounded-xl px-4 py-3 text-sm ${hasil.ok ? "bg-[#E7F7EA] font-semibold text-[#0B5A2A]" : "bg-[#FDE3E1] text-[#b42318]"}`}>{hasil.pesan}</p>
            )}
            <button type="button" disabled={!token || proses || hasil?.ok === true}
              onClick={async () => {
                setProses(true); setHasil(null);
                try {
                  await apiRequest("/v1/auth/verify", { method: "POST", body: { token } });
                  window.sessionStorage.removeItem("tbcall-dev-token");
                  setDevToken(null);
                  setHasil({ ok: true, pesan: "Kontak terverifikasi. Akun Anda aktif — lanjutkan ke halaman masuk." });
                } catch (err) { setHasil({ ok: false, pesan: errText(err).detail }); }
                finally { setProses(false); }
              }}
              className="mt-5 min-h-12 w-full rounded-full bg-[#0B5A2A] text-sm font-bold text-white transition hover:bg-[#0e6b35] disabled:opacity-60">
              {proses ? "Memverifikasi…" : "Verifikasi kontak"}
            </button>
            {hasil?.ok && <Link href={TBC_ROUTES.masuk} className="mt-4 inline-block w-full rounded-full bg-[#EEF0FA] py-3.5 text-center text-sm font-bold text-[#123524] hover:bg-[#e2e5f4]">Lanjut ke halaman masuk →</Link>}
            <div className="mt-5 border-t pt-4">
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => setResendOpen(!resendOpen)} className="font-bold text-[#1B7A3E] hover:underline">
                  {resendOpen ? "Tutup kirim ulang token" : "Kirim ulang token verifikasi?"}
                </button>
                <span className="text-xs text-[#8a90a5]">Backend POST /auth/verification/resend</span>
              </div>
              {resendOpen && (
                <div className="mt-3 space-y-3 rounded-xl bg-[#F3F4FB] p-4 text-sm">
                  <p className="font-semibold text-[#123524]">Kirim ulang token ke kontak terdaftar</p>
                  <div className="flex gap-2">
                    <input className={`${inputClass} !min-h-11 flex-1`} placeholder="Email atau nomor telepon terdaftar" value={resendId} onChange={(e) => setResendId(e.target.value)} />
                    <button type="button" disabled={resendProses || !resendId} onClick={async () => {
                      setResendProses(true); setResendPesan(null);
                      try {
                        const res = await apiRequest<{ message: string }>("/v1/auth/verification/resend", { method: "POST", body: { identity: resendId } });
                        setResendPesan({ ok: true, text: res.data?.message ?? "Permintaan kirim ulang diterima." });
                      } catch (err) {
                        setResendPesan({ ok: false, text: errText(err).detail });
                      } finally { setResendProses(false); }
                    }} className="min-h-11 rounded-full bg-[#0B5A2A] px-4 font-bold text-white transition hover:bg-[#0e6b35] disabled:opacity-60">
                      {resendProses ? "Mengirim…" : "Kirim"}
                    </button>
                  </div>
                  {resendPesan && (
                    <p role={resendPesan.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-xs ${resendPesan.ok ? "bg-[#E7F7EA] text-[#0B5A2A]" : "bg-[#FDE3E1] text-[#b42318]"}`}>{resendPesan.text}</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-[#e4e8f4] bg-white p-7">
            <h2 className="text-xl font-bold text-[#123524]">Perjalanan akses akun</h2>
            <ol className="mt-5 space-y-5">
              {([
                ["Pendaftaran selesai", "Akun dibuat melalui POST /auth/register.", true],
                ["Verifikasi kontak", "Aktifkan lewat POST /auth/verify dengan token.", false],
                ["Pengaitan oleh petugas", "Petugas mencocokkan identitas akun dengan data pasien.", false],
                ["Akses data pengobatan", "Dibuka sesuai hak akses setelah pemeriksaan.", false],
              ] as [string, string, boolean][]).map(([t, d, ok], i) => (
                <li key={t} className="flex items-start gap-4">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${ok ? "bg-[#DCF2DF] text-[#0B5A2A]" : "bg-[#EEF0FA] text-[#5b6478]"}`}>
                    {ok ? "✓" : i === 1 ? "✉" : i === 2 ? "👤" : "🔒"}
                  </span>
                  <span><strong className={`block text-sm font-bold ${ok ? "text-[#0B5A2A]" : "text-[#123524]"}`}>{t}</strong><span className="mt-0.5 block text-sm text-[#5b6478]">{d}</span></span>
                </li>
              ))}
            </ol>
          </section>
          <div className="rounded-2xl bg-[#E7F7EA] p-6">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-[#1f7a3f]"><span aria-hidden="true">🛡</span><span><strong className="font-bold text-[#0B5A2A]">Menunggu aktivasi akses pasien</strong><br />Kontak terverifikasi tidak berarti data pengobatan langsung terbuka. Pengaitan tetap diperiksa petugas; tidak ada persetujuan otomatis.</span></p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Link href={TBC_ROUTES.daftar} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#d8dcea] bg-white px-6 text-sm font-semibold text-[#123524] hover:bg-[#f4f5fb]">← Kembali ke pendaftaran</Link>
        <Link href={TBC_ROUTES.masuk} className="inline-flex min-h-12 items-center rounded-full border border-[#d8dcea] bg-white px-6 text-sm font-semibold text-[#123524] hover:bg-[#f4f5fb]">Kembali ke halaman masuk</Link>
      </div>
    </div>
  );
}
