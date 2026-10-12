import type { Metadata } from "next";
import { AuthShell, VerifikasiKontak } from "@/components/tbc/auth";

export const metadata: Metadata = { title: "Verifikasi Kontak & Aktivasi" };

export default function Page() {
  return <AuthShell><VerifikasiKontak /></AuthShell>;
}
