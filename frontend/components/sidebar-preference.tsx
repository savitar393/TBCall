"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const SidebarContext = createContext<{collapsed:boolean; toggle:()=>void} | null>(null);

// Root lifetime keeps this presentation-only choice across client page remounts.
// No browser storage: reloads start expanded, matching the server-rendered state.
export function SidebarProvider({children}:{children:ReactNode}) {
  const [collapsed,setCollapsed] = useState(false);
  const value = useMemo(()=>({collapsed,toggle:()=>setCollapsed(current=>!current)}),[collapsed]);
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
export function useSidebar() {
  const state = useContext(SidebarContext);
  if (!state) throw new Error("SidebarProvider is required");
  return state;
}
