import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { portalBackend, renderPortal, routing, failure } from "./portal-harness";
import * as f from "./portal-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));
it("patient-only menu has one destination per feature and retains secondary permissions", async () => {
  portalBackend(); await renderPortal("home"); await screen.findByRole("heading", {name:"Kegiatan hari ini"});
  const nav=within(screen.getByRole("navigation",{name:"Navigasi utama desktop"}));
  const links=nav.getAllByRole("link"); const paths=links.map(l=>l.getAttribute("href"));
  expect(new Set(paths).size).toBe(paths.length);
  expect(nav.getByRole("link",{name:"Beranda"})).toHaveAttribute("href","/portal");
  expect(nav.getByRole("link",{name:"Profil"})).toHaveAttribute("href","/portal/profile");
  expect(nav.queryByRole("link",{name:/Saya|Akun & akses|Data diri/})).not.toBeInTheDocument();
  expect(nav.getByRole("link",{name:"Terapi pencegahan (TPT)"})).toHaveAttribute("href","/portal/tpt");
  expect(nav.getByRole("link",{name:"Peringatan"})).toHaveAttribute("href","/portal/alerts");
  const collapse=screen.getByRole("button",{name:"Ciutkan navigasi"});
  expect(collapse).toHaveAttribute("title","Ciutkan navigasi");
  expect(screen.queryByText("Ciutkan menu")).not.toBeInTheDocument();
});
it("patient menu independently denies clinical destinations without their permissions",async()=>{
  portalBackend({...f.patient,permissions:[]}); await renderPortal("home"); await screen.findByRole("heading",{name:"Kegiatan hari ini"});
  const nav=within(screen.getByRole("navigation",{name:"Navigasi utama desktop"}));
  expect(nav.getByRole("link",{name:"Kalender"})).toBeInTheDocument();
  for(const name of ["Pengobatan","Pemantauan","Notifikasi","Peringatan","Terapi pencegahan (TPT)"]) expect(nav.queryByRole("link",{name})).not.toBeInTheDocument();
});
it("treatment exposes all follow-up records through progressive disclosure without extra writes",async()=>{
  const history=Array.from({length:24},(_,i)=>({...f.followUp,id:`10000000-0000-4000-8000-${String(i).padStart(12,"0")}`,followUpType:`Kunjungan fiktif ${i}`,status:"COMPLETED",completedAt:f.time}));
  const calls=portalBackend(f.patient,c=>c.url.split("?")[0].endsWith("/follow-ups")?Response.json(history):undefined);
  await renderPortal("treatment");
  const toggle=await screen.findByText("Riwayat dan kunjungan lainnya (24)");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  await userEvent.click(toggle);
  expect(toggle.closest("details")).toHaveAttribute("open");
  const summaries=toggle.closest("details")!.querySelectorAll(":scope > div > details > summary");
  expect(summaries).toHaveLength(24);
  history.forEach(follow=>expect([...summaries].some(summary=>summary.textContent?.includes(follow.followUpType))).toBe(true));
  expect(calls.every(c=>!c.options.method||c.options.method==="GET")).toBe(true);
});
it("profile separates account and medical details without a duplicate navigation grid",async()=>{
  portalBackend(); await renderPortal("profile"); await screen.findByText(f.selfPatient.fullName);
  expect(screen.getByRole("heading",{level:1,name:"Profil"})).toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"Akun Anda"})).toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"Data pribadi"})).toBeInTheDocument();
  expect(screen.queryByRole("region",{name:"Bagian portal"})).not.toBeInTheDocument();
});


it("authorized follow-up history remains available when no current treatment is returned", async()=>{
  portalBackend(f.patient,c=>c.url.split("?")[0].endsWith("/treatment")?new Response(null,{status:404}):undefined);
  await renderPortal("treatment");
  await screen.findByRole("heading",{name:"Tindak lanjut berikutnya"});
  expect(await screen.findByText(f.followUp.followUpType,{selector:"summary span"})).toBeInTheDocument();
  await screen.findByText("Belum ada catatan pengobatan.");
  expect(screen.queryByRole("region",{name:"Ringkasan pengobatan"})).not.toBeInTheDocument();
});

it("supporter dose disclosure preserves the authoritative actor-specific label", async()=>{
  portalBackend(f.supporter,c=>c.url.split("?")[0].endsWith("/dose-events")?Response.json(f.page({...f.dose,status:"TAKEN_SELF_REPORTED"})):undefined);
  await renderPortal("case");
  expect(await screen.findByText(/Diminum berdasarkan laporan$/,{selector:"summary"})).toBeInTheDocument();
  expect(screen.queryByText(/Diminum berdasarkan laporan sendiri/,{selector:"summary"})).not.toBeInTheDocument();
});
it("treatment refetch failure does not hide independently authorized follow-ups", async()=>{
  let reject=false;
  portalBackend(f.patient,c=>reject&&c.url.split("?")[0].endsWith("/treatment")?failure(503,"TEMPORARY"):undefined);
  await renderPortal("treatment");
  await screen.findByRole("region",{name:"Ringkasan pengobatan"});
  await screen.findByText(f.followUp.followUpType,{selector:"summary span"});
  reject=true;
  await userEvent.click(screen.getByRole("button",{name:"Muat ulang catatan"}));
  await screen.findByRole("button",{name:"Coba kembali"});
  expect(screen.getByRole("heading",{name:"Tindak lanjut berikutnya"})).toBeInTheDocument();
  expect(screen.getByText(f.followUp.followUpType,{selector:"summary span"})).toBeInTheDocument();
});
