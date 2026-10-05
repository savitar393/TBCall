"use client";
import { z } from "@/lib/validation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { ApiFeedback } from "./api-feedback";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const schema = z.object({
  identity: z.string().trim().min(1, "Identitas login wajib diisi.").max(254, "Identitas terlalu panjang."),
  password: z.string().min(1, "Kata sandi wajib diisi.").max(128, "Kata sandi terlalu panjang."),
});

export function LoginForm() {
  const session = useSession();
  const { register, handleSubmit, resetField, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { identity: "", password: "" } });
  const pending = isSubmitting || session.isPending;
  const unavailable = session.status === "loading" || session.status === "unavailable";
  return <form noValidate className="space-y-6" onSubmit={handleSubmit(async (input) => {
    try { await session.login(input); } catch { /* Safe context error is rendered below. */ }
    finally { resetField("password"); }
  })}>
    <div className="space-y-2">
      <Label htmlFor="login-identity">Email atau nomor telepon</Label>
      <Input id="login-identity" autoComplete="username" maxLength={254} disabled={pending} aria-invalid={!!errors.identity} aria-describedby={errors.identity ? "identity-error" : undefined} placeholder="Email atau nomor telepon terdaftar" {...register("identity")} />
      {errors.identity && <p id="identity-error" role="alert" className="text-sm text-destructive">{errors.identity.message}</p>}
    </div>
    <div className="space-y-2">
      <Label htmlFor="login-password">Kata sandi</Label>
      <Input id="login-password" type="password" autoComplete="current-password" maxLength={128} disabled={pending} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />
      {errors.password && <p id="password-error" role="alert" className="text-sm text-destructive">{errors.password.message}</p>}
    </div>
    <ApiFeedback error={session.error} />
    <Button className="w-full" type="submit" disabled={pending || unavailable}>
      {pending ? <><LoaderCircle aria-hidden="true" className="animate-spin" /> Memproses…</> : <>Masuk <ArrowRight aria-hidden="true" /></>}
    </Button>
    {session.status === "loading" && <p role="status" className="text-center text-sm text-muted-foreground">Memeriksa sesi Anda…</p>}
    {session.status === "unavailable" && <Button className="w-full" type="button" variant="outline" onClick={() => void session.refresh().catch(() => {})}>Coba kembali</Button>}
  </form>;
}
