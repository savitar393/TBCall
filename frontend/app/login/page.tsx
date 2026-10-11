"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { useSession } from "@/lib/auth/session";
import { AuthFrame } from "@/features/onboarding/auth-frame";
export default function LoginPage() {
 const session=useSession(); const router=useRouter();
 useEffect(()=>{if(session.status==="authenticated")router.replace("/");},[session.status,router]);
 if(session.status==="authenticated")return <p role="status" className="p-8 text-muted-foreground">Membuka beranda…</p>;
 return <AuthFrame title="Masuk ke akun Anda" description="Gunakan akun yang telah terdaftar untuk melanjutkan."><LoginForm/></AuthFrame>;
}
