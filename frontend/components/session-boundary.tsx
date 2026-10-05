"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { ApiFeedback } from "./api-feedback";
import { Button } from "./ui/button";

export function SessionBoundary({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  useEffect(() => { if (session.status === "anonymous") router.replace("/login"); }, [session.status, router]);
  if (session.status === "unavailable") return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 p-6">
    <h1 className="text-2xl font-semibold">Layanan belum tersedia</h1>
    <ApiFeedback error={session.error} />
    <Button onClick={() => void session.refresh().catch(() => {})}>Coba kembali</Button>
  </main>;
  if (session.status !== "authenticated") return <main className="flex min-h-dvh items-center justify-center"><p role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> Memeriksa sesi Anda…</p></main>;
  return <>{children}</>;
}
