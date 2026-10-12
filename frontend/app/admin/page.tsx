import type { Metadata } from "next";
import { RuangAdminLive } from "@/components/tbc/live/admin";

export const metadata: Metadata = { title: "Ruang Admin Faskes" };

export default function Page() {
  return <RuangAdminLive />;
}
