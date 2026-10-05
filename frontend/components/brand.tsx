import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <Link href="/" aria-label="TBCall" className={cn("inline-flex items-center gap-3 rounded-lg font-semibold tracking-tight", inverse ? "text-white" : "text-foreground")}>
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", inverse ? "bg-white/15 text-white" : "bg-primary text-white")}><HeartPulse aria-hidden="true" className="size-6" /></span>
    <span className={compact ? "sr-only" : "text-2xl"}>TBCall<span className="ml-1 text-primary">.</span></span>
  </Link>;
}
