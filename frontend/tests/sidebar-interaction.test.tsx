import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { AppShell } from "@/components/app-shell";
import { portalBackend } from "./portal-harness";
import * as f from "./portal-fixtures";

const location = vi.hoisted(() => ({ pathname: "/portal" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname, useRouter: () => ({replace:vi.fn()}) }));
function page(key = "home") {
  return <AppProviders><AppShell key={key}><h1>Contoh konten</h1><button>Kontrol konten</button></AppShell></AppProviders>;
}
async function setup(user = f.patient) {
  location.pathname = "/portal";
  const calls = portalBackend(user);
  const view = render(page());
  await screen.findByRole("navigation", {name:"Navigasi utama desktop"});
  return {view, calls, user:userEvent.setup()};
}
it("desktop sidebar starts pinned expanded and preserves the active patient home", async()=>{
  await setup();
  expect(screen.getByRole("button",{name:"Ciutkan navigasi"})).toHaveAttribute("aria-expanded","true");
  expect(within(screen.getByRole("navigation",{name:"Navigasi utama desktop"})).getByRole("link",{name:"Beranda"})).toHaveAttribute("aria-current","page");
});
it.each([["Kalender","/portal/calendar"],["Pengobatan","/portal/treatment"],["Profil","/portal/profile"]])("%s navigation and a page remount preserve the expanded state",async(name,href)=>{
  const {view,user,calls}=await setup();
  await user.click(within(screen.getByRole("navigation",{name:"Navigasi utama desktop"})).getByRole("link",{name}));
  expect(screen.getByRole("button",{name:"Ciutkan navigasi"})).toHaveAttribute("aria-expanded","true");
  location.pathname=href; view.rerender(page(href));
  expect(screen.getByRole("button",{name:"Ciutkan navigasi"})).toHaveAttribute("aria-expanded","true");
  expect(within(screen.getByRole("navigation",{name:"Navigasi utama desktop"})).getByRole("link",{name})).toHaveAttribute("aria-current","page");
  expect(calls.every(c=>!c.options.method||c.options.method==="GET")).toBe(true);
});
it("main clicks, main focus and Escape never change the pinned state",async()=>{
  const {user}=await setup();
  await user.click(screen.getByRole("heading",{name:"Contoh konten"}));
  screen.getByRole("button",{name:"Kontrol konten"}).focus();
  await user.keyboard("{Escape}");
  const nav=within(screen.getByRole("navigation",{name:"Navigasi utama desktop"}));
  nav.getByRole("link",{name:"Kalender"}).focus(); await user.keyboard("{Escape}");
  expect(screen.getByRole("button",{name:"Ciutkan navigasi"})).toHaveAttribute("aria-expanded","true");
});
it("only explicit keyboard toggles change state and collapsed preference survives page remount",async()=>{
  const {view,user}=await setup();
  const toggle=screen.getByRole("button",{name:"Ciutkan navigasi"});
  toggle.focus(); await user.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-expanded","false"); expect(toggle).toHaveFocus();
  const nav=within(screen.getByRole("navigation",{name:"Navigasi utama desktop"}));
  for(const name of ["Kalender","Pengobatan","Profil"]) expect(nav.getByRole("link",{name})).toHaveAttribute("title",name);
  location.pathname="/portal/profile"; view.rerender(page("profile"));
  const expand=screen.getByRole("button",{name:"Perluas navigasi"});
  expect(expand).toHaveAttribute("aria-expanded","false");
  expand.focus(); await user.keyboard(" ");
  expect(expand).toHaveAttribute("aria-expanded","true"); expect(expand).toHaveFocus();
});
it("mobile navigation closes only its drawer and retains the desktop preference",async()=>{
  const {user}=await setup();
  await user.click(screen.getByRole("button",{name:"Ciutkan navigasi"}));
  const mobile=screen.getByRole("button",{name:"Buka navigasi"});
  await user.click(mobile);
  const drawer=within(screen.getByRole("navigation",{name:"Navigasi utama seluler"}));
  await user.click(drawer.getByRole("link",{name:"Profil"}));
  expect(screen.queryByRole("navigation",{name:"Navigasi utama seluler"})).not.toBeInTheDocument();
  expect(mobile).toHaveAttribute("aria-expanded","false");
  expect(screen.getByRole("button",{name:"Perluas navigasi"})).toHaveAttribute("aria-expanded","false");
});
it("changing sidebar presentation never admits independently denied patient destinations",async()=>{
  const {user}=await setup({...f.patient,permissions:[]});
  await user.click(screen.getByRole("button",{name:"Ciutkan navigasi"}));
  await user.click(screen.getByRole("button",{name:"Perluas navigasi"}));
  const nav=within(screen.getByRole("navigation",{name:"Navigasi utama desktop"}));
  for(const name of ["Pengobatan","Pemantauan","Notifikasi","Peringatan","Terapi pencegahan (TPT)"]) expect(nav.queryByRole("link",{name})).not.toBeInTheDocument();
  expect(nav.getByRole("link",{name:"Kalender"})).toBeInTheDocument();
});
