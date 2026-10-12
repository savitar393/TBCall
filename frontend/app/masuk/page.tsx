import type { Metadata } from "next";
import { AuthShell, MasukForm } from "@/components/tbc/auth";

export const metadata: Metadata = { title: "Masuk" };

export default function Page() {
  return <AuthShell><MasukForm /></AuthShell>;
}
