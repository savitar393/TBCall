import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useSession } from "@/lib/auth/session";
import { labQueries } from "@/features/laboratory/queries";
import { labStaff, labOfficer, labPage, labDetail, labIds, resultResponse, labSpecimen } from "./laboratory-fixtures";
import { labBackend, renderLab, routing, failure } from "./laboratory-harness";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/laboratory" }));
it.each(["references", "requests", "request"] as const)("%s key belongs to user and consumes AbortSignal", async name => {
  const client = new QueryClient({ defaultOptions:{queries:{retry:false}} }); const calls=labBackend();
  const options = {references:labQueries.references(labOfficer.id),requests:labQueries.requests(labOfficer.id,{page:0,size:20}),request:labQueries.request(labOfficer.id,labIds.request)}[name];
  expect(options.queryKey.slice(0,2)).toEqual(["laboratory",labOfficer.id]);
  await client.fetchQuery(options as ReturnType<typeof labQueries.references>); expect(calls[0].options.signal).toBeInstanceOf(AbortSignal); client.clear();
});
it("late old-account GET is aborted and never cached/rendered for the new account", async () => {
  let changed=false; let resolve!: (r:Response)=>void; let signal:AbortSignal|undefined; let client!:QueryClient;
  labBackend(c=>c.url.endsWith("/me")?Response.json(changed?{...labOfficer,id:"new-account"}:labOfficer):c.url.includes("/lab-requests?")?changed?Response.json({...labPage,content:[{...labPage.content[0],patient:{...labDetail.patient,fullName:"Pasien akun baru"}}]}):(signal=c.options.signal as AbortSignal,new Promise<Response>(r=>{resolve=r;})):undefined);
  function Switch(){ const session=useSession(); client=useQueryClient(); return <button onClick={()=>{changed=true;void session.refresh();}}>Ganti akun</button>; }
  await renderLab("queue",{},<Switch/>); await waitFor(()=>expect(resolve).toBeDefined()); await userEvent.click(screen.getByText("Ganti akun")); await screen.findByText("Pasien akun baru"); expect(signal?.aborted).toBe(true);
  await act(async()=>{resolve(Response.json(labPage));await Promise.resolve();}); expect(screen.queryByText(labDetail.patient.fullName)).not.toBeInTheDocument(); expect(client.getQueryCache().findAll({queryKey:["laboratory",labOfficer.id]})).toHaveLength(0);
});
it.each([["result",false],["specimen",false],["result",true],["specimen",true]] as const)("late old-account %s command (error=%s) is aborted and cannot invalidate/navigate/render in new account", async (kind, fails)=>{
  let changed=false; let resolve!:(r:Response)=>void; let signal:AbortSignal|undefined; let client!:QueryClient; const actor=kind==="result"?labStaff:labOfficer;
  const calls=labBackend(c=>c.url.endsWith("/me")?Response.json(changed?{...actor,id:"new-account"}:actor):c.options.method==="POST"?(signal=c.options.signal as AbortSignal,new Promise<Response>(r=>{resolve=r;})):undefined,actor);
  function Switch(){const session=useSession();client=useQueryClient();return <button onClick={()=>{changed=true;void session.refresh().then(()=>client.setQueryData(["laboratory","new-account","sentinel"],"new-data"));}}>Ganti akun</button>;}
  await renderLab("detail",{id:labIds.request},<Switch/>); await userEvent.click(await screen.findByRole("button",{name:kind==="result"?"Catat hasil Molekuler langsung":"Catat spesimen"}));
  if(kind==="result"){await userEvent.type(screen.getByLabelText(/Waktu pemeriksaan/),"2026-09-01T12:00");await userEvent.type(screen.getByLabelText("Kode hasil"),"Old draft");}else await userEvent.type(screen.getByLabelText(/Jenis spesimen/),"Old draft");
  await userEvent.click(screen.getByRole("button",{name:kind==="result"?"Simpan hasil":"Simpan spesimen"}));await waitFor(()=>expect(resolve).toBeDefined());await userEvent.click(screen.getByText("Ganti akun"));await screen.findByRole("button",{name:kind==="result"?"Catat hasil Molekuler langsung":"Catat spesimen"});expect(signal?.aborted).toBe(true);const count=calls.length;
  routing.replace.mockClear(); await act(async()=>{resolve(fails ? failure(401,"AUTHENTICATION_REQUIRED") : Response.json(kind==="result"?resultResponse:labSpecimen));await Promise.resolve();});expect(calls).toHaveLength(count);expect(client.getQueryData(["laboratory","new-account","sentinel"])).toBe("new-data");expect(screen.queryByText(/Perubahan tersimpan/)).not.toBeInTheDocument();expect(client.getMutationCache().getAll()).toHaveLength(0);expect(routing.replace).not.toHaveBeenCalled();
});
it("result edits/failures keep sensitive data out of storage, logs, history, metadata, chrome and mutation cache", async()=>{
  const storage=vi.spyOn(Storage.prototype,"setItem");const indexed=vi.fn();vi.stubGlobal("indexedDB",{open:indexed});const logs=[vi.spyOn(console,"log"),vi.spyOn(console,"warn"),vi.spyOn(console,"info"),vi.spyOn(console,"error")];const push=vi.spyOn(history,"pushState");const replace=vi.spyOn(history,"replaceState");const title=document.title; let client!:QueryClient;
  function Probe(){client=useQueryClient();return null;} labBackend(c=>c.options.method==="POST"?failure(409,"SOURCE_AUTHORITY_CONFLICT"):undefined,labStaff);await renderLab("detail",{id:labIds.request},<Probe/>);await userEvent.click(await screen.findByRole("button",{name:"Catat hasil Molekuler langsung"}));await userEvent.type(screen.getByLabelText(/Waktu pemeriksaan/),"2026-09-01T12:00");await userEvent.type(screen.getByLabelText("Narasi hasil"),"Private laboratory narrative");await userEvent.click(screen.getByRole("button",{name:"Simpan hasil"}));await screen.findByText("Data dikendalikan sumber eksternal");
  expect(storage).not.toHaveBeenCalled();expect(indexed).not.toHaveBeenCalled();expect(push).not.toHaveBeenCalled();expect(replace).not.toHaveBeenCalled();for(const log of logs)expect(log).not.toHaveBeenCalled();expect(document.title).toBe(title);expect(client.getMutationCache().getAll()).toHaveLength(0);expect(screen.getByRole("navigation")).not.toHaveTextContent(labDetail.patient.fullName);
});
