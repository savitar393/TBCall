"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronLeft, ChevronRight, CalendarDays, Bell, Pill, FlaskConical, Home, LogOut, Menu, UserRound, Activity, HeartHandshake, ShieldCheck, ShieldAlert, UsersRound, LayoutDashboard, ClipboardPlus, History, ArrowLeftRight, Search, Settings2, Network } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { applicationNavigation, applicationBreadcrumbs, navigationActive, patientOnly } from "@/lib/application-navigation";
import { AppBreadcrumbs } from "./application-patterns";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-preference";
import { Brand } from "./brand";
import { ApiFeedback } from "./api-feedback";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const {collapsed, toggle} = useSidebar();
  const [drawer, setDrawer] = useState(false);
  if (!session.user) return null;
  const user = session.user;
  const patientHome = patientOnly(user);
  const groups = applicationNavigation(user);
  const crumbs = applicationBreadcrumbs(pathname,user);
  const patient = user.roles.some(role => role.code === "PATIENT");
  const patientLinks = patient ? [{ href: "/portal", label: "Beranda", icon: Home }, { href: "/portal/calendar", label: "Kalender", icon: CalendarDays }, ...(user.permissions.includes("TREATMENT_READ") ? [{ href: "/portal/treatment", label: "Pengobatan", icon: Pill }] : []), ...(user.permissions.includes("NOTIFICATION_READ_SELF") ? [{ href: "/portal/notifications", label: "Notifikasi", icon: Bell }] : []), { href: "/portal/profile", label: "Profil", icon: UserRound }] : [];
  const identity = user.email ?? user.phone ?? "Pengguna TBCall";
  const icons: Record<string, typeof Home> = {
    "/": Home, "/portal": Home, "/portal/calendar": CalendarDays, "/portal/treatment": Pill,
    "/portal/monitoring": Activity, "/portal/notifications": Bell, "/portal/profile": UserRound,
    "/portal/support": HeartHandshake, "/portal/tpt": ShieldCheck, "/portal/alerts": ShieldAlert,
    "/laboratory": FlaskConical, "/dashboard": LayoutDashboard, "/patients": UsersRound,
    "/intake/new": ClipboardPlus, "/cases/history": History, "/referrals": ArrowLeftRight,
    "/contact-investigations": Search, "/alerts": ShieldAlert, "/notifications": Bell,
    "/supporting-cases": HeartHandshake, "/admin/users": UsersRound, "/admin/facilities": Building2,
    "/integrations": Network, "/#akun": Settings2,
  };
  const navigation = (mobile = false) => {
    return <nav id={mobile ? "mobile-nav" : "desktop-nav"} aria-label={`Navigasi utama ${mobile ? "seluler" : "desktop"}`} className="space-y-6">
      {groups.filter(group => group.links.length).map(group => <div key={group.title} role="group" aria-label={group.title} className="space-y-1">
        {group.title && <p aria-hidden="true" className={cn("mb-3 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground", !mobile && "sidebar-label")}>{group.title}</p>}
        {group.links.map(item => {
          const Icon = icons[item.href] ?? UserRound;
          const current = navigationActive(pathname,item.href,user);
          return <Link key={item.href} href={item.href} onClick={() => { if (mobile) setDrawer(false); }} aria-current={current ? "page" : undefined} title={collapsed && !mobile ? item.label : undefined}
            className={cn("sidebar-link relative flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors", current ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground", collapsed && !mobile && "px-4")}>
            <Icon aria-hidden="true" className="size-5 shrink-0"/><span className={!mobile ? "sidebar-label" : undefined}>{item.label}</span>
          </Link>;
        })}
      </div>)}
    </nav>;
  };
  return <div className="authenticated-app flex min-h-dvh">
    <a href="#main-content" className="skip-link">Lewati ke konten utama</a>
    <aside aria-label="Bar samping" data-expanded={!collapsed} className="sidebar-slot sticky top-0 z-40 hidden h-dvh shrink-0 lg:block">
      <div className={cn("sidebar-panel flex h-full flex-col border-r bg-white", !collapsed && "sidebar-panel-expanded")}>
        <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="sidebar-content flex min-h-full flex-col p-5">
          <div className="sidebar-brand relative h-12 shrink-0">
            <div className="sidebar-brand-full" aria-hidden={collapsed} inert={collapsed}><Brand /></div>
            <div className="sidebar-brand-compact" aria-hidden={!collapsed} inert={!collapsed}><Brand compact /></div>
          </div>
          <div className="mt-8">{navigation()}</div>
          {user.activeFacilities.length > 0 && <div aria-hidden={collapsed} className="sidebar-facility mt-auto pt-8"><div className="rounded-xl bg-background p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Fasilitas aktif</p><p className="mt-2 flex items-start gap-2 text-sm"><Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{user.activeFacilities[0]?.name}</p>{user.activeFacilities.length > 1 && <p className="mt-1 text-xs text-muted-foreground">dan {user.activeFacilities.length - 1} fasilitas lainnya</p>}</div></div>}
          </div>
        </div>
      </div>
      <Button variant="outline" size="icon" className="sidebar-toggle absolute top-6 rounded-full bg-white shadow-sm" title={collapsed ? "Perluas navigasi" : "Ciutkan navigasi"} aria-controls="desktop-nav" aria-expanded={!collapsed} aria-label={collapsed ? "Perluas navigasi" : "Ciutkan navigasi"} onClick={toggle}>
        {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </Button>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="app-topbar sticky top-0 z-30 flex min-h-18 items-center justify-between gap-3 border-b bg-white px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka navigasi"><Menu aria-hidden="true" /></Button></SheetTrigger>
            <SheetContent side="left" className="w-80 max-w-[90vw] overflow-y-auto">
              <SheetHeader><SheetTitle>Menu TBCall</SheetTitle><SheetDescription>Pilih halaman untuk melihat akun dan konteks akses Anda.</SheetDescription></SheetHeader>
              <div className="mt-8">{navigation(true)}</div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{patientHome ? "Ruang Anda" : "Ruang kerja"}</p><p className="mt-1 max-w-48 truncate text-sm font-semibold sm:max-w-none">{crumbs.at(-1)?.label ?? "TBCall"}</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <div className="hidden min-w-0 text-right sm:block"><p className="max-w-64 truncate text-sm font-medium">{identity}</p><p className="mt-1 text-xs text-muted-foreground">{user.roles.map(role => role.name).join(" · ") || "Akun aktif"}</p></div>
          <Button variant="outline" disabled={session.isPending} onClick={() => void session.logout().catch(() => {})}><LogOut aria-hidden="true" /><span>Keluar</span></Button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className={cn("app-workspace mx-auto max-w-7xl space-y-6 p-4 sm:p-7 lg:p-9", patient && "pb-28 sm:pb-28 lg:pb-10")}>
        <AppBreadcrumbs items={crumbs}/><ApiFeedback error={session.error} />{children}
      </main>
      {patient && <nav aria-label="Akses cepat pasien" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">{patientLinks.map(({ href, label, icon: Icon }) => {
        const current = navigationActive(pathname,href,user);
        return <Link href={href} key={href} aria-current={current ? "page" : undefined} className={cn("flex min-h-18 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px]", current ? "font-semibold text-primary" : "text-muted-foreground")}><Icon aria-hidden="true" className="size-5"/>{label}</Link>; })}</nav>}
      <footer className="mx-auto max-w-6xl px-5 pb-6 text-xs text-muted-foreground sm:px-8 lg:px-10">TBCall · Tuberculosis Monitoring System</footer>
    </div>
  </div>;
}
