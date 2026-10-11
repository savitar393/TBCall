import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <Link href="/" aria-label="TBCall" className={cn("inline-flex items-center gap-3 rounded-lg font-semibold tracking-tight", inverse ? "text-white" : "text-foreground")}>
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", inverse ? "bg-white/15 text-white" : "bg-primary text-white")}><span className="relative block size-11 overflow-hidden rounded-xl bg-white"><Image src="/brand/logo.jpeg" alt="" width={1600} height={1600} sizes="100px" className="absolute left-1/2 top-1/2 w-24 max-w-none -translate-x-1/2 -translate-y-1/2"/></span></span>
    <span className={compact ? "sr-only" : "text-2xl"}>TBCall<span className="ml-1 text-inherit">.</span></span>
  </Link>;
}
