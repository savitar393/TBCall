"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { useSession } from "@/lib/auth/session";

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => { if (session.status === "authenticated") router.replace("/"); }, [session.status, router]);
  if (session.status === "authenticated") return <p role="status" className="p-8 text-muted-foreground">Membuka beranda…</p>;
  return <main className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
    <section className="relative hidden overflow-hidden bg-[#123e38] p-12 text-white lg:flex lg:flex-col xl:p-16">
      <div aria-hidden="true" className="absolute -right-24 top-32 size-96 rounded-full border border-white/10" /><div aria-hidden="true" className="absolute -right-4 top-52 size-56 rounded-full border border-white/10" />
      <div className="relative my-auto max-w-md py-20"><div className="login-mark mb-6"><Image src="/brand/logo.png" alt="TBCall" width={1600} height={1600} priority sizes="576px" className="h-auto w-full" /></div><p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-200">Pendampingan pengobatan TBC</p><h2 className="mt-5 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Terhubung untuk pendampingan yang berkelanjutan.</h2><p className="mt-6 leading-relaxed text-white/70">Satu ruang kerja bagi tim pelayanan, pasien, dan pendamping pengobatan.</p></div>
      <p className="text-xs text-white/60">TBCall · Bersama mendukung pelayanan TBC</p>
    </section>
    <section className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 xl:px-24">
      <div className="mx-auto w-full max-w-md"><div className="login-mark login-mark-mobile mb-8 lg:hidden"><Image src="/brand/logo.png" alt="TBCall" width={1600} height={1600} priority sizes="384px" className="h-auto w-full" /></div><p className="text-sm font-medium text-primary">Selamat datang di TBCall</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Masuk ke akun Anda</h1><p className="mb-9 mt-3 text-sm leading-relaxed text-muted-foreground">Gunakan akun yang telah terdaftar untuk melanjutkan.</p><LoginForm /><Link href="/" className="mt-6 inline-flex text-sm font-medium text-primary underline underline-offset-4">Kembali ke beranda publik</Link><p className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground"><LockKeyhole aria-hidden="true" className="size-4" />Jaga kerahasiaan akun Anda.</p></div>
    </section>
  </main>;
}
