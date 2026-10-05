"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronLeft, ChevronRight, Home, LogOut, Menu, UserRound } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { filterNavigation, foundationNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { ApiFeedback } from "./api-feedback";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  if (!session.user) return null;
  const user = session.user;
  const items = filterNavigation(foundationNavigation, user.permissions);
  const identity = user.email ?? user.phone ?? "Pengguna TBCall";
  const navigation = (mobile = false) => <nav id={mobile ? "mobile-nav" : "desktop-nav"} aria-label={`Navigasi utama ${mobile ? "seluler" : "desktop"}`} className="space-y-2">
    {items.map((item) => {
      const Icon = item.href === "/" ? Home : UserRound;
      return <Link key={item.href} href={item.href} onClick={() => setDrawer(false)} aria-current={item.href === pathname ? "page" : undefined} title={collapsed && !mobile ? item.label : undefined}
        className={cn("flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors", item.href === pathname ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground", collapsed && !mobile && "justify-center px-2")}>
        <Icon aria-hidden="true" className="size-5 shrink-0" /><span className={collapsed && !mobile ? "sr-only" : ""}>{item.label}</span>
      </Link>;
    })}
  </nav>;
  return <div className="flex min-h-dvh">
    <a href="#main-content" className="skip-link">Lewati ke konten utama</a>
    <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-white p-5 lg:flex", collapsed ? "w-24" : "w-72")}>
      <Brand compact={collapsed} />
      <div className="mt-10">{navigation()}</div>
      <div className="mt-auto space-y-5 pt-8">
        {!collapsed && <div className="rounded-xl bg-background p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Fasilitas aktif</p><p className="mt-2 flex items-start gap-2 text-sm"><Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{user.activeFacilities[0]?.name ?? "Belum ada fasilitas aktif"}</p>{user.activeFacilities.length > 1 && <p className="mt-1 text-xs text-muted-foreground">dan {user.activeFacilities.length - 1} fasilitas lainnya</p>}</div>}
        <Button variant="ghost" className="w-full" aria-controls="desktop-nav" aria-expanded={!collapsed} aria-label={collapsed ? "Perluas navigasi" : "Ciutkan navigasi"} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight aria-hidden="true" /> : <><ChevronLeft aria-hidden="true" /><span>Ciutkan menu</span></>}
        </Button>
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 flex min-h-20 items-center justify-between gap-4 border-b bg-white px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka navigasi"><Menu aria-hidden="true" /></Button></SheetTrigger>
            <SheetContent side="left" className="w-80 max-w-[90vw]">
              <SheetHeader><SheetTitle>Menu TBCall</SheetTitle><SheetDescription>Pilih halaman untuk melihat akun dan konteks akses Anda.</SheetDescription></SheetHeader>
              <div className="mt-8">{navigation(true)}</div>
            </SheetContent>
          </Sheet>
          <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ruang kerja</p><p className="mt-1 text-sm font-semibold">TBCall</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <div className="hidden min-w-0 text-right sm:block"><p className="max-w-64 truncate text-sm font-medium">{identity}</p><p className="mt-1 text-xs text-muted-foreground">{user.roles.map(role => role.name).join(" · ") || "Akun aktif"}</p></div>
          <Button variant="outline" disabled={session.isPending} onClick={() => void session.logout().catch(() => {})}><LogOut aria-hidden="true" /><span>Keluar</span></Button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl space-y-7 p-5 sm:p-8 lg:p-10">
        <ApiFeedback error={session.error} />{children}
      </main>
      <footer className="mx-auto max-w-6xl px-5 pb-6 text-xs text-muted-foreground sm:px-8 lg:px-10">TBCall · Tuberculosis Monitoring System</footer>
    </div>
  </div>;
}
