import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <Link href="/" aria-label="TBCall" className={cn("relative inline-flex shrink-0 items-center rounded-lg", compact ? "size-12" : "h-12 w-40 sm:w-60", inverse && "text-white")}>
    <span className={cn("relative block h-full w-full overflow-hidden",compact && "rounded-lg")}>
      <Image src={compact ? "/brand/logo.png" : "/brand/long-logo.png"} alt="" width={1563} height={1563} sizes={compact ? "48px" : "(max-width: 639px) 160px, 240px"} className={compact ? "absolute left-0 top-1/2 w-full -translate-y-1/2" : "absolute left-0 top-1/2 w-full -translate-y-[45%]"}/>
    </span>
  </Link>;
}
