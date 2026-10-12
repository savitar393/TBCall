"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ============================================================
   TB Call Center — design system (sesuai mockup UI/UX)
   Tema: hijau kesehatan + aksen lavender, kartu putih rounded
   ============================================================ */

export const TBC_ROUTES = {
  landing: "/landing",
  masuk: "/masuk",
  daftar: "/daftar",
  verifikasi: "/verifikasi",
  portal: "/portal",
  nakes: "/nakes",
  admin: "/admin",
} as const;

export function TbcLogo({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <Link href={TBC_ROUTES.landing} aria-label="TB Call Center - Beranda" className={cn("inline-flex items-center gap-2.5 rounded-lg", inverse ? "text-white" : "text-[#123524]")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#1B7A3E] text-white shadow-sm", inverse && "bg-white/15")}>
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-extrabold tracking-tight">TB Call Center</span>
          <span className={cn("block text-[9px] font-medium uppercase tracking-wide", inverse ? "text-white/70" : "text-[#1B7A3E]")}>Sistem Monitoring Tuberculosis</span>
        </span>
      )}
    </Link>
  );
}

export type ModuleTab = { key: string; label: string };

/** Header utama dengan navigasi pill modul (sesuai mockup) */
export function TopNav({
  modules, active, onSelect, userName, userRole, notif = false,
}: {
  modules: readonly ModuleTab[]; active: string; onSelect: (key: string) => void;
  userName: string; userRole: string; notif?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e4e8f4] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[74px] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        <TbcLogo />
        <nav aria-label="Navigasi modul" className="hidden rounded-full bg-[#DCF2DF] p-1.5 lg:flex lg:items-center">
          {modules.map((m) => (
            <button key={m.key} type="button" onClick={() => onSelect(m.key)} aria-current={active === m.key ? "page" : undefined}
              className={cn("min-h-11 rounded-full px-5 text-sm font-semibold transition-colors",
                active === m.key ? "bg-[#0B5A2A] text-white shadow" : "text-[#14532d] hover:bg-white/60")}>
              {m.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          {notif && (
            <span className="relative inline-flex size-10 items-center justify-center rounded-full text-[#14532d]" aria-label="Notifikasi">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 20a2.2 2.2 0 0 0 4 0" strokeLinecap="round" /></svg>
              <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-hidden="true" />
            </span>
          )}
          <div className="hidden text-right sm:block">
            <p className="text-sm font-bold text-[#123524]">{userName}</p>
            <p className="text-xs text-[#5b6478]">{userRole}</p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-full bg-[#0B5A2A] text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.5-3.4 4-5 7-5s5.5 1.6 7 5" strokeLinecap="round" /></svg>
          </span>
        </div>
      </div>
      {/* navigasi modul versi mobile */}
      <div className="overflow-x-auto border-t border-[#eef1f8] px-4 py-2 lg:hidden">
        <div className="flex gap-1.5">
          {modules.map((m) => (
            <button key={m.key} type="button" onClick={() => onSelect(m.key)} aria-current={active === m.key ? "page" : undefined}
              className={cn("min-h-10 shrink-0 rounded-full px-4 text-xs font-semibold", active === m.key ? "bg-[#0B5A2A] text-white" : "bg-[#DCF2DF] text-[#14532d]")}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/** Bar konteks fasilitas di bawah header */
export function FacilityBar({ name, subtitle, tag, roleTag }: { name: string; subtitle: string; tag?: string; roleTag?: string }) {
  return (
    <div className="rounded-2xl border border-[#e4e8f4] bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-[#E9F8EC] text-[#0B5A2A]" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" /><path d="M15 9h4a1 1 0 0 1 1 1v11" /><path d="M2 21h20" /><path d="M8 8h2m-2 4h2m-2 4h2" strokeLinecap="round" /></svg>
          </span>
          <div>
            <p className="text-sm font-bold text-[#123524]">{name}</p>
            <p className="text-xs text-[#5b6478]">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tag && <span className="rounded-full bg-[#EEF0FA] px-3 py-1.5 text-xs font-semibold text-[#4c5470]">{tag}</span>}
          {roleTag && <span className="rounded-full bg-[#DCF2DF] px-3 py-1.5 text-xs font-bold text-[#0B5A2A]">{roleTag}</span>}
        </div>
      </div>
    </div>
  );
}

/** Tab kedua (sub-tab) dengan pill putih di atas bar lavender */
export function SubTabs({ tabs, active, onChange }: { tabs: readonly ModuleTab[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-[#E9EBF7] p-2" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" type="button" aria-selected={active === t.key} onClick={() => onChange(t.key)}
          className={cn("min-h-11 rounded-xl px-5 text-sm font-semibold transition-colors",
            active === t.key ? "bg-white text-[#0B5A2A] shadow-sm" : "text-[#4c5470] hover:bg-white/50")}>
          {t.label}
          {active === t.key && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-[#1B7A3E]" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

/** Banner oranye "konsep pengembangan / data demo" */
export function DemoBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[#FDEBD3] px-5 py-4" role="note">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f7dcb4] text-[#8a5a12]" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 11v5" strokeLinecap="round" /></svg>
      </span>
      <div>
        <p className="text-sm font-bold text-[#8a5a12]">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-[#8a5a12]/90">{children}</p>
      </div>
    </div>
  );
}

/** Banner hijau keberhasilan / informasi aman */
export function SuccessBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[#E7F7EA] px-5 py-4" role="status">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#c9ecd2] text-[#0B5A2A]" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <div>
        <p className="text-sm font-bold text-[#0B5A2A]">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-[#1f7a3f]">{children}</p>
      </div>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-2xl border border-[#e4e8f4] bg-white p-6 shadow-[0_1px_2px_rgba(23,37,84,0.04)]", className)}>{children}</section>;
}

export function CardTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-[#123524]">{children}</h2>
        {sub && <p className="mt-1 text-sm text-[#5b6478]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Chip({ tone = "green", children }: { tone?: "green" | "amber" | "red" | "gray" | "blue"; children: ReactNode }) {
  const tones = {
    green: "bg-[#DCF2DF] text-[#0B5A2A]",
    amber: "bg-[#FDEBD3] text-[#8a5a12]",
    red: "bg-[#FDE3E1] text-[#b42318]",
    gray: "bg-[#EEF0FA] text-[#4c5470]",
    blue: "bg-[#E3EDFB] text-[#1d4f91]",
  } as const;
  return <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function FooterBar({ left, right }: { left: string; right: string }) {
  return (
    <footer className="mt-10 border-t border-[#e4e8f4] py-6">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 text-xs text-[#5b6478] sm:px-6">
        <p>{left}</p><p>{right}</p>
      </div>
    </footer>
  );
}

/** Footer gelap landing */
export function DarkFooter() {
  return (
    <footer className="mt-16 bg-[#0B3B1E] py-10 text-white">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <TbcLogo inverse />
          <nav aria-label="Tautan footer" className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-white/75">
            <Link className="hover:text-white" href={TBC_ROUTES.landing}>Beranda</Link>
            <Link className="hover:text-white" href={TBC_ROUTES.masuk}>Masuk</Link>
            <Link className="hover:text-white" href={TBC_ROUTES.daftar}>Daftar</Link>
            <Link className="hover:text-white" href={TBC_ROUTES.portal}>Portal Pasien</Link>
            <a className="hover:text-white" href="#statistik">Statistik &amp; GIS</a>
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/55">
          <p>© 2025 Dinas Kesehatan Provinsi Jawa Tengah. Terintegrasi dengan SITB Kemenkes RI.</p>
          <p>Kebijakan Privasi · Syarat Penggunaan</p>
        </div>
      </div>
    </footer>
  );
}

/* ---------- primitif kecil ---------- */

export function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#123524]">{label}{required && <span aria-hidden="true"> *</span>}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-[#5b6478]">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-[#d8dcea] bg-white px-4 text-sm text-[#123524] outline-none placeholder:text-[#9aa1b5] focus:border-[#1B7A3E] focus:ring-2 focus:ring-[#1B7A3E]/25";

export function PrimaryButton({ children, onClick, type = "button", className, disabled }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; className?: string; disabled?: boolean }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0B5A2A] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0e6b35] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5A2A]", className)}>{children}</button>;
}

export function GhostButton({ children, onClick, className, disabled }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#EEF0FA] px-6 text-sm font-semibold text-[#3f4660] transition hover:bg-[#e2e5f4] disabled:opacity-60", className)}>{children}</button>;
}

export function OutlineButton({ children, onClick, className, disabled }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#d8dcea] bg-white px-6 text-sm font-semibold text-[#123524] transition hover:bg-[#f4f5fb] disabled:opacity-60", className)}>{children}</button>;
}

/** Kartu statistik landing (angka besar + delta) */
export function StatTile({ icon, value, label, delta, up }: { icon: ReactNode; value: string; label: string; delta: string; up?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#e4e8f4] bg-white px-5 py-6 text-center">
      <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-[#E9F8EC] text-[#1B7A3E]" aria-hidden="true">{icon}</span>
      <p className="text-2xl font-extrabold text-[#123524]">{value}</p>
      <p className="mt-1 text-sm font-medium text-[#5b6478]">{label}</p>
      <p className={cn("mt-2 text-xs font-semibold", up ? "text-[#1B7A3E]" : "text-[#1B7A3E]")}>
        {up ? "▲" : "▼"} {delta}
      </p>
    </div>
  );
}

/** Diagram batang sederhana berbasis CSS (Tren kasus) */
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-56 items-end gap-3" role="img" aria-label={`Diagram batang: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-bold text-[#1B7A3E]">{d.value}</span>
          <div className="w-full max-w-16 rounded-t-lg bg-[#1B7A3E] transition-all" style={{ height: `${(d.value / max) * 170}px` }} />
          <span className="text-xs text-[#5b6478]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Dropdown kecil untuk filter demo */
export function SelectField({ label, options, value, onChange, locked }: { label: string; options: string[]; value: string; onChange: (v: string) => void; locked?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#123524]">{label}</span>
      <span className={cn("mt-2 flex min-h-12 items-center justify-between rounded-xl border px-4 text-sm", locked ? "border-[#d8dcea] bg-[#EEF0FA] text-[#3f4660]" : "border-[#d8dcea] bg-white")}>
        <select value={value} disabled={locked} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-sm outline-none" aria-label={label}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {locked && <svg viewBox="0 0 24 24" className="ml-2 size-4 shrink-0 text-[#5b6478]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>}
      </span>
    </label>
  );
}

/** Wrapper halaman aplikasi (pasien/nakes/admin) dengan state modul + sub-tab */
export function WorkspacePage({
  modules, userName, userRole, facility, facilitySub, facilityTag, roleTag, notif, footerLeft, footerRight, renderModule,
}: {
  modules: readonly { key: string; label: string }[]; userName: string; userRole: string;
  facility: string; facilitySub: string; facilityTag?: string; roleTag?: string; notif?: boolean;
  footerLeft: string; footerRight: string;
  renderModule: (key: string) => ReactNode;
}) {
  const [active, setActive] = useState(modules[0]!.key);
  return (
    <div className="min-h-dvh bg-[#F3F4FB]">
      <TopNav modules={modules} active={active} onSelect={setActive} userName={userName} userRole={userRole} notif={notif} />
      <main id="main-content" className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        <FacilityBar name={facility} subtitle={facilitySub} tag={facilityTag} roleTag={roleTag} />
        {renderModule(active)}
      </main>
      <FooterBar left={footerLeft} right={footerRight} />
    </div>
  );
}
