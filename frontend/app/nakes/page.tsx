import type { Metadata } from "next";
import { RuangNakesLive } from "@/components/tbc/live/nakes";

export const metadata: Metadata = { title: "Ruang Nakes/Dokter" };

export default function Page() {
  return <RuangNakesLive />;
}
