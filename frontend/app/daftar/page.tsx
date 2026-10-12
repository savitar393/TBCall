import type { Metadata } from "next";
import { AuthShell, DaftarWizard } from "@/components/tbc/auth";

export const metadata: Metadata = { title: "Daftar Akun" };

export default function Page() {
  return <AuthShell><DaftarWizard /></AuthShell>;
}
