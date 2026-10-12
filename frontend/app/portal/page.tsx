import type { Metadata } from "next";
import { PortalPasienLive } from "@/components/tbc/live/portal";

export const metadata: Metadata = { title: "Portal Pasien" };

export default function Page() {
  return <PortalPasienLive />;
}
