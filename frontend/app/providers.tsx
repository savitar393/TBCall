"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setNonce } from "get-nonce";
import { SessionProvider } from "@/lib/auth/session";

export function AppProviders({ children, nonce }: { children: ReactNode; nonce?: string }) {
  const [client] = useState(() => {
    // Keep the initial document nonce across client navigation. Radix's scroll
    // lock stylesheet uses this helper before injecting its style element.
    if (typeof window !== "undefined") setNonce(nonce ?? "");
    return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } } });
  });
  return <QueryClientProvider client={client}><SessionProvider>{children}</SessionProvider></QueryClientProvider>;
}
