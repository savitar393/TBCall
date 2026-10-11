import Link from "next/link";
import { AlertCircle, ChevronRight, CircleCheck, Info, LoaderCircle, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Breadcrumb } from "@/lib/application-navigation";

export function AppBreadcrumbs({ items }: { items: Breadcrumb[] }) {
  return <nav aria-label="Jejak navigasi" className="text-xs text-muted-foreground"><ol className="flex flex-wrap items-center gap-x-2 gap-y-1">{items.map((item, index) => <li key={`${index}-${item.label}`} className="flex items-center gap-2">
    {index > 0 && <ChevronRight aria-hidden="true" className="size-3" />}
    {item.href ? <Link className="rounded hover:text-primary hover:underline" href={item.href}>{item.label}</Link> : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>}
  </li>)}</ol></nav>;
}
export function AppPageHeader({ title, description, eyebrow, actions }: { title: string; description?: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return <header role="generic" className="app-page-header"><div className="min-w-0">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="page-title">{title}</h1>{description && <div className="page-description">{description}</div>}</div>{actions && <div className="app-actions">{actions}</div>}</header>;
}
export function AppSection({ title, description, actions, children, className }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section aria-label={title} className={cn("surface space-y-4", className)}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="section-title">{title}</h2>{description && <div className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</div>}</div>{actions && <div className="app-actions">{actions}</div>}</div>{children}</section>;
}
export function AppState({ kind, title, children, action }: { kind: "loading" | "empty" | "restricted" | "unavailable" | "success" | "error"; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = kind === "loading" ? LoaderCircle : kind === "restricted" ? ShieldCheck : kind === "success" ? CircleCheck : kind === "error" ? AlertCircle : Info;
  return <div role={kind === "error" ? "alert" : kind === "loading" || kind === "success" ? "status" : undefined} aria-live={kind === "loading" ? "polite" : undefined} className={cn("app-state", `app-state-${kind}`)}><Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", kind === "loading" && "motion-safe:animate-spin")} /><div className="min-w-0"><p className="font-medium">{title}</p>{children && <div className="mt-2 text-sm leading-6 text-muted-foreground">{children}</div>}{action && <div className="mt-4">{action}</div>}</div></div>;
}
export function AppStatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "active" | "warning" | "complete" }) {
  return <span className={cn("app-status", `app-status-${tone}`)}>{children}</span>;
}
export function AppDisclosure({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="app-disclosure" open={open}><summary>{title}</summary><div className="space-y-4 pb-4 pt-2">{children}</div></details>;
}
export function AppFormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <fieldset className="app-form-section"><legend className="px-2 text-base font-semibold">{title}</legend>{description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}{children}</fieldset>;
}
export function AppTable({ caption, children }: { caption: string; children: ReactNode }) {
  return <div className="app-table-scroll" tabIndex={0} role="region" aria-label={caption}><table className="app-table"><caption className="sr-only">{caption}</caption>{children}</table></div>;
}
export function AppViewLinks({ label, items }: { label: string; items: { label: string; href: string; current: boolean }[] }) {
  return <nav aria-label={label} className="app-view-links">{items.map(item => <Link key={item.href} href={item.href} aria-current={item.current ? "page" : undefined}>{item.label}</Link>)}</nav>;
}
