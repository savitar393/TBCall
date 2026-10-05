import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppProviders } from "./providers";
import "./globals.css";

export const metadata: Metadata = { title: { default: "TBCall", template: "%s | TBCall" }, description: "Tuberculosis Monitoring System" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers forces dynamic rendering for the per-request CSP nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <html lang="id"><body><AppProviders nonce={nonce}>{children}</AppProviders></body></html>;
}
