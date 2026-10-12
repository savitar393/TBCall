import type { Metadata } from "next";
import LandingPage from "@/components/tbc/landing";

export const metadata: Metadata = { title: "TB Call Center Jawa Tengah", description: "Platform terintegrasi pemantauan dan deteksi dini Tuberkulosis Provinsi Jawa Tengah." };

export default function Page() {
  return <LandingPage />;
}
