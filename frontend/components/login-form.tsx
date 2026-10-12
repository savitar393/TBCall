"use client";
import { useState } from "react";
import { z } from "@/lib/validation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { apiRequest } from "@/lib/api/client";
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
  const { register, handleSubmit, resetField, watch, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { identity: "", password: "" } });
  const pending = isSubmitting || session.isPending;
  const unavailable = session.status === "loading" || session.status === "unavailable";

  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetIdentity, setResetIdentity] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const currentIdentity = watch("identity");

  const handleOpenReset = () => {
    setResetOpen(true);
    setResetStep("request");
    setResetIdentity(currentIdentity || "");
    setResetMessage(null);
    setResetError(null);
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetIdentity.trim()) {
      setResetError("Masukkan email atau nomor telepon Anda.");
      return;
    }
    setResetLoading(true);
    setResetError(null);
    setResetMessage(null);
    try {
      await apiRequest("/v1/auth/password-reset/request", {
        method: "POST",
        body: { identity: resetIdentity.trim() },
      });
      setResetMessage("Jika akun terdaftar, tautan/kode reset telah dikirim ke email atau WhatsApp Anda.");
      setResetStep("confirm");
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Gagal meminta reset kata sandi.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken.trim() || !newPassword) {
      setResetError("Token dan kata sandi baru wajib diisi.");
      return;
    }
    if (newPassword.length < 8) {
      setResetError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    setResetLoading(true);
    setResetError(null);
    try {
      await apiRequest("/v1/auth/password-reset/confirm", {
        method: "POST",
        body: { token: resetToken.trim(), newPassword },
      });
      setResetMessage("Kata sandi berhasil diperbarui! Silakan masuk dengan kata sandi baru.");
      setTimeout(() => {
        setResetOpen(false);
        setResetStep("request");
        setResetToken("");
        setNewPassword("");
      }, 2000);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Gagal mereset kata sandi.");
    } finally {
      setResetLoading(false);
    }
  };

  if (resetOpen) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-semibold text-foreground">Pemulihan Kata Sandi</h3>
          <button type="button" onClick={() => setResetOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
            Batal
          </button>
        </div>

        {resetStep === "request" ? (
          <form noValidate className="space-y-4" onSubmit={handleRequestReset}>
            <p className="text-xs text-muted-foreground">
              Masukkan email atau nomor telepon yang terdaftar pada akun TBCall Anda.
            </p>
            <div className="space-y-2">
              <Label htmlFor="reset-identity">Email atau nomor telepon</Label>
              <Input
                id="reset-identity"
                value={resetIdentity}
                onChange={(e) => setResetIdentity(e.target.value)}
                placeholder="nama@contoh.id atau 0812xxxx"
                disabled={resetLoading}
              />
            </div>
            {resetError && <p role="alert" className="text-xs text-destructive">{resetError}</p>}
            {resetMessage && <p role="status" className="text-xs text-primary">{resetMessage}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={resetLoading} className="w-full">
                {resetLoading ? "Mengirim…" : "Kirim Instruksi Reset"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setResetStep("confirm")}>
                Sudah Punya Token
              </Button>
            </div>
          </form>
        ) : (
          <form noValidate className="space-y-4" onSubmit={handleConfirmReset}>
            <p className="text-xs text-muted-foreground">
              Masukkan token yang Anda terima melalui email/WhatsApp dan tentukan kata sandi baru.
            </p>
            <div className="space-y-2">
              <Label htmlFor="reset-token">Token reset</Label>
              <Input
                id="reset-token"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Tempel token di sini"
                disabled={resetLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-new-password">Kata sandi baru (min. 8 karakter)</Label>
              <Input
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Kata sandi baru"
                disabled={resetLoading}
              />
            </div>
            {resetError && <p role="alert" className="text-xs text-destructive">{resetError}</p>}
            {resetMessage && <p role="status" className="text-xs text-primary font-semibold">{resetMessage}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={resetLoading} className="w-full">
                {resetLoading ? "Menyimpan…" : "Simpan Kata Sandi Baru"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setResetStep("request")}>
                Kembali
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

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
      <div className="flex items-center justify-between">
        <Label htmlFor="login-password">Kata sandi</Label>
        <button
          type="button"
          onClick={handleOpenReset}
          className="text-xs text-primary hover:underline"
        >
          Lupa kata sandi?
        </button>
      </div>
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
